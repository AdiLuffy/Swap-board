const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...options,
    });
  } catch (networkErr) {
    if (networkErr.name === "AbortError") {
      throw new ApiError("The server took too long to respond. It may be down or the database connection is stuck.", 0);
    }
    throw new ApiError("Can't reach the server. Check that it's running and try again.", 0);
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.detail || body.error || message;
    } catch {
      /* non-JSON error body, keep default message */
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  health: () => request("/health"),
  people: ({ search = "", page = 1, limit = 20 } = {}) =>
    request(`/people?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`),
  person: (id) => request(`/people/${id}`),
  directMatches: (id) => request(`/people/${id}/matches/direct`),
  swapChains: (id) => request(`/people/${id}/matches/chains`),
  recommendations: (id) => request(`/people/${id}/recommendations`),
  skills: (search = "") => request(`/skills?search=${encodeURIComponent(search)}`),
  network: (category = "") => request(`/network?category=${encodeURIComponent(category)}`),
  path: (from, to) => request(`/path?from=${from}&to=${to}`),
};

export { ApiError };
