import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { signInPassword, signUpPassword, signInWithGoogle, useAuth } from "../hooks/useAuth";

const MODES = {
  signin: {
    title: "\u30ed\u30b0\u30a4\u30f3",
    cta: "\u30ed\u30b0\u30a4\u30f3",
  },
  signup: {
    title: "\u65b0\u898f\u767b\u9332",
    cta: "\u767b\u9332\u3059\u308b",
  },
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
  const [oauthLoading, setOauthLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const queryMode = params.get("mode");
    if (queryMode === "signin" || queryMode === "signup") {
      setMode(queryMode);
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
  const isSignup = mode === "signup";

  async function handleGoogle() {
    setError("");
    setMessage("");
    setOauthLoading(true);
    try {
      await signInWithGoogle(redirectTo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "原因不明のエラーです";
      setError(`Googleログインに失敗しました: ${msg}`);
      setOauthLoading(false);
    }
  }

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
      setError("パスワードは6文字以上で設定してください。");
      return;
    }
    if (isSignup && password !== confirm) {
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
        setMessage("確認メールを送信しました。");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "原因不明のエラーです";
      setError(`処理に失敗しました: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-container">
      <div
        className="card auth-card"
        style={{
          display: "grid",
          gap: 24,
          padding: 32,
          maxWidth: 420,
          margin: "0 auto",
        }}
      >
        <header style={{ display: "grid", gap: 8, textAlign: "center" }}>
          <h1 className="auth-title" style={{ margin: 0 }}>
            {modeMeta.title}
          </h1>
        </header>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
          style={{ display: "grid", gap: 20 }}
        >
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

          {isSignup && (
            <label className="field">
              <span>パスワード（確認）</span>
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="もう一度入力"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </label>
          )}

          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-message">{message}</div>}

          <button
            className="btn primary"
            type="submit"
            disabled={submitting || oauthLoading}
            style={{ height: 44 }}
          >
            {submitting ? "送信中..." : modeMeta.cta}
          </button>
        </form>

        <div
          style={{
            display: "grid",
            gap: 12,
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              gap: 12,
              color: "var(--muted)",
              fontSize: 13,
            }}
          >
            <span style={{ height: 1, background: "var(--border)" }} />
            <span>または</span>
            <span style={{ height: 1, background: "var(--border)" }} />
          </div>
          <button
            type="button"
            className="btn"
            onClick={handleGoogle}
            disabled={submitting || oauthLoading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              height: 44,
              fontWeight: 600,
            }}
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              focusable="false"
            >
              <path
                d="M17.64 9.20455C17.64 8.56637 17.5827 7.95273 17.4764 7.36364H9V10.8482H13.84C13.6327 11.9527 13.0045 12.8955 12.0618 13.5327V15.7955H14.96C16.6582 14.2045 17.64 11.9418 17.64 9.20455Z"
                fill="#4285F4"
              />
              <path
                d="M8.99998 18C11.43 18 13.4673 17.1955 14.96 15.7955L12.0618 13.5327C11.2573 14.0727 10.23 14.3864 8.99998 14.3864C6.65543 14.3864 4.67271 12.7818 3.96453 10.6764H0.957275V13.0182C2.44181 15.9891 5.48181 18 8.99998 18Z"
                fill="#34A853"
              />
              <path
                d="M3.96455 10.6764C3.78545 10.1364 3.68182 9.56818 3.68182 9C3.68182 8.43182 3.78545 7.86364 3.95091 7.32364V4.98182H0.957273C0.347727 6.21182 0 7.56818 0 9C0 10.4318 0.347727 11.7882 0.957273 13.0182L3.96455 10.6764Z"
                fill="#FBBC05"
              />
              <path
                d="M8.99998 3.61364C10.36 3.61364 11.53 4.08182 12.44 4.94545L15.0264 2.35909C13.4536 0.890909 11.43 0 8.99998 0C5.48181 0 2.44181 2.01091 0.957275 4.98182L3.95091 7.32364C4.67271 5.21818 6.65543 3.61364 8.99998 3.61364Z"
                fill="#EA4335"
              />
            </svg>
            <span>{oauthLoading ? "Googleにリダイレクト中..." : "Google で続ける"}</span>
          </button>
        </div>

        <div style={{ textAlign: "center", fontSize: 14 }}>
          {mode === "signin" ? (
            <>
              アカウントをお持ちでない場合{" "}
              <button
                className="auth-link"
                type="button"
                onClick={() => setMode("signup")}
                disabled={submitting || oauthLoading}
              >
                新規登録はこちら
              </button>
            </>
          ) : (
            <>
              既にアカウントをお持ちの場合{" "}
              <button
                className="auth-link"
                type="button"
                onClick={() => setMode("signin")}
                disabled={submitting || oauthLoading}
              >
                ログインはこちら
              </button>
            </>
          )}
        </div>

        <div className="auth-back">
          <Link to={redirectTo === "/" ? "/" : redirectTo}>トップに戻る</Link>
        </div>
      </div>
    </div>
  );
}
