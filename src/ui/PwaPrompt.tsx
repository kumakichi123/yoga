import React, { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
};

const VISITS_KEY = "pwaPrompt.visits";
const DISMISSED_AT_KEY = "pwaPrompt.dismissedAt";
const INSTALLED_KEY = "pwaPrompt.installed";
const SESSION_SHOWN_KEY = "pwaPrompt.sessionShown";
const LAST_SHOWN_KEY = "pwaPrompt.lastShown";

const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const INITIAL_DELAY_MS = 45_000; // 45 seconds
const RETURN_DELAY_MS = 6_000; // ~6 seconds on subsequent visits

function supportsWindow() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function readNumber(key: string, fallback = 0): number {
  if (!supportsWindow()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(key: string, value: number) {
  if (!supportsWindow()) return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
}

function readBoolean(key: string): boolean {
  if (!supportsWindow()) return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeBoolean(key: string, value: boolean) {
  if (!supportsWindow()) return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore
  }
}

function sessionFlagged(key: string): boolean {
  if (!supportsWindow()) return false;
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function setSessionFlag(key: string) {
  if (!supportsWindow()) return;
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // ignore
  }
}

function isStandalone(): boolean {
  if (!supportsWindow()) return true;
  const displayModeStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone = (window.navigator as any).standalone;
  return Boolean(displayModeStandalone || iosStandalone);
}

function detectIos(): boolean {
  if (!supportsWindow()) return false;
  const ua = window.navigator.userAgent || "";
  const iOS = /iphone|ipad|ipod/i.test(ua);
  const macTouch = /macintosh/i.test(ua) && "ontouchend" in document;
  return (iOS || macTouch) && !(window.navigator as any).standalone;
}

const containerStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 1200,
  right: 16,
  bottom: 16,
  left: "auto",
  width: "min(360px, calc(100% - 32px))",
};

const cardStyle: React.CSSProperties = {
  background: "var(--card, #fff)",
  border: "1px solid var(--border, rgba(124,58,237,.2))",
  borderRadius: 24,
  padding: "18px 20px",
  boxShadow: "0 24px 48px rgba(124,58,237,.22)",
  display: "grid",
  gap: 12,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  justifyContent: "flex-end",
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 18,
};

const textStyle: React.CSSProperties = {
  color: "var(--muted, #6a5f82)",
  lineHeight: 1.6,
};

export default function PwaPrompt() {
  const [visitCount, setVisitCount] = useState<number>(0);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [trigger, setTrigger] = useState(false);
  const [installed, setInstalled] = useState<boolean>(() => isStandalone() || readBoolean(INSTALLED_KEY));
  const [platform, setPlatform] = useState<"android" | "ios" | null>(null);

  const dismissedAt = useMemo(() => readNumber(DISMISSED_AT_KEY, 0), []);
  const lastShownAt = useMemo(() => readNumber(LAST_SHOWN_KEY, 0), []);

  useEffect(() => {
    if (!supportsWindow()) return;
    const ios = detectIos();
    if (ios) {
      setPlatform("ios");
    }
  }, []);

  useEffect(() => {
    if (!supportsWindow()) return;
    const nextVisits = readNumber(VISITS_KEY, 0) + 1;
    writeNumber(VISITS_KEY, nextVisits);
    setVisitCount(nextVisits);
  }, []);

  useEffect(() => {
    if (!supportsWindow()) return;
    const handleInstalled = () => {
      writeBoolean(INSTALLED_KEY, true);
      setInstalled(true);
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", handleInstalled);
    return () => window.removeEventListener("appinstalled", handleInstalled);
  }, []);

  useEffect(() => {
    if (!supportsWindow() || installed) return;
    const handler = (event: Event) => {
      const bipEvent = event as BeforeInstallPromptEvent;
      event.preventDefault();
      setDeferredPrompt(bipEvent);
      setPlatform("android");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [installed]);

  useEffect(() => {
    if (!supportsWindow() || installed) return;
    if (sessionFlagged(SESSION_SHOWN_KEY)) return;

    const now = Date.now();
    if (dismissedAt && now - dismissedAt < COOLDOWN_MS) return;

    const delay = visitCount >= 2 ? RETURN_DELAY_MS : INITIAL_DELAY_MS;
    const timer = window.setTimeout(() => setTrigger(true), delay);
    return () => window.clearTimeout(timer);
  }, [visitCount, dismissedAt, installed]);

  useEffect(() => {
    if (!supportsWindow() || installed || !trigger) return;
    if (sessionFlagged(SESSION_SHOWN_KEY)) return;

    const now = Date.now();
    if (lastShownAt && now - lastShownAt < COOLDOWN_MS / 6) {
      // don't spam if already shown earlier today within ~12h
      return;
    }

    if (platform === "android" && !deferredPrompt) {
      // wait until event arrives
      return;
    }

    if (!platform) return;

    setVisible(true);
    setSessionFlag(SESSION_SHOWN_KEY);
    writeNumber(LAST_SHOWN_KEY, Date.now());
  }, [trigger, platform, deferredPrompt, installed, lastShownAt]);

  useEffect(() => {
    if (!supportsWindow()) return;
    const mq = window.matchMedia?.("(display-mode: standalone)");
    if (!mq) return;
    const listener = (event: MediaQueryListEvent) => {
      if (event.matches) {
        writeBoolean(INSTALLED_KEY, true);
        setInstalled(true);
        setVisible(false);
      }
    };
    if (mq.addEventListener) {
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    }
    mq.addListener(listener);
    return () => mq.removeListener(listener);
  }, []);

  if (!supportsWindow() || installed) {
    return null;
  }

  const handleDismiss = (persistCooldown = true) => {
    setVisible(false);
    setTrigger(false);
    if (persistCooldown) {
      writeNumber(DISMISSED_AT_KEY, Date.now());
    }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      handleDismiss(false);
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        writeBoolean(INSTALLED_KEY, true);
        setInstalled(true);
        setVisible(false);
      } else {
        handleDismiss();
      }
    } catch {
      handleDismiss();
    } finally {
      setDeferredPrompt(null);
    }
  };

  if (!visible || !platform) {
    return null;
  }

  const title = "ホーム画面に追加";
  const text =
    platform === "ios"
      ? "共有アイコン →『ホーム画面に追加』でインストールできます。"
      : "オフラインでも使えます。ホーム画面に追加しますか？";

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={titleStyle}>{title}</div>
        <div style={textStyle}>{text}</div>
        <div style={actionsStyle}>
          <button
            type="button"
            className="btn"
            onClick={() => handleDismiss()}
          >
            あとで
          </button>
          {platform === "android" ? (
            <button
              type="button"
              className="btn primary"
              onClick={handleInstallClick}
            >
              追加する
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              onClick={() => handleDismiss(false)}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
