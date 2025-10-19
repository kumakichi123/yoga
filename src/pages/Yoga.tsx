// src/pages/Yoga.tsx
import React, { useEffect, useMemo, useState } from "react";
import { sequences } from "../data";
import { useNavigate } from "react-router-dom";
import ChatWidget from "../ui/ChatWidget";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { isSubscriptionActive } from "../utils/subscription";

const MAX_STARS = 3;

function minutesOf(durationSec: number) {
  return Math.round(durationSec / 60);
}

function Stars({ level }: { level: number }) {
  const filled = Math.max(0, Math.min(MAX_STARS, level));
  return (
    <div
      aria-label={`\u30ec\u30d9\u30eb${level}`}
      style={{ display: "flex", gap: 4, fontSize: 20, color: "#f59e0b" }}
    >
      {Array.from({ length: MAX_STARS }, (_, idx) => (
        <span key={idx} aria-hidden="true">
          {idx < filled ? "\u2605" : "\u2606"}
        </span>
      ))}
    </div>
  );
}

export default function Yoga() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const durations = useMemo(() => {
    const mins = sequences.map((seq) => minutesOf(seq.durationSec));
    return Array.from(new Set(mins)).sort((a, b) => a - b);
  }, []);
  const [dur, setDur] = useState(() => (durations.length ? durations[0] : 0));

  const allowedLimitedSet = useMemo(() => {
    const map = new Map<number, string>();
    sequences.forEach((seq) => {
      const minutes = minutesOf(seq.durationSec);
      if (!map.has(minutes)) {
        map.set(minutes, seq.slug);
      }
    });
    return new Set(map.values());
  }, []);

  const isPaid = isSubscriptionActive(profile);
  const isLimited = !user || !isPaid;

  useEffect(() => {
    if (durations.length && !durations.includes(dur)) {
      setDur(durations[0]);
    }
  }, [dur, durations]);

  const list = useMemo(() => {
    return sequences
      .filter((seq) => minutesOf(seq.durationSec) === dur)
      .map((seq) => {
        const locked = isLimited && !allowedLimitedSet.has(seq.slug);
        return { seq, locked };
      });
  }, [allowedLimitedSet, dur, isLimited]);

  return (
    <>
      <div className="row">
        {durations.length > 0 && (
          <div className="tabs" style={{ marginTop: 4 }}>
            {durations.map((value) => (
              <div
                key={value}
                className={`tab ${value === dur ? "active" : ""}`}
                onClick={() => setDur(value)}
              >
                {value}{'\u5206'}
              </div>
            ))}
          </div>
        )}

        <div className="cards">
          {list.map(({ seq, locked }) => (
            <div className="card row" key={seq.slug} aria-disabled={locked}>
              <div style={{ fontWeight: 700 }}>{seq.title.ja}</div>
              <Stars level={seq.level} />
              {seq.description?.ja && (
                <p className="muted" style={{ margin: 0 }}>{seq.description.ja}</p>
              )}
              <button
                className="btn primary"
                onClick={() => nav(`/play/${seq.slug}`)}
                disabled={locked}
              >
                {locked ? "\u30d7\u30ec\u30df\u30a2\u30e0\u9650\u5b9a" : "\u958b\u59cb"}
              </button>
            </div>
          ))}
          {list.length === 0 && (
            <div className="muted">\u4e00\u81f4\u3059\u308b\u30e1\u30cb\u30e5\u30fc\u304c\u3042\u308a\u307e\u305b\u3093\u3002</div>
          )}
        </div>
      </div>
      <ChatWidget />
    </>
  );
}
