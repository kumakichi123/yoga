import { syncStripeSubscription } from './stripeHelpers.js';
// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { readdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { poseLibrary } from '../data/poses.js';

const app = express();
app.use(cors());
const rawBodySaver = (req, res, buf) => { if (req.originalUrl === '/api/stripe/webhook') { req.rawBody = buf; } };
app.use(express.json({ verify: rawBodySaver }));

// ---- Supabase (server-side) ----
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');
const stripeClient = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

const parsedFreeLimit = Number(process.env.SDK_FREE_WEEKLY_LIMIT);
const DEFAULT_SDK_FREE_LIMIT = Number.isFinite(parsedFreeLimit) && parsedFreeLimit > 0
  ? parsedFreeLimit
  : 5;
const SDK_BILLING_URL =
  process.env.SDK_BILLING_URL ||
  (APP_BASE_URL ? `${APP_BASE_URL.replace(/\/+$/, '')}/settings` : null);

const BGM_DIR = path.resolve(process.cwd(), 'public', 'BGM');
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.webm']);
const CHANNEL_HEADER = 'x-chat-channel';
const CHATGPT_CHANNEL = 'chatgpt';
const SDK_CHANNEL = 'sdk';
const MCP_CHANNEL = 'mcp';
const SDK_TOKEN_HEADER = 'x-chatgpt-app-token';
const MAX_POSE_SUGGEST_DISTANCE = 4;
const POSE_SLUGS = Object.keys(poseLibrary);

const sdkTokenCache = {
  raw: null,
  set: new Set(),
};

const mcpSessions = new Map();

function sendMcpEvent(session, type, payload) {
  if (!session || !session.res || session.res.writableEnded) return;
  try {
    session.res.write(
      `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`
    );
  } catch (err) {
    console.error('MCP send event error', err);
  }
}

const mcpTools = [
  {
    name: 'get_history',
    description: 'Return monthly practice history for the user.',
    input_schema: {
      type: 'object',
      required: ['user_id'],
      properties: {
        user_id: { type: 'string' },
        month: {
          type: 'string',
          description: 'YYYY-MM format (optional).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_profile',
    description: 'Fetch the user profile and usage stats.',
    input_schema: {
      type: 'object',
      required: ['user_id'],
      properties: {
        user_id: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_bgm',
    description: 'List available background music tracks.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
];

const mcpServerInfo = { name: 'Yoga SDK MCP Bridge', version: '0.1.0' };
const MCP_PING_INTERVAL_MS = 15000;

function getEnvTokenSet() {
  const raw = process.env.CHATGPT_APP_TOKENS || '';
  if (raw === sdkTokenCache.raw) {
    return sdkTokenCache.set;
  }
  const nextSet = new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  sdkTokenCache.raw = raw;
  sdkTokenCache.set = nextSet;
  return nextSet;
}

function isSdkTokenValid(token) {
  if (!token || typeof token !== 'string') return false;
  return getEnvTokenSet().has(token.trim());
}

function requireSdkToken(req, res, next) {
  const header = req.headers?.[SDK_TOKEN_HEADER];
  const headerToken = Array.isArray(header) ? header[0] : header;
  const query = req.query?.token;
  const queryToken =
    typeof query === 'string' && query.trim().length ? query.trim() : null;
  const authHeader = req.headers?.authorization;
  let bearerToken = null;
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) {
      const trimmed = match[1].trim();
      if (trimmed.length) bearerToken = trimmed;
    }
  }
  const token = headerToken ?? queryToken ?? bearerToken;
  if (!token || !isSdkTokenValid(token)) {
    console.warn('SDK token auth failed', {
      path: req.originalUrl,
      hasHeaderToken: Boolean(headerToken),
      hasQueryToken: Boolean(queryToken),
      hasBearerToken: Boolean(bearerToken),
    });
    return res.status(401).json({ error: 'sdk_unauthorised' });
  }
  const trimmed = token.trim();
  req.sdkToken = trimmed;
  const requestedChannel = req.baseUrl?.includes('/api/mcp') || req.originalUrl?.includes('/api/mcp')
    ? MCP_CHANNEL
    : SDK_CHANNEL;
  req.sdkChannel = requestedChannel;
  console.log('SDK token auth success', {
    path: req.originalUrl,
    channel: requestedChannel,
    tokenLength: trimmed.length,
  });
  return next();
}

function detectChannel(req) {
  if (req.sdkChannel) return req.sdkChannel;
  const header = req.headers?.[CHANNEL_HEADER];
  const querySource =
    typeof req.query?.channel === 'string' ? req.query.channel : null;
  const candidate =
    (Array.isArray(header) ? header[0] : header) ?? querySource ?? '';
  if (typeof candidate !== 'string') return 'web';
  const normalized = candidate.trim().toLowerCase();
  if (normalized === CHATGPT_CHANNEL) return CHATGPT_CHANNEL;
  if (normalized === SDK_CHANNEL) return SDK_CHANNEL;
  if (normalized === MCP_CHANNEL) return MCP_CHANNEL;
  return 'web';
}

async function listBgmTracks() {
  try {
    const entries = await readdir(BGM_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .map((fileName) => {
        const parsed = path.parse(fileName);
        const humanName = parsed.name
          .replace(/[-_]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return {
          fileName,
          name: humanName || parsed.name || fileName,
          url: `/BGM/${encodeURIComponent(fileName)}`,
        };
      });
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

function cloneFrames(frames = []) {
  return frames.map((frame) => ({
    seconds: Number(frame.seconds) || 0,
    imageUrl: frame.imageUrl,
    text: { ...frame.text },
  }));
}

function sumFrameSeconds(frames = []) {
  return frames.reduce((total, frame) => total + (Number(frame.seconds) || 0), 0);
}

function defaultPoseDuration(pose) {
  const total = sumFrameSeconds(pose.frames);
  return total > 0 ? total : 30;
}

function normalisePoseSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshteinDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

function resolvePoseSlug(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const directSlug = trimmed.toLowerCase();
  if (poseLibrary[directSlug]) {
    return { slug: directSlug, replaced: false, distance: 0, original: trimmed };
  }
  const target = normalisePoseSlug(trimmed);
  if (!target) return null;
  let bestSlug = null;
  let bestDistance = Infinity;
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

function slugify(value, fallback = '') {
  if (!value || typeof value !== 'string') return fallback;
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || fallback;
}

function determineTimeSegment(date = new Date()) {
  const hour = date.getHours();
  if (hour < 6) return 'late-night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'day';
  return 'evening';
}

function suggestBgmForContext(tracks, context = {}) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { track: null, reason: 'no_tracks' };
  }
  const byFileName = new Map(tracks.map((track) => [track.fileName, track]));
  const preferences = [];
  const segment = context.timeSegment || determineTimeSegment();
  if (segment === 'morning') {
    preferences.push('譛昴・險ｪ繧・mp3');
  } else if (segment === 'evening') {
    preferences.push('譁ｰ邱代・荳・mp3');
  }
  const energyHint =
    typeof context.energy === 'string' ? context.energy.toLowerCase() : '';
  if (energyHint) {
    if (/relax|calm|gentle|sleep|slow/.test(energyHint)) {
      preferences.unshift('譁ｰ邱代・荳・mp3');
    }
    if (/focus|work|product|study/.test(energyHint)) {
      preferences.push('Night_Show_Case.mp3');
    }
    if (/holiday|xmas|christmas/.test(energyHint)) {
      preferences.push('We_Wish_You_a_Merry_Christmas・医が繝ｫ繧ｴ繝ｼ繝ｫVer.・・mp3');
    }
  }
  const focusKeywords = Array.isArray(context.focusKeywords)
    ? context.focusKeywords
    : [];
  if (focusKeywords.some((keyword) => /relax|sleep|calm|閻ｰ|閧ｩ|繧ｹ繝医Ξ繝・メ/i.test(keyword))) {
    preferences.push('譁ｰ邱代・荳・mp3');
  }
  if (focusKeywords.some((keyword) => /energ|power|遲弓core|菴灘ｹｹ/i.test(keyword))) {
    preferences.push('Night_Show_Case.mp3');
  }
  if (context.seasonHint === 'holiday') {
    preferences.push('We_Wish_You_a_Merry_Christmas・医が繝ｫ繧ｴ繝ｼ繝ｫVer.・・mp3');
  }
  for (const candidate of preferences) {
    const track = byFileName.get(candidate);
    if (track) {
      return { track, reason: 'preference', candidate };
    }
  }
  return { track: tracks[0], reason: 'fallback' };
}

async function trackSdkUsageQuota({ userId, paid, freeLimit = DEFAULT_SDK_FREE_LIMIT }) {
  if (!userId) {
    throw new Error('missing_user_id');
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
  const limit = Number.isFinite(freeLimit) && freeLimit > 0 ? freeLimit : DEFAULT_SDK_FREE_LIMIT;
  const weekKey = startOfWeekKey();
  const { data, error } = await supabase
    .from('sdk_usage')
    .select('id, chat_count')
    .eq('user_id', userId)
    .eq('week_key', weekKey)
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
      .from('sdk_usage')
      .update({ chat_count: count, updated_at: nowIso })
      .eq('id', data.id);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase
      .from('sdk_usage')
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

function extractRequestedBgm(menu) {
  if (!menu) return null;
  const candidates = [
    menu.bgm,
    menu.bgm_file,
    menu.bgmFile,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length) {
      return candidate.trim();
    }
  }
  return null;
}

async function normalizeAndStoreMenu({
  userId,
  menu,
  channel,
  requestMetadata,
  autoBgmMode = 'fallback',
  autoBgmContext = {},
}) {
  if (!menu || !Array.isArray(menu.steps) || menu.steps.length === 0) {
    throw Object.assign(new Error('missing_steps'), { statusCode: 400, payload: { error: 'missing_steps' } });
  }
  const adjustments = [];
  const normalizedSteps = [];
  let totalSeconds = 0;
  let maxLevel = 1;
  const focusCollector = new Set(
    Array.isArray(autoBgmContext.focusKeywords) ? autoBgmContext.focusKeywords : []
  );

  for (const rawStep of menu.steps) {
    const stepInput = typeof rawStep === 'string' ? { pose: rawStep } : rawStep || {};
    const slugSource =
      stepInput.pose_slug ||
      stepInput.pose ||
      stepInput.slug ||
      stepInput.id ||
      '';
    const resolved = resolvePoseSlug(slugSource);
    if (!resolved) {
      throw Object.assign(new Error('unknown_pose'), {
        statusCode: 400,
        payload: { error: 'unknown_pose', pose: slugSource },
      });
    }
    if (resolved.replaced && resolved.original !== resolved.slug) {
      adjustments.push({
        type: 'pose_replaced',
        from: resolved.original,
        to: resolved.slug,
        distance: resolved.distance,
      });
    }
    const blueprint = poseLibrary[resolved.slug];
    const baseFrames = cloneFrames(blueprint.frames);
    let frames = baseFrames;
    let requestedDuration = null;
    if (typeof stepInput.duration_sec === 'number') {
      requestedDuration = stepInput.duration_sec;
    } else if (typeof stepInput.seconds === 'number') {
      requestedDuration = stepInput.seconds;
    }
    if (Array.isArray(stepInput.frames) && stepInput.frames.length) {
      frames = stepInput.frames.map((frame, index) => {
        const fallback =
          baseFrames[index] ||
          baseFrames[baseFrames.length - 1] || {
            seconds: defaultPoseDuration(blueprint),
            imageUrl: blueprint.imageUrl,
            text: blueprint.frames[0]?.text ?? {},
          };
        const seconds = Number(frame.seconds) || fallback.seconds;
        const imageUrl =
          typeof frame.imageUrl === 'string' && frame.imageUrl.trim().length
            ? frame.imageUrl
            : fallback.imageUrl;
        const text =
          frame.text && typeof frame.text === 'object'
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
      throw Object.assign(new Error('invalid_step_duration'), {
        statusCode: 400,
        payload: { error: 'invalid_step_duration', pose: resolved.slug },
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
      typeof stepInput.notes === 'string' && stepInput.notes.trim().length
        ? stepInput.notes.trim()
        : null;
    const normalized = {
      poseSlug: blueprint.slug,
      frames,
    };
    if (note) {
      normalized.note = note;
    }
    normalizedSteps.push(normalized);
  }

  if (totalSeconds <= 0) {
    throw Object.assign(new Error('invalid_sequence_duration'), {
      statusCode: 400,
      payload: { error: 'invalid_sequence_duration' },
    });
  }

  const tracks = await listBgmTracks();
  const trackSet = new Set(tracks.map((track) => track.fileName));
  const autoContext = {
    ...autoBgmContext,
    focusKeywords: Array.from(focusCollector),
    timeSegment: autoBgmContext.timeSegment || determineTimeSegment(),
  };

  let requestedBgm = extractRequestedBgm(menu);
  let autoBgmReason = null;
  const forceAuto = autoBgmMode === 'always';
  const allowAuto = autoBgmMode === 'always' || autoBgmMode === 'fallback';

  if (forceAuto || (!requestedBgm && allowAuto)) {
    const suggestion = suggestBgmForContext(tracks, autoContext);
    if (suggestion.track) {
      if (requestedBgm && suggestion.track.fileName !== requestedBgm) {
        adjustments.push({
          type: 'bgm_replaced',
          from: requestedBgm,
          to: suggestion.track.fileName,
          reason: suggestion.reason,
        });
      } else if (!requestedBgm) {
        adjustments.push({
          type: 'bgm_assigned',
          to: suggestion.track.fileName,
          reason: suggestion.reason,
        });
      }
      requestedBgm = suggestion.track.fileName;
      autoBgmReason = suggestion.reason || 'suggestion';
    }
  }

  if (requestedBgm && !trackSet.has(requestedBgm)) {
    const fallback = tracks[0]?.fileName ?? null;
    adjustments.push({
      type: 'bgm_invalid_replaced',
      from: requestedBgm,
      to: fallback,
    });
    requestedBgm = fallback;
  }
  if (!requestedBgm && tracks.length) {
    requestedBgm = tracks[0].fileName;
    adjustments.push({
      type: 'bgm_assigned_default',
      to: requestedBgm,
    });
  }

  const title =
    typeof menu.title === 'string' && menu.title.trim().length
      ? menu.title.trim()
      : 'Custom Flow';
  const summary =
    typeof menu.summary === 'string' && menu.summary.trim().length
      ? menu.summary.trim()
      : null;
  const slugSource =
    typeof menu.slug === 'string' && menu.slug.trim().length
      ? menu.slug
      : title;
  const sequenceSlug = slugify(
    slugSource,
    `chatgpt-${randomUUID().slice(0, 8)}`
  );
  const id = randomUUID();
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
    .from('chatgpt_sequences')
    .insert(payload);
  if (insertError) {
    throw Object.assign(insertError, {
      statusCode: 500,
      payload: { error: 'sequence_store_failed' },
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

async function fetchProfileWithStats(userId) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    return { profile: null, stats: null };
  }
  const { data: sessions, error: sessionsError, count } = await supabase
    .from('sessions')
    .select('duration_sec,completed_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(50);
  if (sessionsError) throw sessionsError;
  const totalSessions =
    typeof count === 'number' ? count : (sessions?.length ?? 0);
  const totalSeconds = (sessions ?? []).reduce(
    (acc, row) => acc + (Number(row.duration_sec) || 0),
    0
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

async function fetchMonthlyHistoryData({ userId, monthParam }) {
  const targetDate = monthParam ? `${monthParam}-01` : null;
  const basis = targetDate ? new Date(`${targetDate}T00:00:00Z`) : new Date();
  if (Number.isNaN(basis.getTime())) {
    const error = new Error('invalid_month');
    error.statusCode = 400;
    throw error;
  }
  const year = basis.getUTCFullYear();
  const monthIndex = basis.getUTCMonth();
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  const monthLabel = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('sessions')
    .select('completed_at,duration_sec,sequence_slug')
    .eq('user_id', userId)
    .gte('completed_at', start.toISOString())
    .lt('completed_at', end.toISOString())
    .order('completed_at', { ascending: true });
  if (error) throw error;
  const dayMap = new Map();
  let totalSeconds = 0;
  for (const row of data || []) {
    const completed = row.completed_at ? new Date(row.completed_at) : null;
    if (!completed) continue;
    const dateKey = completed.toISOString().slice(0, 10);
    const existing = dayMap.get(dateKey) || { total_seconds: 0, session_count: 0 };
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
    total_sessions: days.reduce((acc, item) => acc + item.session_count, 0),
    days,
  };
}

async function getUserFromRequest(req) {
  const auth = req.headers['authorization'];
  if (!auth || typeof auth !== 'string') return null;
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

function getAnonymousId(req) {
  const header = req.headers['x-anonymous-id'];
  const bodyAnon = req.body?.anonymous_id;
  const value = (typeof header === 'string' && header.trim().length) ? header.trim() :
                (typeof bodyAnon === 'string' && bodyAnon.trim().length) ? bodyAnon.trim() : null;
  return value;
}
function ensureStripeConfigured(res) {
  if (!stripeClient || !STRIPE_PRICE_ID) {
    res.status(500).json({ error: 'stripe_not_configured' });
    return false;
  }
  return true;
}

function startOfWeekKey(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

function isProfileSubscriptionActive(profile) {
  if (!profile) return false;
  const status = profile?.subscription_status;
  if (!status) return false;
  if (status === 'active' || status === 'trialing') {
    if (!profile.subscription_current_period_end) return true;
    return new Date(profile.subscription_current_period_end).getTime() > Date.now();
  }
  return false;
}



const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normaliseConversationId(conversationId) {
  if (typeof conversationId !== 'string') return null;
  const trimmed = conversationId.trim();
  if (!trimmed) return null;
  if (UUID_REGEX.test(trimmed)) return trimmed;
  return null;
}

function logConversationId() {}

app.get('/api/bgm', async (req, res) => {
  try {
    const tracks = await listBgmTracks();
    return res.json({ tracks });
  } catch (err) {
    console.error('GET /api/bgm error', err);
    return res.status(500).json({ error: 'bgm_list_failed' });
  }
});

app.get('/api/chatgpt/poses', (req, res) => {
  const poses = Object.values(poseLibrary).map((pose) => ({
    slug: pose.slug,
    name: pose.name,
    cues: pose.cues,
    level: pose.level,
    tags: pose.tags ?? [],
    areas: pose.areas ?? [],
    imageUrl: pose.imageUrl ?? null,
    default_duration_sec: defaultPoseDuration(pose),
    frames: pose.frames.map((frame) => ({
      seconds: Number(frame.seconds) || 0,
      imageUrl: frame.imageUrl,
      text: { ...frame.text },
    })),
  }));
  return res.json({ poses });
});

app.get('/api/chatgpt/bgms', async (req, res) => {
  try {
    const tracks = await listBgmTracks();
    return res.json({ tracks });
  } catch (err) {
    console.error('GET /api/chatgpt/bgms error', err);
    return res.status(500).json({ error: 'bgm_list_failed' });
  }
});

app.get('/api/chatgpt/profile/:userId', async (req, res) => {
  try {
    const userId = req.params?.userId;
    if (!userId) {
      return res.status(400).json({ error: 'missing_user_id' });
    }
    const { profile, stats } = await fetchProfileWithStats(userId);
    if (!profile) {
      return res.status(404).json({ error: 'profile_not_found' });
    }
    return res.json({
      profile,
      stats,
    });
  } catch (err) {
    console.error('GET /api/chatgpt/profile error', err);
    return res.status(500).json({ error: 'profile_fetch_failed' });
  }
});

app.post('/api/chatgpt/menus', async (req, res) => {
  try {
    const body = req.body || {};
    const userId =
      typeof body.user_id === 'string' && body.user_id.trim().length
        ? body.user_id.trim()
        : typeof body.userId === 'string' && body.userId.trim().length
        ? body.userId.trim()
        : null;
    if (!userId) {
      return res.status(400).json({ error: 'missing_user_id' });
    }
    const channel = detectChannel(req);
    const focusKeywords = Array.isArray(body.focus_keywords)
      ? body.focus_keywords
      : Array.isArray(body.focusKeywords)
      ? body.focusKeywords
      : [];
    const result = await normalizeAndStoreMenu({
      userId,
      menu: body.menu,
      channel,
      requestMetadata: body.request ?? null,
      autoBgmMode: 'fallback',
      autoBgmContext: {
        focusKeywords,
        timeSegment: body.time_segment,
      },
    });
    return res.status(201).json({
      id: result.id,
      slug: result.slug,
      title: result.title,
      duration_sec: result.duration_sec,
      level: result.level,
      bgm: result.bgm,
      steps: result.steps,
      adjustments: result.adjustments,
      summary: result.summary,
    });
  } catch (err) {
    console.error('POST /api/chatgpt/menus error', err);
    if (err?.payload) {
      return res.status(err.statusCode || 400).json(err.payload);
    }
    return res.status(500).json({ error: 'menu_upsert_failed' });
  }
});

const sdkRouter = express.Router();
sdkRouter.use(requireSdkToken);

sdkRouter.post('/menus', async (req, res) => {
  try {
    const body = req.body || {};
    const userId =
      typeof body.user_id === 'string' && body.user_id.trim().length
        ? body.user_id.trim()
        : typeof body.userId === 'string' && body.userId.trim().length
        ? body.userId.trim()
        : null;
    if (!userId) {
      return res.status(400).json({ error: 'missing_user_id' });
    }
    const constraints = (body.constraints && typeof body.constraints === 'object') ? body.constraints : {};
    const focusSet = new Set();
    const collectFocus = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string' && entry.trim().length) {
            focusSet.add(entry.trim());
          }
        }
      } else if (typeof value === 'string' && value.trim().length) {
        value
          .split(/[\s,\u3001]+/)
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach((part) => focusSet.add(part));
      }
    };

    const profileResult = await fetchProfileWithStats(userId);
    const profileRecord = profileResult.profile || null;
    const paid = isProfileSubscriptionActive(profileRecord);
    const usage = await trackSdkUsageQuota({
      userId,
      paid,
      freeLimit:
        typeof body.free_limit === 'number' ? body.free_limit : DEFAULT_SDK_FREE_LIMIT,
    });
    if (!usage.allowed) {
      const limit = usage.usage.limit;
      const message = limit
        ? `Free plan allows up to ${limit} chats per week. Please consider upgrading to continue.`
        : 'Free plan usage limit reached. Please consider upgrading to continue.';
      return res.status(402).json({
        error: 'payment_required',
        message,
        usage: usage.usage,
        billing_url: SDK_BILLING_URL,
        paid,
      });
    }

    const autoBgmContext = {
      focusKeywords: Array.from(focusSet),
      energy: constraints.energy || body.energy,
      seasonHint: constraints.season_hint || body.season_hint,
      timeSegment: body.time_segment || constraints.time_segment,
    };

    const sequence = await normalizeAndStoreMenu({
      userId,
      menu: body.menu,
      channel: SDK_CHANNEL,
      requestMetadata: body.request ?? null,
      autoBgmMode: 'always',
      autoBgmContext,
    });

    return res.status(201).json({
      sequence,
      usage: usage.usage,
      paid,
      profile: profileRecord,
      stats: profileResult.stats,
    });
  } catch (err) {
    console.error('POST /api/sdk/menus error', err);
    if (err?.payload) {
      return res.status(err.statusCode || 400).json(err.payload);
    }
    return res.status(500).json({ error: 'sdk_menu_failed' });
  }
});

sdkRouter.get('/history', async (req, res) => {
  try {
    const userId =
      typeof req.query.user_id === 'string' && req.query.user_id.trim().length
        ? req.query.user_id.trim()
        : null;
    if (!userId) {
      return res.status(400).json({ error: 'missing_user_id' });
    }
    const monthParam =
      typeof req.query.month === 'string' && req.query.month.trim().length
        ? req.query.month.trim()
        : null;
    const data = await fetchMonthlyHistoryData({ userId, monthParam });
    return res.json(data);
  } catch (err) {
    console.error('GET /api/sdk/history error', err);
    if (err?.statusCode === 400) {
      return res.status(400).json({ error: err.message || 'invalid_request' });
    }
    return res.status(500).json({ error: 'history_fetch_failed' });
  }
});

sdkRouter.get('/profile/:userId', async (req, res) => {
  try {
    const userId = req.params?.userId;
    if (!userId) {
      return res.status(400).json({ error: 'missing_user_id' });
    }
    const { profile, stats } = await fetchProfileWithStats(userId);
    if (!profile) {
      return res.status(404).json({ error: 'profile_not_found' });
    }
    return res.json({
      profile,
      stats,
      paid: isProfileSubscriptionActive(profile),
    });
  } catch (err) {
    console.error('GET /api/sdk/profile error', err);
    return res.status(500).json({ error: 'profile_fetch_failed' });
  }
});


const mcpRouter = express.Router();
mcpRouter.use(requireSdkToken);

mcpRouter.get('/sse', (req, res) => {
  const sessionId = randomUUID();
  const session = {
    id: sessionId,
    token: req.sdkToken,
    createdAt: Date.now(),
    res,
  };
  mcpSessions.set(sessionId, session);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const handshake = {
    session_id: sessionId,
    protocol_version: '1.0',
    server: mcpServerInfo,
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
      sampling: {},
    },
    session: {
      id: sessionId,
    },
    limits: {
      free_weekly_limit: DEFAULT_SDK_FREE_LIMIT,
      billing_url: SDK_BILLING_URL || null,
    },
    tools: mcpTools,
  };

  sendMcpEvent(session, 'handshake', handshake);
  sendMcpEvent(session, 'ready', { message: 'session_ready' });

  const heartbeat = setInterval(() => {
    sendMcpEvent(session, 'ping', { ts: Date.now() });
  }, MCP_PING_INTERVAL_MS);
  session.heartbeat = heartbeat;

  const cleanup = () => {
    clearInterval(heartbeat);
    mcpSessions.delete(sessionId);
  };

  res.on('close', cleanup);
  res.on('error', (err) => {
    console.error('MCP SSE connection error', err);
    cleanup();
  });
});

mcpRouter.post('/invoke', async (req, res) => {
  let session = null;
  let requestId = null;
  let tool = null;
  try {
    const body = req.body || {};
    const sessionId = body.session_id || body.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'missing_session_id' });
    }
    session = mcpSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'session_not_found' });
    }
    session.lastAccess = Date.now();
    tool = body.tool || body.name;
    if (!tool) {
      return res.status(400).json({ error: 'missing_tool' });
    }
    requestId = body.request_id || body.requestId || null;
    const args = body.arguments ?? body.args ?? {};
    let result;

    if (tool === 'get_history') {
      const userId = typeof args.user_id === 'string' && args.user_id.trim().length
        ? args.user_id.trim()
        : null;
      if (!userId) {
        const err = new Error('missing_user_id');
        err.statusCode = 400;
        err.payload = { error: 'missing_user_id' };
        throw err;
      }
      const monthParam = typeof args.month === 'string' && args.month.trim().length
        ? args.month.trim()
        : null;
      const history = await fetchMonthlyHistoryData({ userId, monthParam });
      result = { history };
    } else if (tool === 'get_profile') {
      const userId = typeof args.user_id === 'string' && args.user_id.trim().length
        ? args.user_id.trim()
        : null;
      if (!userId) {
        const err = new Error('missing_user_id');
        err.statusCode = 400;
        err.payload = { error: 'missing_user_id' };
        throw err;
      }
      const { profile, stats } = await fetchProfileWithStats(userId);
      if (!profile) {
        const err = new Error('profile_not_found');
        err.statusCode = 404;
        err.payload = { error: 'profile_not_found' };
        throw err;
      }
      result = {
        profile,
        stats,
        paid: isProfileSubscriptionActive(profile),
      };
    } else if (tool === 'list_bgm') {
      const tracks = await listBgmTracks();
      result = { tracks };
    } else {
      return res.status(400).json({ error: 'unknown_tool' });
    }

    const responsePayload = { request_id: requestId, tool, result };
    res.json({ ok: true, result });
    sendMcpEvent(session, 'tool_result', responsePayload);
  } catch (err) {
    console.error('POST /api/mcp/invoke error', err);
    const status = err?.statusCode || (err?.payload ? 400 : 500);
    const response = err?.payload || { error: 'mcp_invoke_failed', message: err.message };
    res.status(status).json(response);
    if (session) {
      sendMcpEvent(session, 'tool_error', {
        request_id: requestId,
        tool,
        error: response.error || 'mcp_invoke_failed',
        details: response,
      });
    }
  }
});

app.use('/api/mcp', mcpRouter);

app.use('/api/sdk', sdkRouter);
app.post('/api/sessions', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const { sequence_slug, duration_sec } = req.body || {};
    if (!sequence_slug || !duration_sec) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    const anonymousId = getAnonymousId(req);
    if (!user && !anonymousId) {
      return res.status(400).json({ error: 'missing_identity' });
    }
    const payload = {
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
    const { error } = await supabase.from('sessions').insert(payload);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/sessions error', err);
    return res.status(500).json({ error: 'session_insert_failed' });
  }
});

app.get('/api/sessions/month', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const anonymousId = getAnonymousId(req);
    if (!user && !anonymousId) {
      return res.status(400).json({ error: 'missing_identity' });
    }
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      return res.status(400).json({ error: 'invalid_range' });
    }
    const start = new Date(Date.UTC(year, month, 1)).toISOString();
    const end = new Date(Date.UTC(year, month + 1, 1)).toISOString();
    let query = supabase
      .from('sessions')
      .select('completed_at,duration_sec,sequence_slug')
      .gte('completed_at', start)
      .lt('completed_at', end)
      .order('completed_at', { ascending: true });
    if (user) {
      query = query.eq('user_id', user.id);
    } else {
      query = query.eq('anonymous_id', anonymousId).is('user_id', null);
    }
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ rows: data || [] });
  } catch (err) {
    console.error('GET /api/sessions/month error', err);
    return res.status(500).json({ error: 'month_fetch_failed' });
  }
});

app.get('/api/sessions/totals', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const anonymousId = getAnonymousId(req);
    if (!user && !anonymousId) {
      return res.status(400).json({ error: 'missing_identity' });
    }
    let query = supabase
      .from('sessions')
      .select('duration_sec');
    if (user) {
      query = query.eq('user_id', user.id);
    } else {
      query = query.eq('anonymous_id', anonymousId).is('user_id', null);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    const sessions = rows.length;
    const seconds = rows.reduce((acc, row) => acc + (row.duration_sec || 0), 0);
    return res.json({ sessions, seconds });
  } catch (err) {
    console.error('GET /api/sessions/totals error', err);
    return res.status(500).json({ error: 'totals_fetch_failed' });
  }
});

app.post('/api/sessions/link', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'auth_required' });
    }
    const anonymousId = getAnonymousId(req);
    if (!anonymousId) {
      return res.status(400).json({ error: 'missing_anonymous_id' });
    }
    const { data, error } = await supabase
      .from('sessions')
      .update({ user_id: user.id, anonymous_id: null })
      .eq('anonymous_id', anonymousId)
      .is('user_id', null)
      .select('id');
    if (error) throw error;
    return res.json({ moved: data?.length || 0 });
  } catch (err) {
    console.error('POST /api/sessions/link error', err);
    return res.status(500).json({ error: 'link_failed' });
  }
});

app.post('/api/subscription/checkout', async (req, res) => {
  try {
    if (!ensureStripeConfigured(res)) return;
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'auth_required' });
    }
    const successUrl = `${APP_BASE_URL}/settings?upgrade=success`;
    const cancelUrl = `${APP_BASE_URL}/settings?upgrade=cancel`;
    const session = await stripeClient.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email || undefined,
      metadata: { user_id: user.id },
      subscription_data: {
        metadata: { user_id: user.id },
      },
      line_items: [
        { price: STRIPE_PRICE_ID, quantity: 1 },
      ],
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return res.json({ url: session.url });
  } catch (err) {
    console.error('POST /api/subscription/checkout error', err);
    return res.status(500).json({ error: 'stripe_checkout_failed' });
  }
});

app.post('/api/subscription/cancel', async (req, res) => {
  try {
    if (!ensureStripeConfigured(res)) return;
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'auth_required' });
    }
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    const subscriptionId = profile?.stripe_subscription_id;
    if (!subscriptionId) {
      return res.status(400).json({ error: 'no_active_subscription' });
    }
    if (!stripeClient) {
      return res.status(500).json({ error: 'stripe_not_configured' });
    }
    const updated = await stripeClient.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    await syncStripeSubscription(supabase, updated);
    return res.json({
      cancel_at_period_end: Boolean(updated.cancel_at_period_end),
      current_period_end: updated.current_period_end ? new Date(updated.current_period_end * 1000).toISOString() : null,
    });
  } catch (err) {
    console.error('POST /api/subscription/cancel error', err);
    return res.status(500).json({ error: 'subscription_cancel_failed' });
  }
});


app.post('/api/stripe/webhook', async (req, res) => {
  if (!stripeClient || !STRIPE_WEBHOOK_SECRET) {
    return res.status(200).json({ ignored: true });
  }
  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = stripeClient.webhooks.constructEvent(req.rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const subscriptionId = session.subscription;
        if (subscriptionId && typeof subscriptionId === 'string') {
          const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);
          await syncStripeSubscription(supabase, subscription);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await syncStripeSubscription(supabase, subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.subscription && typeof invoice.subscription === 'string') {
          const subscription = await stripeClient.subscriptions.retrieve(invoice.subscription);
          await syncStripeSubscription(supabase, subscription);
        }
        break;
      }
      default:
        break;
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error', err);
    return res.status(500).send('Webhook handler failed');
  }
});

app.get('/api/profile', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'auth_required' });
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'not_found' });
    }
    return res.json(data);
  } catch (err) {
    console.error('GET /api/profile error', err);
    return res.status(500).json({ error: 'profile_fetch_failed' });
  }
});

// 繝ｦ繝ｼ繧ｶ縺ｮ逶ｴ霑大ｮ溽ｸｾ繧定ｦ∫ｴ・・ｽ・ｽ縺ｦLLM縺ｫ貂｡縺帙ｋ蠖｢縺ｸ
async function buildUserSummary(userId) {
  if (!userId) return null;

  // 繝励Ο繝輔ぅ繝ｼ繝ｫ
  const { data: prof } = await supabase
    .from('profiles')
    .select('tz,goal_per_week')
    .eq('user_id', userId)
    .maybeSingle();
  const tz = prof?.tz || 'Asia/Tokyo';
  const goal = prof?.goal_per_week ?? 3;

  // 逶ｴ霑・0譌･縺ｮ繧ｻ繝・・ｽ・ｽ繝ｧ繝ｳ
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 59);

  const { data: rows } = await supabase
    .from('sessions')
    .select('completed_at,duration_sec,sequence_slug')
    .eq('user_id', userId)
    .gte('completed_at', start.toISOString())
    .lte('completed_at', end.toISOString())
    .order('completed_at', { ascending: true });

  const byDay = new Map(); // 'YYYY-MM-DD' -> minutes
  for (const r of rows || []) {
    const day = new Date(r.completed_at).toISOString().slice(0, 10);
    const min = Math.round((r.duration_sec || 0) / 60);
    byDay.set(day, (byDay.get(day) || 0) + min);
  }

  // 繧ｹ繝医Μ繝ｼ繧ｯ: 莉頑律縺九ｉ驕｡繧矩｣邯壽律謨ｰ
  const today = new Date();
  const key = (d) => d.toISOString().slice(0, 10);
  let streak = 0;
  const set = new Set(byDay.keys());
  const d = new Date(today);
  while (set.has(key(d))) { streak++; d.setDate(d.getDate() - 1); }

  // 騾ｱ繝ｻ譛亥粋險・
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay()); // 譌･譖懷ｧ九∪繧・
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const sumInRange = (from) =>
    (rows || [])
      .filter(r => new Date(r.completed_at) >= from)
      .reduce((a, r) => a + Math.round((r.duration_sec || 0) / 60), 0);

  const week_minutes = sumInRange(weekStart);
  const month_minutes = sumInRange(monthStart);

  const last_sessions = (rows || []).slice(-5).reverse().map(r => ({
    date: new Date(r.completed_at).toISOString().slice(0, 10),
    slug: r.sequence_slug,
    minutes: Math.round((r.duration_sec || 0) / 60),
  }));

  const daily_minutes = Array.from(byDay.entries()); // [ ["YYYY-MM-DD", minutes], ... ]

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

// ---- Dify Chatflow 繧担SE縺ｧ繝励Ο繧ｭ繧ｷ ----
// POST /api/chat 縺ｧSSE繧定ｿ斐☆縲ゅヵ繝ｭ繝ｳ繝茨ｿｽEfetch縺ｧReadableStream繧定ｪｭ繧縺九ヾSE縺ｨ縺励※謇ｱ縺・
app.post('/api/chat', async (req, res) => {
  const channel = detectChannel(req);
  if (channel === CHATGPT_CHANNEL) {
    return res.status(400).json({
      error: 'chatgpt_channel_not_supported',
      hint: 'Use /api/chatgpt/menus for plan generation.',
    });
  }
  const { message, conversation_id, inputs, uid } = req.body || {};

  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ error: 'missing_uid' });
  }

  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  if (!trimmedMessage) {
    return res.status(400).json({ error: 'empty_message' });
  }

  let paid = false;
  let freeChatInfo = null;
  let profileRecord = null;
  const difyConversationId = normaliseConversationId(conversation_id);
  logConversationId(conversation_id, difyConversationId);

  try {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('subscription_status, subscription_current_period_end, display_name')
      .eq('user_id', uid)
      .maybeSingle();
    if (profileError) throw profileError;
    profileRecord = profileData || null;
    paid = isProfileSubscriptionActive(profileRecord);

    if (!paid) {
      const adminUser = await supabase.auth.admin.getUserById(uid);
      if (adminUser.error) throw adminUser.error;
      const adminRecord = adminUser.data?.user;
      if (!adminRecord) {
        return res.status(404).json({ error: 'user_not_found' });
      }
      const metadata = adminRecord.user_metadata || {};
      const weekKey = startOfWeekKey();
      let count = Number(metadata.free_chat_count) || 0;
      let storedWeek = typeof metadata.free_chat_week === 'string' ? metadata.free_chat_week : '';
      if (storedWeek !== weekKey) {
        storedWeek = weekKey;
        count = 0;
      }
      const limit = 10;
      if (count >= limit) {
        return res.status(429).json({ error: 'free_chat_limit', limit });
      }
      const newMetadata = Object.assign({}, metadata, {
        free_chat_week: storedWeek,
        free_chat_count: count + 1,
      });
      const update = await supabase.auth.admin.updateUserById(uid, { user_metadata: newMetadata });
      if (update.error) throw update.error;
      freeChatInfo = {
        weekKey: storedWeek,
        countBefore: count,
        countAfter: newMetadata.free_chat_count,
        limit,
      };
    }
  } catch (err) {
    console.error('POST /api/chat preflight error', err);
    return res.status(500).json({ error: 'chat_init_failed' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

  try {
    const summary = await buildUserSummary(uid).catch((err) => {
      return null;
    });

    const mergedInputs = Object.assign(
      {},
      inputs || {},
      {
        user_summary: summary ? JSON.stringify(summary) : "",
        user_display_name: profileRecord?.display_name || "",
      }
    );
    const difyUrl = (process.env.DIFY_BASE || '') + '/v1/chat-messages';

    const upstream = await fetch(difyUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.DIFY_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: trimmedMessage,
        inputs: mergedInputs,
        response_mode: 'streaming',
        conversation_id: difyConversationId || undefined,
        user: uid || conversation_id || 'anon',
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      console.error('POST /api/chat Dify upstream error', {
        status: upstream.status,
        hasBody: Boolean(upstream.body),
        text,
      });
      res.write('event: error\ndata: ' + JSON.stringify({ status: upstream.status, text }) + '\n\n');
      clearInterval(heartbeat);
      return res.end();
    }

    let chunkCount = 0;
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let streamingConversationId = difyConversationId || null;

    const flushEventBlock = (block) => {
      if (!block) return;
      const lines = block.split('\n');
      let eventName = null;
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim() || null;
          continue;
        }
        if (!line.startsWith('data:')) continue;
        const dataPart = line.slice(5).trim();
        if (!dataPart || dataPart === '[DONE]') continue;
        try {
          const payload = JSON.parse(dataPart);
          const candidate =
            typeof payload.conversation_id === 'string'
              ? payload.conversation_id
              : typeof payload.conversationId === 'string'
              ? payload.conversationId
              : null;
        if (candidate && UUID_REGEX.test(candidate) && candidate !== streamingConversationId) {
          streamingConversationId = candidate;
        }
      } catch (parseErr) {
        void parseErr;
      }
    }
  };

    for await (const chunk of upstream.body) {
      chunkCount += 1;
      res.write(chunk);
      const textChunk = decoder.decode(chunk, { stream: true });
      sseBuffer += textChunk;
      let separatorIndex;
      while ((separatorIndex = sseBuffer.indexOf('\n\n')) !== -1) {
        const eventBlock = sseBuffer.slice(0, separatorIndex);
        sseBuffer = sseBuffer.slice(separatorIndex + 2);
        flushEventBlock(eventBlock);
      }
    }

    if (sseBuffer.length) {
      flushEventBlock(sseBuffer);
      sseBuffer = '';
    }

    const remaining = decoder.decode();
    if (remaining) flushEventBlock(remaining);

    clearInterval(heartbeat);
    return res.end();
  } catch (err) {
    console.error('POST /api/chat streaming error', err);
    res.write('event: error\ndata: ' + JSON.stringify({ error: String(err) }) + '\n\n');
    clearInterval(heartbeat);
    return res.end();
  }
});


const port = process.env.PORT || 8787;
app.listen(port);










