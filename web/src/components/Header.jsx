import { MONTHS } from '../tweets.js';
import { inApp } from '../router.js';

export default function Header({ filters, setFilter, clear, facets, sort, setSort, oneAtATime, status }) {
  const { query, year, month, author } = filters;
  const active = query || year || month || author;
  return (
    <header className="page-header">
      <h1>Likes</h1>
      <div className="search">
        <input type="search" placeholder="Search likes" value={query} onChange={e => setFilter('query', e.target.value)} aria-label="Search likes" />
      </div>
      <div className="controls">
        <select value={year} onChange={e => setFilter('year', e.target.value)} aria-label="Year">
          <option value="">Year</option>
          {facets.years.map(([y, count]) => <option key={y} value={y}>{y} ({count})</option>)}
        </select>
        <select value={month} onChange={e => setFilter('month', e.target.value)} aria-label="Month">
          <option value="">Month</option>
          {MONTHS.map((name, i) => {
            const count = year ? facets.monthCount(year, i + 1) : null;
            return <option key={name} value={i + 1} disabled={count === 0}>{name}{count ? ` (${count})` : ''}</option>;
          })}
        </select>
        <select className="author" value={author} onChange={e => setFilter('author', e.target.value)} aria-label="Author">
          <option value="">Author ({facets.authors.length})</option>
          {facets.authors.map(([name, count]) => <option key={name} value={name}>@{name} ({count})</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Order">
          {query.trim() && <option value="best">Best match</option>}
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
          <option value="random">Shuffled</option>
        </select>
        {sort === 'random' && <>
          <button type="button" className="pill" onClick={() => setSort('random')} title="Shuffle into a new order">Reshuffle</button>
          <a className="pill" href={oneAtATime} onClick={inApp(oneAtATime)} title="Read these one at a time">One at a time</a>
        </>}
        {active && <button type="button" className="pill" onClick={clear} title="Clear search and filters">Clear</button>}
      </div>
      <p className="status" role="status">{status}</p>
    </header>
  );
}
