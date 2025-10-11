import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "../ui/Calendar";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { isSubscriptionActive } from "../utils/subscription";
import { fetchMonthSessions, fetchTotals, createStripeCheckoutSession } from "../store.remote";
import { sequences } from "../data";

type MonthRow = {
  completed_at: string;
  duration_sec: number | null;
  sequence_slug: string;
};

const TEXT = {
  loading: "読み込み中...",
  loginRequiredTitle: "ログインが必要です",
  loginRequiredDescription: "履歴を確認するにはログインまたは新規登録を行ってください。",
  login: "ログイン",
  signup: "新規登録",
  totalsSessions: "全期間セッション",
  totalsDuration: "全期間時間",
  monthDuration: "今月時間",
  prev: "前へ",
  next: "次へ",
  monthLoading: "月データを読み込み中...",
  paywallTitle: "プレミアムプランが必要です",
  paywallDescription: "履歴の詳細は月額580円のプレミアムプランでご利用いただけます。",
  upgrade: "アップグレード",
  upgradeLoading: "リダイレクト中...",
  upgradeError: "決済ページの取得に失敗しました。時間を置いて再試行してください。",
  dayHint: "カレンダーの日付をタップすると、その日の記録が表示されます。",
  dayTitle: "{date}の記録",
  dayEmpty: "この日の記録はまだありません。",
  dayTotal: "合計 {duration}",
  dayReplay: "もう一度やる",
  dayClose: "閉じる",
} as const;

const OVERLAY_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "rgba(47, 28, 77, 0.35)",
  backdropFilter: "blur(8px)",
  zIndex: 1100,
};

const MODAL_STYLE: React.CSSProperties = {
  width: "min(420px, 100%)",
  maxHeight: "90vh",
  background: "var(--card, #fff)",
  borderRadius: 24,
  border: "1px solid var(--border, rgba(124,58,237,.2))",
  boxShadow: "0 24px 48px rgba(124,58,237,.25)",
  padding: "24px 20px",
  display: "grid",
  gap: 16,
  overflowY: "auto",
};

const MODAL_LIST_STYLE: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

function formatDuration(sec: number) {
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}分${seconds.toString().padStart(2, "0")}秒`;
}

function formatDateLabel(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return `${month}月${day}日`;
}

function formatTimeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function History() {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const isPaid = isSubscriptionActive(profile);
  const navigate = useNavigate();

  const sequenceMap = useMemo(() => {
    const map = new Map<string, string>();
    sequences.forEach((seq) => {
      const label = seq.title.ja ?? seq.title.en ?? seq.slug;
      map.set(seq.slug, label);
    });
    return map;
  }, []);

  const now = useMemo(() => new Date(), []);
  const [ym, setYM] = useState<[number, number]>([now.getFullYear(), now.getMonth()]);
  const [marks, setMarks] = useState<Set<string>>(new Set());
  const [monthSeconds, setMonthSeconds] = useState(0);
  const [totals, setTotals] = useState({ sessions: 0, seconds: 0 });
  const [monthRows, setMonthRows] = useState<MonthRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const overallLoading = loading || profileLoading;

  const loadMonth = useCallback(
    async (year: number, month: number) => {
      if (!user || !isPaid) {
        setMarks(new Set());
        setMonthSeconds(0);
        setMonthRows([]);
        return;
      }
      setLoadingMonth(true);
      try {
        const rows: MonthRow[] = await fetchMonthSessions(year, month);
        const markSet = new Set<string>();
        let seconds = 0;
        for (const row of rows) {
          const date = row.completed_at.slice(0, 10);
          markSet.add(date);
          seconds += row.duration_sec ?? 0;
        }
        setMarks(markSet);
        setMonthSeconds(seconds);
        setMonthRows(rows);
      } catch (err) {
        console.error(err);
        setMarks(new Set());
        setMonthSeconds(0);
        setMonthRows([]);
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
      setMonthRows([]);
      setTotals({ sessions: 0, seconds: 0 });
      setSelectedDate(null);
      setDetailOpen(false);
      return;
    }
    loadMonth(ym[0], ym[1]);
    fetchTotals()
      .then((result) => setTotals(result))
      .catch((err) => {
        console.error(err);
        setTotals({ sessions: 0, seconds: 0 });
      });
  }, [user, ym, loadMonth, isPaid]);

  useEffect(() => {
    if (!selectedDate) {
      setDetailOpen(false);
      return;
    }
    const exists = monthRows.some((row) => row.completed_at.startsWith(selectedDate));
    if (!exists) {
      setSelectedDate(null);
      setDetailOpen(false);
    }
  }, [monthRows, selectedDate]);

  const handleSelectDate = useCallback((iso: string) => {
    setSelectedDate(iso);
    setDetailOpen(true);
  }, []);

  useEffect(() => {
    if (!detailOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailOpen]);

  const dailySessions = useMemo(() => {
    if (!selectedDate) return [];
    return monthRows.filter((row) => row.completed_at.startsWith(selectedDate));
  }, [monthRows, selectedDate]);

  const dailySeconds = useMemo(
    () => dailySessions.reduce((acc, row) => acc + (row.duration_sec ?? 0), 0),
    [dailySessions]
  );

  const showDetail = detailOpen && !!selectedDate;
  const detailTitleId = "history-day-detail";

  const handleUpgrade = useCallback(async () => {
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
  }, []);

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
          <div className="history-locked__icon" role="img" aria-hidden="true">
            🔒
          </div>
          <h2 className="history-locked__title">{TEXT.loginRequiredTitle}</h2>
          <p className="muted">{TEXT.loginRequiredDescription}</p>
          <div className="history-locked__actions">
            <button
              className="btn primary"
              onClick={() =>
                navigate("/auth?mode=signin&redirect=/history", { state: { from: "/history" } })
              }
            >
              {TEXT.login}
            </button>
            <button
              className="btn"
              onClick={() =>
                navigate("/auth?mode=signup&redirect=/history", { state: { from: "/history" } })
              }
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
          <div className="history-locked__icon" role="img" aria-hidden="true">
            💡
          </div>
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
            <div style={{ fontSize: 20, fontWeight: 700 }}>{totals.sessions}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="muted">{TEXT.totalsDuration}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{formatDuration(totals.seconds)}</div>
          </div>
        </div>
      </div>

      <div className="card row">
        <div className="cal-head">
          <button
            className="btn"
            onClick={() => setYM(([Y, M]) => (M ? [Y, M - 1] : [Y - 1, 11]))}
          >
            {TEXT.prev}
          </button>
          <div style={{ fontWeight: 700 }}>
            {y}年 {m + 1}月
          </div>
          <button
            className="btn"
            onClick={() => setYM(([Y, M]) => (M < 11 ? [Y, M + 1] : [Y + 1, 0]))}
          >
            {TEXT.next}
          </button>
        </div>

        <Calendar
          year={y}
          month={m}
          marks={marks}
          selected={selectedDate}
          onSelect={handleSelectDate}
        />

        {loadingMonth && <div className="muted">{TEXT.monthLoading}</div>}

        <div className="grid2">
          <div className="card" style={{ padding: 12 }}>
            <div className="muted">{TEXT.monthDuration}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{formatDuration(monthSeconds)}</div>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: 16,
            borderRadius: 20,
            border: "1px dashed var(--border)",
            background: "var(--card-soft)",
            color: "var(--muted)",
            textAlign: "center",
          }}
        >
          {TEXT.dayHint}
        </div>
      </div>

      {showDetail && selectedDate && (
        <div
          style={OVERLAY_STYLE}
          role="presentation"
          onClick={() => setDetailOpen(false)}
        >
          <div
            style={MODAL_STYLE}
            role="dialog"
            aria-modal="true"
            aria-labelledby={detailTitleId}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div id={detailTitleId} style={{ fontWeight: 700, fontSize: 18 }}>
                {TEXT.dayTitle.replace("{date}", formatDateLabel(selectedDate))}
              </div>
              <button className="btn" onClick={() => setDetailOpen(false)}>
                {TEXT.dayClose}
              </button>
            </div>

            {dailySessions.length > 0 ? (
              <>
                <div className="muted">
                  {TEXT.dayTotal.replace("{duration}", formatDuration(dailySeconds))}
                </div>
                <div style={MODAL_LIST_STYLE}>
                  {dailySessions.map((session, index) => {
                    const title =
                      sequenceMap.get(session.sequence_slug) ?? session.sequence_slug;
                    return (
                      <div
                        key={`${session.sequence_slug}-${session.completed_at}-${index}`}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 16,
                          padding: 12,
                          display: "grid",
                          gap: 6,
                          background: "var(--card)",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{title}</div>
                        <div className="muted">
                          {formatTimeLabel(session.completed_at)} /{" "}
                          {formatDuration(session.duration_sec ?? 0)}
                        </div>
                        <div>
                          <button
                            className="btn"
                            onClick={() => navigate(`/play/${session.sequence_slug}`)}
                          >
                            {TEXT.dayReplay}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="muted">{TEXT.dayEmpty}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
