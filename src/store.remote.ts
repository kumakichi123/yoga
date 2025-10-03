import { ensureAnonymousId } from "../lib/anonymous";
import { supabase } from "../lib/supabase";
import type { ExperienceLevel, Profile } from "./types";

type HeaderMap = Record<string, string>;

export type ProfileUpdate = {
  goal_per_week?: number | null;
  tz?: string | null;
  display_name?: string | null;
  experience_level?: ExperienceLevel | null;
};

async function getSessionToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function baseHeaders(): HeaderMap {
  const headers: HeaderMap = {};
  const anon = ensureAnonymousId();
  if (anon) headers["X-Anonymous-Id"] = anon;
  return headers;
}

async function authHeaders({ json }: { json?: boolean } = {}): Promise<HeaderMap> {
  const headers = baseHeaders();
  if (json) headers["Content-Type"] = "application/json";
  const token = await getSessionToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export async function upsertProfile(update: ProfileUpdate) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("no_auth");
  const payload: Record<string, unknown> = { user_id: user.id };
  if (update.goal_per_week !== undefined) payload.goal_per_week = update.goal_per_week;
  if (update.tz !== undefined) payload.tz = update.tz;
  if (update.display_name !== undefined) payload.display_name = update.display_name;
  if (update.experience_level !== undefined) payload.experience_level = update.experience_level;
  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

export async function fetchProfile(): Promise<Profile | null> {
  const headers = await authHeaders();
  const res = await fetch("/api/profile", { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("profile_fetch_failed");
  return res.json();
}


export async function createStripeCheckoutSession(): Promise<{ url: string }> {
  const headers = await authHeaders({ json: true });
  const res = await fetch('/api/subscription/checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    let message = 'stripe_checkout_failed';
    try {
      const err = await res.json();
      if (err?.error) message = err.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json();
}
export async function insertSession(sequence_slug: string, duration_sec: number) {
  const headers = await authHeaders({ json: true });
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers,
    body: JSON.stringify({ sequence_slug, duration_sec }),
  });
  if (!res.ok) throw new Error("session_save_failed");
}

export async function fetchMonthSessions(year: number, month: number) {
  const headers = await authHeaders();
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  const res = await fetch(`/api/sessions/month?${params.toString()}`, { headers });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error("month_sessions_failed");
  const json = await res.json();
  return json.rows ?? [];
}

export async function fetchTotals() {
  const headers = await authHeaders();
  const res = await fetch("/api/sessions/totals", { headers });
  if (res.status === 404) return { sessions: 0, seconds: 0 };
  if (!res.ok) throw new Error("totals_fetch_failed");
  const json = await res.json();
  return { sessions: json.sessions ?? 0, seconds: json.seconds ?? 0 };
}

export async function linkAnonymousSessions() {
  const anon = ensureAnonymousId();
  const token = await getSessionToken();
  if (!anon || !token) return { moved: 0 };
  const headers: HeaderMap = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "X-Anonymous-Id": anon,
  };
  const res = await fetch("/api/sessions/link", {
    method: "POST",
    headers,
    body: JSON.stringify({ anonymous_id: anon }),
  });
  if (!res.ok) throw new Error("link_failed");
  return res.json();
}