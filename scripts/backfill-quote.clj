(require '[clojure.edn :as edn]
         '[twitter-scraper.core :as core]
         '[twitter-scraper.fetcher :as fetcher]
         '[twitter-scraper.html :as html])
(let [[output selected-id] *command-line-args*
      tweets (core/load-cache output)
      retry-ids (when (= selected-id "retry")
                  (set (:unavailable (edn/read-string (slurp (str output "/quote-repair-report.edn"))))))
      counts (atom {:checked 0 :with-media 0 :unavailable []})
      updated
      (mapv (fn [tweet]
              (if (and (:quote tweet) (or (nil? selected-id) (= selected-id (:tweet-id tweet)) (contains? retry-ids (:tweet-id tweet))))
                (let [quote (:quote (fetcher/fetch-article-data (:tweet-id tweet)))]
                  (swap! counts update :checked inc)
                  (Thread/sleep 500)
                  (if quote
                    (let [media (:media quote)
                          repaired (fetcher/download-media
                                    (assoc (:quote tweet) :media media) (str output "/media"))]
                      (when (seq media) (swap! counts update :with-media inc))
                      (when-not (every? :local-path (:media repaired))
                        (swap! counts update :unavailable conj (:tweet-id tweet)))
                      (println "Checked quoted tweet" (:tweet-id tweet) @counts)
                      (assoc tweet :quote repaired))
                    (do (swap! counts update :unavailable conj (:tweet-id tweet)) tweet)))
                tweet)) tweets)]
  (core/save-cache updated output)
  (html/copy-css output)
  (html/generate-all-pages updated output {})
  (spit (str output "/quote-repair-report.edn") (pr-str @counts))
  (println "Quote repair complete:" @counts))
(shutdown-agents)
