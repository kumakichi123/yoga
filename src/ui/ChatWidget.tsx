import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { isSubscriptionActive } from "../utils/subscription";
import { apiUrl } from "../utils/api";
import type { ChatMsg } from "../types";
import { fetchMonthSessions, fetchTotals } from "../store.remote";

const TEXT = {
  toggleOpen: "AI\u306B\u76F8\u8AC7\u3057\u3066\u307F\u308B",
  toggleClose: "\u3068\u3058\u308b",
  inputPlaceholder: "\u30e1\u30c3\u30bb\u30fc\u30b8\u3092\u5165\u529b",
  send: "\u9001\u4fe1",
  loginPrompt: "\u30ed\u30b0\u30a4\u30f3\u3059\u308b\u3068AI\u30c1\u30e3\u30c3\u30c8\u3092\u3054\u5229\u7528\u3044\u305f\u3060\u3051\u307e\u3059\u3002",
  login: "\u30ed\u30b0\u30a4\u30f3",
  signup: "\u65b0\u898f\u767b\u9332",
  loading: "\u8aad\u307f\u8fbc\u3093\u3067\u3044\u307e\u3059\u2026",
  limitReached: "\u7121\u6599\u30d7\u30e9\u30f3\u306f\u903110\u901a\u307e\u3067\u3067\u3059\u3002\u30d7\u30ec\u30df\u30a2\u30e0\u30d7\u30e9\u30f3\u3092\u3054\u691c\u8a0e\u304f\u3060\u3055\u3044\u3002",
  sendError: "\u30c1\u30e3\u30c3\u30c8\u306e\u9001\u4fe1\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u6642\u9593\u3092\u304a\u3044\u3066\u518d\u5ea6\u304a\u8a66\u3057\u304f\u3060\u3055\u3044\u3002",
} as const;

function buildDefaultMessage(
  streak: number,
  totalSessions: number,
  totalSeconds: number
) {
  return "\u3053\u3093\u306b\u3061\u306f\uff01\u4f55\u304b\u8cea\u554f\u3084\u304a\u60a9\u307f\u306f\u3042\u308a\u307e\u3059\u304b\uff1f";
}

export default function ChatWidget() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const isPaid = isSubscriptionActive(profile);


const conversationStorageKey = useMemo(
  () => (user?.id ? `chat.conversationId.${user.id}` : null),
  [user?.id]
);
const [conversationId, setConversationId] = useState<string | null>(null);

useEffect(() => {
  if (!conversationStorageKey) {
    setConversationId(null);
    return;
  }
  if (typeof window === "undefined") return;
  try {
    const stored = window.localStorage.getItem(conversationStorageKey);
    setConversationId(stored || null);
  } catch {
    setConversationId(null);
  }
}, [conversationStorageKey]);

const persistConversationId = useCallback(
  (value: string | null) => {
    setConversationId(value);
    if (!conversationStorageKey || typeof window === "undefined") return;
    try {
      if (value) {
        window.localStorage.setItem(conversationStorageKey, value);
      } else {
        window.localStorage.removeItem(conversationStorageKey);
      }
    } catch {
      // ignore storage errors
    }
  },
  [conversationStorageKey]
);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [statsLoading, setStatsLoading] = useState(false);
  const [monthSeconds, setMonthSeconds] = useState(0);
  const [totals, setTotals] = useState({ sessions: 0, seconds: 0 });
  const [sending, setSending] = useState(false);
  const [limitReached, setLimitReached] = useState(false);


  const renderMessageText = useCallback((text: string) => {
    const parts = text.split(/(?:\r\n|\r|\n)/);
    return parts.map((part, idx) => (
      <React.Fragment key={idx}>
        {part === "" ? "\u00a0" : part}
        {idx < parts.length - 1 ? <br /> : null}
      </React.Fragment>
    ));
  }, []);

  const overallLoading = loading || profileLoading || statsLoading;
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollToBottom = useCallback(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  useEffect(() => {
    if (!open) return;
    scrollToBottom();
  }, [messages, overallLoading, scrollToBottom, open]);

  const adjustTextareaSize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const computed =
      typeof window !== "undefined" ? window.getComputedStyle(el) : null;
    const lineHeight = computed ? parseFloat(computed.lineHeight || "0") : 0;
    const paddingTop = computed ? parseFloat(computed.paddingTop || "0") : 0;
    const paddingBottom = computed
      ? parseFloat(computed.paddingBottom || "0")
      : 0;
    const fallbackLineHeight = 20;
    const maxHeight =
      (lineHeight > 0 ? lineHeight : fallbackLineHeight) * 5 +
      paddingTop +
      paddingBottom;
    const newHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${newHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    adjustTextareaSize();
  }, [input, open, adjustTextareaSize]);

  const ensureDefaultMessage = useCallback(
    (streak: number, sessions: number, seconds: number) => {
      setLimitReached(false);
      const defaultMsg: ChatMsg = {
        role: "assistant",
        text: buildDefaultMessage(streak, sessions, seconds),
        at: new Date().toISOString(),
      };
      setMessages([defaultMsg]);
    },
    []
  );

  const loadStats = useCallback(async () => {
    if (!user || !isPaid) {
      setLimitReached(false);
      setTotals({ sessions: 0, seconds: 0 });
      setMonthSeconds(0);
      setMessages([
        {
          role: "assistant",
          text: buildDefaultMessage(0, 0, 0),
          at: new Date().toISOString(),
        },
      ]);
      return;
    }
    setStatsLoading(true);
    setLimitReached(false);
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const [current, totalsData] = await Promise.all([
        fetchMonthSessions(y, m),
        fetchTotals(),
      ]);
      setTotals(totalsData);
      setMonthSeconds(
        current.reduce((acc: number, row: any) => acc + (row.duration_sec || 0), 0)
      );
      ensureDefaultMessage(0, totalsData.sessions, totalsData.seconds);
    } catch (err) {
      console.error(err);
      ensureDefaultMessage(0, 0, 0);
    } finally {
      setStatsLoading(false);
    }
  }, [user?.id, isPaid, ensureDefaultMessage]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const canSend = useMemo(
    () => input.trim().length > 0 && !sending && !limitReached,
    [input, sending, limitReached]
  );

  async function handleSend() {
    if (!canSend) return;
    if (!user) {
      navigate("/auth?mode=signin&redirect=/", { state: { from: "/" } });
      return;
    }

    const trimmed = input.trim();
    const timestamp = new Date().toISOString();
    const outgoing: ChatMsg = { role: "user", text: trimmed, at: timestamp };
    setMessages((prev) => [...prev, outgoing]);
    setInput("");
    setSending(true);

    try {
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversation_id: conversationId ?? undefined,
          inputs: {
            total_sessions: totals.sessions,
            total_seconds: totals.seconds,
            month_seconds: monthSeconds,
          },
          uid: user.id,
        }),
      });

      if (!response.ok) {
        let errorText = TEXT.sendError;
        let hitLimit = false;
        if (response.status === 429) {
          errorText = TEXT.limitReached;
          hitLimit = true;
        } else {
          try {
            const err = await response.json();
            if (err?.error === "free_chat_limit") {
              errorText = TEXT.limitReached;
              hitLimit = true;
            }
          } catch {
            // ignore JSON parse errors
          }
        }
        if (hitLimit) {
          setLimitReached(true);
        }
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: errorText, at: new Date().toISOString() },
        ]);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: TEXT.sendError, at: new Date().toISOString() },
        ]);
        return;
      }

      const assistantAt = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "", at: assistantAt },
      ]);

      const updateAssistant = (text: string) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.at === assistantAt ? { ...msg, text } : msg
          )
        );
      };

      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let assistantText = "";
      let latestConversationId: string | null = conversationId ?? null;
      let receivedContent = false;
      let streamError: string | null = null;

      const applyAnswer = (value: unknown, replace = false) => {
        if (typeof value !== "string" || value.length === 0) return;
        receivedContent = true;
        assistantText = replace ? value : assistantText + value;
        updateAssistant(assistantText);
      };

      const handlePayload = (payload: any, eventName: string | null) => {
        if (!payload || typeof payload !== "object") return;

        const candidate =
          typeof payload.conversation_id === "string"
            ? payload.conversation_id
            : typeof payload.conversationId === "string"
            ? payload.conversationId
            : null;
        if (candidate) {
          latestConversationId = candidate;
        }

        if (payload.error) {
          streamError =
            typeof payload.error === "string"
              ? payload.error
              : TEXT.sendError;
          updateAssistant(streamError);
          receivedContent = true;
          return;
        }

        const payloadEvent =
          typeof payload.event === "string" ? payload.event : eventName;
        if (payloadEvent === "error") {
          streamError =
            typeof payload.message === "string"
              ? payload.message
              : TEXT.sendError;
          updateAssistant(streamError);
          receivedContent = true;
          return;
        }

        if (typeof payload.output_text === "string") {
          applyAnswer(payload.output_text, true);
          return;
        }

        if (Array.isArray(payload.outputs)) {
          const textOutput = payload.outputs
            .map((item: any) => {
              if (item && typeof item === "object") {
                if (typeof item.answer === "string") return item.answer;
                if (typeof item.text === "string") return item.text;
                if (typeof item.value === "string") return item.value;
              }
              return "";
            })
            .filter(Boolean)
            .join("");
          if (textOutput) {
            applyAnswer(textOutput, true);
            return;
          }
        }

        if (typeof payload.answer === "string") {
          const replace = payloadEvent === "message_end";
          applyAnswer(payload.answer, replace);
          return;
        }

        if (typeof payload.message === "string") {
          applyAnswer(payload.message, payloadEvent === "message_end");
        }
      };

  


    const processBuffer = () => {
      buffer = buffer.replace(new RegExp('\\r', 'g'), '');
      let index: number;
      while ((index = buffer.indexOf('\n\n')) !== -1) {
        const eventChunk = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (!eventChunk.trim()) continue;
        const lines = eventChunk.split('\n');
        let eventName: string | null = null;
        const dataParts: string[] = [];
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim() || null;
            continue;
          }
          if (line.startsWith('data:')) {
            dataParts.push(line.slice(5).trim());
          }
        }
        for (const part of dataParts) {
          if (!part || part === '[DONE]') continue;
          try {
            const payload = JSON.parse(part);
            handlePayload(payload, eventName);
          } catch {
            // ignore malformed chunk
          }
        }
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      processBuffer();
    }
    buffer += decoder.decode();
    processBuffer();

      if (streamError) {
        updateAssistant(streamError);
      } else if (!receivedContent) {
        const hint =
          monthSeconds === 0
            ? "まずは3分メニューから試してみましょう。"
            : monthSeconds < 600
            ? "いいペースです！もう1本軽めのメニューを追加してみますか？"
            : "素晴らしい継続力です。次はどんな練習がしたいですか？";
        updateAssistant(hint);
      } else if (!assistantText.trim()) {
        updateAssistant(TEXT.sendError);
      }

      if (latestConversationId && latestConversationId !== conversationId) {
        persistConversationId(latestConversationId);
      }
    } catch (err) {
      console.error("chat send error", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: TEXT.sendError, at: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  }
  function renderPanelContent() {
    if (!user) {
      return (
        <div className="chat-widget__paywall">
          <p>{TEXT.loginPrompt}</p>
          <div className="chat-widget__actions">
            <button
              className="btn primary"
              onClick={() => navigate("/auth?mode=signin&redirect=/", { state: { from: "/" } })}
            >
              {TEXT.login}
            </button>
            <button
              className="btn"
              onClick={() => navigate("/auth?mode=signup&redirect=/", { state: { from: "/" } })}
            >
              {TEXT.signup}
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="chat-widget__messages" ref={messagesRef}>
          {messages.map((msg, idx) => (

            <div key={idx} className={`chat-widget__bubble chat-widget__bubble--${msg.role}`}>

              {renderMessageText(msg.text)}

            </div>

          ))}

          {overallLoading && (
            <div className="chat-widget__bubble chat-widget__bubble--assistant">
              {TEXT.loading}
            </div>
          )}
        </div>
        <div className="chat-widget__input">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={TEXT.inputPlaceholder}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            disabled={sending}
          />
          <button className="btn primary" onClick={handleSend} disabled={!canSend}>
            {TEXT.send}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className={`chat-widget ${open ? "chat-widget--open" : ""}`}>
      <button
        className="chat-widget__toggle btn"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? TEXT.toggleClose : TEXT.toggleOpen}
      </button>
      {open && (
        <div className="chat-widget__panel">
          {renderPanelContent()}
        </div>
      )}
    </div>
  );
}
