(ns twitter-scraper.html
  (:require [hiccup2.core :as h]
            [hiccup.util :refer [raw-string]]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [cheshire.core :as json]
            [twitter-scraper.util :as util]))

;; Simple script for individual tweet/article pages
(def simple-page-script
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
    document.querySelectorAll('.show-more-link').forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        var container = this.closest('.tweet-text-container');
        container.classList.toggle('expanded');
        this.textContent = container.classList.contains('expanded') ? 'Show less' : 'Show more';
      });
    });
  });")

;; Main app script for index page with virtual scrolling
(def index-app-script
  "
(function() {
  var allTweets = [];
  var filteredTweets = [];
  var BATCH_SIZE = 50;
  var loadedCount = 0;
  var isLoading = false;
  var searchQuery = '';
  var activeAuthor = null;
  var sortOrder = 'desc'; // 'desc' = newest first, 'asc' = oldest first
  var activeYear = null;
  var activeMonth = null; // 1-12
  var container = document.getElementById('tweet-list');
  var statusEl = document.getElementById('status');
  var searchInput = document.getElementById('search');
  var filtersEl = document.getElementById('filters');
  var sortBtn = document.getElementById('sort-toggle');

  // Theme
  var html = document.documentElement;
  var stored = localStorage.getItem('theme');
  if (stored) html.setAttribute('data-theme', stored);
  document.getElementById('theme-toggle').addEventListener('click', function() {
    var current = html.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function linkifyText(text) {
    if (!text) return '';
    return escapeHtml(text)
      .replace(/(https?:\\/\\/[^\\s]+)/g, '<a href=\"$1\" target=\"_blank\" rel=\"noopener\">$1</a>')
      .replace(/@(\\w+)/g, '<a href=\"https://twitter.com/$1\" target=\"_blank\" rel=\"noopener\">@$1</a>')
      .replace(/#(\\w+)/g, '<a href=\"https://twitter.com/hashtag/$1\" target=\"_blank\" rel=\"noopener\">#$1</a>');
  }

  function highlightText(html, query) {
    if (!query || !html) return html;
    var escaped = query.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    var regex = new RegExp('(' + escaped + ')', 'gi');
    return html.replace(regex, '<mark>$1</mark>');
  }

  function renderMedia(media) {
    if (!media || !media.length) return '';
    var count = Math.min(media.length, 4);
    var html = '<div class=\"media-grid media-count-' + count + '\">';
    media.forEach(function(m) {
      var src = m.localPath ? 'media/' + m.localPath : m.url;
      if (m.type === 'photo') {
        html += '<div class=\"media-item\"><a href=\"' + src + '\" target=\"_blank\"><img src=\"' + src + '\" alt=\"\" loading=\"lazy\"></a></div>';
      } else if (m.type === 'video') {
        html += '<div class=\"media-item\"><video controls preload=\"metadata\"' + (m.poster ? ' poster=\"' + m.poster + '\"' : '') + '><source src=\"' + src + '\" type=\"video/mp4\"></video></div>';
      } else if (m.type === 'gif') {
        html += '<div class=\"media-item\"><video autoplay loop muted playsinline><source src=\"' + src + '\" type=\"video/mp4\"></video></div>';
      }
    });
    return html + '</div>';
  }

  function renderArticle(article, tweetId, query) {
    if (!article) return '';
    var cover = article.coverImage ? '<div class=\"article-cover\"><img src=\"articles/' + tweetId + '-cover.jpg\" alt=\"\" loading=\"lazy\"></div>' : '';
    var titleHtml = escapeHtml(article.title);
    var previewHtml = article.previewText ? escapeHtml(article.previewText).substring(0, 150) : '';
    if (query) {
      titleHtml = highlightText(titleHtml, query);
      previewHtml = highlightText(previewHtml, query);
    }
    var preview = previewHtml ? '<p class=\"article-preview\">' + previewHtml + '</p>' : '';
    return '<a class=\"article-card\" href=\"articles/' + tweetId + '.html\" target=\"_blank\" rel=\"noopener\">' + cover + '<div class=\"article-info\"><h3 class=\"article-title\">' + titleHtml + '</h3>' + preview + '</div></a>';
  }

  function renderQuote(quote, query) {
    if (!quote) return '';
    var user = quote.user || {};
    var screenName = user.screenName || '';
    var displayName = escapeHtml(user.name || screenName);
    var textHtml = quote.text ? linkifyText(quote.text) : '';
    if (query) textHtml = highlightText(textHtml, query);

    var articleHtml = '';
    var quoteLink = 'https://twitter.com/i/status/' + quote.tweetId;
    if (quote.article) {
      var art = quote.article;
      // Link to local article page
      quoteLink = 'articles/' + quote.tweetId + '.html';
      var cover = art.coverImage ? '<div class=\"quote-article-cover\"><img src=\"articles/' + quote.tweetId + '-cover.jpg\" alt=\"\" loading=\"lazy\"></div>' : '';
      var title = escapeHtml(art.title || '');
      var preview = art.previewText ? escapeHtml(art.previewText).substring(0, 100) + '...' : '';
      articleHtml = '<div class=\"quote-article\">' + cover + '<div class=\"quote-article-info\"><div class=\"quote-article-title\">' + title + '</div><div class=\"quote-article-preview\">' + preview + '</div></div></div>';
    }

    return '<div class=\"quote-card\">' + '<a href=\"' + quoteLink + '\" target=\"_blank\" rel=\"noopener\">' +
      '<div class=\"quote-header\"><span class=\"quote-name\">' + displayName + '</span> <span class=\"quote-username\">@' + escapeHtml(screenName) + '</span></div></a>' +
      (textHtml ? '<div class=\"quote-text\">' + textHtml + '</div>' : '') +
      renderMedia(quote.media) +
      (articleHtml ? '<a href=\"' + quoteLink + '\" target=\"_blank\" rel=\"noopener\">' + articleHtml + '</a>' : '') +
      '</div>';
  }

  function renderTweet(t, query) {
    var isLong = t.text && t.text.length > 280;
    var textClass = isLong ? 'tweet-text-container' : 'tweet-text-container expanded';
    var linkedText = linkifyText(t.text);
    var highlightedText = query ? highlightText(linkedText, query) : linkedText;
    var textHtml = t.text ? '<div class=\"' + textClass + '\"><p class=\"tweet-text' + (isLong ? ' truncated' : '') + '\">' + highlightedText + '</p>' + (isLong ? '<a class=\"show-more-link\" href=\"#\">Show more</a>' : '') + '</div>' : '';

    var avatar = t.user.profileImage ? '<img class=\"avatar\" src=\"' + t.user.profileImage + '\" alt=\"\" loading=\"lazy\">' : '';
    var date = t.createdAt ? '<time class=\"tweet-date\">' + new Date(t.createdAt).toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'}) + '</time>' : '';

    var displayName = escapeHtml(t.user.name);
    var screenName = escapeHtml(t.user.screenName);
    if (query) {
      displayName = highlightText(displayName, query);
      screenName = highlightText(screenName, query);
    }

    var articleHtml = renderArticle(t.article, t.tweetId, query);
    var quoteHtml = renderQuote(t.quote, query);

    return '<article class=\"tweet-card\" id=\"tweet-' + t.tweetId + '\">' +
      '<header class=\"tweet-header\">' + avatar +
      '<div class=\"user-info\"><span class=\"display-name\">' + displayName + '</span><span class=\"username\" data-author=\"' + escapeHtml(t.user.screenName) + '\">@' + screenName + '</span></div>' +
      '<a class=\"tweet-link\" href=\"https://twitter.com/i/status/' + t.tweetId + '\" target=\"_blank\" rel=\"noopener\" title=\"View on Twitter\">↗</a></header>' +
      '<div class=\"tweet-content\">' + textHtml + '</div>' +
      renderMedia(t.media) +
      articleHtml +
      quoteHtml +
      '<footer class=\"tweet-footer\">' + date + '<a class=\"tweet-page-link\" href=\"tweets/' + t.tweetId + '.html\">View page →</a></footer></article>';
  }

  function loadMore() {
    if (isLoading || loadedCount >= filteredTweets.length) return;
    isLoading = true;
    var fragment = document.createDocumentFragment();
    var end = Math.min(loadedCount + BATCH_SIZE, filteredTweets.length);
    var temp = document.createElement('div');
    for (var i = loadedCount; i < end; i++) {
      temp.innerHTML = renderTweet(filteredTweets[i], searchQuery);
      fragment.appendChild(temp.firstChild);
    }
    container.appendChild(fragment);
    loadedCount = end;
    updateStatus();
    isLoading = false;
    bindShowMore();
    bindClickableFilters();
  }

  function bindShowMore() {
    container.querySelectorAll('.show-more-link').forEach(function(link) {
      if (link.dataset.bound) return;
      link.dataset.bound = '1';
      link.addEventListener('click', function(e) {
        e.preventDefault();
        var c = this.closest('.tweet-text-container');
        c.classList.toggle('expanded');
        this.textContent = c.classList.contains('expanded') ? 'Show less' : 'Show more';
      });
    });
  }

  function bindClickableFilters() {
    container.querySelectorAll('.username').forEach(function(el) {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.style.cursor = 'pointer';
      el.addEventListener('click', function(e) {
        e.preventDefault();
        var authorSelect = document.getElementById('author-filter');
        if (authorSelect) authorSelect.value = this.dataset.author;
        setAuthorFilter(this.dataset.author);
      });
    });
  }

  function updateStatus() {
    var showing = loadedCount;
    var total = filteredTweets.length;
    var allTotal = allTweets.length;
    var parts = [];
    if (activeYear || activeMonth) {
      var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var dateParts = [];
      if (activeMonth) dateParts.push(monthNames[parseInt(activeMonth) - 1]);
      if (activeYear) dateParts.push(activeYear);
      parts.push('from ' + dateParts.join(' '));
    }
    if (activeAuthor) parts.push('by @' + activeAuthor);
    if (searchQuery) parts.push('matching \"' + searchQuery + '\"');
    var filterDesc = parts.length ? ' (' + parts.join(', ') + ')' : '';
    statusEl.textContent = 'Showing ' + showing + ' of ' + total + filterDesc + ' from ' + allTotal + ' tweets';
  }

  function buildFilterUI() {
    // Count authors
    var authorCounts = {};
    allTweets.forEach(function(t) {
      var author = t.user && t.user.screenName;
      if (author) {
        authorCounts[author] = (authorCounts[author] || 0) + 1;
      }
    });

    // Count by year and month
    var yearCounts = {};
    var monthCountsByYear = {}; // {year: {month: count}}
    allTweets.forEach(function(t) {
      if (t.createdAt) {
        var d = new Date(t.createdAt);
        var year = d.getFullYear();
        var month = d.getMonth() + 1;
        yearCounts[year] = (yearCounts[year] || 0) + 1;
        if (!monthCountsByYear[year]) monthCountsByYear[year] = {};
        monthCountsByYear[year][month] = (monthCountsByYear[year][month] || 0) + 1;
      }
    });

    // Sort years descending
    var sortedYears = Object.keys(yearCounts).sort(function(a,b) { return b - a; });

    // Build year dropdown
    var html = '<select id=\"year-filter\" class=\"filter-select\"><option value=\"\">Year</option>';
    sortedYears.forEach(function(y) {
      html += '<option value=\"' + y + '\">' + y + ' (' + yearCounts[y] + ')</option>';
    });
    html += '</select>';

    // Build month dropdown
    html += '<select id=\"month-filter\" class=\"filter-select\"><option value=\"\">Month</option>';
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (var i = 1; i <= 12; i++) {
      html += '<option value=\"' + i + '\">' + monthNames[i-1] + '</option>';
    }
    html += '</select>';

    // Sort authors by count
    var sortedAuthors = Object.entries(authorCounts).sort(function(a,b) { return b[1] - a[1]; });

    html += '<select id=\"author-filter\" class=\"filter-select author-select\"><option value=\"\">Author (' + sortedAuthors.length + ')</option>';
    sortedAuthors.forEach(function(a) {
      html += '<option value=\"' + escapeHtml(a[0]) + '\">@' + escapeHtml(a[0]) + ' (' + a[1] + ')</option>';
    });
    html += '</select>';

    filtersEl.innerHTML = html;

    // Store month counts for updating dropdown
    window.monthCountsByYear = monthCountsByYear;

    // Bind dropdown changes
    document.getElementById('year-filter').addEventListener('change', function() {
      setYearFilter(this.value);
    });
    document.getElementById('month-filter').addEventListener('change', function() {
      setMonthFilter(this.value);
    });
    document.getElementById('author-filter').addEventListener('change', function() {
      setAuthorFilter(this.value);
    });

    // Bind clear button from header
    var clearBtn = document.getElementById('clear-filters');
    if (clearBtn) clearBtn.addEventListener('click', clearFilters);
  }

  function updateMonthDropdown() {
    var monthSelect = document.getElementById('month-filter');
    if (!monthSelect) return;
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var counts = activeYear && window.monthCountsByYear[activeYear] || {};

    // Update options with counts for selected year
    for (var i = 1; i <= 12; i++) {
      var opt = monthSelect.options[i];
      var count = counts[i] || 0;
      if (activeYear) {
        opt.textContent = monthNames[i-1] + (count ? ' (' + count + ')' : '');
        opt.disabled = !count;
      } else {
        opt.textContent = monthNames[i-1];
        opt.disabled = false;
      }
    }
  }

  function setAuthorFilter(author) {
    activeAuthor = author || null;
    applyFilter();
    updateClearButton();
  }

  function setYearFilter(year) {
    activeYear = year || null;
    if (!activeYear) activeMonth = null;
    updateMonthDropdown();
    updateActiveFilterUI();
    applyFilter();
    updateClearButton();
  }

  function setMonthFilter(month) {
    activeMonth = month || null;
    updateActiveFilterUI();
    applyFilter();
    updateClearButton();
  }

  function clearFilters() {
    activeAuthor = null;
    activeYear = null;
    activeMonth = null;
    searchQuery = '';
    searchInput.value = '';
    var yearSelect = document.getElementById('year-filter');
    var monthSelect = document.getElementById('month-filter');
    var authorSelect = document.getElementById('author-filter');
    if (yearSelect) yearSelect.value = '';
    if (monthSelect) monthSelect.value = '';
    if (authorSelect) authorSelect.value = '';
    updateMonthDropdown();
    applyFilter();
    updateClearButton();
  }

  function sortTweets(tweets) {
    return tweets.slice().sort(function(a, b) {
      // Push tweets without dates to the end
      if (!a.createdAt && !b.createdAt) return 0;
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      var dateA = new Date(a.createdAt);
      var dateB = new Date(b.createdAt);
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
  }

  function toggleSort() {
    sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
    updateSortButton();
    applyFilter();
  }

  function updateSortButton() {
    if (sortBtn) {
      sortBtn.textContent = sortOrder === 'desc' ? '↓ Newest' : '↑ Oldest';
      sortBtn.title = sortOrder === 'desc' ? 'Showing newest first' : 'Showing oldest first';
    }
  }

  function updateClearButton() {
    var clearBtn = document.getElementById('clear-filters');
    if (clearBtn) {
      clearBtn.style.display = (activeAuthor || activeYear || activeMonth || searchQuery) ? '' : 'none';
    }
  }

  function updateActiveFilterUI() {
    // No-op: dropdowns handle their own state
  }

  function applyFilter() {
    loadedCount = 0;
    container.innerHTML = '';
    var filtered = allTweets.filter(function(t) {
      var screenName = t.user && t.user.screenName;
      if (activeAuthor && screenName !== activeAuthor) return false;
      if (activeYear || activeMonth) {
        if (!t.createdAt) return false;
        var d = new Date(t.createdAt);
        if (isNaN(d.getTime())) return false;
        if (activeYear && d.getFullYear() !== parseInt(activeYear)) return false;
        if (activeMonth && (d.getMonth() + 1) !== parseInt(activeMonth)) return false;
      }
      if (searchQuery) {
        var text = (t.text || '') + ' ' + (t.user && t.user.name || '') + ' ' + (screenName || '');
        if (t.article) text += ' ' + (t.article.title || '') + ' ' + (t.article.previewText || '');
        if (text.toLowerCase().indexOf(searchQuery.toLowerCase()) === -1) return false;
      }
      return true;
    });
    filteredTweets = sortTweets(filtered);
    loadMore();
  }

  // Scroll handler
  window.addEventListener('scroll', function() {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 1000) {
      loadMore();
    }
  });

  // Search handler
  var debounce;
  searchInput.addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(function() {
      searchQuery = searchInput.value.trim();
      applyFilter();
      updateClearButton();
    }, 200);
  });

  // Sort button handler
  if (sortBtn) {
    sortBtn.addEventListener('click', toggleSort);
    updateSortButton();
  }

  // Load data (injected by server)
  statusEl.textContent = 'Loading tweets...';
  allTweets = window.TWEET_DATA || [];
  filteredTweets = sortTweets(allTweets);
  buildFilterUI();
  applyFilter();
})();
")

(defn html-page
  "Wrap content in a full HTML page structure."
  [title content & {:keys [css-path script]}]
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
      [:script (raw-string (or script simple-page-script))]]])))

(defn linkify-text
  "Convert URLs, mentions, and hashtags in text to links."
  [text]
  (when text
    (-> text
        (str/replace "&" "&amp;")
        (str/replace "<" "&lt;")
        (str/replace ">" "&gt;")
        (str/replace "\"" "&quot;")
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

;; Article rendering

(defn render-article-block
  "Render a single article content block.
   entity-to-media-map: maps entity range key to media_id
   local-images: maps media_id to local filename
   media-prefix: path prefix for article images"
  [block entity-to-media-map local-images media-prefix]
  (let [block-type (:type block)
        text (:text block)]
    (case block-type
      "header-two" [:h2 text]
      "atomic" (when-let [entity-range (first (:entityRanges block))]
                 (let [entity-key (:key entity-range)
                       media-id (get entity-to-media-map entity-key)
                       local-file (get local-images media-id)]
                   (when local-file
                     [:figure.article-figure
                      [:img {:src (str media-prefix local-file)
                             :alt ""
                             :loading "lazy"}]])))
      ;; Default: paragraph
      (when (and text (not (str/blank? text)))
        [:p (raw-string (linkify-text text))]))))

(defn build-entity-to-media-map
  "Build a map from entity key to media_id.
   entity-map is a vector where each entry has :key and :value.data.mediaItems[0].mediaId
   The :key field is what content blocks reference in their entityRanges."
  [entity-map]
  (->> entity-map
       (map (fn [entity]
              (let [k (:key entity)
                    media-id (get-in entity [:value :data :mediaItems 0 :mediaId])]
                (when (and k media-id)
                  ;; Key can be string or int in entityRanges, normalize to string
                  [(if (string? k) (Integer/parseInt k) k) media-id]))))
       (filter some?)
       (into {})))

(defn render-article-content
  "Render article content blocks to HTML."
  [article media-prefix]
  (let [blocks (:content-blocks article)
        entity-map (:entity-map article)
        entity-to-media-map (build-entity-to-media-map entity-map)
        local-images (:local-images article)]
    [:div.article-content
     (for [block blocks]
       (render-article-block block entity-to-media-map local-images media-prefix))]))

(defn render-article-card
  "Render an article preview card."
  [article tweet-id articles-prefix]
  (when article
    (let [cover-image (:cover-image article)
          local-cover (str articles-prefix tweet-id "-cover.jpg")]
      [:a.article-card {:href (str articles-prefix tweet-id ".html")
                        :target "_blank"
                        :rel "noopener"}
       (when cover-image
         [:div.article-cover
          [:img {:src local-cover :alt "" :loading "lazy"}]])
       [:div.article-info
        [:h3.article-title (:title article)]
        (when-let [preview (:preview-text article)]
          [:p.article-preview (util/truncate preview 150)])]])))

(defn build-local-images-map
  "Build a map from media_id to local filename based on naming convention.
   Used when :local-images isn't populated (e.g., when --skip-media was used)."
  [tweet-id media-entities]
  (->> media-entities
       (map (fn [entity]
              (let [media-id (:media_id entity)
                    img-url (get-in entity [:media_info :original_img_url])]
                (when (and media-id img-url)
                  (let [ext (or (util/media-extension img-url) "jpg")]
                    [media-id (str tweet-id "-" media-id "." ext)])))))
       (filter some?)
       (into {})))

(defn generate-article-page
  "Generate a standalone HTML page for an article."
  [tweet output-dir]
  (when-let [article (:article tweet)]
    (let [tweet-id (:tweet-id tweet)
          user (:user tweet)
          title (:title article)
          entity-to-media-map (build-entity-to-media-map (:entity-map article))
          ;; Use :local-images if available, otherwise construct from media-entities
          local-images (or (:local-images article)
                           (build-local-images-map tweet-id (:media-entities article)))
          content [:main.article-page
                   [:nav.breadcrumb
                    [:a {:href "../index.html"} "← Back to all tweets"]]
                   [:article.article-full
                    [:header.article-header
                     [:h1 title]
                     [:div.article-meta
                      [:span.article-author (str "By @" (:screen-name user))]
                      (when-let [created-at (:created-at article)]
                        [:time.article-date {:datetime created-at}
                         (util/format-date created-at)])]]
                    (when-let [cover (:cover-image article)]
                      [:div.article-cover-full
                       [:img {:src (str "../articles/" tweet-id "-cover.jpg")
                              :alt ""}]])
                    [:div.article-body
                     (for [block (:content-blocks article)]
                       (render-article-block block entity-to-media-map local-images "../articles/"))]]]
          html (html-page title content :css-path "../style.css")
          file-path (str output-dir "/articles/" tweet-id ".html")]
      (util/ensure-directory (str output-dir "/articles"))
      (spit file-path html)
      file-path)))

(def tweet-truncate-length 280)

(defn render-tweet-text
  "Render tweet text, with Show more link for long tweets."
  [text]
  (when text
    (let [is-long? (> (count text) tweet-truncate-length)]
      (if is-long?
        [:div.tweet-text-container
         [:p.tweet-text.truncated (raw-string (linkify-text text))]
         [:a.show-more-link {:href "#"} "Show more"]]
        [:div.tweet-text-container.expanded
         [:p.tweet-text (raw-string (linkify-text text))]]))))

(defn render-quote-card [quote media-prefix articles-prefix]
  (when quote
    [:div.quote-card
     [:a.quote-header {:href (str "https://twitter.com/i/status/" (:tweet-id quote))
                       :target "_blank" :rel "noopener"}
      [:span.quote-name (get-in quote [:user :name])]
      [:span.quote-username (str "@" (get-in quote [:user :screen-name]))]]
     (render-tweet-text (:text quote))
     (render-media-grid (:media quote) media-prefix)
     (render-article-card (:article quote) (:tweet-id quote) articles-prefix)]))

(defn render-tweet-card
  "Render a single tweet as a card.
   media-prefix determines the path prefix for local media files."
  [tweet & {:keys [link-to-page media-prefix articles-prefix]
            :or {media-prefix "media/" articles-prefix "articles/"}}]
  (let [tweet-id (:tweet-id tweet)
        user (:user tweet)
        text (:text tweet)
        created-at (:created-at tweet)
        media (:media tweet)
        article (:article tweet)]
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
      (render-tweet-text text)]
     (render-media-grid media media-prefix)
     (render-article-card article tweet-id articles-prefix)
     (render-quote-card (:quote tweet) media-prefix articles-prefix)
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
                 (render-tweet-card tweet :media-prefix "../media/" :articles-prefix "../articles/")]
        html (html-page title content :css-path "../style.css")
        file-path (str output-dir "/tweets/" tweet-id ".html")]
    (util/ensure-directory (str output-dir "/tweets"))
    (spit file-path html)
    file-path))

(defn tweet->json-data
  "Convert a tweet to JSON-serializable format for the web app."
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

(defn generate-tweets-json
  "Generate tweets.json file with all tweet data."
  [tweets output-dir]
  (let [sorted-tweets (sort-by :created-at #(compare %2 %1) tweets)
        json-data (mapv tweet->json-data sorted-tweets)
        file-path (str output-dir "/tweets.json")]
    (spit file-path (json/generate-string json-data))
    (util/log-info "Generated tweets.json with" (count json-data) "tweets")
    file-path))

(defn generate-index-page
  "Generate the main index page with embedded tweet data."
  [tweets output-dir & {:keys [title] :or {title "Twitter Likes Archive"}}]
  (let [sorted-tweets (sort-by :created-at #(compare %2 %1) tweets)
        json-data (mapv tweet->json-data sorted-tweets)
        data-script (str "window.TWEET_DATA = " (json/generate-string json-data) ";")
        content [:div
                 [:header.page-header
                  [:div.header-top
                   [:h1 title]
                   [:button#theme-toggle {:type "button"} "◐"]]
                  [:div.header-controls
                   [:input#search {:type "text" :placeholder "Search..." :autocomplete "off"}]
                   [:div#filters.filters-inline]
                   [:button#sort-toggle.sort-btn {:type "button"} "↓ Newest"]
                   [:button#clear-filters.clear-btn {:style "display:none"} "✕"]]
                  [:p#status.tweet-count "Loading..."]]
                 [:main#tweet-list.tweet-list]
                 [:footer.page-footer
                  [:p "Generated by Twitter Likes Archiver"]]]
        full-script (str data-script "\n" index-app-script)
        html (html-page title content :css-path "style.css" :script full-script)
        file-path (str output-dir "/index.html")]
    (spit file-path html)
    file-path))

(defn generate-all-pages
  "Generate index and individual tweet pages."
  [tweets output-dir {:keys [on-progress]}]
  (util/log-info "Generating HTML pages...")
  (util/ensure-directory output-dir)
  (util/ensure-directory (str output-dir "/tweets"))
  (util/ensure-directory (str output-dir "/articles"))

  ;; Generate individual tweet pages
  (let [total (count tweets)]
    (doseq [[idx tweet] (map-indexed vector tweets)]
      (when on-progress (on-progress idx total (:tweet-id tweet)))
      (generate-tweet-page tweet output-dir)
      ;; Generate article page if present
      (when (:article tweet)
        (generate-article-page tweet output-dir))
      ;; Generate article page for quoted tweet if present
      (when-let [quote-tweet (:quote tweet)]
        (when (:article quote-tweet)
          (generate-article-page quote-tweet output-dir)))))

  ;; Generate tweets.json for the web app
  (generate-tweets-json tweets output-dir)

  ;; Generate index page (shell that loads tweets.json)
  (generate-index-page tweets output-dir)

  (let [article-count (count (filter :article tweets))]
    (util/log-info "Generated" (count tweets) "tweet pages," article-count "article pages, and index")))

(defn copy-css
  "Copy CSS file to output directory."
  [output-dir]
  (let [css-resource (io/resource "templates/style.css")
        dest-path (str output-dir "/style.css")]
    (if css-resource
      (spit dest-path (slurp css-resource))
      (util/log-warn "CSS template not found, using default styles"))))
