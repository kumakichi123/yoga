import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { isSubscriptionActive } from "../utils/subscription";
import { apiUrl } from "../utils/api";
import type { ChatMsg } from "../types";
import {
  createStripeCheckoutSession,
  fetchMonthSessions,
  fetchTotals,
} from "../store.remote";

const TEXT = {
  toggleOpen: "AIアシスタント",
  toggleClose: "閉じる",
  inputPlaceholder: "メッセージを入力",
  send: "送信",
  loginPrompt: "ログインするとAIチャットをご利用いただけます。",
  login: "ログイン",
  signup: "新規登録",
  paywallTitle: "プレミアムプランが必要です",
  paywallMessage: "AIチャットは月額580円のプレミアムプランで解放されます。",
  upgrade: "アップグレード",
  loading: "読み込み中...",
  upgradeLoading: "リダイレクト中...",
  upgradeError: "決済ページの取得に失敗しました。時間を置いて再試行してください。",
} as const;

function formatMinutes(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${minutes}分`;
}

function computeStreak(rows: Array<{ completed_at: string }>) {
  const dates = new Set(
    rows.map((row) => new Date(row.completed_at).toISOString().slice(0, 10))
  );
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function buildDefaultMessage(
  streak: number,
  totalSessions: number,
  totalSeconds: number
) {
  if (streak >= 3) {
    return `素晴らしいですね！${streak}日連続で継続中です。この勢いで続けましょう。`;
  }
  if (totalSessions > 0) {
    return `これまでに${totalSessions}回のセッションを完了しています。累計${formatMinutes(
      totalSeconds
    )}取り組みました。今日はどんな気分ですか？`;
  }
  return "初めまして！まずは3分メニューから始めてみませんか？";
}

export default function ChatWidget() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const isPaid = isSubscriptionActive(profile);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [statsLoading, setStatsLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [monthSeconds, setMonthSeconds] = useState(0);
  const [totals, setTotals] = useState({ sessions: 0, seconds: 0 });

  const overallLoading = loading || profileLoading || statsLoading;

  const ensureDefaultMessage = useCallback(
    (streak: number, sessions: number, seconds: number) => {
      const defaultMsg: ChatMsg = {
        role: "assistant",
        text: buildDefaultMessage(streak, sessions, seconds),
        at: new Date().toISOString(),
      };
      setMessages([defaultMsg]);
    },
    []
  );

  const loadStats = useCallback(async () => {
    if (!user || !isPaid) {
      setMessages([
        {
          role: "assistant",
          text: buildDefaultMessage(0, 0, 0),
          at: new Date().toISOString(),
        },
      ]);
      return;
    }
    setStatsLoading(true);
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const [current, previous, totalsData] = await Promise.all([
        fetchMonthSessions(y, m),
        fetchMonthSessions(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1),
        fetchTotals(),
      ]);
      setTotals(totalsData);
      const combined = [...current, ...previous];
      setMonthSeconds(
        current.reduce((acc: number, row: any) => acc + (row.duration_sec || 0), 0)
      );
      const streak = computeStreak(combined);
      ensureDefaultMessage(streak, totalsData.sessions, totalsData.seconds);
    } catch (err) {
      console.error(err);
      ensureDefaultMessage(0, 0, 0);
    } finally {
      setStatsLoading(false);
    }
  }, [user?.id, isPaid, ensureDefaultMessage]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const canSend = useMemo(
    () => input.trim().length > 0,
    [input]
  );

  async function handleUpgrade() {
    try {
      setCheckoutLoading(true);
      setCheckoutError(null);
      const { url } = await createStripeCheckoutSession();
      window.location.href = url;
    } catch (err) {
      console.error("createStripeCheckoutSession error", err);
      setCheckoutError(TEXT.upgradeError);
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleSend() {
    if (!canSend) return;
    if (!user) {
      navigate("/auth?mode=signin&redirect=/", { state: { from: "/" } });
      return;
    }
    if (!isPaid) {
      handleUpgrade();
      return;
    }
    const trimmed = input.trim();
    const timestamp = new Date().toISOString();
    const outgoing: ChatMsg = { role: "user", text: trimmed, at: timestamp };
    const hint =
      monthSeconds === 0
        ? "今日は3分メニューから軽く始めてみましょう。"
        : monthSeconds < 600
        ? "良いペースです。あと一回でより習慣化できますよ。"
        : "素晴らしい継続力です！身体の様子はいかがですか？";
    const reply: ChatMsg = {
      role: "assistant",
      text: `${hint}`,
      at: timestamp,
    };
    setMessages((prev) => [...prev, outgoing, reply]);
    setInput("");
    fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: trimmed,
        conversation_id: "home-chat",
        inputs: {
          total_sessions: totals.sessions,
          total_seconds: totals.seconds,
          month_seconds: monthSeconds,
        },
        uid: user.id,
      }),
    }).catch(() => undefined);
  }

  function renderPanelContent() {
    if (!user) {
      return (
        <div className="chat-widget__paywall">
          <p>{TEXT.loginPrompt}</p>
          <div className="chat-widget__actions">
            <button
              className="btn primary"
              onClick={() => navigate("/auth?mode=signin&redirect=/", { state: { from: "/" } })}
            >
              {TEXT.login}
            </button>
            <button
              className="btn"
              onClick={() => navigate("/auth?mode=signup&redirect=/", { state: { from: "/" } })}
            >
              {TEXT.signup}
            </button>
          </div>
        </div>
      );
    }

    if (!isPaid) {
      return (
        <div className="chat-widget__paywall">
          <h3>{TEXT.paywallTitle}</h3>
          <p>{TEXT.paywallMessage}</p>
          {checkoutError && (
            <div className="chat-widget__error">{checkoutError}</div>
          )}
          <button className="btn primary" onClick={handleUpgrade} disabled={checkoutLoading}>
            {checkoutLoading ? TEXT.upgradeLoading : TEXT.upgrade}
          </button>
        </div>
      );
    }

    return (
      <>
        <div className="chat-widget__messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`chat-widget__bubble chat-widget__bubble--${msg.role}`}>
              {msg.text}
            </div>
          ))}
          {overallLoading && (
            <div className="chat-widget__bubble chat-widget__bubble--assistant">
              {TEXT.loading}
            </div>
          )}
        </div>
        <div className="chat-widget__input">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={TEXT.inputPlaceholder}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            disabled={checkoutLoading}
          />
          <button className="btn primary" onClick={handleSend} disabled={!canSend}>
            {TEXT.send}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className={`chat-widget ${open ? "chat-widget--open" : ""}`}>
      <button
        className="chat-widget__toggle btn primary"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? TEXT.toggleClose : TEXT.toggleOpen}
      </button>
      {open && (
        <div className="chat-widget__panel">
          {renderPanelContent()}
        </div>
      )}
    </div>
  );
}


