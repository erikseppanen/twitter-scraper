(ns twitter-scraper.parser
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [twitter-scraper.util :as util]))

(defn strip-js-wrapper
  "Remove the JavaScript variable assignment wrapper from Twitter export files.
   Files are formatted as: window.YTD.like.part0 = [...]"
  [content]
  (if-let [match (re-find #"=\s*(\[[\s\S]*\])\s*;?\s*$" content)]
    (second match)
    content))

(defn parse-likes-file
  "Parse the like.js file from Twitter export.
   Returns a sequence of liked tweet data."
  [file-path]
  (util/log-info "Parsing likes file:" file-path)
  (let [content (slurp file-path)
        json-str (strip-js-wrapper content)
        data (json/parse-string json-str true)]
    (->> data
         (map :like)
         (filter some?)
         (map (fn [like]
                {:tweet-id (:tweetId like)
                 :full-text (:fullText like)
                 :expanded-url (:expandedUrl like)})))))

(defn parse-tweet-js
  "Parse the tweet.js file from Twitter export (user's own tweets).
   Returns a sequence of tweet data."
  [file-path]
  (util/log-info "Parsing tweets file:" file-path)
  (let [content (slurp file-path)
        json-str (strip-js-wrapper content)
        data (json/parse-string json-str true)]
    (->> data
         (map :tweet)
         (filter some?)
         (map (fn [tweet]
                {:tweet-id (:id tweet)
                 :full-text (:full_text tweet)
                 :created-at (:created_at tweet)
                 :entities (:entities tweet)
                 :extended-entities (:extended_entities tweet)})))))

(defn find-export-file
  "Find a specific file in the Twitter export directory structure."
  [export-dir filename]
  (let [;; Try common locations
        paths [(io/file export-dir "data" filename)
               (io/file export-dir filename)
               (io/file export-dir "assets" "data" filename)]]
    (->> paths
         (filter #(.exists %))
         first)))

(defn discover-like-files
  "Find all like.js part files in the export directory.
   Twitter splits large exports into multiple parts."
  [export-dir]
  (let [data-dir (io/file export-dir "data")]
    (if (.exists data-dir)
      (->> (.listFiles data-dir)
           (filter #(re-matches #"like(?:s)?\.js|like-part\d+\.js" (.getName %)))
           (sort-by #(.getName %))
           vec)
      (let [direct-file (io/file export-dir "like.js")]
        (if (.exists direct-file)
          [direct-file]
          [])))))

(defn parse-all-likes
  "Parse all like files from a Twitter export directory.
   Handles both single file and multi-part exports."
  [export-dir]
  (let [like-files (discover-like-files export-dir)]
    (if (empty? like-files)
      (do
        (util/log-warn "No like.js files found in" export-dir)
        [])
      (do
        (util/log-info "Found" (count like-files) "like file(s)")
        (->> like-files
             (mapcat #(parse-likes-file (.getPath %)))
             (distinct)
             vec)))))

(defn extract-tweet-ids
  "Extract just the tweet IDs from parsed likes data."
  [likes]
  (->> likes
       (map :tweet-id)
       (filter some?)
       distinct
       vec))

(defn validate-export-directory
  "Validate that a directory looks like a Twitter export."
  [dir-path]
  (let [dir (io/file dir-path)]
    (cond
      (not (.exists dir))
      {:valid false :error (str "Directory does not exist: " dir-path)}

      (not (.isDirectory dir))
      {:valid false :error (str "Path is not a directory: " dir-path)}

      :else
      (let [data-dir (io/file dir "data")
            has-data-dir (.exists data-dir)
            like-files (discover-like-files dir-path)]
        (if (or has-data-dir (seq like-files))
          {:valid true
           :has-data-dir has-data-dir
           :like-file-count (count like-files)}
          {:valid false
           :error "Could not find Twitter export data. Expected 'data' directory or 'like.js' file."})))))
