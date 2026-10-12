(ns twitter-scraper.core-test
  (:require [clojure.test :refer [deftest is run-tests]]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [cheshire.core :as json]
            [twitter-scraper.core :as core]
            [twitter-scraper.fetcher :as fetcher]
            [twitter-scraper.output :as output]))

(deftest incremental-import-persists-local-media
  (let [dir (.toFile (java.nio.file.Files/createTempDirectory "archive-test" (make-array java.nio.file.attribute.FileAttribute 0)))
        output (.getPath dir)
        input (str output "/ids.txt")
        fetched (atom nil)]
    (try
      (core/save-cache [{:tweet-id "20" :text "Existing"}] output)
      (spit input "20\n10\n")
      (with-redefs [fetcher/fetch-tweets-batch (fn [ids _]
                                              (reset! fetched ids)
                                              {"10" {:tweet-id "10" :text "Older tweet liked recently" :media [{:type :photo :url "https://example.invalid/a.jpg"}]}})
                    fetcher/download-all-media (fn [tweets _ _]
                                                 (map #(assoc-in % [:media 0 :local-path] "10.jpg") tweets))
                    fetcher/download-all-article-media (fn [tweets _] tweets)
                    output/write-archive (constantly nil)]
        (core/run-import {:output output :import input :delay 0})
        (is (= ["10"] @fetched))
        (let [cache (core/load-cache output)]
          (is (= #{"10" "20"} (set (map :tweet-id cache))))
          (is (= "10.jpg" (get-in (first (filter #(= "10" (:tweet-id %)) cache)) [:media 0 :local-path])))))
      (finally
        (doseq [file (reverse (file-seq dir))] (io/delete-file file))))))

(deftest old-cache-restores-only-existing-media
  (let [dir (.toFile (java.nio.file.Files/createTempDirectory "media-recovery" (make-array java.nio.file.attribute.FileAttribute 0)))
        media-dir (io/file dir "media")]
    (try
      (.mkdir media-dir)
      (spit (io/file media-dir "10_0.jpg") "image")
      (let [tweet {:tweet-id "10" :media [{:url "https://example.invalid/a.jpg"} {:url "https://example.invalid/b.jpg"}]}
            restored (fetcher/restore-local-media tweet (.getPath dir))]
        (is (= "10_0.jpg" (get-in restored [:media 0 :local-path])))
        (is (nil? (get-in restored [:media 1 :local-path]))))
      (finally (doseq [file (reverse (file-seq dir))] (io/delete-file file))))))

(deftest quoted-photos-are-downloaded-and-exported
  (let [dir (.toFile (java.nio.file.Files/createTempDirectory "quote-media" (make-array java.nio.file.attribute.FileAttribute 0)))
        quote (fetcher/extract-quote-from-response
               {:quote {:id "10" :text "Mountain" :author {:name "Example Author" :screen_name "example_author"}
                        :media {:all [{:type "photo" :url "https://example.invalid/a.jpg"}
                                      {:type "photo" :url "https://example.invalid/b.jpg"}]}}})]
    (try
      (with-redefs [fetcher/download-file (fn [_ dest] (spit dest "image") true)]
        (let [tweet (first (fetcher/download-all-media [{:tweet-id "20" :text "Reply" :quote quote}] (.getPath dir) {}))
              data (output/tweet->json-data tweet)]
          (is (= ["10_0.jpg" "10_1.jpg"] (mapv :localPath (get-in data [:quote :media]))))
          (is (= "example_author" (get-in data [:quote :user :screenName])))))
      (finally (doseq [file (reverse (file-seq dir))] (io/delete-file file))))))

(deftest quote-media-survives-supplemental-api-failure
  (let [body {:quoted_tweet {:id_str "10" :text "Mountain"
                             :user {:screen_name "example_author"}
                             :photos [{:url "https://example.invalid/mountain.jpg"}]}}]
    (doseq [extra [nil {:quote {:tweet-id "10" :text "Full text" :media []}}]]
      (is (= "https://example.invalid/mountain.jpg"
             (get-in (fetcher/combine-quote body extra) [:media 0 :url]))))))

(deftest removal-deletes-unshared-files-and-blocks-reimport
  (let [dir (.toFile (java.nio.file.Files/createTempDirectory "archive-remove" (make-array java.nio.file.attribute.FileAttribute 0)))
        output (.getPath dir)
        ids (str output "/remove.txt")
        file #(io/file output %)
        quote {:tweet-id "99" :text "Quoted" :media [{:type :photo :url "https://example.invalid/99_0.jpg" :local-path "99_0.jpg"}]}]
    (try
      (doseq [d ["media" "tweets" "articles"]] (.mkdir (file d)))
      (doseq [f ["media/10_0.jpg" "media/99_0.jpg" "media/20_0.jpg"
                 "articles/10.json" "articles/10-cover.jpg" "articles/99.json"]]
        (spit (file f) "x"))
      (core/save-cache [{:tweet-id "10" :text "Remove me" :media [{:type :photo :url "https://example.invalid/10_0.jpg" :local-path "10_0.jpg"}] :quote quote}
                        {:tweet-id "20" :text "Keep me" :media [{:type :photo :url "https://example.invalid/20_0.jpg" :local-path "20_0.jpg"}] :quote quote}]
                       output)
      (spit ids "10\n")
      (core/run-remove {:output output :remove ids})
      (is (= ["20"] (map :tweet-id (core/load-cache output))))
      (is (= "10\n" (slurp (file ".removed-ids"))))
      (doseq [f ["media/10_0.jpg" "articles/10.json" "articles/10-cover.jpg"]]
        (is (not (.exists (file f))) f))
      ;; The kept tweet quotes the same tweet, so its shared files stay.
      (doseq [f ["media/99_0.jpg" "media/20_0.jpg" "articles/99.json"]]
        (is (.exists (file f)) f))
      (let [fetched (atom nil)]
        (spit ids "10\n30\n")
        (with-redefs [fetcher/fetch-tweets-batch (fn [ids _] (reset! fetched ids) {"30" {:tweet-id "30" :text "New"}})
                      fetcher/download-all-media (fn [tweets _ _] tweets)
                      fetcher/download-all-article-media (fn [tweets _] tweets)]
          (core/run-import {:output output :import ids :delay 0}))
        (is (= ["30"] @fetched))
        (is (= #{"20" "30"} (set (map :tweet-id (core/load-cache output))))))
      (finally
        (doseq [f (reverse (file-seq dir))] (io/delete-file f))))))

(defn- temp-dir [prefix]
  (.toFile (java.nio.file.Files/createTempDirectory prefix (make-array java.nio.file.attribute.FileAttribute 0))))

(deftest articles-export-text-styles-links-and-local-images
  (let [dir (temp-dir "article-json")
        article {:title "A title" :created-at "2025-01-02T00:00:00Z" :cover-image "https://example.invalid/cover.jpg"
                 :media-entities [{:media_id "7" :media_info {:original_img_url "https://example.invalid/a.png"}}
                                  {:media_id "8" :media_info {:original_img_url "https://example.invalid/b.jpg"}}]
                 :entity-map [{:key "0" :value {:type "LINK" :data {:url "https://example.com"}}}
                              {:key "1" :value {:type "MEDIA" :data {:caption "A chart" :mediaItems [{:mediaId "7"}]}}}
                              {:key "2" :value {:type "MEDIA" :data {:mediaItems [{:mediaId "8"}]}}}
                              {:key "3" :value {:type "DIVIDER" :data {}}}
                              {:key "4" :value {:type "MARKDOWN" :data {:markdown "```bash\nls -la\n```"}}}]
                 :content-blocks [{:type "header-one" :text "Heading" :entityRanges [] :inlineStyleRanges []}
                                  {:type "unstyled" :text "Read this now" :entityRanges [{:key 0 :offset 5 :length 4}]
                                   :inlineStyleRanges [{:offset 0 :length 4 :style "Bold"} {:offset 0 :length 4 :style "Underline"}]}
                                  {:type "unordered-list-item" :text "Item" :entityRanges [] :inlineStyleRanges []}
                                  {:type "unstyled" :text "  " :entityRanges [] :inlineStyleRanges []}
                                  {:type "atomic" :text " " :entityRanges [{:key 1 :offset 0 :length 1}]}
                                  {:type "atomic" :text " " :entityRanges [{:key 2 :offset 0 :length 1}]}
                                  {:type "atomic" :text " " :entityRanges [{:key 3 :offset 0 :length 1}]}
                                  {:type "atomic" :text " " :entityRanges [{:key 4 :offset 0 :length 1}]}]}]
    (try
      (doseq [d ["articles" "tweets"]] (.mkdir (io/file dir d)))
      (spit (io/file dir "articles/10-7.png") "image")
      (spit (io/file dir "articles/10-cover.jpg") "image")
      (spit (io/file dir "index.html") "old")
      (spit (io/file dir "style.css") "old")
      (spit (io/file dir "tweets/10.html") "old")
      (spit (io/file dir "articles/10.html") "old")
      (output/write-archive [{:tweet-id "10" :text "Has an article" :user {:name "Writer" :screen-name "writer"} :article article}
                             {:tweet-id "20" :text "Quotes one" :quote {:tweet-id "30" :user {:screen-name "quoted"} :article (dissoc article :cover-image)}}]
                            (.getPath dir))
      (let [data (json/parse-string (slurp (io/file dir "articles/10.json")) true)]
        (is (= {:name "Writer" :screenName "writer"} (:user data)))
        (is (= "10-cover.jpg" (:cover data)))
        (is (= [{:type "h1" :text "Heading"}
                {:type "p" :text "Read this now" :links [{:offset 5 :length 4 :url "https://example.com"}]
                 :styles [{:offset 0 :length 4 :style "bold"}]}
                {:type "ul" :text "Item"}
                {:type "image" :src "10-7.png" :caption "A chart"}
                {:type "divider"}
                {:type "code" :code "ls -la"}]
               (:blocks data))
            "blank text and images that were never downloaded are left out"))
      (is (nil? (:cover (json/parse-string (slurp (io/file dir "articles/30.json")) true))) "quoted articles get files too")
      (is (= 2 (count (json/parse-string (slurp (io/file dir "tweets.json"))))))
      (doseq [f ["index.html" "style.css" "tweets" "articles/10.html"]]
        (is (not (.exists (io/file dir f))) (str "retired " f)))
      (is (.exists (io/file dir "articles/10-7.png")))
      (finally (doseq [f (reverse (file-seq dir))] (io/delete-file f))))))

(defn -main [& _]
  (let [result (run-tests 'twitter-scraper.core-test)]
    (shutdown-agents)
    (System/exit (if (zero? (+ (:fail result) (:error result))) 0 1))))
