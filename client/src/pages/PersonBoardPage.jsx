import { useEffect, useRef, useState, useLayoutEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client.js";
import PersonCard from "../components/PersonCard.jsx";
import { Loading, ErrorState, EmptyState } from "../components/States.jsx";

export default function PersonBoardPage() {
  const { id } = useParams();
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    Promise.all([
      api.person(id),
      api.directMatches(id),
      api.swapChains(id),
      api.recommendations(id),
    ])
      .then(([person, direct, chains, recs]) => {
        if (cancelled) return;
        setState({ status: "ready", person, direct, chains, recs });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: "error", error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "loading") return <Loading count={4} />;
  if (state.status === "error")
    return <ErrorState detail={state.error} onRetry={() => setState({ status: "loading" })} />;

  const { person, direct, chains, recs } = state;

  return (
    <div>
      <Link to="/" className="btn secondary" style={{ display: "inline-block", marginBottom: 18 }}>
        ← Back to board
      </Link>

      <ThreadBoard center={person} matches={direct} />

      <h2 className="section-title">Barter chains through {person.name.split(" ")[0]}</h2>
      {chains.length === 0 ? (
        <EmptyState
          title="No chains found yet"
          detail="No 3- or 4-person loop closes back to this person right now — as the board grows, longer chains tend to appear."
        />
      ) : (
        chains.map((chain, idx) => <ChainRow key={idx} chain={chain} />)
      )}

      <h2 className="section-title">Skills {person.name.split(" ")[0]} might want next</h2>
      {recs.length === 0 ? (
        <EmptyState title="Not enough data yet" detail="Recommendations improve as more people join the board." />
      ) : (
        <div className="tag-row">
          {recs.map((r) => (
            <span className="tag want" key={r.skill.id} title={`Wanted by ${r.score} people with similar interests`}>
              {r.skill.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ThreadBoard({ center, matches }) {
  const containerRef = useRef(null);
  const centerRef = useRef(null);
  const matchRefs = useRef([]);
  const [lines, setLines] = useState([]);

  useLayoutEffect(() => {
    function measure() {
      if (!containerRef.current || !centerRef.current) return;
      const box = containerRef.current.getBoundingClientRect();
      const from = centerRef.current.getBoundingClientRect();
      const fromPoint = { x: from.left + from.width / 2 - box.left, y: from.top + from.height / 2 - box.top };
      const next = matchRefs.current.filter(Boolean).map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
      });
      setLines(next.map((to) => ({ from: fromPoint, to })));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [matches.length]);

  return (
    <div className="board-canvas" ref={containerRef}>
      <svg className="board-thread-svg">
        {lines.map((l, i) => (
          <path
            key={i}
            className="thread-path"
            d={threadPath(l.from, l.to)}
          />
        ))}
      </svg>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: matches.length ? 40 : 0 }}>
        <div style={{ width: 260 }} ref={centerRef}>
          <div className="card tilt-l">
            <h3>{center.name}</h3>
            <div className="meta">{center.location} · joined {center.joinedAt}</div>
            <p style={{ fontSize: 13.5, margin: "8px 0" }}>{center.bio}</p>
            <div className="card-label">Offers</div>
            <div className="tag-row">
              {center.offers.map((o) => (
                <span className="tag offer" key={o.id} title={o.description}>{o.skill} · {o.level}</span>
              ))}
            </div>
            <div className="card-label">Wants</div>
            <div className="tag-row">
              {center.wants.map((w) => (
                <span className="tag want" key={w.id}>{w.skill}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {matches.length > 0 && (
        <>
          <h2 className="section-title" style={{ textAlign: "center" }}>Direct swap matches</h2>
          <div className="card-grid">
            {matches.map((m, i) => (
              <div key={m.person.id} style={{ "--i": i }} ref={(el) => (matchRefs.current[i] = el)}>
                <PersonCard
                  person={m.person}
                  tilt={i % 2 === 0 ? "tilt-r" : "tilt-l"}
                  footnote={`You teach ${m.iTeach} · they teach ${m.theyTeach}`}
                />
              </div>
            ))}
          </div>
        </>
      )}
      {matches.length === 0 && (
        <EmptyState title="No direct match yet" detail="Nobody currently offers what this person wants while wanting what they offer. Check the chains below instead." />
      )}
    </div>
  );
}

function threadPath(from, to) {
  const midY = (from.y + to.y) / 2;
  const sag = 18;
  return `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${midY + sag}, ${to.x} ${to.y}`;
}

function ChainRow({ chain }) {
  return (
    <div className="chain-strip">
      {chain.people.map((p, i) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center" }}>
          <div className="chain-node">
            <Link to={`/people/${p.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="card tilt-l" style={{ padding: "12px 14px" }}>
                <h3 style={{ fontSize: 15 }}>{p.name}</h3>
                <div className="meta">{p.location}</div>
              </div>
            </Link>
          </div>
          <div className="chain-arrow">
            teaches
            <br />
            {chain.handoffs[i]}
            <br />
            →
          </div>
        </div>
      ))}
      <div className="chain-arrow">back to<br />{chain.people[0].name.split(" ")[0]}<br />↺</div>
    </div>
  );
}
