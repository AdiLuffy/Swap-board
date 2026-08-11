import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = 4321;
const BASE = `http://localhost:${PORT}/api`;
let child;

before(async () => {
  child = spawn("node", ["src/index.js"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "pipe",
  });
  // Wait for the server to report it's listening rather than a fixed sleep.
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server did not start in time")), 5000);
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
});

after(() => {
  child.kill();
});

test("GET /api/health reports degraded (503) when no DB credentials are configured", async () => {
  const res = await fetch(`${BASE}/health`);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.status, "degraded");
  assert.equal(body.db.ok, false);
});

test("GET /api/unknown-route returns a structured 404", async () => {
  const res = await fetch(`${BASE}/unknown-route`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "Not found");
});

test("GET /api/path without from/to is rejected with 400 before touching the DB", async () => {
  const res = await fetch(`${BASE}/path`);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /from and to are required/);
});

test("GET /api/people fails gracefully (503, not a crash) when the DB is unreachable", async () => {
  const res = await fetch(`${BASE}/people`);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, "Database unavailable");
  assert.ok(body.detail);
});

test("rate limiter headers are present on API responses", async () => {
  const res = await fetch(`${BASE}/health`);
  assert.ok(res.headers.get("ratelimit-limit") || res.headers.get("x-ratelimit-limit"));
});
