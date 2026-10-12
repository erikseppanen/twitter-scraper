import TweetText from './TweetText.jsx';
import Media from './Media.jsx';
import Avatar from './Avatar.jsx';
import { inApp } from '../router.js';

export default function QuoteCard({ quote, parentId, query }) {
  if (!quote) return null;
  const user = quote.user || {};
  // A quoted article opens in the app; other quotes open on X.
  const href = quote.article ? '/app/article/' + quote.tweetId : 'https://x.com/i/status/' + quote.tweetId;
  const link = quote.article ? { onClick: inApp(href) } : { target: '_blank', rel: 'noopener noreferrer' };
  return (
    <div className="quote-card">
      <a className="quote-header" href={href} {...link}>
        <Avatar src={user.profileImage} className="quote-avatar" />
        <span className="display-name">{user.name || user.screenName}</span>
        {user.screenName && <span className="secondary">@{user.screenName}</span>}
      </a>
      {/* Quote translations are looked up through the tweet that quotes them. */}
      {quote.text && <TweetText className="quote-text" tweetId={parentId} quoted text={quote.text} query={query} clampLong={false} />}
      <Media media={quote.media} />
      {quote.article && (
        <a className="quote-article" href={href} {...link}>
          {quote.article.coverImage && <img src={'/archive/articles/' + quote.tweetId + '-cover.jpg'} alt="" loading="lazy" />}
          <div>
            <div className="article-title">{quote.article.title}</div>
            {quote.article.previewText && <div className="article-preview">{quote.article.previewText.slice(0, 100)}…</div>}
          </div>
        </a>
      )}
    </div>
  );
}
