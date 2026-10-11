import TweetText from './TweetText.jsx';
import Media from './Media.jsx';
import Avatar from './Avatar.jsx';

export default function QuoteCard({ quote, parentId, query }) {
  if (!quote) return null;
  const user = quote.user || {};
  const href = quote.article ? '/archive/articles/' + quote.tweetId + '.html' : 'https://x.com/i/status/' + quote.tweetId;
  return (
    <div className="quote-card">
      <a className="quote-header" href={href} target="_blank" rel="noopener noreferrer">
        <Avatar src={user.profileImage} className="quote-avatar" />
        <span className="display-name">{user.name || user.screenName}</span>
        {user.screenName && <span className="secondary">@{user.screenName}</span>}
      </a>
      {/* Quote translations are looked up through the tweet that quotes them. */}
      {quote.text && <TweetText className="quote-text" tweetId={parentId} quoted text={quote.text} query={query} clampLong={false} />}
      <Media media={quote.media} />
      {quote.article && (
        <a className="quote-article" href={href} target="_blank" rel="noopener noreferrer">
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
