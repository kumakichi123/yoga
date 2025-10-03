import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../ui/Calendar";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { isSubscriptionActive } from "../utils/subscription";
import { ChatMsg } from "../types";
import { fetchMonthSessions, fetchTotals, createStripeCheckoutSession } from "../store.remote";

const TEXT = {
  assistantGreeting: "\u6700\u8fd1\u306e\u8abf\u5b50\u306f\u3044\u304b\u304c\u3067\u3059\u304b\uff1f\u30c8\u30ec\u30fc\u30cb\u30f3\u30b0\u306e\u632f\u308a\u8fd4\u308a\u3092\u4e00\u7dd2\u306b\u3057\u307e\u3057\u3087\u3046\u3002",
  hintRestart: "\u4eca\u65e5\u306f3\u5206\u304b\u3089\u8efd\u304f\u518d\u958b\u3057\u3066\u307f\u307e\u3057\u3087\u3046\u3002",
  hintSpeed: "\u826f\u3044\u30da\u30fc\u30b9\u3067\u3059\u3002\u3042\u3068\u4e00\u56de\u3067\u3055\u3089\u306b\u52a0\u901f\u3067\u304d\u307e\u3059\u3088\u3002",
  hintStable: "\u5b89\u5b9a\u3057\u3066\u3044\u307e\u3059\u3002\u7fcc\u65e5\u306f\u8efd\u3081\u306e\u30bb\u30c3\u30c8\u3082\u304a\u3059\u3059\u3081\u3067\u3059\u3002",
  monthSummaryPrefix: "\u4eca\u6708\u306e\u7dcf\u8a08\u306f ",
  monthSummarySuffix: " \u3067\u3059\u3002",
  loading: "\u8aad\u307f\u8fbc\u307f\u4e2d\u3067\u3059...",
  loginRequiredTitle: "\u30ed\u30b0\u30a4\u30f3\u304c\u5fc5\u8981\u3067\u3059",
  loginRequiredDescription: "AI\u30c1\u30e3\u30c3\u30c8\u3068\u5c65\u6b74\u6a5f\u80fd\u3092\u5229\u7528\u3059\u308b\u306b\u306f\u30ed\u30b0\u30a4\u30f3\u307e\u305f\u306f\u65b0\u898f\u767b\u9332\u3092\u884c\u3063\u3066\u304f\u3060\u3055\u3044\u3002",
  login: "\u30ed\u30b0\u30a4\u30f3",
  signup: "\u65b0\u898f\u767b\u9332",
  chatHeading: "AI\u30c1\u30e3\u30c3\u30c8",
  inputPlaceholder: "\u4eca\u65e5\u306e\u8abf\u5b50\u3092\u66f8\u3044\u3066\u307f\u307e\u3057\u3087\u3046",
  send: "\u9001\u4fe1",
  totalsSessions: "\u5168\u671f\u9593\u30bb\u30c3\u30b7\u30e7\u30f3",
  totalsDuration: "\u5168\u671f\u9593\u6642\u9593",
  monthDuration: "\u4eca\u6708\u6642\u9593",
  prev: "\u524d\u3078",
  next: "\u6b21\u3078",
  monthLoading: "\u6708\u306e\u30c7\u30fc\u30bf\u3092\u8aad\u307f\u8fbc\u307f\u4e2d...",
  paywallTitle: "\u30d7\u30ec\u30df\u30a2\u30e0\u30d7\u30e9\u30f3\u304c\u5fc5\u8981\u3067\u3059",
  paywallDescription: "AI\u30c1\u30e3\u30c3\u30c8\u3068\u5c65\u6b74\u306e\u8a73\u7d30\u306f\u6708\u984d580\u5186\u306e\u30d7\u30ec\u30df\u30a2\u30e0\u30d7\u30e9\u30f3\u3067\u3054\u5229\u7528\u3044\u305f\u3060\u3051\u307e\u3059\u3002",
  upgrade: "\u30a2\u30c3\u30d7\u30b0\u30ec\u30fc\u30c9",
  upgradeLoading: "\u30ea\u30c0\u30a4\u30ec\u30af\u30c8\u4e2d...",
  upgradeError: "\u6c7a\u6e08\u30da\u30fc\u30b8\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u3057\u3070\u3089\u304f\u3057\u3066\u304b\u3089\u518d\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002",
} as const;

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

const initialAssistant: ChatMsg = {
  role: "assistant",
  text: TEXT.assistantGreeting,
  at: new Date().toISOString(),
};

export default function History() {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<ChatMsg[]>([initialAssistant]);
  const [inp, setInp] = useState("");
  const now = useMemo(() => new Date(), []);
  const [ym, setYM] = useState<[number, number]>([now.getFullYear(), now.getMonth()]);
  const [marks, setMarks] = useState<Set<string>>(new Set());
  const [monthSeconds, setMonthSeconds] = useState(0);
  const [tot, setTot] = useState({ sessions: 0, seconds: 0 });
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const isPaid = isSubscriptionActive(profile);
  const overallLoading = loading || profileLoading;

  const loadMonth = useCallback(
    async (y: number, m: number) => {
      if (!user || !isPaid) {
        setMarks(new Set());
        setMonthSeconds(0);
        return;
      }
      setLoadingMonth(true);
      try {
        const rows = await fetchMonthSessions(y, m);
        const map = new Set<string>();
        let secs = 0;
        for (const r of rows) {
          const d = r.completed_at.slice(0, 10);
          map.add(d);
          secs += r.duration_sec || 0;
        }
        setMarks(map);
        setMonthSeconds(secs);
      } catch (err) {
        console.error(err);
        setMarks(new Set());
        setMonthSeconds(0);
      } finally {
        setLoadingMonth(false);
      }
    },
    [user, isPaid]
  );

  useEffect(() => {
    if (!user) {
      setMarks(new Set());
      setMonthSeconds(0);
      setTot({ sessions: 0, seconds: 0 });
      return;
    }
    if (!isPaid) {
      setMarks(new Set());
      setMonthSeconds(0);
      setTot({ sessions: 0, seconds: 0 });
      return;
    }
    loadMonth(ym[0], ym[1]);
    fetchTotals()
      .then(setTot)
      .catch((err) => {
        console.error(err);
        setTot({ sessions: 0, seconds: 0 });
      });
  }, [user, ym, loadMonth, isPaid]);

  async function handleUpgrade() {
    try {
      setCheckoutLoading(true);
      setCheckoutError(null);
      const { url } = await createStripeCheckoutSession();
      window.location.href = url;
    } catch (err) {
      console.error('createStripeCheckoutSession error', err);
      setCheckoutError(TEXT.upgradeError);
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function send() {
    if (!user) {
      navigate("/auth?mode=signin&redirect=/history", { state: { from: "/history" } });
      return;
    }
    if (!isPaid) {
      handleUpgrade();
      return;
    }
    if (!inp.trim()) return;
    const hint =
      monthSeconds === 0
        ? TEXT.hintRestart
        : monthSeconds < 600
        ? TEXT.hintSpeed
        : TEXT.hintStable;
    const nowIso = new Date().toISOString();
    const userMsg: ChatMsg = { role: "user", text: inp.trim(), at: nowIso };
    const assistantMsg: ChatMsg = {
      role: "assistant",
      text: `${TEXT.monthSummaryPrefix}${mmss(monthSeconds)}${TEXT.monthSummarySuffix}${hint}`,
      at: nowIso,
    };
    setMsgs((prev) => [...prev, userMsg, assistantMsg]);
    setInp("");
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMsg.text,
        conversation_id: "history-top",
        inputs: {
          month_seconds: monthSeconds,
          total_sessions: tot.sessions,
          total_seconds: tot.seconds,
        },
        uid: user.id,
      }),
    }).catch(() => {});
  }

  const y = ym[0];
  const m = ym[1];

  if (overallLoading) {
    return (
      <div className="row">
        <div className="card">
          <div className="muted">{TEXT.loading}</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="row">
        <div className="card row history-locked">
          <div className="history-locked__icon" role="img" aria-hidden="true">\u1f512</div>
          <h2 className="history-locked__title">{TEXT.loginRequiredTitle}</h2>
          <p className="muted">{TEXT.loginRequiredDescription}</p>
          <div className="history-locked__actions">
            <button
              className="btn primary"
              onClick={() => navigate("/auth?mode=signin&redirect=/history", { state: { from: "/history" } })}
            >
              {TEXT.login}
            </button>
            <button
              className="btn"
              onClick={() => navigate("/auth?mode=signup&redirect=/history", { state: { from: "/history" } })}
            >
              {TEXT.signup}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isPaid) {
    return (
      <div className="row">
        <div className="card row history-locked">
          <div className="history-locked__icon" role="img" aria-hidden="true">\u1f4a1</div>
          <h2 className="history-locked__title">{TEXT.paywallTitle}</h2>
          <p className="muted">{TEXT.paywallDescription}</p>
          {checkoutError && <div className="history-locked__error">{checkoutError}</div>}
          <div className="history-locked__actions">
            <button className="btn primary" onClick={handleUpgrade} disabled={checkoutLoading}>
              {checkoutLoading ? TEXT.upgradeLoading : TEXT.upgrade}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="row">
      <div className="card">
        <div className="muted">{TEXT.chatHeading}</div>
        <div className="row">
          {msgs.slice(-12).map((msg, index) => (
            <div key={index} className={`msg ${msg.role === "user" ? "u" : "a"}`}>
              {msg.text}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={inp}
            onChange={(event) => setInp(event.target.value)}
            placeholder={TEXT.inputPlaceholder}
            style={{ flex: 1, padding: 10, border: "1px solid var(--border)", borderRadius: 10 }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <button className="btn primary" onClick={send}>{TEXT.send}</button>
        </div>
      </div>

      <div className="card row">
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="card" style={{ padding: 12 }}>
            <div className="muted">{TEXT.totalsSessions}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{tot.sessions}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="muted">{TEXT.totalsDuration}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{mmss(tot.seconds)}</div>
          </div>
        </div>
      </div>

      <div className="card row">
        <div className="cal-head">
          <button className="btn" onClick={() => setYM(([Y, M]) => (M ? [Y, M - 1] : [Y - 1, 11]))}>{TEXT.prev}</button>
          <div style={{ fontWeight: 700 }}>{y}\u5e74 {m + 1}\u6708</div>
          <button className="btn" onClick={() => setYM(([Y, M]) => (M < 11 ? [Y, M + 1] : [Y + 1, 0]))}>{TEXT.next}</button>
        </div>
        <Calendar year={y} month={m} marks={marks} />
        {loadingMonth && <div className="muted">{TEXT.monthLoading}</div>}
        <div className="grid2">
          <div className="card" style={{ padding: 12 }}>
            <div className="muted">{TEXT.monthDuration}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{mmss(monthSeconds)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
