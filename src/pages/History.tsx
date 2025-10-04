import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../ui/Calendar";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { isSubscriptionActive } from "../utils/subscription";
import { fetchMonthSessions, fetchTotals, createStripeCheckoutSession } from "../store.remote";

const TEXT = {
  loading: "読み込み中です...",
  loginRequiredTitle: "ログインが必要です",
  loginRequiredDescription: "履歴を確認するにはログインまたは新規登録を行ってください。",
  login: "ログイン",
  signup: "新規登録",
  totalsSessions: "全期間セッション",
  totalsDuration: "全期間時間",
  monthDuration: "今月時間",
  prev: "前へ",
  next: "次へ",
  monthLoading: "月のデータを読み込み中...",
  paywallTitle: "プレミアムプランが必要です",
  paywallDescription: "履歴の詳細は月額580円のプレミアムプランでご利用いただけます。",
  upgrade: "アップグレード",
  upgradeLoading: "リダイレクト中...",
  upgradeError: "決済ページの取得に失敗しました。時間を置いて再試行してください。",
} as const;

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export default function History() {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const isPaid = isSubscriptionActive(profile);
  const navigate = useNavigate();

  const now = useMemo(() => new Date(), []);
  const [ym, setYM] = useState<[number, number]>([now.getFullYear(), now.getMonth()]);
  const [marks, setMarks] = useState<Set<string>>(new Set());
  const [monthSeconds, setMonthSeconds] = useState(0);
  const [tot, setTot] = useState({ sessions: 0, seconds: 0 });
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

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
    if (!user || !isPaid) {
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
      console.error("createStripeCheckoutSession error", err);
      setCheckoutError(TEXT.upgradeError);
    } finally {
      setCheckoutLoading(false);
    }
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

  if (!isPaid) {
    return (
      <div className="row">
        <div className="card row history-locked">
          <div className="history-locked__icon" role="img" aria-hidden="true">💡</div>
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
