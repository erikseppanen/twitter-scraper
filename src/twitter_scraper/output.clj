(ns twitter-scraper.output
  "Writes the files the archive app reads: tweets.json and one JSON file per article."
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [cheshire.core :as json]
            [twitter-scraper.util :as util]))

(defn tweet->json-data
  "Convert a tweet to the JSON shape the app reads."
  [tweet]
  {:tweetId (:tweet-id tweet)
   :text (:text tweet)
   :createdAt (:created-at tweet)
   :user {:name (get-in tweet [:user :name])
          :screenName (get-in tweet [:user :screen-name])
          :profileImage (get-in tweet [:user :profile-image])}
   :media (when-let [media (:media tweet)]
            (mapv (fn [m]
                    {:type (name (:type m))
                     :url (:url m)
                     :localPath (:local-path m)
                     :poster (:poster m)})
                  media))
   :article (when-let [article (:article tweet)]
              {:title (:title article)
               :previewText (:preview-text article)
               :coverImage (:cover-image article)})
   :quote (when-let [quote-tweet (:quote tweet)]
            (tweet->json-data quote-tweet))})

(defn write-tweets-json
  "Write tweets.json, newest first."
  [tweets output-dir]
  (let [json-data (mapv tweet->json-data (sort-by :created-at #(compare %2 %1) tweets))]
    (spit (str output-dir "/tweets.json") (json/generate-string json-data))
    (util/log-info "Wrote tweets.json with" (count json-data) "tweets")))

;; Articles

(defn- entities-by-key
  "Article entities by the integer key that content blocks refer to."
  [entity-map]
  (into {} (keep (fn [{k :key v :value}]
                   (when (and k v) [(if (string? k) (parse-long k) k) v])))
        entity-map))

(defn- local-images
  "Downloaded inline images by media ID. Uses the naming convention, so archives
   built with --skip-media still find images downloaded later."
  [tweet-id article]
  (merge (into {} (keep (fn [{:keys [media_id media_info]}]
                          (when-let [url (and media_id (:original_img_url media_info))]
                            [media_id (str tweet-id "-" media_id "." (or (util/media-extension url) "jpg"))])))
               (:media-entities article))
         (:local-images article)))

(defn- strip-fence
  "Article code blocks arrive as Markdown fences; keep only the code."
  [markdown]
  (-> markdown
      (str/replace #"^```[^\n]*\n?" "")
      (str/replace #"\n?```\s*$" "")))

(def ^:private text-block-types
  {"unstyled" "p" "header-one" "h1" "header-two" "h2" "blockquote" "quote"
   "unordered-list-item" "ul" "ordered-list-item" "ol"})

(defn article-block
  "One article content block in the app's shape, or nil when there is nothing to show.
   Text blocks keep bold/italic ranges and links; offsets count UTF-16 units, as in JavaScript."
  [block entities images exists?]
  (let [entity-at (fn [range] (get entities (:key range)))]
    (if (= "atomic" (:type block))
      (let [{:keys [type data]} (some entity-at (:entityRanges block))]
        (case type
          "MEDIA" (let [file (get images (get-in data [:mediaItems 0 :mediaId]))]
                    (when (and file (exists? file))
                      (cond-> {:type "image" :src file}
                        (seq (:caption data)) (assoc :caption (:caption data)))))
          "DIVIDER" {:type "divider"}
          "MARKDOWN" (when-let [markdown (:markdown data)] {:type "code" :code (strip-fence markdown)})
          "TWEET" (when-let [id (:tweetId data)] {:type "tweet" :tweetId id})
          nil))
      (let [text (:text block)
            links (vec (keep (fn [range]
                               (let [{:keys [type data]} (entity-at range)]
                                 (when (and (= "LINK" type) (:url data))
                                   {:offset (:offset range) :length (:length range) :url (:url data)})))
                             (:entityRanges block)))
            styles (vec (keep (fn [{:keys [offset length style]}]
                                (when (#{"Bold" "Italic"} style)
                                  {:offset offset :length length :style (str/lower-case style)}))
                              (:inlineStyleRanges block)))]
        (when-not (str/blank? text)
          (cond-> {:type (get text-block-types (:type block) "p") :text text}
            (seq links) (assoc :links links)
            (seq styles) (assoc :styles styles)))))))

(defn article->json-data
  "A tweet's article in the app's shape. Images are files in the articles directory."
  [tweet articles-dir]
  (let [{:keys [tweet-id user article]} tweet
        exists? #(.exists (io/file articles-dir %))
        cover (str tweet-id "-cover.jpg")
        entities (entities-by-key (:entity-map article))
        images (local-images tweet-id article)]
    {:tweetId tweet-id
     :title (:title article)
     :createdAt (:created-at article)
     :user {:name (:name user) :screenName (:screen-name user)}
     :cover (when (and (:cover-image article) (exists? cover)) cover)
     :blocks (vec (keep #(article-block % entities images exists?) (:content-blocks article)))}))

(defn write-articles
  "Write articles/ID.json for every article, including articles in quoted tweets."
  [tweets output-dir]
  (let [dir (util/ensure-directory (str output-dir "/articles"))
        articles (filter :article (concat tweets (keep :quote tweets)))]
    (doseq [tweet articles]
      (spit (str dir "/" (:tweet-id tweet) ".json")
            (json/generate-string (article->json-data tweet dir))))
    (util/log-info "Wrote" (count (distinct (map :tweet-id articles))) "articles")))

(defn remove-retired-pages
  "Delete the static HTML pages earlier versions generated; the app replaces them."
  [output-dir]
  (let [files (concat (keep #(let [f (io/file output-dir %)] (when (.isFile f) f)) ["index.html" "style.css"])
                      (filter #(str/ends-with? (.getName %) ".html") (.listFiles (io/file output-dir "tweets")))
                      (filter #(re-matches #"\d+\.html" (.getName %)) (.listFiles (io/file output-dir "articles"))))
        deleted (count (filter #(.delete %) files))
        tweets-dir (io/file output-dir "tweets")]
    (when (and (.isDirectory tweets-dir) (empty? (.list tweets-dir))) (.delete tweets-dir))
    (when (pos? deleted) (util/log-info "Deleted" deleted "retired HTML pages"))))

(defn write-archive
  "Write everything the app reads for these tweets."
  [tweets output-dir]
  (util/ensure-directory output-dir)
  (write-tweets-json tweets output-dir)
  (write-articles tweets output-dir)
  (remove-retired-pages output-dir))
