/* Cloudflare Worker API entry point */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { poseLibrary } from "../data/poses.js";

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
  CHATGPT_APP_TOKENS?: string;
  SDK_FREE_WEEKLY_LIMIT?: string;
  SDK_BILLING_URL?: string;
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
  "https://chat.openai.com",
  "https://chatgpt.com",
];

const SDK_TOKEN_HEADER = "x-chatgpt-app-token";
const MCP_CHANNEL = "mcp";
const MAX_POSE_SUGGEST_DISTANCE = 4;
const MCP_PING_INTERVAL_MS = 15000;
const DEFAULT_FREE_LIMIT_FALLBACK = 5;

const mcpServerInfo = { name: "Yoga SDK MCP Bridge", version: "0.1.0" };
const textEncoder = new TextEncoder();

const STATIC_BGM_FILES = [
  "Night_Show_Case.mp3",
  "We_Wish_You_a_Merry_Christmas（オルゴールVer.）.mp3",
  "新緑の丘.mp3",
  "朝の訪れ.mp3",
] as const;

const BGM_RELAX = "新緑の丘.mp3";
const BGM_MORNING = "朝の訪れ.mp3";
const BGM_UPBEAT = "Night_Show_Case.mp3";
const BGM_HOLIDAY = "We_Wish_You_a_Merry_Christmas（オルゴールVer.）.mp3";

type BgmTrack = {
  fileName: string;
  name: string;
  url: string;
};

type McpSession = {
  id: string;
  token: string;
  createdAt: number;
  lastAccess: number;
  controller: ReadableStreamDefaultController<Uint8Array>;
  heartbeat: ReturnType<typeof setInterval> | null;
};

const POSE_SLUGS = Object.keys(poseLibrary);
const STATIC_BGM_TRACKS: BgmTrack[] = STATIC_BGM_FILES.map((fileName) => {
  const base = fileName.replace(/\.[^.]+$/, "");
  const humanName = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return {
    fileName,
    name: humanName || base || fileName,
    url: `/BGM/${encodeURIComponent(fileName)}`,
  };
});

let cachedTokenRaw: string | null = null;
let cachedTokenSet: Set<string> = new Set();

const mcpSessions = new Map<string, McpSession>();

const mcpTools = [
  {
    name: "generate_menu",
    description: "Generate and store a personalized yoga sequence for the user.",
    input_schema: {
      type: "object",
      required: ["user_id", "menu"],
      properties: {
        user_id: {
          type: "string",
          description: "Supabase auth user id.",
        },
        menu: {
          type: "object",
          description: "Sequence blueprint following the same structure as /api/sdk/menus.",
        },
        focus_keywords: {
          type: "array",
          items: { type: "string" },
        },
        constraints: {
          type: "object",
          additionalProperties: true,
          properties: {
            focus: {
              anyOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } },
              ],
            },
            energy: { type: "string" },
            season_hint: { type: "string" },
            time_segment: { type: "string" },
          },
        },
        free_limit: { type: "integer" },
        request: { type: "object" },
      },
      additionalProperties: true,
    },
  },
  {
    name: "get_history",
    description: "Return monthly practice history for the user.",
    input_schema: {
      type: "object",
      required: ["user_id"],
      properties: {
        user_id: { type: "string" },
        month: {
          type: "string",
          description: "YYYY-MM format (optional).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_profile",
    description: "Return profile and aggregate stats for the user.",
    input_schema: {
      type: "object",
      required: ["user_id"],
      properties: {
        user_id: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_bgm",
    description: "List available background music tracks.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
];

function getEnvTokenSet(env: Env) {
  const raw = env.CHATGPT_APP_TOKENS || "";
  if (raw === cachedTokenRaw) {
    return cachedTokenSet;
  }
  const next = new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
  cachedTokenRaw = raw;
  cachedTokenSet = next;
  return next;
}

function isSdkTokenValid(env: Env, token: string | null | undefined) {
  if (!token || typeof token !== "string") return false;
  return getEnvTokenSet(env).has(token.trim());
}

type TokenExtraction = {
  token: string | null;
  hasHeaderToken: boolean;
  hasQueryToken: boolean;
  hasBearerToken: boolean;
};

function extractSdkToken(request: Request, url: URL): TokenExtraction {
  const headerRaw = request.headers.get(SDK_TOKEN_HEADER);
  const headerToken =
    typeof headerRaw === "string" && headerRaw.trim().length
      ? headerRaw.trim()
      : null;
  const queryRaw = url.searchParams.get("token");
  const queryToken =
    typeof queryRaw === "string" && queryRaw.trim().length
      ? queryRaw.trim()
      : null;
  const authHeader = request.headers.get("Authorization");
  let bearerToken: string | null = null;
  if (typeof authHeader === "string") {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1] && match[1].trim().length) {
      bearerToken = match[1].trim();
    }
  }
  const token = headerToken ?? queryToken ?? bearerToken ?? null;
  return {
    token,
    hasHeaderToken: Boolean(headerToken),
    hasQueryToken: Boolean(queryToken),
    hasBearerToken: Boolean(bearerToken),
  };
}

type AuthResult =
  | { ok: true; token: string }
  | { ok: false; response: Response };

function authenticateSdkRequest(
  env: Env,
  request: Request,
  url: URL,
  channel: string,
): AuthResult {
  const extraction = extractSdkToken(request, url);
  const token = extraction.token;
  if (!token || !isSdkTokenValid(env, token)) {
    console.warn("SDK token auth failed", {
      path: url.pathname + url.search,
      hasHeaderToken: extraction.hasHeaderToken,
      hasQueryToken: extraction.hasQueryToken,
      hasBearerToken: extraction.hasBearerToken,
    });
    return {
      ok: false,
      response: errorResponse(request, 401, "sdk_unauthorised"),
    };
  }
  console.log("SDK token auth success", {
    path: url.pathname + url.search,
    channel,
    tokenLength: token.length,
  });
  return { ok: true, token };
}

function getSdkFreeWeeklyLimit(env: Env): number {
  const parsed = Number(env.SDK_FREE_WEEKLY_LIMIT);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_FREE_LIMIT_FALLBACK;
}

function getBillingUrl(env: Env): string | null {
  const explicit = (env.SDK_BILLING_URL || "").trim();
  if (explicit) return explicit;
  const base = (env.APP_BASE_URL || "").trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/settings`;
}

async function listBgmTracks(_env: Env): Promise<BgmTrack[]> {
  return STATIC_BGM_TRACKS.map((track) => ({ ...track }));
}

function cloneFrames(frames: any[] = []) {
  return frames.map((frame) => ({
    seconds: Number(frame.seconds) || 0,
    imageUrl: frame.imageUrl,
    text: { ...(frame.text || {}) },
  }));
}

function sumFrameSeconds(frames: any[] = []) {
  return frames.reduce(
    (total, frame) => total + (Number(frame.seconds) || 0),
    0,
  );
}

function defaultPoseDuration(pose: any) {
  const total = sumFrameSeconds(pose?.frames || []);
  return total > 0 ? total : 30;
}

function normalisePoseSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshteinDistance(a: string, b: string) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  );
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

function resolvePoseSlug(input: string) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const directSlug = trimmed.toLowerCase();
  if (poseLibrary[directSlug]) {
    return {
      slug: directSlug,
      replaced: false,
      distance: 0,
      original: trimmed,
    };
  }
  const target = normalisePoseSlug(trimmed);
  if (!target) return null;
  let bestSlug: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const slug of POSE_SLUGS) {
    const normalised = normalisePoseSlug(slug);
    if (normalised === target) {
      return { slug, replaced: true, distance: 0, original: trimmed };
    }
    const distance = levenshteinDistance(target, normalised);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSlug = slug;
    }
  }
  if (bestSlug && bestDistance <= MAX_POSE_SUGGEST_DISTANCE) {
    return { slug: bestSlug, replaced: true, distance: bestDistance, original: trimmed };
  }
  return null;
}

function slugify(value: string, fallback = "") {
  if (!value || typeof value !== "string") return fallback;
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || fallback;
}

function determineTimeSegment(date = new Date()) {
  const hour = date.getHours();
  if (hour < 6) return "late-night";
  if (hour < 12) return "morning";
  if (hour < 18) return "day";
  return "evening";
}

function suggestBgmForContext(tracks: BgmTrack[], context: Record<string, any> = {}) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { track: null, reason: "no_tracks" };
  }
  const byFileName = new Map(tracks.map((track) => [track.fileName, track]));
  const preferences: string[] = [];
  const segment = context.timeSegment || determineTimeSegment();
  if (segment === "morning") {
    preferences.push(BGM_MORNING);
  } else if (segment === "evening") {
    preferences.push(BGM_RELAX);
  }
  const energyHint =
    typeof context.energy === "string" ? context.energy.toLowerCase() : "";
  if (energyHint) {
    if (/relax|calm|gentle|sleep|slow/.test(energyHint)) {
      preferences.unshift(BGM_RELAX);
    }
    if (/focus|work|product|study/.test(energyHint)) {
      preferences.push(BGM_UPBEAT);
    }
    if (/holiday|xmas|christmas/.test(energyHint)) {
      preferences.push(BGM_HOLIDAY);
    }
  }
  const focusKeywords = Array.isArray(context.focusKeywords)
    ? context.focusKeywords
    : [];
  if (
    focusKeywords.some((keyword: string) =>
      /relax|sleep|calm|腰|肩|ストレッチ|リラックス/i.test(keyword),
    )
  ) {
    preferences.push(BGM_RELAX);
  }
  if (
    focusKeywords.some((keyword: string) =>
      /energ|power|筋|core|体幹/i.test(keyword),
    )
  ) {
    preferences.push(BGM_UPBEAT);
  }
  if (context.seasonHint === "holiday") {
    preferences.push(BGM_HOLIDAY);
  }
  for (const candidate of preferences) {
    const track = byFileName.get(candidate);
    if (track) {
      return { track, reason: "preference", candidate };
    }
  }
  return { track: tracks[0], reason: "fallback" };
}

function extractRequestedBgm(menu: any) {
  if (!menu) return null;
  const candidates = [menu.bgm, menu.bgm_file, menu.bgmFile];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length) {
      return candidate.trim();
    }
  }
  return null;
}

async function normalizeAndStoreMenu(env: Env, options: {
  userId: string;
  menu: any;
  channel: string;
  requestMetadata?: any;
  autoBgmMode?: "always" | "fallback" | "never";
  autoBgmContext?: Record<string, any>;
}) {
  const {
    userId,
    menu,
    channel,
    requestMetadata,
    autoBgmMode = "fallback",
    autoBgmContext = {},
  } = options;

  if (!menu || !Array.isArray(menu.steps) || menu.steps.length === 0) {
    throw Object.assign(new Error("missing_steps"), {
      statusCode: 400,
      payload: { error: "missing_steps" },
    });
  }

  const supabase = getSupabase(env);
  const adjustments: any[] = [];
  const normalizedSteps: any[] = [];
  let totalSeconds = 0;
  let maxLevel = 1;
  const focusCollector = new Set<string>(
    Array.isArray(autoBgmContext.focusKeywords)
      ? autoBgmContext.focusKeywords
      : [],
  );

  for (const rawStep of menu.steps) {
    const stepInput =
      typeof rawStep === "string" ? { pose: rawStep } : rawStep || {};
    const slugSource =
      stepInput.pose_slug ||
      stepInput.pose ||
      stepInput.slug ||
      stepInput.id ||
      "";
    const resolved = resolvePoseSlug(slugSource);
    if (!resolved) {
      throw Object.assign(new Error("unknown_pose"), {
        statusCode: 400,
        payload: { error: "unknown_pose", pose: slugSource },
      });
    }
    if (resolved.replaced && resolved.original !== resolved.slug) {
      adjustments.push({
        type: "pose_replaced",
        from: resolved.original,
        to: resolved.slug,
        distance: resolved.distance,
      });
    }
    const blueprint = poseLibrary[resolved.slug];
    const baseFrames = cloneFrames(blueprint.frames);
    let frames = baseFrames;
    let requestedDuration: number | null = null;
    if (typeof stepInput.duration_sec === "number") {
      requestedDuration = stepInput.duration_sec;
    } else if (typeof stepInput.seconds === "number") {
      requestedDuration = stepInput.seconds;
    }
    if (Array.isArray(stepInput.frames) && stepInput.frames.length) {
      frames = stepInput.frames.map((frame: any, index: number) => {
        const fallback =
          baseFrames[index] ||
          baseFrames[baseFrames.length - 1] || {
            seconds: defaultPoseDuration(blueprint),
            imageUrl: blueprint.imageUrl,
            text: blueprint.frames[0]?.text ?? {},
          };
        const seconds = Number(frame.seconds) || fallback.seconds;
        const imageUrl =
          typeof frame.imageUrl === "string" && frame.imageUrl.trim().length
            ? frame.imageUrl
            : fallback.imageUrl;
        const text =
          frame.text && typeof frame.text === "object"
            ? { ...fallback.text, ...frame.text }
            : { ...fallback.text };
        return { seconds, imageUrl, text };
      });
    } else if (requestedDuration && requestedDuration > 0) {
      const baseTotal = sumFrameSeconds(baseFrames);
      if (baseTotal > 0) {
        const ratio = requestedDuration / baseTotal;
        frames = baseFrames.map((frame) => ({
          ...frame,
          seconds: Math.max(5, Math.round(frame.seconds * ratio)),
        }));
        const adjustment = requestedDuration - sumFrameSeconds(frames);
        if (adjustment !== 0 && frames.length) {
          frames[frames.length - 1].seconds += adjustment;
        }
      } else if (frames.length) {
        frames[0].seconds = requestedDuration;
      }
    }

    const stepSeconds = sumFrameSeconds(frames);
    if (stepSeconds <= 0) {
      throw Object.assign(new Error("invalid_step_duration"), {
        statusCode: 400,
        payload: { error: "invalid_step_duration", pose: resolved.slug },
      });
    }
    totalSeconds += stepSeconds;
    maxLevel = Math.max(maxLevel, blueprint.level || 1);
    if (Array.isArray(blueprint.tags)) {
      for (const tag of blueprint.tags) {
        focusCollector.add(tag);
      }
    }
    if (Array.isArray(blueprint.areas)) {
      for (const area of blueprint.areas) {
        focusCollector.add(area);
      }
    }
    const note =
      typeof stepInput.notes === "string" && stepInput.notes.trim().length
        ? stepInput.notes.trim()
        : null;
    const normalized: Record<string, any> = {
      poseSlug: blueprint.slug,
      frames,
    };
    if (note) {
      normalized.note = note;
    }
    normalizedSteps.push(normalized);
  }

  if (totalSeconds <= 0) {
    throw Object.assign(new Error("invalid_sequence_duration"), {
      statusCode: 400,
      payload: { error: "invalid_sequence_duration" },
    });
  }

  const tracks = await listBgmTracks(env);
  const trackSet = new Set(tracks.map((track) => track.fileName));
  const autoContext = {
    ...autoBgmContext,
    focusKeywords: Array.from(focusCollector),
    timeSegment: autoBgmContext.timeSegment || determineTimeSegment(),
  };

  let requestedBgm = extractRequestedBgm(menu);
  let autoBgmReason: string | null = null;
  const forceAuto = autoBgmMode === "always";
  const allowAuto = autoBgmMode === "always" || autoBgmMode === "fallback";

  if (forceAuto || (!requestedBgm && allowAuto)) {
    const suggestion = suggestBgmForContext(tracks, autoContext);
    if (suggestion.track) {
      if (requestedBgm && suggestion.track.fileName !== requestedBgm) {
        adjustments.push({
          type: "bgm_replaced",
          from: requestedBgm,
          to: suggestion.track.fileName,
          reason: suggestion.reason,
        });
      } else if (!requestedBgm) {
        adjustments.push({
          type: "bgm_assigned",
          to: suggestion.track.fileName,
          reason: suggestion.reason,
        });
      }
      requestedBgm = suggestion.track.fileName;
      autoBgmReason = suggestion.reason || "suggestion";
    }
  }

  if (requestedBgm && !trackSet.has(requestedBgm)) {
    const fallback = tracks[0]?.fileName ?? null;
    adjustments.push({
      type: "bgm_invalid_replaced",
      from: requestedBgm,
      to: fallback,
    });
    requestedBgm = fallback;
  }
  if (!requestedBgm && tracks.length) {
    requestedBgm = tracks[0].fileName;
    adjustments.push({
      type: "bgm_assigned_default",
      to: requestedBgm,
    });
  }

  const title =
    typeof menu.title === "string" && menu.title.trim().length
      ? menu.title.trim()
      : "Custom Flow";
  const summary =
    typeof menu.summary === "string" && menu.summary.trim().length
      ? menu.summary.trim()
      : null;
  const slugSource =
    typeof menu.slug === "string" && menu.slug.trim().length
      ? menu.slug
      : title;
  const sequenceSlug = slugify(
    slugSource,
    `chatgpt-${crypto.randomUUID().slice(0, 8)}`,
  );
  const id = crypto.randomUUID();
  const payload = {
    id,
    user_id: userId,
    source: channel,
    slug: sequenceSlug,
    title,
    bgm: requestedBgm,
    total_seconds: totalSeconds,
    level: maxLevel,
    steps: normalizedSteps,
    summary,
    metadata: {
      request: requestMetadata ?? null,
      adjustments,
      raw_menu: menu,
      bgm_auto_reason: autoBgmReason,
      auto_context: autoContext,
    },
  };

  const { error: insertError } = await supabase
    .from("chatgpt_sequences")
    .insert(payload);
  if (insertError) {
    throw Object.assign(insertError, {
      statusCode: 500,
      payload: { error: "sequence_store_failed" },
    });
  }

  return {
    id,
    slug: sequenceSlug,
    title,
    duration_sec: totalSeconds,
    level: maxLevel,
    bgm: requestedBgm,
    steps: normalizedSteps,
    adjustments,
    summary,
    metadata: payload.metadata,
  };
}

async function fetchProfileWithStats(env: Env, userId: string) {
  const supabase = getSupabase(env);
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    return { profile: null, stats: null };
  }
  const { data: sessions, error: sessionsError, count } = await supabase
    .from("sessions")
    .select("duration_sec,completed_at", { count: "exact" })
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(50);
  if (sessionsError) throw sessionsError;
  const totalSessions =
    typeof count === "number" ? count : (sessions?.length ?? 0);
  const totalSeconds = (sessions ?? []).reduce(
    (acc, row) => acc + (Number(row.duration_sec) || 0),
    0,
  );
  const lastSessionAt = sessions?.[0]?.completed_at ?? null;
  return {
    profile,
    stats: {
      total_sessions: totalSessions,
      total_seconds: totalSeconds,
      last_session_at: lastSessionAt,
    },
  };
}

async function fetchMonthlyHistoryData(env: Env, options: {
  userId: string;
  monthParam: string | null;
}) {
  const { userId, monthParam } = options;
  const supabase = getSupabase(env);
  const targetDate = monthParam ? `${monthParam}-01` : null;
  const basis = targetDate ? new Date(`${targetDate}T00:00:00Z`) : new Date();
  if (Number.isNaN(basis.getTime())) {
    const error: any = new Error("invalid_month");
    error.statusCode = 400;
    throw error;
  }
  const year = basis.getUTCFullYear();
  const monthIndex = basis.getUTCMonth();
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  const monthLabel = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("sessions")
    .select("completed_at,duration_sec,sequence_slug")
    .eq("user_id", userId)
    .gte("completed_at", start.toISOString())
    .lt("completed_at", end.toISOString())
    .order("completed_at", { ascending: true });
  if (error) throw error;
  const dayMap = new Map<
    string,
    { total_seconds: number; session_count: number }
  >();
  let totalSeconds = 0;
  for (const row of data || []) {
    const completed = row.completed_at ? new Date(row.completed_at) : null;
    if (!completed) continue;
    const dateKey = completed.toISOString().slice(0, 10);
    const existing = dayMap.get(dateKey) || {
      total_seconds: 0,
      session_count: 0,
    };
    const duration = Number(row.duration_sec) || 0;
    existing.total_seconds += duration;
    existing.session_count += 1;
    dayMap.set(dateKey, existing);
    totalSeconds += duration;
  }
  const days = Array.from(dayMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, info]) => ({
      date,
      total_seconds: info.total_seconds,
      session_count: info.session_count,
    }));
  return {
    month: monthLabel,
    total_seconds: totalSeconds,
    total_sessions: days.reduce(
      (acc, item) => acc + item.session_count,
      0,
    ),
    days,
  };
}

async function trackSdkUsageQuota(env: Env, options: {
  userId: string;
  paid: boolean;
  freeLimit?: number;
}) {
  const { userId, paid } = options;
  const freeLimit =
    Number.isFinite(options.freeLimit) && options.freeLimit && options.freeLimit > 0
      ? Number(options.freeLimit)
      : getSdkFreeWeeklyLimit(env);
  if (!userId) {
    throw new Error("missing_user_id");
  }
  if (paid) {
    return {
      allowed: true,
      usage: {
        weekKey: startOfWeekKey(),
        countBefore: 0,
        countAfter: 0,
        limit: null,
      },
    };
  }
  const supabase = getSupabase(env);
  const limit = freeLimit > 0 ? freeLimit : getSdkFreeWeeklyLimit(env);
  const weekKey = startOfWeekKey();
  const { data, error } = await supabase
    .from("sdk_usage")
    .select("id, chat_count")
    .eq("user_id", userId)
    .eq("week_key", weekKey)
    .maybeSingle();
  if (error) throw error;
  let count = data?.chat_count ?? 0;
  const countBefore = count;
  if (count >= limit) {
    return {
      allowed: false,
      usage: { weekKey, countBefore, countAfter: count, limit },
    };
  }
  count += 1;
  const nowIso = new Date().toISOString();
  if (data?.id) {
    const { error: updateError } = await supabase
      .from("sdk_usage")
      .update({ chat_count: count, updated_at: nowIso })
      .eq("id", data.id);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase
      .from("sdk_usage")
      .insert({
        user_id: userId,
        week_key: weekKey,
        chat_count: count,
        updated_at: nowIso,
      });
    if (insertError) throw insertError;
  }
  return {
    allowed: true,
    usage: { weekKey, countBefore, countAfter: count, limit },
  };
}

function cleanupMcpSession(sessionId: string) {
  const session = mcpSessions.get(sessionId);
  if (!session) return;
  if (session.heartbeat) {
    clearInterval(session.heartbeat);
    session.heartbeat = null;
  }
  try {
    session.controller.close();
  } catch {
    // ignore
  }
  mcpSessions.delete(sessionId);
}

function sendMcpEvent(
  session: McpSession | null | undefined,
  type: string,
  payload: Record<string, any>,
) {
  if (!session) return;
  try {
    session.controller.enqueue(
      textEncoder.encode(
        `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`,
      ),
    );
  } catch (err) {
    console.error("MCP send event error", err);
    cleanupMcpSession(session.id);
  }
}

async function handleMcpSse(env: Env, request: Request, url: URL) {
  const auth = authenticateSdkRequest(env, request, url, MCP_CHANNEL);
  if (!auth.ok) return auth.response;
  const sessionId = crypto.randomUUID();
  const freeLimit = getSdkFreeWeeklyLimit(env);
  const billingUrl = getBillingUrl(env);
  const session: McpSession = {
    id: sessionId,
    token: auth.token,
    createdAt: Date.now(),
    lastAccess: Date.now(),
    controller: null as unknown as ReadableStreamDefaultController<Uint8Array>,
    heartbeat: null,
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      session.controller = controller;
      mcpSessions.set(sessionId, session);
  const handshake = {
    session_id: sessionId,
    protocol: "1.0",
    server: mcpServerInfo,
    capabilities: {},
    limits: {
      free_weekly_limit: freeLimit,
      billing_url: billingUrl,
    },
    tools: mcpTools,
      };
      sendMcpEvent(session, "handshake", handshake);
      sendMcpEvent(session, "ready", { message: "session_ready" });
      session.heartbeat = setInterval(() => {
        sendMcpEvent(session, "ping", { ts: Date.now() });
      }, MCP_PING_INTERVAL_MS);
    },
    cancel() {
      cleanupMcpSession(sessionId);
    },
  });

  request.signal.addEventListener("abort", () => {
    cleanupMcpSession(sessionId);
  });

  const headers = buildCorsHeaders(request, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  return new Response(stream, { status: 200, headers });
}

async function handleMcpInvoke(env: Env, request: Request, url: URL) {
  const auth = authenticateSdkRequest(env, request, url, MCP_CHANNEL);
  if (!auth.ok) return auth.response;
  const billingUrl = getBillingUrl(env);
  const body = (await readJson(request)) || {};
  const sessionId = body.session_id || body.sessionId;
  if (!sessionId || typeof sessionId !== "string") {
    return errorResponse(request, 400, "missing_session_id");
  }
  const session = mcpSessions.get(sessionId);
  if (!session) {
    return errorResponse(request, 404, "session_not_found");
  }
  if (session.token !== auth.token) {
    return errorResponse(request, 403, "session_token_mismatch");
  }
  session.lastAccess = Date.now();
  const tool = body.tool || body.name;
  if (!tool || typeof tool !== "string") {
    return errorResponse(request, 400, "missing_tool");
  }
  const requestId = body.request_id || body.requestId || null;
  const args = body.arguments ?? body.args ?? {};
  let result: Record<string, any>;
  try {
    if (tool === "generate_menu") {
      const userId =
        typeof args.user_id === "string" && args.user_id.trim().length
          ? args.user_id.trim()
          : null;
      if (!userId) {
        const err: any = new Error("missing_user_id");
        err.statusCode = 400;
        err.payload = { error: "missing_user_id" };
        throw err;
      }
      const menu = args.menu;
      if (!menu || typeof menu !== "object") {
        const err: any = new Error("missing_menu");
        err.statusCode = 400;
        err.payload = { error: "missing_menu" };
        throw err;
      }
      const constraints =
        args.constraints && typeof args.constraints === "object"
          ? args.constraints
          : {};
      const focusSet = new Set<string>();
      const collectFocus = (value: unknown) => {
        if (!value) return;
        if (Array.isArray(value)) {
          value
            .map((item) =>
              typeof item === "string" ? item.trim() : "",
            )
            .filter(Boolean)
            .forEach((entry) => focusSet.add(entry));
        } else if (typeof value === "string" && value.trim().length) {
          value
            .split(/[\s,\u3001]+/)
            .map((entry) => entry.trim())
            .filter(Boolean)
            .forEach((entry) => focusSet.add(entry));
        }
      };
      collectFocus(args.focus_keywords);
      collectFocus(args.focusKeywords);
      collectFocus(constraints.focus);
      if (Array.isArray(menu.tags)) collectFocus(menu.tags);
      if (Array.isArray(menu.focus)) collectFocus(menu.focus);

      const profileResult = await fetchProfileWithStats(env, userId);
      const profileRecord = profileResult.profile || null;
      const paid = isProfileSubscriptionActive(profileRecord);
      const usage = await trackSdkUsageQuota(env, {
        userId,
        paid,
        freeLimit:
          typeof args.free_limit === "number" ? args.free_limit : undefined,
      });
      if (!usage.allowed) {
        const limit = usage.usage.limit;
        const message = limit
          ? `Free plan allows up to ${limit} chats per week. Please consider upgrading to continue.`
          : "Free plan usage limit reached. Please consider upgrading to continue.";
        const err: any = new Error("payment_required");
        err.statusCode = 402;
        err.payload = {
          error: "payment_required",
          message,
          usage: usage.usage,
          billing_url: billingUrl || getBillingUrl(env),
          paid,
        };
        throw err;
      }

      const autoBgmContext = {
        focusKeywords: Array.from(focusSet),
        energy: constraints.energy || args.energy,
        seasonHint: constraints.season_hint || args.season_hint,
        timeSegment: args.time_segment || constraints.time_segment,
      };

      const sequence = await normalizeAndStoreMenu(env, {
        userId,
        menu,
        channel: MCP_CHANNEL,
        requestMetadata: args.request ?? null,
        autoBgmMode: "always",
        autoBgmContext,
      });

      result = {
        sequence,
        usage: usage.usage,
        paid,
        profile: profileRecord,
        stats: profileResult.stats,
      };
    } else if (tool === "get_history") {
      const userId =
        typeof args.user_id === "string" && args.user_id.trim().length
          ? args.user_id.trim()
          : null;
      if (!userId) {
        const err: any = new Error("missing_user_id");
        err.statusCode = 400;
        err.payload = { error: "missing_user_id" };
        throw err;
      }
      const monthParam =
        typeof args.month === "string" && args.month.trim().length
          ? args.month.trim()
          : null;
      const history = await fetchMonthlyHistoryData(env, {
        userId,
        monthParam,
      });
      result = { history };
    } else if (tool === "get_profile") {
      const userId =
        typeof args.user_id === "string" && args.user_id.trim().length
          ? args.user_id.trim()
          : null;
      if (!userId) {
        const err: any = new Error("missing_user_id");
        err.statusCode = 400;
        err.payload = { error: "missing_user_id" };
        throw err;
      }
      const { profile, stats } = await fetchProfileWithStats(env, userId);
      if (!profile) {
        const err: any = new Error("profile_not_found");
        err.statusCode = 404;
        err.payload = { error: "profile_not_found" };
        throw err;
      }
      result = {
        profile,
        stats,
        paid: isProfileSubscriptionActive(profile),
      };
    } else if (tool === "list_bgm") {
      const tracks = await listBgmTracks(env);
      result = { tracks };
    } else {
      return errorResponse(request, 400, "unknown_tool");
    }
  } catch (err: any) {
    console.error("POST /api/mcp/invoke error", err);
    const status =
      typeof err?.statusCode === "number"
        ? err.statusCode
        : err?.payload
        ? 400
        : 500;
    const payload =
      err?.payload ||
      ({
        error: "mcp_invoke_failed",
        message: err?.message || "invoke_failed",
      } as Record<string, any>);
    sendMcpEvent(session, "tool_error", {
      request_id: requestId,
      tool,
      error: payload.error || "mcp_invoke_failed",
      details: payload,
    });
    return jsonResponse(request, payload, { status });
  }

  const responsePayload = { request_id: requestId, tool, result };
  sendMcpEvent(session, "tool_result", responsePayload);
  return jsonResponse(request, { ok: true, result });
}

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
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Anonymous-Id,X-ChatGPT-App-Token,X-Chat-Channel",
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

  if (request.method === "GET" && url.pathname === "/api/mcp/sse") {
    return handleMcpSse(env, request, url);
  }

  if (request.method === "POST" && url.pathname === "/api/mcp/invoke") {
    return handleMcpInvoke(env, request, url);
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
