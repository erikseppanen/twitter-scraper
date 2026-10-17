import { inApp } from '../router.js';
import { HomeIcon, RandomIcon, UpdatesIcon, ThemeIcon } from './Icons.jsx';

const ITEMS = [
  ['timeline', '/app/', 'Likes', HomeIcon],
  ['random', '/app/random', 'Random', RandomIcon],
  ['updates', '/app/updates', 'Updates', UpdatesIcon],
];

// X-style navigation: labeled on wide screens, icons when narrower, a tab bar on phones.
export default function Nav({ page, theme, toggleTheme }) {
  const current = page === 'tweet' || page === 'article' ? 'timeline' : page;
  return (
    <nav className="nav" aria-label="Main">
      {ITEMS.map(([key, href, label, Icon]) => (
        <a key={key} className={'nav-item' + (current === key ? ' current' : '')} href={href} onClick={inApp(href)}
          aria-current={current === key ? 'page' : undefined} title={label}>
          <Icon /><span className="nav-label">{label}</span>
        </a>
      ))}
      <button type="button" className="nav-item" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme">
        <ThemeIcon /><span className="nav-label">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
      </button>
    </nav>
  );
}
