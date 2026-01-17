(ns twitter-scraper.util
  (:require [clojure.java.io :as io]
            [clojure.string :as str])
  (:import [java.time Instant ZoneId]
           [java.time.format DateTimeFormatter]))

(defn ensure-directory
  "Create directory if it doesn't exist."
  [path]
  (let [dir (io/file path)]
    (when-not (.exists dir)
      (.mkdirs dir))
    path))

(defn file-exists?
  "Check if a file exists."
  [path]
  (.exists (io/file path)))

(defn extract-tweet-id
  "Extract tweet ID from a Twitter URL or return the ID if already numeric."
  [url-or-id]
  (if (re-matches #"\d+" url-or-id)
    url-or-id
    (when-let [match (re-find #"/status/(\d+)" url-or-id)]
      (second match))))

(defn url->filename
  "Convert a URL to a safe filename, preserving extension."
  [url]
  (let [path (.getPath (java.net.URI. url))
        filename (last (str/split path #"/"))
        ;; Remove query params if any
        clean-name (first (str/split filename #"\?"))]
    clean-name))

(defn media-extension
  "Get the file extension from a URL or filename."
  [url-or-filename]
  (when-let [match (re-find #"\.(\w+)(?:\?|$)" url-or-filename)]
    (str/lower-case (second match))))

(defn format-date
  "Format an ISO date string or timestamp to a readable format."
  [date-str]
  (try
    (let [instant (if (string? date-str)
                    (Instant/parse date-str)
                    (Instant/ofEpochMilli date-str))
          formatter (DateTimeFormatter/ofPattern "MMM d, yyyy 'at' h:mm a")
          zoned (.atZone instant (ZoneId/systemDefault))]
      (.format formatter zoned))
    (catch Exception _
      date-str)))

(defn sanitize-filename
  "Remove or replace characters that are invalid in filenames."
  [s]
  (-> s
      (str/replace #"[<>:\"/\\|?*]" "_")
      (str/replace #"\s+" "_")
      (str/trim)))

(defn truncate
  "Truncate string to max length, adding ellipsis if needed."
  [s max-len]
  (if (> (count s) max-len)
    (str (subs s 0 (- max-len 3)) "...")
    s))

(defn retry-with-backoff
  "Retry a function with exponential backoff.
   Returns the result of f or throws after max-retries."
  [f {:keys [max-retries initial-delay-ms max-delay-ms]
      :or {max-retries 3
           initial-delay-ms 1000
           max-delay-ms 30000}}]
  (loop [attempt 1
         delay-ms initial-delay-ms]
    (let [result (try
                   {:success true :value (f)}
                   (catch Exception e
                     {:success false :error e}))]
      (if (:success result)
        (:value result)
        (if (>= attempt max-retries)
          (throw (:error result))
          (do
            (Thread/sleep delay-ms)
            (recur (inc attempt)
                   (min (* delay-ms 2) max-delay-ms))))))))

(defn progress-bar
  "Create a simple text progress bar."
  [current total width]
  (let [pct (if (zero? total) 0 (/ current total))
        filled (int (* pct width))
        empty (- width filled)]
    (str "[" (apply str (repeat filled "=")) (apply str (repeat empty " ")) "] "
         current "/" total " (" (int (* pct 100)) "%)")))

(defn log
  "Simple logging function with timestamp."
  [level & messages]
  (let [timestamp (java.time.LocalDateTime/now)
        formatter (DateTimeFormatter/ofPattern "HH:mm:ss")]
    (println (str "[" (.format timestamp formatter) "] "
                  (str/upper-case (name level)) " "
                  (str/join " " messages)))))

(defn log-info [& msgs] (apply log :info msgs))
(defn log-warn [& msgs] (apply log :warn msgs))
(defn log-error [& msgs] (apply log :error msgs))
