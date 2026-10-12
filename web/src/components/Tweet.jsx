import { Highlighted } from './RichText.jsx';
import TweetText from './TweetText.jsx';
import Media from './Media.jsx';
import Avatar from './Avatar.jsx';
import QuoteCard from './QuoteCard.jsx';
import ArticleCard from './ArticleCard.jsx';
import { RelatedIcon, LinkIcon, TrashIcon, ExternalIcon } from './Icons.jsx';
import { formatDate } from '../tweets.js';
import { inApp } from '../router.js';

export default function Tweet({ tweet, query, onAuthor, onRelated, onRemove, active = false, full = false, children }) {
  const user = tweet.user || {};
  const date = formatDate(tweet.createdAt);
  const page = '/app/tweet/' + tweet.tweetId;
  return (
    <article className={'tweet' + (active ? ' active' : '') + (full ? ' full' : '')} id={'tweet-' + tweet.tweetId}>
      <div className="tweet-avatar">
        <Avatar src={user.profileImage} className="avatar" />
      </div>
      <div className="tweet-body">
        <header className="tweet-header">
          <span className="display-name"><Highlighted text={user.name || user.screenName || 'Unknown'} query={query} /></span>
          {user.screenName && (onAuthor
            ? <button type="button" className="secondary handle" title={'Show likes from @' + user.screenName} onClick={() => onAuthor(user.screenName)}>@<Highlighted text={user.screenName} query={query} /></button>
            : <span className="secondary handle">@{user.screenName}</span>)}
          {date && <><span className="secondary">·</span><a className="secondary date" href={page} onClick={inApp(page)} title="Open this tweet">{date}</a></>}
        </header>
        {tweet.text && <TweetText className="tweet-text" tweetId={tweet.tweetId} text={tweet.text} query={query} clampLong={!full} />}
        <Media media={tweet.media} />
        <ArticleCard article={tweet.article} tweetId={tweet.tweetId} query={query} />
        <QuoteCard quote={tweet.quote} parentId={tweet.tweetId} query={query} />
        {children}
        <footer className="actions">
          {onRelated && <button type="button" className="action" onClick={() => onRelated(tweet.tweetId)} title="Show related likes" aria-label="Related"><RelatedIcon /><span className="action-label">Related</span></button>}
          {/* The stable address is the link target; clicking stays in the app. */}
          <a className="action" href={'/tweet/' + tweet.tweetId} onClick={inApp(page)} title="Permanent link to this tweet" aria-label="Permalink"><LinkIcon /><span className="action-label">Permalink</span></a>
          <a className="action" href={'https://x.com/i/status/' + tweet.tweetId} target="_blank" rel="noopener noreferrer" title="View on X" aria-label="X"><ExternalIcon /><span className="action-label">X</span></a>
          {onRemove && <button type="button" className="action remove" onClick={() => onRemove(tweet)} title="Remove from archive" aria-label="Remove"><TrashIcon /><span className="action-label">Remove</span></button>}
        </footer>
      </div>
    </article>
  );
}
