// src/ui/Shell.tsx
import React, { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import OnboardingWizard from "./OnboardingWizard";
import { useAuth, signOut } from "../hooks/useAuth";

const TEXT = {
  title: "\u4e09\u5206\u30e8\u30ac",
  login: "\u30ED\u30B0\u30A4\u30F3 / \u65B0\u898F\u767B\u9332",
  logout: "\u30ED\u30B0\u30A2\u30A6\u30C8",
  authLoading: "\u8A8D\u8A3C\u3092\u78BA\u8A8D\u4E2D...",
  loggingOut: "\u30ED\u30B0\u30A2\u30A6\u30C8\u4E2D...",
  loggedInAs: "\u30ED\u30B0\u30A4\u30F3\u4E2D:",
  navYoga: "\u30E8\u30AC",
  navHistory: "\u5C65\u6B74",
  navSettings: "\u8A2D\u5B9A",
} as const;

export default function Shell() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user, loading } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const tab = loc.pathname.startsWith("/history")
    ? "history"
    : loc.pathname.startsWith("/settings")
    ? "settings"
    : "yoga";

  const currentPath = `${loc.pathname}${loc.search}${loc.hash}`;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="container row" style={{ paddingBottom: 80 }}>
      <OnboardingWizard />
      <header className="shell-header">
        <div className="shell-auth">
          {loading ? (
            <span className="muted">{TEXT.authLoading}</span>
          ) : user ? (
            <>
              <span className="muted">{TEXT.loggedInAs} {user.email || user.id}</span>
              <button className="btn" onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? TEXT.loggingOut : TEXT.logout}
              </button>
            </>
          ) : (
            <button
              className="btn primary"
              onClick={() => nav(`/auth?mode=signin&redirect=${encodeURIComponent(currentPath)}`, {
                state: { from: currentPath },
              })}
            >
              {TEXT.login}
            </button>
          )}
        </div>
      </header>
      <Outlet />
      <div className="bottom">
        <div className="nav">
          <button className={`btn ${tab === "yoga" ? "primary" : ""}`} onClick={() => nav("/")}>
            {TEXT.navYoga}
          </button>
          <button className={`btn ${tab === "history" ? "primary" : ""}`} onClick={() => nav("/history")}>
            {TEXT.navHistory}
          </button>
          <button className={`btn ${tab === "settings" ? "primary" : ""}`} onClick={() => nav("/settings")}>
            {TEXT.navSettings}
          </button>
        </div>
      </div>
    </div>
  );
}
