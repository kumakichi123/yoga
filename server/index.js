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

const BGM_DIR = path.resolve(process.cwd(), 'public', 'BGM');
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.webm']);

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
    const entries = await readdir(BGM_DIR, { withFileTypes: true });
    const tracks = entries
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
    return res.json({ tracks });
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return res.json({ tracks: [] });
    }
    console.error('GET /api/bgm error', err);
    return res.status(500).json({ error: 'bgm_list_failed' });
  }
});

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

// ユーザの直近実績を要紁E��てLLMに渡せる形へ
async function buildUserSummary(userId) {
  if (!userId) return null;

  // プロフィール
  const { data: prof } = await supabase
    .from('profiles')
    .select('tz,goal_per_week')
    .eq('user_id', userId)
    .maybeSingle();
  const tz = prof?.tz || 'Asia/Tokyo';
  const goal = prof?.goal_per_week ?? 3;

  // 直迁E0日のセチE��ョン
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

  // ストリーク: 今日から遡る連続日数
  const today = new Date();
  const key = (d) => d.toISOString().slice(0, 10);
  let streak = 0;
  const set = new Set(byDay.keys());
  const d = new Date(today);
  while (set.has(key(d))) { streak++; d.setDate(d.getDate() - 1); }

  // 週・月合訁E
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay()); // 日曜始まめE
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

// ---- Dify Chatflow をSSEでプロキシ ----
// POST /api/chat でSSEを返す。フロント�EfetchでReadableStreamを読むか、SSEとして扱ぁE
app.post('/api/chat', async (req, res) => {
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
      }  // Difyはstring要求
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







