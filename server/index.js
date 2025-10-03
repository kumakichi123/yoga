// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

// ---- Supabase (server-side) ----
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
    if (!data) return res.status(404).json({ error: 'not_found' });
    return res.json(data);
  } catch (err) {
    console.error('GET /api/profile error', err);
    return res.status(500).json({ error: 'profile_fetch_failed' });
  }
});

// ユーザの直近実績を要約してLLMに渡せる形へ
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

  // 直近60日のセッション
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

  // 週・月合計
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay()); // 日曜始まり
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
// POST /api/chat でSSEを返す。フロントはfetchでReadableStreamを読むか、SSEとして扱う
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

    // Supabaseから要約を構築し、inputsに合流
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

    // DifyのSSEをそのままパイプ
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