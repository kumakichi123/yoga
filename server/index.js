// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

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
function mapStripeStatus(status) {
  if (!status) return 'free';
  if (status === 'active' || status === 'trialing') return status;
  if (status === 'past_due') return 'past_due';
  return 'free';
}

async function syncStripeSubscription(subscription) {
  if (!subscription) return;
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.warn('Stripe subscription missing user_id metadata');
    return;
  }
  const normalizedStatus = mapStripeStatus(subscription.status);
  const periodEndIso =
    subscription.current_period_end && normalizedStatus !== 'free'
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;
  const payload = {
    user_id: userId,
    subscription_status: normalizedStatus,
    subscription_current_period_end: periodEndIso,
    subscription_provider: normalizedStatus === 'free' ? null : 'stripe',
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
    stripe_subscription_id: normalizedStatus === 'free' ? null : subscription.id,
  };
  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
  if (error) {
    console.error('Supabase subscription sync error', error);
  }
}

function ensureStripeConfigured(res) {
  if (!stripeClient || !STRIPE_PRICE_ID) {
    res.status(500).json({ error: 'stripe_not_configured' });
    return false;
  }
  return true;
}


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

app.post('/api/stripe/webhook', async (req, res) => {
  if (!stripeClient || !STRIPE_WEBHOOK_SECRET) {
    console.warn('Stripe webhook received but Stripe is not configured');
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
          await syncStripeSubscription(subscription);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await syncStripeSubscription(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.subscription && typeof invoice.subscription === 'string') {
          const subscription = await stripeClient.subscriptions.retrieve(invoice.subscription);
          await syncStripeSubscription(subscription);
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
    console.debug('GET /api/profile user', user?.id);
    if (!user) {
      return res.status(401).json({ error: 'auth_required' });
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    console.debug('GET /api/profile supabase result', { data, error });
    if (error) throw error;
    if (!data) {
      console.debug('GET /api/profile returning 404 for user', user.id);
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
  // クライアントへSSEをオープン
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  });
  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 15000);

  try {
    const { message, conversation_id, inputs, uid } = req.body || {};

    // Supabaseから要紁E��構築し、inputsに合流E
    const summary = await buildUserSummary(uid).catch(() => null);
    const mergedInputs = { ...(inputs || {}), ...(summary ? { user_summary: summary } : {}) };

    const upstream = await fetch(`${process.env.DIFY_BASE}/v1/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: message || '',
        inputs: mergedInputs,
        response_mode: 'streaming',
        conversation_id: conversation_id || undefined,
        user: uid || conversation_id || 'anon',
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      res.write(`event: error\ndata: ${JSON.stringify({ status: upstream.status, text })}\n\n`);
      clearInterval(heartbeat);
      return res.end();
    }

    // DifyのSSEをそのままパイチE
    for await (const chunk of upstream.body) res.write(chunk);

    clearInterval(heartbeat);
    return res.end();
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`);
    clearInterval(heartbeat);
    return res.end();
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log('API on', port));





