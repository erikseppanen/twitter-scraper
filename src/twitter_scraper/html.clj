(ns twitter-scraper.html
  (:require [hiccup2.core :as h]
            [hiccup.util :refer [raw-string]]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [twitter-scraper.util :as util]))

(def theme-toggle-script
  "document.addEventListener('DOMContentLoaded', function() {
    var toggle = document.getElementById('theme-toggle');
    var html = document.documentElement;
    var stored = localStorage.getItem('theme');
    if (stored) html.setAttribute('data-theme', stored);
    if (toggle) {
      toggle.addEventListener('click', function() {
        var current = html.getAttribute('data-theme');
        var next = current === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
      });
    }
  });")

(defn html-page
  "Wrap content in a full HTML page structure."
  [title content & {:keys [css-path]}]
  (str
   "<!DOCTYPE html>\n"
   (h/html
    [:html {:lang "en"}
     [:head
      [:meta {:charset "UTF-8"}]
      [:meta {:name "viewport" :content "width=device-width, initial-scale=1.0"}]
      [:title title]
      (when css-path
        [:link {:rel "stylesheet" :href css-path}])]
     [:body
      content
      [:script (raw-string theme-toggle-script)]]])))

(defn linkify-text
  "Convert URLs, mentions, and hashtags in text to links."
  [text]
  (when text
    (-> text
        ;; URLs
        (str/replace #"(https?://[^\s]+)"
                     "<a href=\"$1\" target=\"_blank\" rel=\"noopener\">$1</a>")
        ;; Mentions
        (str/replace #"@(\w+)"
                     "<a href=\"https://twitter.com/$1\" target=\"_blank\" rel=\"noopener\">@$1</a>")
        ;; Hashtags
        (str/replace #"#(\w+)"
                     "<a href=\"https://twitter.com/hashtag/$1\" target=\"_blank\" rel=\"noopener\">#$1</a>"))))

(defn render-media-item
  "Render a single media item (photo, video, or gif).
   media-prefix determines the path prefix for local media files."
  [media media-prefix]
  (let [local-path (:local-path media)
        url (:url media)
        media-src (or (when local-path (str media-prefix local-path)) url)]
    (case (:type media)
      :photo [:div.media-item
              [:a {:href media-src :target "_blank"}
               [:img {:src media-src :alt "Tweet image" :loading "lazy"}]]]
      :video [:div.media-item
              [:video {:controls true :preload "metadata" :poster (:poster media)}
               [:source {:src media-src :type "video/mp4"}]
               "Your browser does not support video."]]
      :gif [:div.media-item
            [:video {:autoplay true :loop true :muted true :playsinline true}
             [:source {:src media-src :type "video/mp4"}]]]
      nil)))

(defn render-media-grid
  "Render media items in a responsive grid.
   media-prefix determines the path prefix for local media files."
  [media-items media-prefix]
  (when (seq media-items)
    (let [count (count media-items)
          grid-class (str "media-grid media-count-" (min count 4))]
      [:div {:class grid-class}
       (map #(render-media-item % media-prefix) media-items)])))

(defn render-tweet-card
  "Render a single tweet as a card.
   media-prefix determines the path prefix for local media files."
  [tweet & {:keys [link-to-page media-prefix] :or {media-prefix "media/"}}]
  (let [tweet-id (:tweet-id tweet)
        user (:user tweet)
        text (:text tweet)
        created-at (:created-at tweet)
        media (:media tweet)]
    [:article.tweet-card {:id (str "tweet-" tweet-id)}
     [:header.tweet-header
      (when-let [avatar (:profile-image user)]
        [:img.avatar {:src avatar :alt "" :loading "lazy"}])
      [:div.user-info
       [:span.display-name (:name user)]
       [:span.username (str "@" (:screen-name user))]]
      [:a.tweet-link {:href (str "https://twitter.com/i/status/" tweet-id)
                      :target "_blank"
                      :rel "noopener"
                      :title "View on Twitter"}
       "↗"]]
     [:div.tweet-content
      (when text
        [:p.tweet-text (raw-string (linkify-text text))])]
     (render-media-grid media media-prefix)
     [:footer.tweet-footer
      (when created-at
        [:time.tweet-date {:datetime created-at}
         (util/format-date created-at)])
      (when link-to-page
        [:a.tweet-page-link {:href (str "tweets/" tweet-id ".html")}
         "View page →"])]]))

(defn generate-tweet-page
  "Generate a standalone HTML page for a single tweet."
  [tweet output-dir]
  (let [tweet-id (:tweet-id tweet)
        user (:user tweet)
        title (str "Tweet by @" (:screen-name user) " - " (util/truncate (:text tweet) 50))
        content [:main.single-tweet
                 [:nav.breadcrumb
                  [:a {:href "../index.html"} "← Back to all tweets"]]
                 (render-tweet-card tweet :media-prefix "../media/")]
        html (html-page title content :css-path "../style.css")
        file-path (str output-dir "/tweets/" tweet-id ".html")]
    (util/ensure-directory (str output-dir "/tweets"))
    (spit file-path html)
    file-path))

(defn generate-index-page
  "Generate the main index page with all tweets."
  [tweets output-dir & {:keys [title] :or {title "Twitter Likes Archive"}}]
  (let [sorted-tweets (sort-by :created-at #(compare %2 %1) tweets)
        content [:div
                 [:header.page-header
                  [:h1 title]
                  [:p.tweet-count (str (count tweets) " liked tweets")]
                  [:div.controls
                   [:button#theme-toggle {:type "button"} "Toggle Dark Mode"]]]
                 [:main.tweet-list
                  (map #(render-tweet-card % :link-to-page true) sorted-tweets)]
                 [:footer.page-footer
                  [:p "Generated by Twitter Likes Archiver"]]]
        html (html-page title content :css-path "style.css")
        file-path (str output-dir "/index.html")]
    (spit file-path html)
    file-path))

(defn generate-all-pages
  "Generate index and individual tweet pages."
  [tweets output-dir {:keys [on-progress]}]
  (util/log-info "Generating HTML pages...")
  (util/ensure-directory output-dir)
  (util/ensure-directory (str output-dir "/tweets"))

  ;; Generate individual tweet pages
  (let [total (count tweets)]
    (doseq [[idx tweet] (map-indexed vector tweets)]
      (when on-progress (on-progress idx total (:tweet-id tweet)))
      (generate-tweet-page tweet output-dir)))

  ;; Generate index page
  (generate-index-page tweets output-dir)

  (util/log-info "Generated" (count tweets) "tweet pages and index"))

(defn copy-css
  "Copy CSS file to output directory."
  [output-dir]
  (let [css-resource (io/resource "templates/style.css")
        dest-path (str output-dir "/style.css")]
    (if css-resource
      (spit dest-path (slurp css-resource))
      (util/log-warn "CSS template not found, using default styles"))))
