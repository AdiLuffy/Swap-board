export function Loading({ count = 6 }) {
  return (
    <div className="card-grid" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-card" key={i} />
      ))}
    </div>
  );
}

export function ErrorState({ title = "Something snagged", detail, onRetry }) {
  return (
    <div className="state-block error" role="alert">
      <div className="state-title">{title}</div>
      <p>{detail || "The board couldn't load right now."}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry} style={{ marginTop: 10 }}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, detail }) {
  return (
    <div className="state-block">
      <div className="state-title">{title}</div>
      <p>{detail}</p>
    </div>
  );
}
