import neo4j from "neo4j-driver";
import { runQuery } from "../config/db.js";

/** Small helper: turn a Neo4j node/record field into a plain JS object. */
function toPlain(node) {
  if (node === null || node === undefined) return null;
  return { id: node.properties.id, ...node.properties };
}

// ---------------------------------------------------------------------------
// People & skills — basic reads, all paginated / parameterised.
// ---------------------------------------------------------------------------

export async function listPeople({ search = "", skip = 0, limit = 20 } = {}) {
  const records = await runQuery(
    `
    MATCH (p:Person)
    WHERE $search = '' OR toLower(p.name) CONTAINS toLower($search)
                       OR toLower(p.location) CONTAINS toLower($search)
    OPTIONAL MATCH (p)-[:OFFERS]->(offered:Skill)
    OPTIONAL MATCH (p)-[:WANTS]->(wanted:Skill)
    WITH p, collect(DISTINCT offered.name) AS offers, collect(DISTINCT wanted.name) AS wants
    RETURN p, offers, wants
    ORDER BY p.name
    SKIP $skip LIMIT $limit
    `,
    { search, skip: neo4jInt(skip), limit: neo4jInt(limit) }
  );
  return records.map((r) => ({
    ...toPlain(r.get("p")),
    offers: r.get("offers").filter(Boolean),
    wants: r.get("wants").filter(Boolean),
  }));
}

export async function countPeople({ search = "" } = {}) {
  const records = await runQuery(
    `MATCH (p:Person)
     WHERE $search = '' OR toLower(p.name) CONTAINS toLower($search)
                        OR toLower(p.location) CONTAINS toLower($search)
     RETURN count(p) AS total`,
    { search }
  );
  return records[0].get("total").toNumber();
}

export async function getPerson(id) {
  const records = await runQuery(
    `
    MATCH (p:Person {id: $id})
    OPTIONAL MATCH (p)-[o:OFFERS]->(offSkill:Skill)
    OPTIONAL MATCH (p)-[w:WANTS]->(wantSkill:Skill)
    RETURN p,
           collect(DISTINCT {skill: offSkill.name, id: offSkill.id, level: o.level, description: o.description}) AS offers,
           collect(DISTINCT {skill: wantSkill.name, id: wantSkill.id, priority: w.priority}) AS wants
    `,
    { id }
  );
  if (records.length === 0) return null;
  const r = records[0];
  return {
    ...toPlain(r.get("p")),
    offers: r.get("offers").filter((o) => o.skill),
    wants: r.get("wants").filter((w) => w.skill),
  };
}

export async function listSkills({ search = "", limit = 50 } = {}) {
  const records = await runQuery(
    `
    MATCH (s:Skill)
    WHERE $search = '' OR toLower(s.name) CONTAINS toLower($search)
    RETURN s ORDER BY s.name LIMIT $limit
    `,
    { search, limit: neo4jInt(limit) }
  );
  return records.map((r) => toPlain(r.get("s")));
}

// ---------------------------------------------------------------------------
// Query 1: Direct mutual swaps.
// A 2-hop pattern matched in both directions at once: person A offers a
// skill that B wants, AND B offers a skill that A wants.
// ---------------------------------------------------------------------------
export async function findDirectMatches(personId) {
  const records = await runQuery(
    `
    MATCH (me:Person {id: $personId})-[:OFFERS]->(mySkill:Skill)<-[:WANTS]-(other:Person)
    MATCH (other)-[:OFFERS]->(theirSkill:Skill)<-[:WANTS]-(me)
    WHERE other.id <> me.id
    RETURN DISTINCT other, mySkill.name AS iTeach, theirSkill.name AS theyTeach
    ORDER BY other.name
    `,
    { personId }
  );
  return records.map((r) => ({
    person: toPlain(r.get("other")),
    iTeach: r.get("iTeach"),
    theyTeach: r.get("theyTeach"),
  }));
}

// ---------------------------------------------------------------------------
// Query 2: Barter cycles of 3-4 people. This is the query a relational
// database handles badly: it needs one extra self-join per chain length,
// with the join condition changing shape each time. In Cypher it's a single
// variable-length pattern that closes back on the starting person.
// ---------------------------------------------------------------------------
export async function findSwapChains(personId) {
  // Plain openCypher, no plugins required (safe for a managed free-tier
  // instance): two explicit fixed-length cycles, 3-person and 4-person.
  // This is the query that's genuinely awkward in SQL - each extra link in
  // the chain needs another self-join of the same table, with the closing
  // condition changing shape every time. Here it's just one more MATCH
  // clause per hop.
  const three = await runQuery(
    `
    MATCH (a:Person {id: $personId})-[:OFFERS]->(s1:Skill)<-[:WANTS]-(b:Person),
          (b)-[:OFFERS]->(s2:Skill)<-[:WANTS]-(c:Person),
          (c)-[:OFFERS]->(s3:Skill)<-[:WANTS]-(a)
    WHERE a.id <> b.id AND b.id <> c.id AND a.id <> c.id
    RETURN DISTINCT a, s1.name AS aTeaches, b, s2.name AS bTeaches, c, s3.name AS cTeaches
    LIMIT 15
    `,
    { personId }
  );

  const four = await runQuery(
    `
    MATCH (a:Person {id: $personId})-[:OFFERS]->(s1:Skill)<-[:WANTS]-(b:Person),
          (b)-[:OFFERS]->(s2:Skill)<-[:WANTS]-(c:Person),
          (c)-[:OFFERS]->(s3:Skill)<-[:WANTS]-(d:Person),
          (d)-[:OFFERS]->(s4:Skill)<-[:WANTS]-(a)
    WHERE a.id <> b.id AND b.id <> c.id AND c.id <> d.id
      AND a.id <> c.id AND a.id <> d.id AND b.id <> d.id
    RETURN DISTINCT a, s1.name AS aTeaches, b, s2.name AS bTeaches,
           c, s3.name AS cTeaches, d, s4.name AS dTeaches
    LIMIT 10
    `,
    { personId }
  );

  const chains3 = three.map((r) => ({
    length: 3,
    people: [toPlain(r.get("a")), toPlain(r.get("b")), toPlain(r.get("c"))],
    handoffs: [r.get("aTeaches"), r.get("bTeaches"), r.get("cTeaches")],
  }));
  const chains4 = four.map((r) => ({
    length: 4,
    people: [toPlain(r.get("a")), toPlain(r.get("b")), toPlain(r.get("c")), toPlain(r.get("d"))],
    handoffs: [r.get("aTeaches"), r.get("bTeaches"), r.get("cTeaches"), r.get("dTeaches")],
  }));
  return [...chains3, ...chains4];
}

// ---------------------------------------------------------------------------
// Query 3: Skill recommendations via collaborative filtering.
// "People who want what you want also want X" - a 2-hop pattern.
// ---------------------------------------------------------------------------
export async function recommendSkills(personId, { limit = 8 } = {}) {
  const records = await runQuery(
    `
    MATCH (me:Person {id: $personId})-[:WANTS]->(shared:Skill)<-[:WANTS]-(peer:Person)
    MATCH (peer)-[:WANTS]->(rec:Skill)
    WHERE NOT (me)-[:WANTS]->(rec) AND rec <> shared
    RETURN rec, count(DISTINCT peer) AS score
    ORDER BY score DESC
    LIMIT $limit
    `,
    { personId, limit: neo4jInt(limit) }
  );
  return records.map((r) => ({ skill: toPlain(r.get("rec")), score: r.get("score").toNumber() }));
}

// ---------------------------------------------------------------------------
// Query 4: Shortest connection path between two people through the skill
// graph (who could introduce me to whom, via shared skill interests).
// ---------------------------------------------------------------------------
export async function shortestConnection(fromId, toId) {
  const records = await runQuery(
    `
    MATCH (a:Person {id: $fromId}), (b:Person {id: $toId})
    MATCH path = shortestPath((a)-[:OFFERS|WANTS*..10]-(b))
    RETURN path
    `,
    { fromId, toId }
  );
  if (records.length === 0) return null;
  const path = records[0].get("path");
  return path.segments.map((seg) => ({
    from: seg.start.labels.includes("Person") ? toPlain(seg.start) : toPlain(seg.start),
    relationship: seg.relationship.type,
    to: toPlain(seg.end),
    startLabel: seg.start.labels[0],
    endLabel: seg.end.labels[0],
  }));
}

// ---------------------------------------------------------------------------
// Whole-network view for the graph visualization, optionally filtered by
// skill category, capped for the free-tier instance size.
// ---------------------------------------------------------------------------
export async function getNetwork({ category = "", limit = 150 } = {}) {
  const records = await runQuery(
    `
    MATCH (p:Person)-[r:OFFERS|WANTS]->(s:Skill)
    WHERE $category = '' OR s.category = $category
    RETURN p, r, s
    LIMIT $limit
    `,
    { category, limit: neo4jInt(limit) }
  );
  const nodesById = new Map();
  const edges = [];
  for (const r of records) {
    const p = toPlain(r.get("p"));
    const s = toPlain(r.get("s"));
    nodesById.set(`p_${p.id}`, { id: `p_${p.id}`, label: p.name, type: "person" });
    nodesById.set(`s_${s.id}`, { id: `s_${s.id}`, label: s.name, type: "skill", category: s.category });
    const rel = r.get("r");
    edges.push({
      source: `p_${p.id}`,
      target: `s_${s.id}`,
      type: rel.type, // OFFERS | WANTS
    });
  }
  return { nodes: [...nodesById.values()], edges };
}

function neo4jInt(n) {
  return neo4j.int(n);
}
