import neo4j from "neo4j-driver";

const { COGNODB_URI, COGNODB_USER, COGNODB_PASSWORD } = process.env;

let driver = null;
let connectionError = null;

/**
 * We create the driver once at boot and reuse it for the life of the
 * process (the driver manages its own internal connection pool, so
 * there's no need to open/close a session per-request pattern beyond
 * the individual `session()` calls below).
 */
export function initDriver() {
  if (!COGNODB_URI || !COGNODB_USER || !COGNODB_PASSWORD) {
    connectionError =
      "Missing COGNODB_URI / COGNODB_USER / COGNODB_PASSWORD environment variables.";
    console.error(`[db] ${connectionError}`);
    return null;
  }

  try {
    driver = neo4j.driver(
      COGNODB_URI,
      neo4j.auth.basic(COGNODB_USER, COGNODB_PASSWORD),
      {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 10_000,
        maxTransactionRetryTime: 15_000,
      }
    );
    connectionError = null;
    return driver;
  } catch (err) {
    connectionError = err.message;
    console.error("[db] Failed to create driver:", err.message);
    return null;
  }
}

export function getDriver() {
  return driver;
}

export async function verifyConnectivity() {
  if (!driver) return { ok: false, error: connectionError || "Driver not initialized" };
  try {
    await driver.verifyConnectivity();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Runs a Cypher query inside a managed session, always closing the
 * session afterwards even on error, and always using parameters
 * (never string-concatenated Cypher) to avoid injection.
 */
export async function runQuery(cypher, params = {}, { write = false } = {}) {
  if (!driver) {
    const err = new Error("Database unavailable");
    err.status = 503;
    err.cause = connectionError;
    throw err;
  }
  const session = driver.session({
    defaultAccessMode: write ? neo4j.session.WRITE : neo4j.session.READ,
  });
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}

export async function closeDriver() {
  if (driver) await driver.close();
}
