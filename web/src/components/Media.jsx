import { mediaSource } from '../tweets.js';

export default function Media({ media }) {
  const items = (media || []).filter(item => mediaSource(item));
  if (!items.length) return null;
  return (
    <div className={'media-grid media-count-' + Math.min(items.length, 4)}>
      {items.slice(0, 4).map((item, i) => {
        const src = mediaSource(item);
        return (
          <div className="media-item" key={i}>
            {item.type === 'photo' && <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="" loading="lazy" /></a>}
            {item.type === 'video' && <video controls preload="metadata" poster={item.poster || undefined} src={src} />}
            {item.type === 'gif' && <video autoPlay loop muted playsInline src={src} />}
          </div>
        );
      })}
    </div>
  );
}
