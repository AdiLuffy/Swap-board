import { Link } from "react-router-dom";

export default function PersonCard({ person, tilt = "tilt-l", footnote }) {
  return (
    <Link to={`/people/${person.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div className={`card ${tilt}`}>
        <h3>{person.name}</h3>
        <div className="meta">{person.location} · joined {person.joinedAt}</div>
        {person.offers?.length > 0 && (
          <>
            <div className="card-label">Offers</div>
            <div className="tag-row">
              {person.offers.slice(0, 4).map((s) => (
                <span className="tag offer" key={s}>{s}</span>
              ))}
            </div>
          </>
        )}
        {person.wants?.length > 0 && (
          <>
            <div className="card-label">Wants</div>
            <div className="tag-row">
              {person.wants.slice(0, 4).map((s) => (
                <span className="tag want" key={s}>{s}</span>
              ))}
            </div>
          </>
        )}
        {footnote && <div className="card-label" style={{ marginTop: 10 }}>{footnote}</div>}
      </div>
    </Link>
  );
}
