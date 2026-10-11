(ns twitter-scraper.core-test
  (:require [clojure.test :refer [deftest is run-tests]]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [hiccup2.core :as h]
            [twitter-scraper.core :as core]
            [twitter-scraper.fetcher :as fetcher]
            [twitter-scraper.html :as html]))

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
                    html/copy-css (constantly nil)
                    html/generate-all-pages (constantly nil)]
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

(deftest quoted-photos-are-downloaded-and-rendered
  (let [dir (.toFile (java.nio.file.Files/createTempDirectory "quote-media" (make-array java.nio.file.attribute.FileAttribute 0)))
        quote (fetcher/extract-quote-from-response
               {:quote {:id "10" :text "Mountain" :author {:name "Example Author" :screen_name "example_author"}
                        :media {:all [{:type "photo" :url "https://example.invalid/a.jpg"}
                                      {:type "photo" :url "https://example.invalid/b.jpg"}]}}})]
    (try
      (with-redefs [fetcher/download-file (fn [_ dest] (spit dest "image") true)]
        (let [tweet (first (fetcher/download-all-media [{:tweet-id "20" :text "Reply" :quote quote}] (.getPath dir) {}))
              data (html/tweet->json-data tweet)
              markup (str (h/html (html/render-tweet-card tweet :media-prefix "../media/")))]
          (is (= ["10_0.jpg" "10_1.jpg"] (mapv :localPath (get-in data [:quote :media]))))
          (is (str/includes? markup "../media/10_0.jpg"))
          (is (str/includes? markup "../media/10_1.jpg"))
          (is (str/includes? markup "example_author"))))
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
      (doseq [f ["media/10_0.jpg" "media/99_0.jpg" "media/20_0.jpg" "tweets/10.html" "tweets/20.html"
                 "articles/10.html" "articles/10-cover.jpg" "articles/99.html"]]
        (spit (file f) "x"))
      (core/save-cache [{:tweet-id "10" :text "Remove me" :media [{:type :photo :url "https://example.invalid/10_0.jpg" :local-path "10_0.jpg"}] :quote quote}
                        {:tweet-id "20" :text "Keep me" :media [{:type :photo :url "https://example.invalid/20_0.jpg" :local-path "20_0.jpg"}] :quote quote}]
                       output)
      (spit ids "10\n")
      (core/run-remove {:output output :remove ids})
      (is (= ["20"] (map :tweet-id (core/load-cache output))))
      (is (= "10\n" (slurp (file ".removed-ids"))))
      (doseq [f ["media/10_0.jpg" "tweets/10.html" "articles/10.html" "articles/10-cover.jpg"]]
        (is (not (.exists (file f))) f))
      ;; The kept tweet quotes the same tweet, so its shared files stay.
      (doseq [f ["media/99_0.jpg" "media/20_0.jpg" "tweets/20.html" "articles/99.html"]]
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

(defn -main [& _]
  (let [result (run-tests 'twitter-scraper.core-test)]
    (shutdown-agents)
    (System/exit (if (zero? (+ (:fail result) (:error result))) 0 1))))
