// Split article text into runs that share the same bold, italic and link ranges.
// Offsets count UTF-16 code units, as JavaScript strings do.
export function segments(text, styles = [], links = []) {
  const cuts = new Set([0, text.length]);
  for (const { offset, length } of [...styles, ...links]) { cuts.add(Math.max(0, offset)); cuts.add(Math.min(text.length, offset + length)); }
  const points = [...cuts].sort((a, b) => a - b);
  const covers = (range, at) => range.offset <= at && at < range.offset + range.length;
  const runs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const at = points[i];
    const run = {
      text: text.slice(at, points[i + 1]),
      bold: styles.some(s => s.style === 'bold' && covers(s, at)),
      italic: styles.some(s => s.style === 'italic' && covers(s, at)),
      href: links.find(link => covers(link, at))?.url || null,
    };
    const last = runs.at(-1);
    if (last && last.bold === run.bold && last.italic === run.italic && last.href === run.href) last.text += run.text;
    else runs.push(run);
  }
  return runs;
}

// Consecutive list items become one list.
export function groupBlocks(blocks) {
  const groups = [];
  for (const block of blocks) {
    const last = groups.at(-1);
    if ((block.type === 'ul' || block.type === 'ol') && last?.type === block.type && last.items) last.items.push(block);
    else groups.push(block.type === 'ul' || block.type === 'ol' ? { type: block.type, items: [block] } : block);
  }
  return groups;
}
