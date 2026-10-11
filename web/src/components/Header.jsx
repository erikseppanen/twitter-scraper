import { MONTHS } from '../tweets.js';

export default function Header({ filters, setFilter, clear, facets, sort, toggleSort, status }) {
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
        <button type="button" className="pill" onClick={toggleSort} title={sort === 'desc' ? 'Showing newest first' : 'Showing oldest first'}>{sort === 'desc' ? '↓ Newest' : '↑ Oldest'}</button>
        {active && <button type="button" className="pill" onClick={clear} title="Clear search and filters">Clear</button>}
      </div>
      <p className="status" role="status">{status}</p>
    </header>
  );
}
