/* Cloudflare Worker API entry point */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type JsonPrimitive = string | number | boolean | null;
type Json = JsonPrimitive | Json[] | { [key: string]: Json };

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  DIFY_API_KEY: string;
  DIFY_BASE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID?: string;
  APP_BASE_URL?: string;
  CONTACT_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  CONTACT_FROM_NAME?: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cachedSupabase: SupabaseClient | null = null;
function getSupabase(env: Env) {
  if (!cachedSupabase) {
    cachedSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }
  return cachedSupabase!;
}

const ALLOWED_ORIGINS = [
  "https://yoga-snowy.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:8787",
];

async function fileToBase64(file: File): Promise<{ content: string; type: string; name: string }> {
  const arrayBuffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return { content: base64, type: file.type || "application/octet-stream", name: file.name || "attachment" };
}

function encodeFormBody(fields: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    params.append(key, value);
  }
  return params.toString();
}

function getCorsOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  return null;
}

function buildCorsHeaders(request: Request, extra: Record<string, string> = {}) {
  const headers = new Headers(extra);
  const origin = getCorsOrigin(request);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return headers;
}

function handleCorsPreflight(request: Request) {
  const origin = getCorsOrigin(request);
  if (!origin) {
    return new Response(null, { status: 204 });
  }
  const headers = buildCorsHeaders(request, {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Anonymous-Id",
    "Access-Control-Max-Age": "86400",
  });
  return new Response(null, { status: 204, headers });
}

async function readJson<T = any>(request: Request): Promise<T | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function startOfWeekKey(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dayNum = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dayNum}`;
}

function isProfileSubscriptionActive(profile: Record<string, any> | null | undefined) {
  if (!profile) return false;
  const status = profile.subscription_status;
  if (!status) return false;
  if (status === "active" || status === "trialing") {
    if (!profile.subscription_current_period_end) return true;
    return new Date(profile.subscription_current_period_end).getTime() > Date.now();
  }
  return false;
}

function normaliseConversationId(conversationId: unknown) {
  if (typeof conversationId !== "string") return null;
  const trimmed = conversationId.trim();
  if (!trimmed) return null;
  if (UUID_REGEX.test(trimmed)) return trimmed;
  return null;
}

async function getUserFromRequest(env: Env, request: Request) {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const supabase = getSupabase(env);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function fetchProfileRecord(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "user_id, display_name, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_current_period_end"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertProfileFields(
  supabase: SupabaseClient,
  userId: string,
  fields: Record<string, any>
) {
  const payload = { user_id: userId, ...fields };
  const { error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

async function ensureStripeCustomerId(
  env: Env,
  supabase: SupabaseClient,
  user: any,
  profile: any
) {
  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id as string;
  }
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("stripe_not_configured");
  }
  const displayName =
    profile?.display_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    "";
  const body = encodeFormBody({
    email: user?.email || undefined,
    name: displayName || undefined,
    "metadata[user_id]": user?.id || undefined,
  });
  const response = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`stripe_customer_create_failed:${text}`);
  }
  const data = (await response.json()) as { id?: string | null };
  const customerId = typeof data?.id === "string" && data.id.trim().length ? data.id : null;
  if (!customerId) {
    throw new Error("stripe_customer_missing_id");
  }
  await upsertProfileFields(supabase, user.id, { stripe_customer_id: customerId });
  return customerId;
}

function resolveAppBaseUrl(env: Env) {
  return env.APP_BASE_URL || "https://yoga-snowy.vercel.app";
}

function getAnonymousId(request: Request, body: any) {
  const header = request.headers.get("X-Anonymous-Id");
  const bodyAnon = body?.anonymous_id;
  const value =
    (typeof header === "string" && header.trim().length ? header.trim() : null) ??
    (typeof bodyAnon === "string" && bodyAnon.trim().length ? bodyAnon.trim() : null);
  return value;
}

function jsonResponse(request: Request, data: Json, init: ResponseInit = {}) {
  const headers = buildCorsHeaders(request, {
    "Content-Type": "application/json",
    ...(init.headers || {}),
  });
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers,
    statusText: init.statusText,
  });
}

function errorResponse(
  request: Request,
  status: number,
  error: string,
  extra: Record<string, Json> = {},
) {
  return jsonResponse(request, { error, ...extra }, { status });
}

async function buildUserSummary(env: Env, userId: string) {
  const supabase = getSupabase(env);
  const { data: prof } = await supabase
    .from("profiles")
    .select("tz,goal_per_week")
    .eq("user_id", userId)
    .maybeSingle();
  const tz = prof?.tz || "Asia/Tokyo";
  const goal = prof?.goal_per_week ?? 3;

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 59);

  const { data: rows } = await supabase
    .from("sessions")
    .select("completed_at,duration_sec,sequence_slug")
    .eq("user_id", userId)
    .gte("completed_at", start.toISOString())
    .lte("completed_at", end.toISOString())
    .order("completed_at", { ascending: true });

  const byDay = new Map<string, number>();
  for (const r of rows || []) {
    const day = new Date(r.completed_at).toISOString().slice(0, 10);
    const min = Math.round((r.duration_sec || 0) / 60);
    byDay.set(day, (byDay.get(day) || 0) + min);
  }
  const today = new Date();
  const key = (d: Date) => d.toISOString().slice(0, 10);
  let streak = 0;
  const set = new Set(byDay.keys());
  const d = new Date(today);
  while (set.has(key(d))) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const sumInRange = (from: Date) =>
    (rows || [])
      .filter((r) => new Date(r.completed_at) >= from)
      .reduce((acc, r) => acc + Math.round((r.duration_sec || 0) / 60), 0);
  const week_minutes = sumInRange(weekStart);
  const month_minutes = sumInRange(monthStart);
  const last_sessions = (rows || [])
    .slice(-5)
    .reverse()
    .map((r) => ({
      date: new Date(r.completed_at).toISOString().slice(0, 10),
      slug: r.sequence_slug,
      minutes: Math.round((r.duration_sec || 0) / 60),
    }));
  const daily_minutes = Array.from(byDay.entries());

  return {
    tz,
    goal_per_week: goal,
    streak_days: streak,
    daily_minutes,
    totals: {
      week_minutes,
      month_minutes,
      total_sessions: (rows || []).length,
    },
    last_sessions,
  };
}

function streamSse(request: Request, upstream: Response) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const pump = async () => {
    if (!upstream.body) {
      await writer.close();
      return;
    }
    const reader = upstream.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      await writer.write(value);
    }
    await writer.close();
  };

  pump();

  const headers = buildCorsHeaders(request, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  return new Response(readable, {
    status: upstream.status,
    headers,
  });
}

async function handleChat(env: Env, request: Request) {
  const body = (await readJson(request)) || {};
  const { message, conversation_id, inputs, uid } = body;
  if (!message || typeof message !== "string") {
    return errorResponse(request, 400, "missing_message");
  }
  const user = await getUserFromRequest(env, request);
  const resolvedUid = uid || user?.id;
  if (!resolvedUid) {
    return errorResponse(request, 400, "missing_uid");
  }
  const supabase = getSupabase(env);
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("subscription_status, subscription_current_period_end, display_name")
    .eq("user_id", resolvedUid)
    .maybeSingle();
  if (profileError) {
    return errorResponse(request, 500, "chat_init_failed");
  }
  const paid = isProfileSubscriptionActive(profile);
  if (!paid) {
    const adminUser = await supabase.auth.admin.getUserById(resolvedUid);
    if (adminUser.error) {
      return errorResponse(request, 500, "chat_init_failed");
    }
    const adminRecord = adminUser.data?.user;
    if (!adminRecord) {
      return errorResponse(request, 404, "user_not_found");
    }
    const metadata = (adminRecord.user_metadata || {}) as Record<string, Json>;
    const weekKey = startOfWeekKey();
    let count = Number(metadata.free_chat_count) || 0;
    let storedWeek = typeof metadata.free_chat_week === "string" ? metadata.free_chat_week : "";
    if (storedWeek !== weekKey) {
      storedWeek = weekKey;
      count = 0;
    }
    const limit = 10;
    if (count >= limit) {
      return errorResponse(request, 429, "free_chat_limit", { limit });
    }
    const newMetadata = { ...metadata, free_chat_week: storedWeek, free_chat_count: count + 1 };
    const update = await supabase.auth.admin.updateUserById(resolvedUid, { user_metadata: newMetadata });
    if (update.error) {
      return errorResponse(request, 500, "chat_init_failed");
    }
  }

  const difyConversationId = normaliseConversationId(conversation_id);
  const summary = await buildUserSummary(env, resolvedUid).catch(() => null);
  const mergedInputs = Object.assign({}, inputs || {}, {
    user_summary: summary ? JSON.stringify(summary) : "",
    user_display_name: profile?.display_name || "",
  });
  const difyUrl = `${env.DIFY_BASE || ""}/v1/chat-messages`;
  const upstream = await fetch(difyUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DIFY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: message.trim(),
      inputs: mergedInputs,
      response_mode: "streaming",
      conversation_id: difyConversationId || undefined,
      user: resolvedUid,
    }),
  });
  if (!upstream.ok) {
    const text = await upstream.text();
    return errorResponse(request, upstream.status, "dify_error", { text });
  }
  return streamSse(request, upstream);
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return handleCorsPreflight(request);
  }

  const supabase = getSupabase(env);

  if (request.method === "POST" && url.pathname === "/api/sessions") {
    const body = (await readJson(request)) || {};
    const user = await getUserFromRequest(env, request);
    const { sequence_slug, duration_sec } = body;
    if (!sequence_slug || !duration_sec) {
      return errorResponse(request, 400, "missing_fields");
    }
    const anonymousId = getAnonymousId(request, body);
    if (!user && !anonymousId) {
      return errorResponse(request, 400, "missing_identity");
    }
    const payload: Record<string, any> = {
      sequence_slug,
      duration_sec,
      completed_at: new Date().toISOString(),
    };
    if (user) {
      payload.user_id = user.id;
      payload.anonymous_id = null;
    } else {
      payload.anonymous_id = anonymousId;
    }
    const { error } = await supabase.from("sessions").insert(payload);
    if (error) {
    return errorResponse(request, 500, "session_insert_failed");
    }
    return jsonResponse(request, { ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/sessions/month") {
    const user = await getUserFromRequest(env, request);
    const anonymousId = request.headers.get("X-Anonymous-Id");
    if (!user && !anonymousId) {
      return errorResponse(request, 400, "missing_identity");
    }
    const year = Number(url.searchParams.get("year"));
    const month = Number(url.searchParams.get("month"));
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      return errorResponse(request, 400, "invalid_range");
    }
    const start = new Date(Date.UTC(year, month, 1)).toISOString();
    const end = new Date(Date.UTC(year, month + 1, 1)).toISOString();
    let query = supabase
      .from("sessions")
      .select("completed_at,duration_sec,sequence_slug")
      .gte("completed_at", start)
      .lt("completed_at", end)
      .order("completed_at", { ascending: true });
    if (user) {
      query = query.eq("user_id", user.id);
    } else {
      query = query.eq("anonymous_id", anonymousId).is("user_id", null);
    }
    const { data, error } = await query;
    if (error) {
      return errorResponse(request, 500, "month_fetch_failed");
    }
    return jsonResponse(request, { rows: data || [] });
  }

  if (request.method === "GET" && url.pathname === "/api/sessions/totals") {
    const user = await getUserFromRequest(env, request);
    const anonymousId = request.headers.get("X-Anonymous-Id");
    if (!user && !anonymousId) {
      return errorResponse(request, 400, "missing_identity");
    }
    let query = supabase.from("sessions").select("duration_sec");
    if (user) {
      query = query.eq("user_id", user.id);
    } else {
      query = query.eq("anonymous_id", anonymousId).is("user_id", null);
    }
    const { data, error } = await query;
    if (error) {
      return errorResponse(request, 500, "totals_fetch_failed");
    }
    const rows = data || [];
    const sessions = rows.length;
    const seconds = rows.reduce((acc, row) => acc + (row.duration_sec || 0), 0);
    return jsonResponse(request, { sessions, seconds });
  }

  if (request.method === "POST" && url.pathname === "/api/sessions/link") {
    const body = (await readJson(request)) || {};
    const user = await getUserFromRequest(env, request);
    if (!user) {
      return errorResponse(request, 401, "auth_required");
    }
    const anonymousId = getAnonymousId(request, body);
    if (!anonymousId) {
      return errorResponse(request, 400, "missing_anonymous_id");
    }
    const { data, error } = await supabase
      .from("sessions")
      .update({ user_id: user.id, anonymous_id: null })
      .eq("anonymous_id", anonymousId)
      .is("user_id", null)
      .select("id");
    if (error) {
      return errorResponse(request, 500, "link_failed");
    }
    return jsonResponse(request, { moved: data?.length || 0 });
  }

  if (request.method === "GET" && url.pathname === "/api/profile") {
    const user = await getUserFromRequest(env, request);
    if (!user) {
      return errorResponse(request, 401, "auth_required");
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      return errorResponse(request, 500, "profile_fetch_failed");
    }
    if (!data) {
      return errorResponse(request, 404, "not_found");
    }
    return jsonResponse(request, data as Json);
  }

  if (request.method === "POST" && url.pathname === "/api/chat") {
    return handleChat(env, request);
  }

  if (request.method === "POST" && url.pathname === "/api/subscription/checkout") {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
      return errorResponse(request, 500, "stripe_not_configured");
    }
    const user = await getUserFromRequest(env, request);
    if (!user) {
      return errorResponse(request, 401, "auth_required");
    }
    const supabase = getSupabase(env);
    let profile: any = null;
    try {
      profile = await fetchProfileRecord(supabase, user.id);
    } catch (err) {
      console.error("profile fetch error", err);
      return errorResponse(request, 500, "profile_fetch_failed");
    }
    let customerId: string;
    try {
      customerId = await ensureStripeCustomerId(env, supabase, user, profile);
    } catch (err) {
      console.error("stripe customer error", err);
      return errorResponse(request, 500, "stripe_customer_failed");
    }
    const successUrl = `${resolveAppBaseUrl(env)}/settings?upgrade=success`;
    const cancelUrl = `${resolveAppBaseUrl(env)}/settings?upgrade=cancel`;
    const sessionBody = encodeFormBody({
      mode: "subscription",
      "line_items[0][price]": env.STRIPE_PRICE_ID,
      "line_items[0][quantity]": "1",
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer: customerId,
      client_reference_id: user.id,
      "subscription_data[metadata][user_id]": user.id,
    });
    const checkoutResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: sessionBody,
    });
    if (!checkoutResponse.ok) {
      const text = await checkoutResponse.text();
      console.error("stripe checkout error", text);
      return errorResponse(request, 502, "stripe_checkout_failed", { text });
    }
    const sessionData = (await checkoutResponse.json()) as { url?: string | null } | null;
    const sessionUrl = typeof sessionData?.url === "string" ? sessionData.url : null;
    if (!sessionUrl) {
      return errorResponse(request, 500, "stripe_checkout_invalid");
    }
    return jsonResponse(request, { url: sessionUrl });
  }

  if (request.method === "POST" && url.pathname === "/api/subscription/cancel") {
    if (!env.STRIPE_SECRET_KEY) {
      return errorResponse(request, 500, "stripe_not_configured");
    }
    const user = await getUserFromRequest(env, request);
    if (!user) {
      return errorResponse(request, 401, "auth_required");
    }
    const supabase = getSupabase(env);
    let profile: any = null;
    try {
      profile = await fetchProfileRecord(supabase, user.id);
    } catch (err) {
      console.error("profile fetch error", err);
      return errorResponse(request, 500, "profile_fetch_failed");
    }
    const subscriptionId = profile?.stripe_subscription_id;
    if (!subscriptionId) {
      return errorResponse(request, 400, "no_active_subscription");
    }
    const cancelBody = encodeFormBody({ cancel_at_period_end: "true" });
    const cancelResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: cancelBody,
    });
    if (!cancelResponse.ok) {
      const text = await cancelResponse.text();
      console.error("stripe cancel error", text);
      return errorResponse(request, 502, "subscription_cancel_failed", { text });
    }
    const subscriptionData = (await cancelResponse.json()) as {
      id?: string | null;
      status?: string | null;
      cancel_at_period_end?: boolean | null;
      current_period_end?: number | null;
    } | null;
    const subscriptionStatus =
      typeof subscriptionData?.status === "string" ? subscriptionData.status : subscriptionData?.status ?? null;
    const subscriptionCurrentPeriodEnd =
      typeof subscriptionData?.current_period_end === "number"
        ? new Date(subscriptionData.current_period_end * 1000).toISOString()
        : null;
    const subscriptionStripeId =
      typeof subscriptionData?.id === "string" && subscriptionData.id.trim().length
        ? subscriptionData.id
        : subscriptionId;
    const cancelAtPeriodEnd = Boolean(subscriptionData?.cancel_at_period_end);
    try {
      await upsertProfileFields(supabase, user.id, {
        subscription_status: subscriptionStatus ?? profile?.subscription_status ?? null,
        subscription_current_period_end: subscriptionCurrentPeriodEnd,
        stripe_subscription_id: subscriptionStripeId,
        subscription_provider: "stripe",
      });
    } catch (err) {
      console.error("profile update error", err);
    }
    return jsonResponse(request, {
      cancel_at_period_end: cancelAtPeriodEnd,
      current_period_end: subscriptionCurrentPeriodEnd,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/contact") {
    if (!env.CONTACT_EMAIL) {
      return errorResponse(request, 500, "contact_disabled");
    }
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return errorResponse(request, 415, "unsupported_media_type");
    }
    const form = await request.formData();
    const nameRaw = form.get("name");
    const emailRaw = form.get("email");
    const messageRaw = form.get("message");
    const fileRaw = form.get("file");
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    const email = typeof emailRaw === "string" ? emailRaw.trim() : "";
    const message = typeof messageRaw === "string" ? messageRaw.trim() : "";
    if (!message) {
      return errorResponse(request, 400, "message_required");
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return errorResponse(request, 400, "invalid_email");
    }
    let attachment: { content: string; type: string; name: string } | null = null;
    if (fileRaw && typeof fileRaw === "object" && "size" in fileRaw) {
      const file = fileRaw as File;
      if (file.size > 0) {
        if (file.size > 5 * 1024 * 1024) {
          return errorResponse(request, 400, "file_too_large");
        }
        attachment = await fileToBase64(file);
      }
    }
    const subject = "ヨガAI お問い合わせ";
    const personalization: any = {
      to: [{ email: env.CONTACT_EMAIL }],
    };
    const fromEmail = env.CONTACT_FROM_EMAIL || "no-reply@yoga-ai.local";
    const fromName = env.CONTACT_FROM_NAME || "ヨガAI";
    const replyToEmail = email || fromEmail;
    const replyToName = email ? name || "ユーザー" : fromName;
    const contentLines = [
      "新しいお問い合わせを受信しました。",
      "",
      `お名前: ${name || "未記入"}`,
      `メール: ${email || "未記入"}`,
      "",
      "内容:",
      message,
    ];
    const mailPayload: any = {
      personalizations: [personalization],
      from: { email: fromEmail, name: fromName },
      reply_to: { email: replyToEmail, name: replyToName },
      subject,
      content: [
        {
          type: "text/plain; charset=utf-8",
          value: contentLines.join("\n"),
        },
      ],
    };
    if (attachment) {
      mailPayload.attachments = [
        {
          filename: attachment.name,
          type: attachment.type,
          content: attachment.content,
        },
      ];
    }
    const mailResponse = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mailPayload),
    });
    if (!mailResponse.ok) {
      const text = await mailResponse.text();
      return errorResponse(request, 502, "contact_failed", { text });
    }
    return jsonResponse(request, { ok: true });
  }

  return errorResponse(request, 404, "not_found");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleFetch(request, env);
    } catch (err) {
      return errorResponse(request, 500, "internal_error", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
