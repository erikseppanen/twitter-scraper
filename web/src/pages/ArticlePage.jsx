import { useEffect, useState } from 'react';
import { PageBar } from './TweetPage.jsx';
import RichText from '../components/RichText.jsx';
import RelatedPanel from '../components/RelatedPanel.jsx';
import { getJSON } from '../api.js';
import { segments, groupBlocks } from '../article.js';
import { formatDate } from '../tweets.js';
import { navigate, inApp } from '../router.js';

const image = name => '/archive/articles/' + encodeURIComponent(name);

function Text({ block }) {
  return segments(block.text, block.styles, block.links).map((run, i) => {
    let content = run.href
      ? <a href={run.href} target="_blank" rel="noopener noreferrer">{run.text}</a>
      : <RichText text={run.text} />;
    if (run.italic) content = <em>{content}</em>;
    if (run.bold) content = <strong>{content}</strong>;
    return <span key={i}>{content}</span>;
  });
}

function Block({ block, byId }) {
  switch (block.type) {
    case 'h1': return <h2><Text block={block} /></h2>;
    case 'h2': return <h3><Text block={block} /></h3>;
    case 'quote': return <blockquote><Text block={block} /></blockquote>;
    case 'ul': return <ul>{block.items.map((item, i) => <li key={i}><Text block={item} /></li>)}</ul>;
    case 'ol': return <ol>{block.items.map((item, i) => <li key={i}><Text block={item} /></li>)}</ol>;
    case 'image': return <figure><img src={image(block.src)} alt={block.caption || ''} loading="lazy" />{block.caption && <figcaption>{block.caption}</figcaption>}</figure>;
    case 'divider': return <hr />;
    case 'code': return <pre><code>{block.code}</code></pre>;
    case 'tweet': {
      // An embedded post: open it here when it is in the archive, otherwise on X.
      const own = byId.has(block.tweetId);
      const href = own ? '/app/tweet/' + block.tweetId : 'https://x.com/i/status/' + block.tweetId;
      return <p><a className="embedded-post" href={href} {...(own ? { onClick: inApp(href) } : { target: '_blank', rel: 'noopener noreferrer' })}>View the embedded post{own ? '' : ' on X'}</a></p>;
    }
    default: return <p><Text block={block} /></p>;
  }
}

// An X article, read from the archive's copy with its downloaded images.
export default function ArticlePage({ id, byId, wide, onRemove }) {
  const [article, setArticle] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getJSON('/archive/articles/' + id + '.json', { decode: false }).then(setArticle,
      e => setError(e.status === 404 ? 'This article is not in your archive.' : e.message));
  }, [id]);

  const user = article?.user || {};
  const author = user.screenName && '/app/?author=' + encodeURIComponent(user.screenName);
  const date = article && formatDate(article.createdAt);
  const related = byId.has(id) && wide && (
    <RelatedPanel id={id} byId={byId} mode="sidebar" onRelated={next => navigate('/app/tweet/' + next)} onRemove={onRemove} />
  );
  return (
    <>
      <main className="timeline">
        <PageBar title="Article" />
        {!article && <p className="empty">{error || 'Loading…'}</p>}
        {article && (
          <article className="article">
            {article.cover && <img className="article-hero" src={image(article.cover)} alt="" />}
            <h1>{article.title}</h1>
            <p className="article-meta">
              {author ? <a href={author} onClick={inApp(author)} title={'Show your likes from @' + user.screenName}>{user.name || '@' + user.screenName}</a> : user.name}
              {date && <> · {date}</>}
              {byId.has(id) && <> · <a href={'/app/tweet/' + id} onClick={inApp('/app/tweet/' + id)}>Tweet</a></>}
              {' · '}<a href={'https://x.com/i/status/' + id} target="_blank" rel="noopener noreferrer">X</a>
            </p>
            {groupBlocks(article.blocks || []).map((block, i) => <Block key={i} block={block} byId={byId} />)}
          </article>
        )}
      </main>
      {related || (wide && <div className="sidebar-spacer" />)}
    </>
  );
}
