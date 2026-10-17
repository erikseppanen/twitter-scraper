import Tweet from '../components/Tweet.jsx';
import RelatedPanel from '../components/RelatedPanel.jsx';
import CopyLinks from '../components/CopyLinks.jsx';
import { BackIcon } from '../components/Icons.jsx';
import { navigate, goBack } from '../router.js';

export function PageBar({ title, back = '/app/' }) {
  return (
    <header className="page-header page-bar">
      <a className="icon-button" href={back} aria-label="Back" title="Back"
        onClick={e => { e.preventDefault(); goBack(back); }}><BackIcon /></a>
      <h1>{title}</h1>
    </header>
  );
}

export default function TweetPage({ id, tweets, byId, error, wide, onRemove, notify }) {
  const tweet = byId.get(id);
  const openTweet = next => navigate('/app/tweet/' + next);
  const related = tweet && <RelatedPanel id={id} byId={byId} mode={wide ? 'sidebar' : 'inline'} onRelated={openTweet} onRemove={onRemove} />;
  return (
    <>
      <main className="timeline">
        <PageBar title="Tweet" />
        {tweet && <Tweet tweet={tweet} full onRemove={onRemove}><CopyLinks tweet={tweet} notify={notify} /></Tweet>}
        {!tweet && <p className="empty">{tweets ? 'This tweet is not in your archive.' : error || 'Loading…'}</p>}
        {!wide && related}
      </main>
      {wide && related}
    </>
  );
}
