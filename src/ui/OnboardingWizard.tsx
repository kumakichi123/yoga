// src/components/OnboardingFormOverlay.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { fetchProfile, upsertProfile } from "../store.remote";
import type { ExperienceLevel, Profile } from "../types";

const TEXT = {
  title: "\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb\u3092\u8a2d\u5b9a\u3057\u307e\u3057\u3087\u3046",
  desc: "\u3042\u306a\u305f\u306b\u5408\u308f\u305b\u305f\u30ec\u30c3\u30b9\u30b3\u30fc\u30b9\u3092\u6e96\u5099\u3059\u308b\u305f\u3081\u60c5\u5831\u3092\u8a2d\u5b9a\u3057\u307e\u3057\u3087\u3046",
  name: "\u30cb\u30c3\u30af\u30cd\u30fc\u30e0",
  namePh: "\u4f8b)\u3000\u307f\u306a\u3068",
  goal: "\u9031\u306b\u904b\u52d5\u3059\u308b\u56de\u6570",
  goalPrefix: "\u9031 ",
  goalSuffix: " \u56de",
  exp: "\u30e8\u30ac\u7d4c\u9a13",
  save: "\u4fdd\u5b58",
  errorSave: "\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u6642\u9593\u3092\u304a\u3044\u3066\u304b\u3089\u518d\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002",
};

const expOptions: { value: ExperienceLevel; label: string; desc: string }[] = [
  { value: "beginner", label: "\u521d\u5fc3\u8005", desc: "\u6700\u8fd1\u30e8\u30ac\u3092\u59cb\u3081\u305f\u3068\u3053\u308d\u3067\u3059\u3002" },
  { value: "intermediate", label: "\u4e2d\u7d1a", desc: "\u9031\u306b\u6570\u56de\u306f\u30e8\u30ac\u3092\u7d9a\u3051\u3066\u3044\u307e\u3059\u3002" },
  { value: "advanced", label: "\u4e0a\u7d1a", desc: "\u5f62\u3084\u30d5\u30ed\u30fc\u306b\u81ea\u4fe1\u304c\u3042\u308a\u307e\u3059\u3002" },
];

function needsOnboarding(profile: Profile | null) {
  return !profile;
}


export default function OnboardingFormOverlay() {
  const { user, loading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState(3);
  const [exp, setExp] = useState<ExperienceLevel | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setVisible(false);
      setProfile(null);
      return;
    }
    let cancelled = false;
    fetchProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setName(p?.display_name ?? "");
        setGoal(p?.goal_per_week && p.goal_per_week > 0 ? p.goal_per_week : 3);
        setExp((p?.experience_level as ExperienceLevel) ?? "");
        setVisible(needsOnboarding(p));
      })
      .catch(() => {
        if (cancelled) return;
        setProfile(null);
        setName("");
        setGoal(3);
        setExp("");
        setVisible(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) setVisible(false);
  }, [user]);

  const canSave = useMemo(() => name.trim().length > 0 && !!exp && goal >= 1, [name, exp, goal]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed = name.trim();
      await upsertProfile({
        display_name: trimmed,
        goal_per_week: goal,
        experience_level: exp as ExperienceLevel,
      });
      setProfile((prev) => ({
        user_id: prev?.user_id || (user ? user.id : ""),
        tz: prev?.tz ?? null,
        display_name: trimmed,
        goal_per_week: goal,
        experience_level: exp as ExperienceLevel,
      }));
      setVisible(false);
    } catch (err) {
      console.error(err);
      setError(TEXT.errorSave);
    } finally {
      setSaving(false);
    }
  }

  if (!visible || !user || loading) return null;

  return (
    <div className="wizard-overlay" role="dialog" aria-modal="true" aria-label="onboarding">
      <form className="wizard-panel" onSubmit={handleSave}>
        <h2>{TEXT.title}</h2>
        <p className="muted">{TEXT.desc}</p>

        <div className="wizard-input-wrap">
          <label htmlFor="ob-name">{TEXT.name}</label>
          <input
            id="ob-name"
            className="wizard-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={TEXT.namePh}
            autoFocus
          />
        </div>

        <div className="wizard-input-wrap">
          <label htmlFor="ob-goal">{TEXT.goal}</label>
          <div className="wizard-goal-value" aria-live="polite">
            {TEXT.goalPrefix}
            {goal}
            {TEXT.goalSuffix}
          </div>
          <input
            id="ob-goal"
            className="wizard-range"
            type="range"
            min={1}
            max={7}
            value={goal}
            onChange={(e) => setGoal(Number(e.target.value) || 1)}
          />
        </div>

        <div className="wizard-input-wrap">
          <span>{TEXT.exp}</span>
          <div className="wizard-options" style={{ maxHeight: 200 }}>
            {expOptions.map((o) => (
              <label key={o.value} className={`wizard-option ${exp === o.value ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="ob-exp"
                  value={o.value}
                  checked={exp === o.value}
                  onChange={() => setExp(o.value)}
                  style={{ marginRight: 8 }}
                />
                <span>{o.label}</span>
                <small>{o.desc}</small>
              </label>
            ))}
          </div>
        </div>

        {error && <div className="wizard-error">{error}</div>}

        <div className="wizard-actions wizard-actions--center">
          <button type="submit" className="btn primary" disabled={!canSave || saving}>
            {TEXT.save}
          </button>
        </div>
      </form>
    </div>
  );
}

