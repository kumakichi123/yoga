const STORAGE_KEY = "anonymous_id";

function makeFallbackId(){
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export function ensureAnonymousId(): string {
  if (typeof window === "undefined") return "";
  try {
    const storage = window.localStorage;
    if (!storage) return "";
    let current = storage.getItem(STORAGE_KEY);
    if (current && current.length > 0) return current;
    const generated = (window.crypto && "randomUUID" in window.crypto)
      ? window.crypto.randomUUID()
      : makeFallbackId();
    storage.setItem(STORAGE_KEY, generated);
    return generated;
  } catch (_err) {
    return "";
  }
}

export function getAnonymousId(): string {
  return ensureAnonymousId();
}