import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../ui/Calendar";
import { useAuth } from "../hooks/useAuth";
import { ChatMsg } from "../types";
import { fetchMonthSessions, fetchTotals } from "../store.remote";

const TEXT = {
  assistantGreeting: "\u6700\u8FD1\u306E\u8ABF\u5B50\u306F\u3044\u304B\u304C\u3067\u3059\u304B\uFF1F \u30C8\u30EC\u30FC\u30CB\u30F3\u30B0\u306E\u632F\u308A\u8FD4\u308A\u3092\u4E00\u7DD2\u306B\u3057\u307E\u3057\u3087\u3046\u3002",
  hintRestart: "\u4ECA\u65E5\u306F3\u5206\u304B\u3089\u8EFD\u304F\u518D\u958B\u3057\u3066\u307F\u307E\u3057\u3087\u3046\u3002",
  hintSpeed: "\u826F\u3044\u30DA\u30FC\u30B9\u3067\u3059\u3002\u3042\u3068\u4E00\u56DE\u3067\u3055\u3089\u306B\u52A0\u901F\u3067\u304D\u307E\u3059\u3088\u3002",
  hintStable: "\u5B89\u5B9A\u3057\u3066\u3044\u307E\u3059\u3002\u7FCC\u65E5\u306F\u8EFD\u3081\u306E\u30BB\u30C3\u30C8\u3082\u304A\u3059\u3059\u3081\u3067\u3059\u3002",
  monthSummaryPrefix: "\u4ECA\u6708\u306E\u7DCF\u8A08\u306F ",
  monthSummarySuffix: " \u3067\u3059\u3002",
  loading: "\u8AAD\u307F\u8FBC\u307F\u4E2D\u3067\u3059...",
  loginRequiredTitle: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059",
  loginRequiredDescription: "AI\u30C1\u30E3\u30C3\u30C8\u3068\u5C65\u6B74\u6A5F\u80FD\u3092\u5229\u7528\u3059\u308B\u306B\u306F\u30ED\u30B0\u30A4\u30F3\u307E\u305F\u306F\u65B0\u898F\u767B\u9332\u3092\u884C\u3063\u3066\u304F\u3060\u3055\u3044\u3002",
  login: "\u30ED\u30B0\u30A4\u30F3",
  signup: "\u65B0\u898F\u767B\u9332",
  chatHeading: "AI\u30C1\u30E3\u30C3\u30C8",
  inputPlaceholder: "\u4ECA\u65E5\u306E\u8ABF\u5B50\u3092\u66F8\u3044\u3066\u307F\u307E\u3057\u3087\u3046",
  send: "\u9001\u4FE1",
  totalsSessions: "\u5168\u671F\u9593\u30BB\u30C3\u30B7\u30E7\u30F3",
  totalsDuration: "\u5168\u671F\u9593\u6642\u9593",
  monthDuration: "\u4ECA\u6708\u6642\u9593",
  prev: "\u524D\u3078",
  next: "\u6B21\u3078",
  monthLoading: "\u6708\u306E\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D...",
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
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<ChatMsg[]>([initialAssistant]);
  const [inp, setInp] = useState("");
  const now = useMemo(() => new Date(), []);
  const [ym, setYM] = useState<[number, number]>([now.getFullYear(), now.getMonth()]);
  const [marks, setMarks] = useState<Set<string>>(new Set());
  const [monthSeconds, setMonthSeconds] = useState(0);
  const [tot, setTot] = useState({ sessions: 0, seconds: 0 });
  const [loadingMonth, setLoadingMonth] = useState(false);

  const loadMonth = useCallback(async (y: number, m: number) => {
    if (!user) return;
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
  }, [user]);

  useEffect(() => {
    if (!user) {
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
  }, [user, ym, loadMonth]);

  async function send() {
    if (!user) {
      navigate("/auth?mode=signin&redirect=/history", { state: { from: "/history" } });
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

  if (loading) {
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
          <div className="history-locked__icon" role="img" aria-hidden="true">🔒</div>
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
          <div style={{ fontWeight: 700 }}>{y}年 {m + 1}月</div>
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
