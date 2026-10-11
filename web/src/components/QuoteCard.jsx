import RichText from './RichText.jsx';
import Media from './Media.jsx';

export default function QuoteCard({ quote, query }) {
  if (!quote) return null;
  const user = quote.user || {};
  const href = quote.article ? '/archive/articles/' + quote.tweetId + '.html' : 'https://x.com/i/status/' + quote.tweetId;
  return (
    <div className="quote-card">
      <a className="quote-header" href={href} target="_blank" rel="noopener noreferrer">
        {user.profileImage && <img className="quote-avatar" src={user.profileImage} alt="" loading="lazy" />}
        <span className="display-name">{user.name || user.screenName}</span>
        {user.screenName && <span className="secondary">@{user.screenName}</span>}
      </a>
      {quote.text && <div className="quote-text"><RichText text={quote.text} query={query} /></div>}
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
