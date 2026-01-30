(ns twitter-scraper.core
  (:require [clojure.tools.cli :refer [parse-opts]]
            [clojure.string :as str]
            [twitter-scraper.parser :as parser]
            [twitter-scraper.fetcher :as fetcher]
            [twitter-scraper.html :as html]
            [twitter-scraper.util :as util])
  (:gen-class))

(def cli-options
  [["-i" "--input PATH" "Path to Twitter export directory"
    :validate [#(.exists (java.io.File. %)) "Directory must exist"]]
   ["-o" "--output PATH" "Output directory for archive"
    :default "./archive"]
   ["-d" "--delay MS" "Delay between API requests (milliseconds)"
    :default 500
    :parse-fn #(Integer/parseInt %)]
   ["-l" "--limit N" "Limit to first N tweets"
    :parse-fn #(Integer/parseInt %)]
   ["-s" "--skip-fetch" "Skip fetching tweet data (use cached data)"]
   ["-m" "--skip-media" "Skip downloading media files"]
   ["-I" "--import FILE" "Import tweet IDs from file (one per line) and merge with existing archive"]
   ["-h" "--help" "Show this help"]])

(defn usage [options-summary]
  (->> ["Twitter Likes Archiver"
        ""
        "Downloads media and generates static HTML pages from your Twitter likes."
        ""
        "Usage: clj -M -m twitter-scraper.core [options]"
        ""
        "Options:"
        options-summary
        ""
        "Steps:"
        "  1. Download your Twitter archive from Twitter Settings"
        "  2. Extract the archive"
        "  3. Run this tool with --input pointing to the extracted directory"
        "  4. Open the generated index.html in your browser"
        ""]
       (str/join \newline)))

(defn error-msg [errors]
  (str "The following errors occurred:\n\n"
       (str/join \newline errors)))

(defn validate-args [args]
  (let [{:keys [options arguments errors summary]} (parse-opts args cli-options)]
    (cond
      (:help options)
      {:exit-message (usage summary) :ok? true}

      errors
      {:exit-message (error-msg errors) :ok? false}

      ;; Import mode doesn't require --input
      (:import options)
      {:options options}

      (nil? (:input options))
      {:exit-message "Error: --input is required\n\n(usage summary)" :ok? false}

      :else
      {:options options})))

(defn print-progress [stage current total item]
  (let [bar (util/progress-bar current total 30)]
    (print (str "\r" stage ": " bar " " (or item "")))
    (flush)
    (when (= current (dec total))
      (println))))

(defn save-cache
  "Save fetched tweet data to cache file."
  [tweets output-dir]
  (let [cache-file (str output-dir "/.tweet-cache.edn")]
    (spit cache-file (pr-str tweets))
    (util/log-info "Cached" (count tweets) "tweets")))

(defn load-cache
  "Load cached tweet data if available."
  [output-dir]
  (let [cache-file (str output-dir "/.tweet-cache.edn")]
    (when (util/file-exists? cache-file)
      (util/log-info "Loading cached tweet data...")
      (read-string (slurp cache-file)))))

(defn run-archive
  "Main archiving pipeline."
  [{:keys [input output delay limit skip-fetch skip-media]}]
  (util/log-info "Starting Twitter Likes Archiver")
  (util/log-info "Input:" input)
  (util/log-info "Output:" output)

  ;; Validate input directory
  (let [validation (parser/validate-export-directory input)]
    (when-not (:valid validation)
      (util/log-error (:error validation))
      (System/exit 1)))

  ;; Ensure output directories exist
  (util/ensure-directory output)
  (util/ensure-directory (str output "/media"))
  (util/ensure-directory (str output "/tweets"))

  ;; Step 1: Parse likes
  (util/log-info "")
  (util/log-info "=== Step 1: Parsing Twitter Export ===")
  (let [likes (parser/parse-all-likes input)
        all-tweet-ids (parser/extract-tweet-ids likes)
        tweet-ids (if limit (take limit all-tweet-ids) all-tweet-ids)]
    (util/log-info "Found" (count all-tweet-ids) "liked tweets")
    (when limit
      (util/log-info "Limiting to first" limit "tweets"))

    (when (empty? tweet-ids)
      (util/log-error "No tweets found in export")
      (System/exit 1))

    ;; Step 2: Fetch tweet data
    (util/log-info "")
    (util/log-info "=== Step 2: Fetching Tweet Data ===")
    (let [tweets (if skip-fetch
                   (or (load-cache output)
                       (do (util/log-error "No cache found. Cannot skip fetch.")
                           (System/exit 1)))
                   (let [fetched (fetcher/fetch-tweets-batch
                                  tweet-ids
                                  {:delay-ms delay
                                   :on-progress #(print-progress "Fetching" %1 %2 %3)})]
                     (save-cache (vals fetched) output)
                     (vals fetched)))]

      (util/log-info "")
      (util/log-info "Successfully fetched" (count tweets) "tweets")
      (util/log-info (str (- (count tweet-ids) (count tweets)) " tweets were unavailable (deleted/private)"))

      ;; Step 3: Download media
      (util/log-info "")
      (util/log-info "=== Step 3: Downloading Media ===")
      (let [tweets-with-media
            (if skip-media
              (do (util/log-info "Skipping media download")
                  tweets)
              (let [media-dir (str output "/media")
                    articles-dir (str output "/articles")]
                (-> tweets
                    (fetcher/download-all-media
                     media-dir
                     {:on-progress #(print-progress "Media" %1 %2 %3)})
                    (fetcher/download-all-article-media articles-dir))))]

        (util/log-info "")

        ;; Step 4: Generate HTML
        (util/log-info "=== Step 4: Generating HTML Pages ===")
        (html/copy-css output)
        (html/generate-all-pages
         tweets-with-media
         output
         {:on-progress #(print-progress "HTML" %1 %2 %3)})

        (util/log-info "")
        (util/log-info "=== Archive Complete ===")
        (util/log-info "Open" (str output "/index.html") "in your browser")))))

(defn parse-tweet-ids-file
  "Parse tweet IDs from a file (one per line, supports URLs too)."
  [file-path]
  (->> (slurp file-path)
       str/split-lines
       (map str/trim)
       (filter seq)
       (map (fn [line]
              ;; Extract ID from URL or use as-is
              (if-let [match (re-find #"/status/(\d+)" line)]
                (second match)
                (re-find #"^\d+$" line))))
       (filter some?)
       vec))

(defn run-import
  "Import tweets from a file of IDs and merge with existing archive."
  [{:keys [output delay skip-media import]}]
  (util/log-info "Starting Twitter Import")
  (util/log-info "Import file:" import)
  (util/log-info "Output:" output)

  ;; Parse tweet IDs from file
  (let [new-ids (parse-tweet-ids-file import)]
    (util/log-info "Found" (count new-ids) "tweet IDs in import file")

    (when (empty? new-ids)
      (util/log-error "No valid tweet IDs found in import file")
      (System/exit 1))

    ;; Load existing cache
    (let [existing-tweets (or (load-cache output) [])
          existing-ids (set (map :tweet-id existing-tweets))
          ids-to-fetch (filterv #(not (existing-ids %)) new-ids)]

      (util/log-info "Existing tweets in cache:" (count existing-tweets))
      (util/log-info "New tweets to fetch:" (count ids-to-fetch))

      (if (empty? ids-to-fetch)
        (util/log-info "All tweets already in cache, nothing to import")
        (do
          ;; Ensure output directories exist
          (util/ensure-directory output)
          (util/ensure-directory (str output "/media"))
          (util/ensure-directory (str output "/tweets"))

          ;; Fetch new tweets
          (util/log-info "")
          (util/log-info "=== Fetching New Tweets ===")
          (let [fetched (fetcher/fetch-tweets-batch
                         ids-to-fetch
                         {:delay-ms delay
                          :on-progress #(print-progress "Fetching" %1 %2 %3)})
                new-tweets (vals fetched)
                all-tweets (concat existing-tweets new-tweets)]

            (util/log-info "")
            (util/log-info "Fetched" (count new-tweets) "new tweets")
            (save-cache all-tweets output)

            ;; Download media for new tweets
            (util/log-info "")
            (util/log-info "=== Downloading Media ===")
            (let [tweets-with-media
                  (if skip-media
                    (do (util/log-info "Skipping media download")
                        all-tweets)
                    (let [media-dir (str output "/media")
                          articles-dir (str output "/articles")]
                      ;; Only download media for new tweets, then merge
                      (let [new-with-media (-> new-tweets
                                               (fetcher/download-all-media
                                                media-dir
                                                {:on-progress #(print-progress "Media" %1 %2 %3)})
                                               (fetcher/download-all-article-media articles-dir))]
                        (concat existing-tweets new-with-media))))]

              ;; Regenerate HTML for all tweets
              (util/log-info "")
              (util/log-info "=== Regenerating HTML Pages ===")
              (html/copy-css output)
              (html/generate-all-pages
               tweets-with-media
               output
               {:on-progress #(print-progress "HTML" %1 %2 %3)})

              (util/log-info "")
              (util/log-info "=== Import Complete ===")
              (util/log-info "Total tweets in archive:" (count tweets-with-media))
              (util/log-info "Open" (str output "/index.html") "in your browser"))))))))

(defn -main [& args]
  (let [{:keys [options exit-message ok?]} (validate-args args)]
    (if exit-message
      (do
        (println exit-message)
        (System/exit (if ok? 0 1)))
      (try
        (if (:import options)
          (run-import options)
          (run-archive options))
        (catch Exception e
          (util/log-error "Fatal error:" (.getMessage e))
          (.printStackTrace e)
          (System/exit 1))))))
