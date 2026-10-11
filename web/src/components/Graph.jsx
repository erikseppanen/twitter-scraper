import { useMemo, useRef, useState } from 'react';

function label(tweet, length) {
  const text = (tweet.text || tweet.quote?.text || 'Saved tweet').replace(/\s+/g, ' ');
  return text.length > length ? text.slice(0, length) + '…' : text;
}

// The selected tweet in the middle, neighbors around it; closer and larger means more
// similar. Drag the background to pan; Fit graph recenters.
export default function Graph({ data, onSelect, compact }) {
  const [pan, setPan] = useState({ data: null, x: 0, y: 0 });
  const drag = useRef(null);
  const svg = useRef(null);
  const width = compact ? 420 : 800, height = compact ? 470 : 440;
  const [kx, ky] = compact ? [0.72, 0.84] : [1.35, 0.78];
  const points = useMemo(() => new Map(data.nodes.map((node, i) => {
    if (!i) return [node.tweet.tweetId, [width / 2, height / 2]];
    const angle = (i - 1) * 2 * Math.PI / Math.max(1, data.nodes.length - 1);
    const radius = 125 + (1 - node.score) * 100;
    return [node.tweet.tweetId, [width / 2 + Math.cos(angle) * radius * kx, height / 2 + Math.sin(angle) * radius * ky]];
  })), [data, width, height, kx, ky]);
  // A new neighborhood starts centered.
  const { x, y } = pan.data === data ? pan : { x: 0, y: 0 };

  const onPointerDown = e => {
    if (e.target.closest('.node')) return;
    drag.current = { startX: e.clientX, startY: e.clientY, x, y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = e => {
    if (!drag.current) return;
    const ratio = width / svg.current.getBoundingClientRect().width;
    setPan({ data, x: drag.current.x + (e.clientX - drag.current.startX) * ratio, y: drag.current.y + (e.clientY - drag.current.startY) * ratio });
  };
  const stop = () => { drag.current = null; };

  return (
    <div className="graph">
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Graph of related tweets. Use Tab and Enter to move between tweets."
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stop} onPointerCancel={stop}>
        <g transform={`translate(${x},${y})`}>
          {data.edges.map(edge => {
            const [x1, y1] = points.get(edge.source) || [], [x2, y2] = points.get(edge.target) || [];
            if (x1 === undefined || x2 === undefined) return null;
            return <line key={edge.source + '-' + edge.target} className="edge" x1={x1} y1={y1} x2={x2} y2={y2}
              opacity={edge.source === data.center ? 0.3 + edge.score * 0.6 : 0.15} strokeWidth={1 + edge.score * 3} />;
          })}
          {data.nodes.map(node => {
            const [nx, ny] = points.get(node.tweet.tweetId), center = node.tweet.tweetId === data.center;
            const name = '@' + (node.tweet.user?.screenName || 'unknown') + ': ' + label(node.tweet, 90);
            const select = () => { if (!center) onSelect(node.tweet.tweetId); };
            return (
              <g key={node.tweet.tweetId} className={'node' + (center ? ' center' : '')} transform={`translate(${nx},${ny})`}
                tabIndex={center ? -1 : 0} role={center ? undefined : 'button'} aria-label={name} onClick={select}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } }}>
                <circle r={center ? 21 : 12 + node.score * 7} />
                <text y={38} textAnchor="middle">{label(node.tweet, compact ? 18 : 28)}</text>
                <title>{name}</title>
              </g>
            );
          })}
        </g>
      </svg>
      <button type="button" className="pill fit" onClick={() => setPan({ data, x: 0, y: 0 })}>Fit graph</button>
    </div>
  );
}
