(ns twitter-scraper.fetcher
  (:require [clj-http.client :as http]
            [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [twitter-scraper.util :as util])
  (:import [java.io FileOutputStream]))

(def syndication-url "https://cdn.syndication.twimg.com/tweet-result")

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
                                  {:type :video
                                   :url (:url best)
                                   :poster (:media_url_https media)})
                         :animated_gif (let [variants (get-in media [:video_info :variants] [])
                                             gif-url (-> variants first :url)]
                                         {:type :gif
                                          :url gif-url
                                          :poster (:media_url_https media)})
                         nil))))
              (filter some?)))]
    ;; Deduplicate by URL (keep first occurrence)
    (->> all-media
         (reduce (fn [[seen result] media]
                   (let [url (:url media)]
                     (if (seen url)
                       [seen result]
                       [(conj seen url) (conj result media)])))
                 [#{} []])
         second)))

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
        200 (let [body (:body response)]
              (when body
                {:tweet-id tweet-id
                 :text (:text body)
                 :created-at (:created_at body)
                 :user {:name (get-in body [:user :name])
                        :screen-name (get-in body [:user :screen_name])
                        :profile-image (get-in body [:user :profile_image_url_https])}
                 :media (extract-media body)
                 :metrics {:likes (get-in body [:favorite_count] 0)
                           :retweets (get-in body [:conversation_count] 0)}
                 :raw body}))
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
