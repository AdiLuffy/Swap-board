# SwapBoard

A skill-bartering network: people list skills they can teach and skills they
want to learn, and SwapBoard finds swap matches — including barter chains
where three or four people can trade in a loop even though no two of them
want to trade directly. Built on **CognoDB** as the graph data layer.

> Live demo: `<add your hosted URL here>`
> Screen recording: `<add link here>`

![SwapBoard corkboard screenshot placeholder](docs/screenshot-explore.png)

---

## Why a graph database?

The core feature of SwapBoard is finding **barter cycles**: A teaches B what
B wants, B teaches C what C wants, and C teaches A what A wants — a closed
loop with no money involved. This is exactly the kind of question a graph
database is built for and a relational database is bad at:

- **The query shape changes with every hop.** Finding a 3-person cycle needs
  a 3-way self-join of a `trades` table against itself; a 4-person cycle
  needs a 4-way self-join with a different join condition. In Cypher, one
  more hop is one more `MATCH` clause of the same shape — see
  [`findSwapChains`](server/src/services/graphService.js).
- **Traversal depth is unknown in advance.** "Is there *any* path connecting
  these two people through shared skills?" (used for the six-degrees-style
  connection finder) is a `shortestPath()` call in Cypher. In SQL it's a
  recursive CTE that gets slower and harder to reason about as the graph
  grows, and most engines cap the recursion depth.
- **The interesting unit is the relationship, not the row.** `OFFERS` and
  `WANTS` edges carry their own properties (skill level, priority) and are
  first-class, indexed, traversable things — not foreign keys you have to
  join back through a junction table every time.

A relational schema would work fine for "list Alice's skills." It falls over
exactly where SwapBoard's value is: multi-hop matching.

## Architecture

```
┌──────────────┐      HTTPS       ┌──────────────────┐    Bolt (bolt+s://)   ┌─────────────┐
│  React client │ ───────────────▶│  Express API      │ ─────────────────────▶│  CognoDB     │
│  (Vite, D3)   │◀─────────────── │  (stateless)      │◀───────────────────── │  (managed)   │
└──────────────┘      JSON        └──────────────────┘   openCypher/Bolt 5    └─────────────┘
```

- **Client** — React + Vite SPA. Talks to the API over `/api/*`, never
  touches the database directly.
- **API** — a single stateless Express service. All Cypher lives in
  `server/src/services/graphService.js`, all queries are parameterised (no
  string-concatenated Cypher, ever), and the Neo4j driver's own connection
  pool is reused across requests instead of opening a connection per call.
- **Database** — CognoDB, addressed only through environment variables.

Kept deliberately to two deployable pieces (static frontend + one API
service) rather than a microservice split — there's no independent scaling
or failure-isolation need here that would justify the operational overhead.

### Request flow & reliability

- Every route is wrapped in `asyncHandler` so a thrown/rejected error always
  reaches the centralized `errorHandler` instead of crashing the process.
- If CognoDB is unreachable, `runQuery()` throws a `503` before ever opening
  a session; the API returns a structured `{ error, detail }` body rather
  than a stack trace, and the client renders a proper error state with a
  retry button (see `client/src/components/States.jsx`). This is exercised
  by the automated tests — see [Testing](#testing).
- `/api/health` calls the driver's `verifyConnectivity()` and reports `200`
  or `503` accordingly, suitable for a platform health check.
- A basic rate limiter (120 req/min per IP on `/api/*`) protects the
  free-tier instance's connection cap from being exhausted by one client.

## Data model

```
        OFFERS {level, description}          WANTS {priority}
   ┌───────────────────────────▶ (:Skill) ◀───────────────────────┐
   │                                                                │
(:Person) ────────────────────────────────────────────────── (:Person)
   name, bio, location, joinedAt          name: name, category, id
```

- `(:Person {id, name, bio, location, joinedAt})`
- `(:Skill {id, name, category})`
- `(:Person)-[:OFFERS {level, description}]->(:Skill)`
- `(:Person)-[:WANTS {priority}]->(:Skill)`

Unique constraints on `Person.id` and `Skill.id`, plus indexes on
`Person.name` and `Skill.name` for search — see `seed/seed.js`.

## The main queries

All four live in `server/src/services/graphService.js`, called from
`server/src/routes/api.js`.

1. **Direct mutual matches** (`findDirectMatches`) — a 2-hop pattern matched
   in both directions: I offer what you want *and* you offer what I want.
2. **Barter chains** (`findSwapChains`) — 3-person and 4-person cycles where
   each person teaches the next what they want, closing back to the start.
   This is the multi-hop, SQL-awkward query described above.
3. **Skill recommendations** (`recommendSkills`) — collaborative filtering:
   skills wanted by other people who want what you want.
4. **Shortest connection** (`shortestConnection`) — `shortestPath()` between
   any two people through the shared `OFFERS`/`WANTS` graph.

## Project structure

```
swapboard/
├── server/                # Express API
│   ├── src/
│   │   ├── config/db.js       # CognoDB driver, connection pooling, health check
│   │   ├── services/          # All Cypher queries
│   │   ├── routes/api.js      # REST endpoints
│   │   └── middleware/        # Error handling, async wrapper
│   ├── seed/seed.js       # Loads sample people/skills + guaranteed demo matches
│   └── test/               # API-level tests (node:test)
└── client/                 # React + Vite SPA
    └── src/
        ├── pages/           # Explore, PersonBoard (the corkboard view), Network
        ├── components/      # PersonCard, loading/error/empty states
        └── api/client.js    # Typed fetch wrapper
```

## Setup

### 1. Create your CognoDB instance

1. Sign up at [console.cognodb.com](https://console.cognodb.com/signup) (free, no card).
2. Create a free `c0` instance, pick a region — provisions in under a minute.
3. Copy the `bolt+s://<instance-id>.databases.cognodb.cloud` URI and the
   generated password for user `cognodb` **immediately** — it's shown once.

### 2. Configure environment variables

```bash
cd server
cp .env.example .env
# fill in COGNODB_URI, COGNODB_USER=cognodb, COGNODB_PASSWORD

cd ../client
cp .env.example .env   # optional for local dev, required for a deployed build
```

`.env` files are gitignored — nothing is committed to source control.

### 3. Install, seed, and run

```bash
# Backend
cd server
npm install
npm run seed     # loads ~45 people, 30 skills, and guaranteed demo matches
npm run dev       # http://localhost:4000

# Frontend, in a second terminal
cd client
npm install
npm run dev       # http://localhost:5173
```

Open `http://localhost:5173`. Try person `p_1` for a direct match, and
`p_3` or `p_6` for a barter chain (the seed script prints these hints).

### 4. Run tests

```bash
cd server
npm test
```

Covers: graceful degradation when the DB is unreachable (503, not a crash),
input validation (`400` before any DB call), 404 handling, and rate-limit
headers.

## Deployment

- **API** — any Node host (Render, Railway, Fly.io). Set the three
  `COGNODB_*` env vars and `CLIENT_ORIGIN` to your deployed frontend URL.
- **Client** — any static host (Vercel, Netlify, Cloudflare Pages). Set
  `VITE_API_BASE_URL` to your deployed API's `/api` URL, then `npm run build`
  and deploy `client/dist`.
- Database migrations are just the idempotent constraint/index statements at
  the top of `seed/seed.js` — safe to re-run.

## What's out of scope

Multi-tenant orgs, Redis caching, and background workers weren't added
because nothing in this app is expensive enough to need them at this scale —
every query here is a bounded, indexed graph traversal against a small
dataset, not a batch job or a cross-tenant boundary. If this grew into a
product with a much larger graph, the first additions would be a cache in
front of `recommendSkills` (it's the most repeat-heavy read) and pagination
on `/api/network` before raising its node cap.
