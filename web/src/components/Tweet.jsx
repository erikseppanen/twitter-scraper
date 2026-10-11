import { useState } from 'react';
import RichText, { Highlighted } from './RichText.jsx';
import Media from './Media.jsx';
import QuoteCard from './QuoteCard.jsx';
import ArticleCard from './ArticleCard.jsx';
import { formatDate } from '../tweets.js';

const LONG = 280;

export default function Tweet({ tweet, query, onAuthor }) {
  const [expanded, setExpanded] = useState(false);
  const user = tweet.user || {};
  const long = (tweet.text || '').length > LONG;
  const date = formatDate(tweet.createdAt);
  return (
    <article className="tweet" id={'tweet-' + tweet.tweetId}>
      <div className="tweet-avatar">
        {user.profileImage ? <img src={user.profileImage} alt="" loading="lazy" /> : <span className="avatar-placeholder" />}
      </div>
      <div className="tweet-body">
        <header className="tweet-header">
          <span className="display-name"><Highlighted text={user.name || user.screenName || 'Unknown'} query={query} /></span>
          {user.screenName && (
            <button type="button" className="secondary handle" title={'Show likes from @' + user.screenName} onClick={() => onAuthor(user.screenName)}>
              @<Highlighted text={user.screenName} query={query} />
            </button>
          )}
          {date && <><span className="secondary">·</span><a className="secondary date" href={'/archive/tweets/' + tweet.tweetId + '.html'} title="View page">{date}</a></>}
          <a className="x-link" href={'https://x.com/i/status/' + tweet.tweetId} target="_blank" rel="noopener noreferrer" title="View on X" aria-label="View on X">↗</a>
        </header>
        {tweet.text && (
          <>
            <p className={'tweet-text' + (long && !expanded ? ' clamped' : '')}><RichText text={tweet.text} query={query} /></p>
            {long && <button type="button" className="show-more" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show more'}</button>}
          </>
        )}
        <Media media={tweet.media} />
        <ArticleCard article={tweet.article} tweetId={tweet.tweetId} query={query} />
        <QuoteCard quote={tweet.quote} query={query} />
      </div>
    </article>
  );
}
