import { useState } from 'react';

// Profile pictures are remote and disappear when people change them; fall back to a circle.
export default function Avatar({ src, className }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={className + ' avatar-placeholder'} />;
  return <img className={className} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}
