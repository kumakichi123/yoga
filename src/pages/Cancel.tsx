import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { isSubscriptionActive, formatSubscriptionPeriodEnd } from "../utils/subscription";
import { cancelStripeSubscription } from "../store.remote";

const TEXT = {
  title: "プランの解約",
  description: "プレミアムプランの自動更新を停止できます。",
  loading: "読み込み中です…",
  noActive: "現在アクティブなサブスクリプションはありません。",
  active: "プレミアムプランをご利用中です。",
  activeWithDate: "次回更新日は {date} です。",
  notice: "解約後も現在の契約期間が終了するまではプレミアム機能をご利用いただけます。",
  button: "解約手続きを進める",
  buttonLoading: "処理中です…",
  success: "解約を受け付けました。数分後にステータスが更新されます。",
  error: "解約手続きに失敗しました。時間を置いて再度お試しください。",
};

export default function Cancel() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, refresh } = useProfile();
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  if (authLoading || profileLoading) {
    return (
      <div className="row">
        <div className="card">
          <div className="muted">{TEXT.loading}</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth?mode=signin&redirect=/settings/cancel" replace />;
  }

  const active = isSubscriptionActive(profile);
  const periodEnd = formatSubscriptionPeriodEnd(profile);

  async function handleCancel() {
    if (status === "loading") return;
    setStatus("loading");
    setError(null);
    try {
      await cancelStripeSubscription();
      setStatus("success");
      refresh();
    } catch (err) {
      console.error("cancel subscription error", err);
      setError(TEXT.error);
      setStatus("idle");
    }
  }

  return (
    <div className="row">
      <div className="card row">
        <h2 style={{ margin: 0 }}>{TEXT.title}</h2>
        <p className="muted">{TEXT.description}</p>
        {!active && <p className="muted">{TEXT.noActive}</p>}
        {active && (
          <>
            <p className="muted">
              {periodEnd ? TEXT.activeWithDate.replace("{date}", periodEnd) : TEXT.active}
            </p>
            <button
              className="btn primary"
              onClick={handleCancel}
              disabled={status === "loading" || status === "success"}
            >
              {status === "loading" ? TEXT.buttonLoading : TEXT.button}
            </button>
            <p className="muted" style={{ fontSize: 13 }}>{TEXT.notice}</p>
          </>
        )}
        {status === "success" && (
          <div style={{ color: "var(--brand-dark)" }}>{TEXT.success}</div>
        )}
        {error && <div style={{ color: "#d53f8c" }}>{error}</div>}
      </div>
    </div>
  );
}
