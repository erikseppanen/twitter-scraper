(ns twitter-scraper.core
  (:require [clojure.tools.cli :refer [parse-opts]]
            [clojure.string :as str]
            [clojure.edn :as edn]
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
   ["-r" "--include-retweets" "Include retweets from Twitter export (fetches original tweets)"]
   ["-R" "--retweets-only" "Archive only retweets, not likes"]
   ["-F" "--refetch-failed" "Re-fetch tweets that previously failed (empty text/user)"]
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

      ;; Refetch mode doesn't require --input
      (:refetch-failed options)
      {:options options}

      (nil? (:input options))
      {:exit-message (str "Error: --input is required\n\n" (usage summary)) :ok? false}

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
      (edn/read-string (slurp cache-file)))))

(defn run-archive
  "Main archiving pipeline."
  [{:keys [input output delay limit skip-fetch skip-media include-retweets retweets-only]}]
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

  ;; Step 1: Parse likes and/or retweets
  (util/log-info "")
  (util/log-info "=== Step 1: Parsing Twitter Export ===")
  (let [;; Get liked tweet IDs (unless retweets-only)
        like-ids (if retweets-only
                   []
                   (let [likes (parser/parse-all-likes input)]
                     (util/log-info "Found" (count likes) "liked tweets")
                     (parser/extract-tweet-ids likes)))
        ;; Get retweet IDs (if include-retweets or retweets-only)
        retweet-ids (if (or include-retweets retweets-only)
                      (let [tweets (parser/parse-all-tweets input)
                            rt-ids (parser/extract-retweet-ids tweets)]
                        (util/log-info "Found" (count rt-ids) "retweets")
                        rt-ids)
                      [])
        ;; Combine and deduplicate
        all-tweet-ids (distinct (concat like-ids retweet-ids))
        tweet-ids (if limit (take limit all-tweet-ids) all-tweet-ids)]
    (util/log-info "Total unique tweets to archive:" (count all-tweet-ids))
    (when limit
      (util/log-info "Limiting to first" limit "tweets"))

    (when (empty? tweet-ids)
      (util/log-error "No tweets found in export")
      (System/exit 1))

    ;; Step 2: Fetch tweet data (merges with existing cache to preserve deleted tweets)
    (util/log-info "")
    (util/log-info "=== Step 2: Fetching Tweet Data ===")
    (let [existing-tweets (or (load-cache output) [])
          existing-ids (set (map :tweet-id existing-tweets))
          _ (when (seq existing-tweets)
              (util/log-info "Existing tweets in cache:" (count existing-tweets)))
          tweets (if skip-fetch
                   (if (seq existing-tweets)
                     existing-tweets
                     (do (util/log-error "No cache found. Cannot skip fetch.")
                         (System/exit 1)))
                   (let [ids-to-fetch (filterv #(not (existing-ids %)) tweet-ids)
                         _ (util/log-info "New tweets to fetch:" (count ids-to-fetch))
                         fetched (if (seq ids-to-fetch)
                                   (fetcher/fetch-tweets-batch
                                    ids-to-fetch
                                    {:delay-ms delay
                                     :on-progress #(print-progress "Fetching" %1 %2 %3)})
                                   {})
                         new-tweets (vals fetched)
                         all-tweets (concat existing-tweets new-tweets)]
                     (save-cache all-tweets output)
                     all-tweets))]

      (util/log-info "")
      (util/log-info "Total tweets in archive:" (count tweets))
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

(defn is-empty-tweet?
  "Check if a tweet has no content (failed to fetch)."
  [tweet]
  (and (nil? (:text tweet))
       (or (nil? (:user tweet))
           (nil? (get-in tweet [:user :screen-name])))))

(defn run-refetch-failed
  "Re-fetch tweets that previously failed (have nil text/user)."
  [{:keys [output delay skip-media]}]
  (util/log-info "Re-fetching failed tweets")
  (util/log-info "Output:" output)

  (let [existing-tweets (or (load-cache output) [])]
    (util/log-info "Total tweets in cache:" (count existing-tweets))

    (let [empty-tweets (filter is-empty-tweet? existing-tweets)
          empty-ids (map :tweet-id empty-tweets)]
      (util/log-info "Found" (count empty-ids) "empty/failed tweets")

      (if (empty? empty-ids)
        (util/log-info "No failed tweets to re-fetch")
        (do
          ;; Ensure output directories exist
          (util/ensure-directory output)
          (util/ensure-directory (str output "/media"))
          (util/ensure-directory (str output "/tweets"))

          ;; Fetch the failed tweets
          (util/log-info "")
          (util/log-info "=== Re-fetching Failed Tweets ===")
          (let [fetched (fetcher/fetch-tweets-batch
                         empty-ids
                         {:delay-ms delay
                          :on-progress #(print-progress "Fetching" %1 %2 %3)})
                fetched-map (into {} (map (fn [t] [(:tweet-id t) t]) (vals fetched)))
                ;; Replace empty tweets with fetched ones where available
                updated-tweets (mapv (fn [tweet]
                                       (if (is-empty-tweet? tweet)
                                         (get fetched-map (:tweet-id tweet) tweet)
                                         tweet))
                                     existing-tweets)
                recovered-count (count (filter #(not (is-empty-tweet? %))
                                               (filter #(is-empty-tweet? (first (filter (fn [t] (= (:tweet-id t) (:tweet-id %))) existing-tweets))) updated-tweets)))]

            (util/log-info "")
            (util/log-info "Recovered" (count fetched) "tweets")
            (save-cache updated-tweets output)

            ;; Download media for recovered tweets
            (util/log-info "")
            (util/log-info "=== Downloading Media ===")
            (let [tweets-with-media
                  (if skip-media
                    (do (util/log-info "Skipping media download")
                        updated-tweets)
                    (let [media-dir (str output "/media")
                          articles-dir (str output "/articles")
                          recovered (vals fetched)]
                      ;; Only download media for recovered tweets
                      (let [recovered-with-media (-> recovered
                                                     (fetcher/download-all-media
                                                      media-dir
                                                      {:on-progress #(print-progress "Media" %1 %2 %3)})
                                                     (fetcher/download-all-article-media articles-dir))
                            recovered-map (into {} (map (fn [t] [(:tweet-id t) t]) recovered-with-media))]
                        ;; Merge back into full list
                        (mapv (fn [tweet]
                                (get recovered-map (:tweet-id tweet) tweet))
                              updated-tweets))))]

              ;; Regenerate HTML
              (util/log-info "")
              (util/log-info "=== Regenerating HTML Pages ===")
              (html/copy-css output)
              (html/generate-all-pages
               tweets-with-media
               output
               {:on-progress #(print-progress "HTML" %1 %2 %3)})

              (util/log-info "")
              (util/log-info "=== Re-fetch Complete ===")
              (util/log-info "Open" (str output "/index.html") "in your browser"))))))))

(defn -main [& args]
  (let [{:keys [options exit-message ok?]} (validate-args args)]
    (if exit-message
      (do
        (println exit-message)
        (System/exit (if ok? 0 1)))
      (try
        (cond
          (:refetch-failed options) (run-refetch-failed options)
          (:import options) (run-import options)
          :else (run-archive options))
        (catch Exception e
          (util/log-error "Fatal error:" (.getMessage e))
          (.printStackTrace e)
          (System/exit 1))))))
