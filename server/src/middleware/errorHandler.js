export function notFound(req, res) {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} ->`, err.message, err.cause || "");
  }
  res.status(status).json({
    error: status === 503 ? "Database unavailable" : err.message || "Internal server error",
    detail: status === 503 ? "The database is unreachable right now. Please try again shortly." : undefined,
  });
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
