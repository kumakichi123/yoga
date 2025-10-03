// src/pages/Yoga.tsx
import React, { useEffect, useMemo, useState } from "react";
import { sequences } from "../data";
import { useNavigate } from "react-router-dom";

function minutesOf(durationSec: number) {
  return Math.round(durationSec / 60);
}

export default function Yoga() {
  const nav = useNavigate();
  const durations = useMemo(() => {
    const mins = sequences.map((seq) => minutesOf(seq.durationSec));
    return Array.from(new Set(mins)).sort((a, b) => a - b);
  }, []);
  const [dur, setDur] = useState(() => (durations.length ? durations[0] : 0));

  useEffect(() => {
    if (durations.length && !durations.includes(dur)) {
      setDur(durations[0]);
    }
  }, [dur, durations]);

  const list = useMemo(
    () => sequences.filter((seq) => minutesOf(seq.durationSec) === dur),
    [dur],
  );

  return (
    <div className="row">
      {durations.length > 0 && (
        <div className="tabs" style={{ marginTop: 4 }}>
          {durations.map((value) => (
            <div
              key={value}
              className={`tab ${value === dur ? "active" : ""}`}
              onClick={() => setDur(value)}
            >
              {value}分
            </div>
          ))}
        </div>
      )}
      <div className="cards">
        {list.map((seq) => (
          <div className="card row" key={seq.slug}>
            <div className="thumb"><span className="muted">{seq.title.ja}</span></div>
            <div style={{ fontWeight: 700 }}>{seq.title.ja}</div>
            <div className="muted">{minutesOf(seq.durationSec)}分 / レベル{seq.level}</div>
            <button className="btn primary" onClick={() => nav(`/play/${seq.slug}`)}>
              開始
            </button>
          </div>
        ))}
        {list.length === 0 && (
          <div className="muted">該当するメニューがありません。</div>
        )}
      </div>
    </div>
  );
}
