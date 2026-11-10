export default function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-live="polite">
      <p className="sr">Loading</p>
      <div className="skel-head" /><div className="grid pad">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skel-card"><div className="skel-img" /><div className="skel-line" /><div className="skel-line short" /></div>)}</div>
    </div>
  );
}
