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
  toggleOpen: "AI\u30a2\u30b7\u30b9\u30bf\u30f3\u30c8",
  toggleClose: "\u3068\u3058\u308b",
  inputPlaceholder: "\u30e1\u30c3\u30bb\u30fc\u30b8\u3092\u5165\u529b",
  send: "\u9001\u4fe1",
  loginPrompt: "\u30ed\u30b0\u30a4\u30f3\u3059\u308b\u3068AI\u30c1\u30e3\u30c3\u30c8\u3092\u3054\u5229\u7528\u3044\u305f\u3060\u3051\u307e\u3059\u3002",
  login: "\u30ed\u30b0\u30a4\u30f3",
  signup: "\u65b0\u898f\u767b\u9332",
  freeNotice: "\u7121\u6599\u30d7\u30e9\u30f3\u3067\u306fAI\u30c1\u30e3\u30c3\u30c8\u3092\u903110\u901a\u307e\u3067\u3054\u5229\u7528\u3044\u305f\u3060\u3051\u307e\u3059\u3002",
  upgrade: "\u30d7\u30ec\u30df\u30a2\u30e0\u306b\u30a2\u30c3\u30d7\u30b0\u30ec\u30fc\u30c9",
  loading: "\u8aad\u307f\u8fbc\u3093\u3067\u3044\u307e\u3059\u2026",
  upgradeLoading: "\u30ea\u30c0\u30a4\u30ec\u30af\u30c8\u4e2d\u2026",
  upgradeError: "\u6c7a\u6e08\u30da\u30fc\u30b8\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u6642\u9593\u3092\u7f6e\u3044\u3066\u518d\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002",
  limitReached: "\u30c1\u30e3\u30c3\u30c8\u306f\u903110\u901a\u307e\u3067\u3067\u3059\u3002\u30d7\u30ec\u30df\u30a2\u30e0\u30d7\u30e9\u30f3\u3092\u3054\u691c\u8a0e\u304f\u3060\u3055\u3044\u3002",
  sendError: "\u30c1\u30e3\u30c3\u30c8\u306e\u9001\u4fe1\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u6642\u9593\u3092\u304a\u3044\u3066\u518d\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002",
} as const;

function formatMinutes(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${minutes}\u5206`;
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
    return `\u7d76\u597d\u8abf\u3067\u3059\u306d\uff01${streak}\u65e5\u9023\u7d9a\u3067\u7df4\u7fd2\u3057\u3066\u3044\u307e\u3059\u3002\u3053\u306e\u8abf\u5b50\u3067\u7d9a\u3051\u307e\u3057\u3087\u3046\u3002`;
  }
  if (totalSessions > 0) {
    return `\u3053\u308c\u307e\u3067\u306b${totalSessions}\u56de\u306e\u30bb\u30c3\u30b7\u30e7\u30f3\u3092\u5b8c\u4e86\u3057\u3066\u3044\u307e\u3059\u3002\u7dcf\u8a08${formatMinutes(
      totalSeconds
    )}\u53d6\u308a\u7d44\u3093\u3067\u3044\u307e\u3059\u3002\u4eca\u65e5\u306f\u3069\u3093\u306a\u6c17\u5206\u3067\u3059\u304b\uff1f`;
  }
  return "\u307e\u305a\u306f3\u5206\u30e1\u30cb\u30e5\u30fc\u304b\u3089\u306f\u3058\u3081\u3066\u307f\u307e\u3057\u3087\u3046\u304b\uff1f";
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
  const [sending, setSending] = useState(false);

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
    () => input.trim().length > 0 && !sending,
    [input, sending]
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

    const trimmed = input.trim();
    const timestamp = new Date().toISOString();
    const outgoing: ChatMsg = { role: "user", text: trimmed, at: timestamp };
    setMessages((prev) => [...prev, outgoing]);
    setInput("");
    setSending(true);

    try {
      const response = await fetch(apiUrl("/api/chat"), {
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
      });

      if (!response.ok) {
        let errorText = TEXT.sendError;
        if (response.status === 429) {
          errorText = TEXT.limitReached;
        } else {
          try {
            const err = await response.json();
            if (err?.error === "free_chat_limit") {
              errorText = TEXT.limitReached;
            }
          } catch {
            // ignore
          }
        }
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: errorText, at: new Date().toISOString() },
        ]);
        return;
      }

      if (response.body?.cancel) {
        try {
          await response.body.cancel();
        } catch {
          // ignore
        }
      }

      const hint =
        monthSeconds === 0
          ? "\u307e\u305a\u306f3\u5206\u30e1\u30cb\u30e5\u30fc\u304b\u3089\u8a66\u3057\u3066\u307f\u307e\u3057\u3087\u3046\u3002"
          : monthSeconds < 600
          ? "\u3044\u3044\u30da\u30fc\u30b9\u3067\u3059\uff01\u3082\u30461\u672c\u8efd\u3081\u306e\u30e1\u30cb\u30e5\u30fc\u3092\u8ffd\u52a0\u3057\u3066\u307f\u307e\u3059\u304b\uff1f"
          : "\u7d20\u6674\u3089\u3057\u3044\u7d99\u7d9a\u529b\u3067\u3059\u3002\u6b21\u306f\u3069\u3093\u306a\u7df4\u7fd2\u304c\u3057\u305f\u3044\u3067\u3059\u304b\uff1f";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: hint, at: new Date().toISOString() },
      ]);
    } catch (err) {
      console.error("chat send error", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: TEXT.sendError, at: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
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

    return (
      <>
        {!isPaid && (
          <div className="chat-widget__paywall" style={{ rowGap: 8 }}>
            <p className="muted" style={{ margin: 0 }}>{TEXT.freeNotice}</p>
            {checkoutError && (
              <div className="chat-widget__error" style={{ margin: 0 }}>{checkoutError}</div>
            )}
            <button className="btn" onClick={handleUpgrade} disabled={checkoutLoading}>
              {checkoutLoading ? TEXT.upgradeLoading : TEXT.upgrade}
            </button>
          </div>
        )}
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
            disabled={sending}
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
