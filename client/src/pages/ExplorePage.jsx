import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import PersonCard from "../components/PersonCard.jsx";
import { Loading, ErrorState, EmptyState } from "../components/States.jsx";

const LIMIT = 12;

export default function ExplorePage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [debounced]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api
      .people({ search: debounced, page, limit: LIMIT })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setData({ error: err.message });
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, page]);

  const totalPages = data && data.total ? Math.ceil(data.total / LIMIT) : 1;

  return (
    <div>
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search by name or city..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search people"
        />
        {data?.total != null && status === "ready" && (
          <span style={{ color: "#fff8ec", fontFamily: "var(--font-mono)", fontSize: 13 }}>
            {data.total} {data.total === 1 ? "person" : "people"} pinned to the board
          </span>
        )}
      </div>

      {status === "loading" && <Loading />}

      {status === "error" && (
        <ErrorState detail={data?.error} onRetry={() => setPage((p) => p)} />
      )}

      {status === "ready" && data.people.length === 0 && (
        <EmptyState
          title="No one matches that search"
          detail="Try a different name or city — or clear the search to see everyone on the board."
        />
      )}

      {status === "ready" && data.people.length > 0 && (
        <>
          <div className="card-grid">
            {data.people.map((p, i) => (
              <div key={p.id} style={{ "--i": i }}>
                <PersonCard person={p} tilt={i % 2 === 0 ? "tilt-l" : "tilt-r"} />
              </div>
            ))}
          </div>
          <div className="pager" style={{ marginTop: 26, justifyContent: "center" }}>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <span>
              page {page} / {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
