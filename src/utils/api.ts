const rawBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
const configuredBase = rawBase.replace(/\/+$/, "");
const normalizedBase = (
  configuredBase ||
  (import.meta.env.DEV ? "http://localhost:8787" : "")
).replace(/\/+$/, "");

/**
 * Returns an absolute URL for API calls. In development, falls back to the local
 * API server when VITE_API_BASE_URL is not set.
 */
export function apiUrl(path: string): string {
  const ensured = path.startsWith("/") ? path : `/${path}`;
  return normalizedBase ? `${normalizedBase}${ensured}` : ensured;
}

