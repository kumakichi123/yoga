import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, signOut } from "../hooks/useAuth";
import { fetchProfile, upsertProfile } from "../store.remote";
import type { ExperienceLevel, Profile } from "../types";

const experienceLabels: Record<ExperienceLevel, string> = {
  beginner: "初心者",
  intermediate: "中級",
  advanced: "上級",
};

export default function Settings() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(3);
  const [experience, setExperience] = useState<ExperienceLevel>("beginner");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setName("");
      setGoal(3);
      setExperience("beginner");
      return;
    }
    let cancelled = false;
    fetchProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        if (p?.display_name) setName(p.display_name);
        if (p?.goal_per_week) setGoal(p.goal_per_week);
        if (p?.experience_level) setExperience(p.experience_level);
      })
      .catch(() => {
        if (cancelled) return;
        setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const experienceOptions: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];
  const disabled = !user || saving;

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
      setMessage("保存しました");
    } catch (err) {
      console.error(err);
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 2500);
    }
  }

  return (
    <div className="row">
      <div className="card row">
        <div style={{ fontWeight: 700 }}>アカウント</div>
        <p className="muted">ログインすると進捗が保存され、複数端末で共有できます。</p>
        {loading ? (
          <div className="muted">読み込み中...</div>
        ) : user ? (
          <div className="row">
            <div className="muted">ログイン中: {user.email || profile?.display_name || "ユーザー"}</div>
            <button className="btn" onClick={signOut}>
              ログアウト
            </button>
          </div>
        ) : (
          <div className="muted">ヘッダーのログインボタンからサインインできます。</div>
        )}
      </div>

      <div className="card row">
        <div style={{ fontWeight: 700 }}>プロフィール</div>
        {!user && <div className="muted">ログイン後にプロフィールを編集できます。</div>}
        <label className="field">
          <span>名前</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="表示名"
            disabled={!user}
          />
        </label>
        <label className="field">
          <span>週あたりの目標回数</span>
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
          <span>経験レベル</span>
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
            保存
          </button>
          {saving && <span className="muted">保存中...</span>}
          {message && <span style={{ color: "var(--brand-dark)" }}>{message}</span>}
          {error && <span style={{ color: "#d53f8c" }}>{error}</span>}
        </div>
      </div>

      <div className="legal-links">
        <Link to="/legal/terms">利用規約</Link>
        <Link to="/legal/privacy">プライバシーポリシー</Link>
        <Link to="/legal/commerce">特定商取引法に基づく表示</Link>
      </div>
    </div>
  );
}
