import { tokenize, highlight } from '../tweets.js';

function Highlighted({ text, query }) {
  return highlight(text, query).map((piece, i) => piece.match ? <mark key={i}>{piece.text}</mark> : piece.text);
}

export default function RichText({ text, query }) {
  return tokenize(text).map((part, i) => part.type === 'link'
    ? <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}><Highlighted text={part.text} query={query} /></a>
    : <Highlighted key={i} text={part.text} query={query} />);
}

export { Highlighted };
