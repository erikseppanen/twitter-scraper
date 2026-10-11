import { Highlighted } from './RichText.jsx';

export default function ArticleCard({ article, tweetId, query }) {
  if (!article) return null;
  const preview = (article.previewText || '').slice(0, 150);
  return (
    <a className="article-card" href={'/archive/articles/' + tweetId + '.html'} target="_blank" rel="noopener noreferrer">
      {article.coverImage && <img className="article-cover" src={'/archive/articles/' + tweetId + '-cover.jpg'} alt="" loading="lazy" />}
      <div className="article-info">
        <div className="article-title"><Highlighted text={article.title || ''} query={query} /></div>
        {preview && <div className="article-preview"><Highlighted text={preview} query={query} /></div>}
      </div>
    </a>
  );
}
