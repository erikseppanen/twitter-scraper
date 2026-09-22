(require '[twitter-scraper.core :as core]
         '[twitter-scraper.fetcher :as fetcher]
         '[twitter-scraper.html :as html])
(let [[output] *command-line-args*
      tweets (core/load-cache output)
      restored (atom 0)
      updated (mapv (fn [tweet]
                      (let [quote (fetcher/combine-quote (:raw tweet) {:quote (:quote tweet)})]
                        (if (and quote (not= quote (:quote tweet)))
                          (do (swap! restored inc)
                              (assoc tweet :quote (fetcher/download-media quote (str output "/media"))))
                          tweet))) tweets)]
  (core/save-cache updated output)
  (html/copy-css output)
  (html/generate-all-pages updated output {})
  (println "Recovered quotes from archived Twitter responses:" @restored))
(shutdown-agents)
