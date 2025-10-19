import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { isSubscriptionActive } from "../utils/subscription";
import { upsertProfile, createStripeCheckoutSession } from "../store.remote";
import type { ExperienceLevel } from "../types";
import { poses } from "../data";

const experienceLabels: Record<ExperienceLevel, string> = {
  beginner: "\u521d\u5fc3\u8005",
  intermediate: "\u4e2d\u7d1a",
  advanced: "\u4e0a\u7d1a",
};

const TEXT = {
  cancelLink: "\u89e3\u7d04\u30da\u30fc\u30b8\u3078",
  poseGalleryTitle: "\u30dd\u30fc\u30ba\u96c6",
  poseGalleryFilterAll: "\u3059\u3079\u3066",
  poseGalleryAreasLabel: "\u90e8\u4f4d\u3067\u7d5e\u308a\u8fbc\u3080",
  poseGalleryLevelLabel: "\u30ec\u30d9\u30eb {level}",
  poseGalleryNoAreas: "\u5bfe\u8c61\u90e8\u4f4d\u306e\u60c5\u5831\u304c\u3042\u308a\u307e\u305b\u3093",
  poseGalleryOpen: "\u8a73\u3057\u304f\u307f\u308b",
  poseGalleryEmpty: "\u8868\u793a\u3067\u304d\u308b\u30dd\u30fc\u30ba\u304c\u3042\u308a\u307e\u305b\u3093\u3002",
  poseGalleryToggleOpen: "\u958b\u304f",
  poseGalleryToggleClose: "\u9589\u3058\u308b",
  planTitle: "\u30d7\u30e9\u30f3",
  upgrade: "\u30a2\u30c3\u30d7\u30b0\u30ec\u30fc\u30c9",
  upgradeLoading: "\u30ea\u30c0\u30a4\u30ec\u30af\u30c8\u4e2d...",
  upgradeError: "\u6c7a\u6e08\u30da\u30fc\u30b8\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u6642\u9593\u3092\u7f6e\u3044\u3066\u304b\u3089\u518d\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002",
  profileTitle: "\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb",
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
  contactCardTitle: "\u304a\u554f\u3044\u5408\u308f\u305b",
  contactCardButton: "\u304a\u554f\u3044\u5408\u308f\u305b\u30d5\u30a9\u30fc\u30e0\u3078",
};

export default function Settings() {
  const { user } = useAuth();
  const { profile, refresh: refreshProfile } = useProfile();
  const location = useLocation();
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [goal, setGoal] = useState(3);
  const [experience, setExperience] = useState<ExperienceLevel>("beginner");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [poseGalleryOpen, setPoseGalleryOpen] = useState(false);

  const areaOptions = useMemo(() => {
    const set = new Set<string>();
    poses.forEach((pose) => {
      (pose.areas || []).forEach((area) => {
        const trimmed = area.trim();
        if (trimmed) set.add(trimmed);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, []);

  const sortedPoses = useMemo(() => {
    return poses
      .slice()
      .sort((a, b) => {
        const aName = a.name.ja ?? a.name.en ?? a.slug;
        const bName = b.name.ja ?? b.name.en ?? b.slug;
        return aName.localeCompare(bName, "ja");
      });
  }, []);

  const filteredPoses = useMemo(() => {
    if (areaFilter === "all") return sortedPoses;
    return sortedPoses.filter((pose) => (pose.areas || []).includes(areaFilter));
  }, [areaFilter, sortedPoses]);

  const isPaid = isSubscriptionActive(profile);
  const canAccessPoseGallery = Boolean(user && isPaid);

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

  function handlePoseGalleryToggle() {
    if (canAccessPoseGallery) {
      setPoseGalleryOpen((value) => !value);
      return;
    }
    if (!user) {
      nav("/auth?mode=signup&redirect=/settings");
      return;
    }
    if (!checkoutLoading) {
      void handleUpgrade();
    }
  }

  const experienceOptions: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];
  const disabled = !user || saving;
  const planLabel = isPaid ? "\u30d7\u30ec\u30df\u30a2\u30e0" : "\u7121\u6599";

  return (
    <div className="row settings-page">
      {upgradeBanner && (
        <div className="card" style={{ background: "#F1EAFE" }}>
          <span>{upgradeBanner}</span>
        </div>
      )}

      <div className="card row">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
        <div style={{ fontWeight: 700 }}>{TEXT.poseGalleryTitle}</div>
        <button
            type="button"
            className="btn"
            onClick={handlePoseGalleryToggle}
            disabled={checkoutLoading}
          >
            {canAccessPoseGallery
              ? poseGalleryOpen
                ? TEXT.poseGalleryToggleClose
                : TEXT.poseGalleryToggleOpen
              : user
              ? TEXT.upgrade
              : "\u30ed\u30b0\u30a4\u30f3"}
          </button>
        </div>

        {canAccessPoseGallery && poseGalleryOpen ? (
          <>
            <span className="muted">{TEXT.poseGalleryAreasLabel}</span>
            <div className="pill-group">
              <button
                  type="button"
                  className={`pill ${areaFilter === "all" ? "active" : ""}`}
                  onClick={() => setAreaFilter("all")}
                >
                  {TEXT.poseGalleryFilterAll}
                </button>
                {areaOptions.map((area) => (
                <button
                    type="button"
                    key={area}
                    className={`pill ${areaFilter === area ? "active" : ""}`}
                    onClick={() => setAreaFilter(area)}
                  >
                    {area}
                  </button>
                ))}
              </div>
            {filteredPoses.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gap: 16,
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                }}
              >
                {filteredPoses.map((pose) => {
                  const poseName = pose.name.ja ?? pose.name.en ?? pose.slug;
                  const poseAreas = pose.areas?.filter((area) => area?.trim().length) ?? [];
                  return (
                    <div
                      key={pose.slug}
                      style={{
                        display: "grid",
                        gap: 10,
                        padding: 14,
                        borderRadius: 20,
                        border: "1px solid var(--border)",
                        background: "var(--card-soft)",
                      }}
                    >
                        <div className="thumb" style={{ margin: 0 }}>
                          {pose.imageUrl ? (
                            <img src={pose.imageUrl} alt={poseName} loading="lazy" />
                          ) : (
                            <span className="muted">{poseName}</span>
                          )}
                        </div>
                        <div style={{ fontWeight: 700 }}>{poseName}</div>
                        <div className="muted">
                          {TEXT.poseGalleryLevelLabel.replace("{level}", String(pose.level))}
                        </div>
                        {poseAreas.length > 0 ? (
                          <div className="pill-group">
                            {poseAreas.map((area) => (
                              <span
                                key={area}
                                className="pill"
                                style={{ cursor: "default" }}
                              >
                                {area}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="muted">{TEXT.poseGalleryNoAreas}</span>
                        )}
                      <button
                          type="button"
                          className="btn primary"
                          onClick={() => nav(`/pose/${pose.slug}`)}
                        >
                          {TEXT.poseGalleryOpen}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="muted">{TEXT.poseGalleryEmpty}</div>
            )}
          </>
        ) : null}
      </div>

      <div className="card row">
        <div style={{ fontWeight: 700 }}>{TEXT.planTitle}</div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{planLabel}</div>
        {checkoutError && <div style={{ color: "#d53f8c" }}>{checkoutError}</div>}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {!isPaid ? (
          <button className="btn primary" onClick={handleUpgrade} disabled={checkoutLoading || !user}>
              {checkoutLoading ? TEXT.upgradeLoading : TEXT.upgrade}
            </button>
          ) : (
            <Link className="btn" to="/settings/cancel">
              {TEXT.cancelLink}
            </Link>
          )}
        </div>
      </div>

      <div className="card row">
        <div style={{ fontWeight: 700 }}>{TEXT.profileTitle}</div>
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

      <div className="card row">
        <div style={{ fontWeight: 700 }}>{TEXT.contactCardTitle}</div>
        <Link className="btn primary" to="/contact">
          {TEXT.contactCardButton}
        </Link>
      </div>

      <div className="legal-links">
        <Link to="/legal/terms">{TEXT.legalTerms}</Link>
        <Link to="/legal/privacy">{TEXT.legalPrivacy}</Link>
        <Link to="/legal/commerce">{TEXT.legalCommerce}</Link>
      </div>
    </div>
  );
}










