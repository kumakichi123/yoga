import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth, signOut } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { isSubscriptionActive, formatSubscriptionPeriodEnd } from "../utils/subscription";
import { upsertProfile, createStripeCheckoutSession } from "../store.remote";
import type { ExperienceLevel } from "../types";

const experienceLabels: Record<ExperienceLevel, string> = {
  beginner: "\u521d\u5fc3\u8005",
  intermediate: "\u4e2d\u7d1a",
  advanced: "\u4e0a\u7d1a",
};

const TEXT = {
  accountTitle: "\u30a2\u30ab\u30a6\u30f3\u30c8",
  accountDescription: "\u30ed\u30b0\u30a4\u30f3\u60c5\u5831\u3068\u8868\u793a\u540d\u306f\u3001\u3053\u3053\u3067\u5909\u66f4\u3067\u304d\u307e\u3059\u3002",
  accountFallback: "\u30d8\u30c3\u30c0\u30fc\u306e\u30ed\u30b0\u30a4\u30f3\u30dc\u30bf\u30f3\u304b\u3089\u30b5\u30a4\u30f3\u30a4\u30f3\u3067\u304d\u307e\u3059\u3002",
  loggedInPrefix: "\u30ed\u30b0\u30a4\u30f3\u4e2d:",
  logout: "\u30ed\u30b0\u30a2\u30a6\u30c8",
  reading: "\u8aad\u307f\u8fbc\u307f\u4e2d...",
  planTitle: "\u30d7\u30e9\u30f3",
  planActive: "\u30d7\u30ec\u30df\u30a2\u30e0\u30d7\u30e9\u30f3\u3092\u3054\u5229\u7528\u4e2d\u3067\u3059",
  planActiveWithDate: "\uff08\u6b21\u56de\u66f4\u65b0: {date}\uff09",
  planFree: "\u73fe\u5728\u306f\u7121\u6599\u30d7\u30e9\u30f3\u3067\u3059\u3002AI\u30c1\u30e3\u30c3\u30c8\u3068\u5c65\u6b74\u306e\u8a73\u7d30\u306f\u30d7\u30ec\u30df\u30a2\u30e0\u30d7\u30e9\u30f3\uff08\u6708\u984d580\u5186\uff09\u3067\u3054\u5229\u7528\u3044\u305f\u3060\u3051\u307e\u3059\u3002",
  upgrade: "\u30a2\u30c3\u30d7\u30b0\u30ec\u30fc\u30c9",
  upgradeLoading: "\u30ea\u30c0\u30a4\u30ec\u30af\u30c8\u4e2d...",
  upgradeError: "\u6c7a\u6e08\u30da\u30fc\u30b8\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u6642\u9593\u3092\u7f6e\u3044\u3066\u304b\u3089\u518d\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002",
  profileTitle: "\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb",
  profileHint: "\u30ed\u30b0\u30a4\u30f3\u5f8c\u306b\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb\u3092\u66f4\u65b0\u3067\u304d\u307e\u3059\u3002",
  nameLabel: "\u8868\u793a\u540d",
  namePlaceholder: "\u30cb\u30c3\u30af\u30cd\u30fc\u30e0",
  goalLabel: "\u9031\u9593\u306e\u76ee\u6a19\u56de\u6570",
  levelLabel: "\u7d4c\u9a13\u30ec\u30d9\u30eb",
  save: "\u4fdd\u5b58",
  saving: "\u4fdd\u5b58\u4e2d...",
  saveSuccess: "\u4fdd\u5b58\u3057\u307e\u3057\u305f",
  saveError: "\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f",
  bannerSuccess: "\u6c7a\u6e08\u304c\u5b8c\u4e86\u3057\u307e\u3057\u305f\u3002\u53cd\u6620\u307e\u3067\u6570\u5206\u304b\u304b\u308b\u5834\u5408\u304c\u3042\u308a\u307e\u3059\u3002",
  bannerCancel: "\u6c7a\u6e08\u304c\u30ad\u30e3\u30f3\u30bb\u30eb\u3055\u308c\u307e\u3057\u305f\u3002\u3082\u3046\u4e00\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002",
  legalTerms: "\u5229\u7528\u898f\u7d04",
  legalPrivacy: "\u30d7\u30e9\u30a4\u30d0\u30b7\u30fc\u30dd\u30ea\u30b7\u30fc",
  legalCommerce: "\u7279\u5b9a\u5546\u53d6\u5f15\u6cd5\u306b\u57fa\u3065\u304f\u8868\u8a18",
};

export default function Settings() {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading, refresh: refreshProfile } = useProfile();
  const location = useLocation();

  const [name, setName] = useState("");
  const [goal, setGoal] = useState(3);
  const [experience, setExperience] = useState<ExperienceLevel>("beginner");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const isPaid = isSubscriptionActive(profile);
  const periodEnd = formatSubscriptionPeriodEnd(profile);
  const authOrProfileLoading = loading || profileLoading;

  useEffect(() => {
    if (!profile) {
      setName("");
      setGoal(3);
      setExperience("beginner");
      return;
    }
    if (profile.display_name !== undefined && profile.display_name !== null) {
      setName(profile.display_name);
    }
    if (profile.goal_per_week) {
      setGoal(profile.goal_per_week);
    }
    if (profile.experience_level) {
      setExperience(profile.experience_level);
    }
  }, [profile?.user_id]);

  const upgradeParam = useMemo(() => new URLSearchParams(location.search).get("upgrade"), [location.search]);
  const upgradeBanner = useMemo(() => {
    if (upgradeParam === "success") {
      return TEXT.bannerSuccess;
    }
    if (upgradeParam === "cancel") {
      return TEXT.bannerCancel;
    }
    return "";
  }, [upgradeParam]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await upsertProfile({
        display_name: name.trim(),
        goal_per_week: goal,
        experience_level: experience,
      });
      setMessage(TEXT.saveSuccess);
      refreshProfile();
    } catch (err) {
      console.error(err);
      setError(TEXT.saveError);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 2500);
    }
  }

  async function handleUpgrade() {
    try {
      setCheckoutLoading(true);
      setCheckoutError("");
      const { url } = await createStripeCheckoutSession();
      window.location.href = url;
    } catch (err) {
      console.error('createStripeCheckoutSession error', err);
      setCheckoutError(TEXT.upgradeError);
    } finally {
      setCheckoutLoading(false);
    }
  }

  const experienceOptions: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];
  const disabled = !user || saving;
  const planLine = isPaid
    ? `${TEXT.planActive}${periodEnd ? TEXT.planActiveWithDate.replace('{date}', periodEnd) : ''}\u3002`
    : TEXT.planFree;

  return (
    <div className="row">
      {upgradeBanner && (
        <div className="card" style={{ background: "#F1EAFE" }}>
          <span>{upgradeBanner}</span>
        </div>
      )}

      <div className="card row">
        <div style={{ fontWeight: 700 }}>{TEXT.accountTitle}</div>
        <p className="muted">{TEXT.accountDescription}</p>
        {authOrProfileLoading ? (
          <div className="muted">{TEXT.reading}</div>
        ) : user ? (
          <div className="row" style={{ gap: 12 }}>
            <div className="muted">{TEXT.loggedInPrefix} {user.email || profile?.display_name || "\u30e6\u30fc\u30b6\u30fc"}</div>
            <button className="btn" onClick={signOut}>
              {TEXT.logout}
            </button>
          </div>
        ) : (
          <div className="muted">{TEXT.accountFallback}</div>
        )}
      </div>

      <div className="card row">
        <div style={{ fontWeight: 700 }}>{TEXT.planTitle}</div>
        <p className="muted">{planLine}</p>
        {checkoutError && <div style={{ color: "#d53f8c" }}>{checkoutError}</div>}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {!isPaid && (
            <button className="btn primary" onClick={handleUpgrade} disabled={checkoutLoading || !user}>
              {checkoutLoading ? TEXT.upgradeLoading : TEXT.upgrade}
            </button>
          )}
        </div>
      </div>

      <div className="card row">
        <div style={{ fontWeight: 700 }}>{TEXT.profileTitle}</div>
        {!user && <div className="muted">{TEXT.profileHint}</div>}
        <label className="field">
          <span>{TEXT.nameLabel}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={TEXT.namePlaceholder}
            disabled={!user}
          />
        </label>
        <label className="field">
          <span>{TEXT.goalLabel}</span>
          <input
            type="number"
            min={1}
            max={14}
            value={goal}
            onChange={(e) => setGoal(Math.max(1, Math.min(14, Number(e.target.value) || 1)))}
            disabled={!user}
          />
        </label>
        <div className="field">
          <span>{TEXT.levelLabel}</span>
          <div className="pill-group">
            {experienceOptions.map((opt) => (
              <button
                key={opt}
                className={`pill ${experience === opt ? "active" : ""}`}
                onClick={() => setExperience(opt)}
                disabled={!user}
                type="button"
              >
                {experienceLabels[opt]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn primary" onClick={handleSave} disabled={disabled || !name.trim()}>
            {TEXT.save}
          </button>
          {saving && <span className="muted">{TEXT.saving}</span>}
          {message && <span style={{ color: "var(--brand-dark)" }}>{message}</span>}
          {error && <span style={{ color: "#d53f8c" }}>{error}</span>}
        </div>
      </div>

      <div className="legal-links">
        <Link to="/legal/terms">{TEXT.legalTerms}</Link>
        <Link to="/legal/privacy">{TEXT.legalPrivacy}</Link>
        <Link to="/legal/commerce">{TEXT.legalCommerce}</Link>
      </div>
    </div>
  );
}


