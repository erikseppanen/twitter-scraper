(ns twitter-scraper.fetcher
  (:require [clj-http.client :as http]
            [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [twitter-scraper.util :as util])
  (:import [java.io FileOutputStream]))

(def syndication-url "https://cdn.syndication.twimg.com/tweet-result")
(def fxtwitter-url "https://api.fxtwitter.com/status")

(defn extract-article-id
  "Extract article ID from tweet entities if present."
  [tweet-data]
  (let [urls (get-in tweet-data [:entities :urls] [])]
    (->> urls
         (map :expanded_url)
         (filter some?)
         (some #(when-let [match (re-find #"x\.com/i/article/(\d+)" %)]
                  (second match))))))

(def default-headers
  {"User-Agent" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
   "Accept" "application/json"
   "Accept-Language" "en-US,en;q=0.9"})

(defn extract-media
  "Extract media URLs from tweet data."
  [tweet-data]
  (let [photos (or (:photos tweet-data) [])
        video (:video tweet-data)
        media-entities (get-in tweet-data [:mediaDetails] [])
        all-media
        (concat
         ;; Photos from photos array
         (->> photos
              (map (fn [photo]
                     {:type :photo
                      :url (:url photo)
                      :expanded-url (:expandedUrl photo)})))
         ;; Video if present
         (when video
           (let [variants (get-in video [:variants] [])
                 best-variant (->> variants
                                   (filter #(= "video/mp4" (:content_type %)))
                                   (sort-by :bitrate >)
                                   first)]
             (when best-variant
               [{:type :video
                 :url (:src best-variant)
                 :poster (get-in video [:poster])}])))
         ;; Media details (alternative location)
         (->> media-entities
              (map (fn [media]
                     (let [media-type (keyword (:type media))]
                       (case media-type
                         :photo {:type :photo
                                 :url (:media_url_https media)}
                         :video (let [variants (get-in media [:video_info :variants] [])
                                      best (->> variants
                                                (filter #(= "video/mp4" (:content_type %)))
                                                (sort-by :bitrate >)
                                                first)]
                                  (when best
                                    {:type :video
                                     :url (:url best)
                                     :poster (:media_url_https media)}))
                         :animated_gif (let [variants (get-in media [:video_info :variants] [])
                                             gif-url (-> variants first :url)]
                                         (when gif-url
                                           {:type :gif
                                            :url gif-url
                                            :poster (:media_url_https media)}))
                         nil))))
              (filter #(and (some? %) (some? (:url %))))))]
    ;; Deduplicate by URL (keep first occurrence)
    (->> all-media
         (reduce (fn [[seen result] media]
                   (let [url (:url media)]
                     (if (seen url)
                       [seen result]
                       [(conj seen url) (conj result media)])))
                 [#{} []])
         second)))

(defn fetch-full-text
  "Fetch full text for long tweets from fxtwitter API."
  [tweet-id]
  (try
    (let [response (http/get (str fxtwitter-url "/" tweet-id)
                            {:headers default-headers
                             :as :json
                             :throw-exceptions false})]
      (when (= 200 (:status response))
        (get-in response [:body :tweet :text])))
    (catch Exception _
      nil)))

(defn extract-article-from-response
  "Extract article data from a tweet response."
  [tweet-data]
  (when-let [article (:article tweet-data)]
    {:article-id (:id article)
     :title (:title article)
     :preview-text (:preview_text article)
     :cover-image (get-in article [:cover_media :media_info :original_img_url])
     :created-at (:created_at article)
     :content-blocks (get-in article [:content :blocks] [])
     :entity-map (get-in article [:content :entityMap] [])
     :media-entities (:media_entities article)}))

(defn extract-quote-from-response
  "Extract quote tweet data from a tweet response."
  [tweet-data]
  (when-let [quote-tweet (:quote tweet-data)]
    {:tweet-id (:id quote-tweet)
     :text (:text quote-tweet)
     :created-at (:created_at quote-tweet)
     :user {:name (get-in quote-tweet [:author :name])
            :screen-name (get-in quote-tweet [:author :screen_name])
            :profile-image (get-in quote-tweet [:author :avatar_url])}
     :article (extract-article-from-response quote-tweet)}))

(defn fetch-article-data
  "Fetch article and quote data from fxtwitter API."
  [tweet-id]
  (try
    (let [response (http/get (str fxtwitter-url "/" tweet-id)
                            {:headers default-headers
                             :as :json
                             :throw-exceptions false})]
      (when (= 200 (:status response))
        (let [tweet-data (get-in response [:body :tweet])]
          {:article (extract-article-from-response tweet-data)
           :quote (extract-quote-from-response tweet-data)})))
    (catch Exception e
      (util/log-warn "Failed to fetch article/quote for tweet" tweet-id "-" (.getMessage e))
      nil)))

(defn fetch-tweet-data
  "Fetch full tweet data from Twitter's syndication API.
   Returns parsed tweet data or nil if not found/deleted."
  [tweet-id]
  (try
    (let [response (http/get syndication-url
                            {:query-params {"id" tweet-id
                                           "token" "x"}
                             :headers default-headers
                             :as :json
                             :throw-exceptions false})]
      (case (:status response)
        200 (let [body (:body response)
                  ;; Check if this is a long tweet (has note_tweet)
                  is-long-tweet? (some? (:note_tweet body))
                  ;; Fetch full text for long tweets
                  full-text (if is-long-tweet?
                              (fetch-full-text tweet-id)
                              nil)
                  ;; Check for article link or quote tweet
                  article-id (extract-article-id body)
                  has-quote? (some? (:quoted_tweet body))
                  ;; Fetch article/quote data if needed
                  extra-data (when (or article-id has-quote?)
                               (fetch-article-data tweet-id))]
              (when body
                (cond-> {:tweet-id tweet-id
                         :text (or full-text (:text body))
                         :created-at (:created_at body)
                         :user {:name (get-in body [:user :name])
                                :screen-name (get-in body [:user :screen_name])
                                :profile-image (get-in body [:user :profile_image_url_https])}
                         :media (extract-media body)
                         :metrics {:likes (get-in body [:favorite_count] 0)
                                   :retweets (get-in body [:conversation_count] 0)}
                         :raw body}
                  (:article extra-data) (assoc :article (:article extra-data))
                  (:quote extra-data) (assoc :quote (:quote extra-data)))))
        404 (do (util/log-warn "Tweet not found:" tweet-id)
                nil)
        (do (util/log-warn "Failed to fetch tweet" tweet-id "- Status:" (:status response))
            nil)))
    (catch Exception e
      (util/log-error "Error fetching tweet" tweet-id "-" (.getMessage e))
      nil)))

(defn generate-media-filename
  "Generate a unique filename for downloaded media."
  [tweet-id media-url index]
  (let [ext (or (util/media-extension media-url) "jpg")
        base (str tweet-id "_" index)]
    (str base "." ext)))

(defn download-file
  "Download a file from URL to destination path.
   Returns true if successful, false otherwise."
  [url dest-path]
  (try
    (let [response (http/get url
                            {:headers default-headers
                             :as :byte-array
                             :throw-exceptions false})]
      (if (= 200 (:status response))
        (do
          (with-open [out (FileOutputStream. dest-path)]
            (.write out ^bytes (:body response)))
          true)
        (do
          (util/log-warn "Failed to download" url "- Status:" (:status response))
          false)))
    (catch Exception e
      (util/log-error "Error downloading" url "-" (.getMessage e))
      false)))

(defn download-media
  "Download all media for a tweet to the specified directory.
   Returns updated tweet data with local file paths."
  [tweet media-dir]
  (let [tweet-id (:tweet-id tweet)
        media-items (:media tweet)]
    (if (empty? media-items)
      tweet
      (let [downloaded-media
            (->> media-items
                 (map-indexed
                  (fn [idx media]
                    (let [url (:url media)
                          filename (generate-media-filename tweet-id url idx)
                          dest-path (str media-dir "/" filename)]
                      (if (util/file-exists? dest-path)
                        (do
                          (util/log-info "Skipping existing:" filename)
                          (assoc media :local-path filename))
                        (if (download-file url dest-path)
                          (do
                            (util/log-info "Downloaded:" filename)
                            (assoc media :local-path filename))
                          media)))))
                 vec)]
        (assoc tweet :media downloaded-media)))))

(defn fetch-tweets-batch
  "Fetch multiple tweets with rate limiting.
   Returns a map of tweet-id -> tweet-data."
  [tweet-ids {:keys [delay-ms on-progress]
              :or {delay-ms 500}}]
  (let [total (count tweet-ids)]
    (loop [ids tweet-ids
           results {}
           idx 0]
      (if (empty? ids)
        results
        (let [tweet-id (first ids)
              _ (when on-progress (on-progress idx total tweet-id))
              tweet-data (util/retry-with-backoff
                          #(fetch-tweet-data tweet-id)
                          {:max-retries 3
                           :initial-delay-ms 1000})]
          (Thread/sleep delay-ms)
          (recur (rest ids)
                 (if tweet-data
                   (assoc results tweet-id tweet-data)
                   results)
                 (inc idx)))))))

(defn download-article-cover
  "Download article cover image for a tweet.
   Returns updated tweet with local cover path."
  [tweet articles-dir]
  (if-let [article (:article tweet)]
    (if-let [cover-url (:cover-image article)]
      (let [tweet-id (:tweet-id tweet)
            filename (str tweet-id "-cover.jpg")
            dest-path (str articles-dir "/" filename)]
        (if (util/file-exists? dest-path)
          (do
            (util/log-info "Skipping existing article cover:" filename)
            (assoc-in tweet [:article :local-cover] filename))
          (if (download-file cover-url dest-path)
            (do
              (util/log-info "Downloaded article cover:" filename)
              (assoc-in tweet [:article :local-cover] filename))
            tweet)))
      tweet)
    tweet))

(defn download-article-images
  "Download all inline images from an article.
   Returns updated tweet with local image paths mapped by media_id."
  [tweet articles-dir]
  (if-let [article (:article tweet)]
    (if-let [media-entities (:media-entities article)]
      (let [tweet-id (:tweet-id tweet)
            downloaded-media
            (->> media-entities
                 (map (fn [entity]
                        (let [media-id (:media_id entity)
                              img-url (get-in entity [:media_info :original_img_url])]
                          (when (and media-id img-url)
                            (let [ext (or (util/media-extension img-url) "jpg")
                                  filename (str tweet-id "-" media-id "." ext)
                                  dest-path (str articles-dir "/" filename)]
                              (if (util/file-exists? dest-path)
                                (do
                                  (util/log-info "Skipping existing article image:" filename)
                                  [media-id filename])
                                (if (download-file img-url dest-path)
                                  (do
                                    (util/log-info "Downloaded article image:" filename)
                                    [media-id filename])
                                  nil)))))))
                 (filter some?)
                 (into {}))]
        (assoc-in tweet [:article :local-images] downloaded-media))
      tweet)
    tweet))

(defn download-all-media
  "Download media for all tweets.
   Returns tweets with updated local paths."
  [tweets media-dir {:keys [on-progress]}]
  (util/ensure-directory media-dir)
  (let [total (count tweets)]
    (->> tweets
         (map-indexed
          (fn [idx tweet]
            (when on-progress (on-progress idx total (:tweet-id tweet)))
            (download-media tweet media-dir)))
         vec)))

(defn download-quote-article-cover
  "Download article cover image for a quoted tweet.
   Returns updated tweet with local cover path in quote."
  [tweet articles-dir]
  (if-let [quote-tweet (:quote tweet)]
    (if-let [article (:article quote-tweet)]
      (if-let [cover-url (:cover-image article)]
        (let [quote-tweet-id (:tweet-id quote-tweet)
              filename (str quote-tweet-id "-cover.jpg")
              dest-path (str articles-dir "/" filename)]
          (if (util/file-exists? dest-path)
            (do
              (util/log-info "Skipping existing quote article cover:" filename)
              (assoc-in tweet [:quote :article :local-cover] filename))
            (if (download-file cover-url dest-path)
              (do
                (util/log-info "Downloaded quote article cover:" filename)
                (assoc-in tweet [:quote :article :local-cover] filename))
              tweet)))
        tweet)
      tweet)
    tweet))

(defn download-all-article-media
  "Download article cover images and inline images for tweets with articles.
   Also downloads cover images for quoted tweet articles.
   Returns tweets with updated local paths."
  [tweets articles-dir]
  (util/ensure-directory articles-dir)
  (let [tweets-with-articles (filter :article tweets)
        tweets-with-quote-articles (filter #(get-in % [:quote :article]) tweets)]
    (when (seq tweets-with-articles)
      (util/log-info "Downloading media for" (count tweets-with-articles) "articles..."))
    (when (seq tweets-with-quote-articles)
      (util/log-info "Downloading media for" (count tweets-with-quote-articles) "quoted articles..."))
    (->> tweets
         (mapv #(download-article-cover % articles-dir))
         (mapv #(download-article-images % articles-dir))
         (mapv #(download-quote-article-cover % articles-dir)))))
