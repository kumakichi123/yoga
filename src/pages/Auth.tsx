import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { signInPassword, signUpPassword, useAuth } from "../hooks/useAuth";

const MODES = {
  signin: { title: "ログイン", cta: "ログイン", helper: "アカウントをお持ちでない場合" },
  signup: { title: "新規登録", cta: "登録する", helper: "すでにアカウントをお持ちの場合" },
} as const;

type Mode = keyof typeof MODES;

export default function AuthPage() {
  const [params] = useSearchParams();
  const initialMode: Mode = params.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const p = params.get("mode");
    if (p === "signup" || p === "signin") {
      setMode(p);
    }
  }, [params]);

  const redirectTo = useMemo(() => {
    const fromState = (location.state as { from?: string } | null)?.from;
    const redirect = params.get("redirect");
    return fromState || redirect || "/";
  }, [location.state, params]);

  useEffect(() => {
    if (!loading && user) {
      navigate(redirectTo, { replace: true });
    }
  }, [loading, user, navigate, redirectTo]);

  const modeMeta = MODES[mode];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password.trim()) {
      setError("メールアドレスとパスワードを入力してください。");
      return;
    }
    if (password.length < 6) {
      setError("パスワードは6文字以上で入力してください。");
      return;
    }
    if (mode === "signup" && password !== confirm) {
      setError("確認用パスワードが一致しません。");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signInPassword(trimmedEmail, password);
        setMessage("ログインしました。");
      } else {
        await signUpPassword(trimmedEmail, password);
        setMessage("登録メールを送信しました。受信トレイをご確認ください。");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "不明なエラーが発生しました";
      setError(`認証に失敗しました: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="card auth-card">
        <div className="auth-header">
          <h1 className="auth-title">{modeMeta.title}</h1>
          <p className="muted">メールアドレスとパスワードで{modeMeta.title}してください。</p>
        </div>
        <div className="auth-toggle">
          <button
            type="button"
            className={`btn ${mode === "signin" ? "primary" : ""}`}
            onClick={() => setMode("signin")}
            disabled={submitting}
          >
            ログイン
          </button>
          <button
            type="button"
            className={`btn ${mode === "signup" ? "primary" : ""}`}
            onClick={() => setMode("signup")}
            disabled={submitting}
          >
            新規登録
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>メールアドレス</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="6文字以上"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
            />
          </label>
          {mode === "signup" && (
            <label className="field">
              <span>パスワード（確認）</span>
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="もう一度入力してください"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </label>
          )}

          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-message">{message}</div>}

          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting ? "送信中..." : modeMeta.cta}
          </button>
        </form>

        <div className="auth-footer">
          <span className="muted">{modeMeta.helper}</span>
          {mode === "signin" ? (
            <button className="auth-link" type="button" onClick={() => setMode("signup")} disabled={submitting}>
              新規登録はこちら
            </button>
          ) : (
            <button className="auth-link" type="button" onClick={() => setMode("signin")} disabled={submitting}>
              ログインはこちら
            </button>
          )}
        </div>

        <div className="auth-back">
          <Link to={redirectTo === "/" ? "/" : redirectTo}>トップに戻る</Link>
        </div>
      </div>
    </div>
  );
}
