// src/pages/PlayPage.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { sequences, poses } from "../data";
import type { Frame, Sequence, Pose } from "../types";
import { insertSession } from "../store.remote";

/** === Inline CSS: 16:9固定＋contain === */
const PLAY_CSS = `
:root{
  --bg:#faf7ff;--card:#fff;--ink:#2b2b2b;--muted:#738295;
  --accent:#b37be3;--accent-weak:#eadbfd;--radius:16px;
}
*{box-sizing:border-box}
body{color:var(--ink)}
.container{width:100%;padding:24px 16px}
.row{display:flex;flex-direction:column;gap:16px}
.main-wrap{min-height:100vh;align-items:center;justify-content:center;background:var(--bg)}
.card{width:min(100%,720px);background:var(--card);border-radius:var(--radius);padding:16px;box-shadow:0 2px 10px rgba(20,20,40,.05);margin:0 auto}
.play-card{gap:24px}
.play-header{display:flex;align-items:center;justify-content:space-between;font-weight:600}
.bar{height:8px;background:#eee;border-radius:999px;overflow:hidden}
.bar>i{display:block;height:100%;background:var(--accent)}
.play-progress{cursor:pointer}
/* 16:9固定枠 + 画像は全体表示 */
.play-thumb{width:100%;aspect-ratio:16/9;background:#fff;border-radius:var(--radius);display:grid;place-items:center;overflow:hidden;position:relative}
.play-thumb>img{width:100%;height:100%;object-fit:contain;display:block}
.play-thumb__meta{position:absolute;top:12px;left:12px;right:12px;display:flex;align-items:flex-start;gap:12px;pointer-events:none}
.play-thumb__tags{display:flex;flex-wrap:wrap;gap:6px}
.play-thumb__tag{display:inline-flex;align-items:center;justify-content:center;padding:4px 10px;border-radius:999px;background:rgba(179,123,227,.85);color:#fff;font-size:12px;font-weight:600}
.play-thumb__level{margin-left:auto;display:flex;align-items:center;gap:2px;font-size:0}
.play-thumb__star{font-size:20px;line-height:1;color:#d8d8d8;text-shadow:0 0 1px rgba(0,0,0,.15)}
.play-thumb__star--filled{color:#ffc107}
/* 次のポーズ プレビュー（16:9サムネ） */
.play-next{align-self:end;display:grid;gap:8px;justify-items:end}
.play-next__label{font-size:12px;color:var(--muted)}
.play-next__content{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:12px;background:#333;color:#fff}
.play-next__thumb{width:96px;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#fff;flex:0 0 auto}
.play-next__thumb>img{width:100%;height:100%;object-fit:contain;display:block}
.play-next__meta{display:grid;gap:2px}
.play-next__name{font-weight:700;font-size:14px}
.play-next__time{font-size:12px;opacity:.9}
/* テキスト */
.play-pose-name{font-size:20px;font-weight:700}
.list-numbered{padding-left:1.5rem;display:grid;gap:6px}
/* コントロール */
.play-controls{display:flex;align-items:center;justify-content:center;gap:24px;margin-top:auto}
.play-timer{display:flex;flex-direction:column;align-items:center;gap:4px}
.play-timer .muted{font-size:12px;color:var(--muted)}
.play-timer .time{font-size:28px;font-weight:700}
/* 汎用ボタン */
.btn{outline:0;border:0;cursor:pointer;user-select:none;padding:10px 14px;border-radius:12px;font-weight:600;color:#432a66;background:var(--accent-weak)}
.btn:active{transform:translateY(1px)}
/* レスポンシブ */
@media(min-width:1024px){.card{width:min(100%,840px)}.play-next__thumb{width:112px}}
@media(max-width:480px){.card{padding:12px}.play-next__content{padding:6px 10px}.play-next__thumb{width:84px}}
`;

const TEXT = {
  notFound: "メニューが見つかりません",
  back: "戻る",
  finish: "終了",
  nextPose: "次のポーズ",
  seconds: "秒",
  next: "次へ",
  timeLabel: "時間",
} as const;

type NextFrameInfo = { frame: Frame; pose?: Pose };

function useTicker(seconds: number, onEnd: () => void, resetKey: React.Key, initialElapsed = 0) {
  const [left, setLeft] = useState(seconds);
  const raf = useRef<number | null>(null);
  const start = useRef(0);
  const endRef = useRef(onEnd);
  useEffect(() => { endRef.current = onEnd; }, [onEnd]);
  useEffect(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    const initialLeft = Math.max(seconds - initialElapsed, 0);
    setLeft(initialLeft);
    start.current = performance.now() - initialElapsed * 1000;
    if (initialLeft === 0) {
      endRef.current();
      return () => {};
    }
    const tick = (t: number) => {
      const remaining = Math.max(seconds - Math.floor((t - start.current) / 1000), 0);
      setLeft(remaining);
      if (remaining === 0) { endRef.current(); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [seconds, resetKey, initialElapsed]);
  return left;
}

export default function PlayPage() {
  useEffect(() => {
    const id = "play-inline-style";
    if (!document.getElementById(id)) {
      const el = document.createElement("style");
      el.id = id;
      el.textContent = PLAY_CSS;
      document.head.appendChild(el);
    }
  }, []);

  const { slug } = useParams();
  const nav = useNavigate();
  const seq = useMemo<Sequence | undefined>(() => sequences.find((s) => s.slug === slug), [slug]);
  const poseMap = useMemo(() => new Map(poses.map((p) => [p.slug, p])), []);
  const [si, setSi] = useState(0);
  const [fi, setFi] = useState(0);
  const [frameInitialElapsed, setFrameInitialElapsed] = useState(0);
  const savedRef = useRef(false);

  useEffect(() => {
    if (!seq) return;
    const urls = seq.steps.flatMap((s) => s.frames.map((f) => f.imageUrl));
    urls.forEach((u) => { const img = new Image(); img.src = u; });
  }, [seq?.slug]);

  useEffect(() => {
    setFrameInitialElapsed(0);
  }, [seq?.slug]);

  if (!seq) {
    return (
      <div className="container">
        {TEXT.notFound}
        <button className="btn" onClick={() => nav("/")}>{TEXT.back}</button>
      </div>
    );
  }

  const step = seq.steps[si];
  const frame: Frame = step.frames[fi];
  const pose = poseMap.get(step.poseSlug);
  const maxStars = 3;
  const levelValue = pose?.level ? Math.min(Math.max(pose.level, 0), maxStars) : 0;
  const poseAreas = pose?.areas ?? [];
  const areasLabel = poseAreas.join("、");
  const stars = Array.from({ length: maxStars }, (_, i) => i < levelValue);
  const levelLabel = `レベル${pose?.level ?? levelValue}`;

  const handleFinish = useCallback(() => {
    if (!savedRef.current) {
      savedRef.current = true;
      insertSession(seq.slug, seq.durationSec).catch(() => {});
    }
    setTimeout(() => nav(-1), 300);
  }, [nav, seq.durationSec, seq.slug]);

  const handleEnd = useCallback(() => {
    setFrameInitialElapsed(0);
    setFi((fiPrev) => {
      const stepNow = seq.steps[si];
      if (fiPrev < stepNow.frames.length - 1) return fiPrev + 1;
      setSi((siPrev) => {
        if (siPrev < seq.steps.length - 1) { setFi(0); return siPrev + 1; }
        handleFinish(); return siPrev;
      });
      return fiPrev;
    });
  }, [handleFinish, seq.steps, si]);

  const resetKey = `${si}-${fi}-${frame.imageUrl}`;
  const left = useTicker(frame.seconds, handleEnd, resetKey, frameInitialElapsed);
  const formattedTime = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;

  const instructionItems = useMemo(() => {
    const items: string[] = [];
    if (frame.text?.ja) items.push(frame.text.ja);
    if (pose?.cues?.length) pose.cues.forEach((c) => { if (c.ja) items.push(c.ja); });
    return items;
  }, [frame, pose]);

  const nextFrameInfo = useMemo<NextFrameInfo | null>(() => {
    if (fi < step.frames.length - 1) return { frame: step.frames[fi + 1], pose };
    if (si < seq.steps.length - 1) {
      const nextStep = seq.steps[si + 1];
      const nextFrame = nextStep.frames[0];
      const nextPose = poseMap.get(nextStep.poseSlug);
      return nextFrame ? { frame: nextFrame, pose: nextPose } : null;
    }
    return null;
  }, [fi, pose, poseMap, seq.steps, si, step.frames]);

  const elapsed =
    seq.steps.slice(0, si).reduce((tot, s) => tot + s.frames.reduce((sum, f) => sum + f.seconds, 0), 0) +
    step.frames.slice(0, fi).reduce((acc, f) => acc + f.seconds, 0) +
    (frame.seconds - left);
  const pct = Math.min(100, Math.round((100 * elapsed) / seq.durationSec));
  const showNextPreview = left <= 5 && !!nextFrameInfo;
  const nextPoseName = nextFrameInfo?.pose?.name.ja ?? TEXT.nextPose;

  const handleProgressSeek = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!seq || !seq.durationSec) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    let target = seq.durationSec * ratio;
    if (target >= seq.durationSec) {
      target = Math.max(seq.durationSec - 0.001, 0);
    }
    let accumulated = 0;
    let newSi = seq.steps.length - 1;
    let newFi = seq.steps[newSi].frames.length - 1;
    let elapsedInFrame = seq.steps[newSi].frames[newFi].seconds;
    outer: for (let s = 0; s < seq.steps.length; s++) {
      const frames = seq.steps[s].frames;
      for (let f = 0; f < frames.length; f++) {
        const duration = frames[f].seconds;
        if (accumulated + duration > target) {
          newSi = s;
          newFi = f;
          elapsedInFrame = target - accumulated;
          break outer;
        }
        accumulated += duration;
      }
    }
    const nextStep = seq.steps[newSi];
    const nextFrame = nextStep.frames[newFi];
    const boundedElapsed = Math.min(Math.max(elapsedInFrame, 0), nextFrame.seconds);
    setSi(newSi);
    setFi(newFi);
    setFrameInitialElapsed(boundedElapsed);
  }, [seq]);

  return (
    <div className="container row main-wrap">
      <div className="card row play-card">
        <div className="play-header">
          <div>{seq.title.ja}</div>
          <button className="btn" onClick={handleFinish}>{TEXT.finish}</button>
        </div>

        <div
          className="bar play-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          onPointerDown={handleProgressSeek}
        >
          <i style={{ width: `${pct}%` }} />
        </div>

        <div className="thumb play-thumb">
          <img src={frame.imageUrl} alt={pose?.name.ja} />
          {(poseAreas.length > 0 || levelValue > 0) && (
            <div className="play-thumb__meta">
              {poseAreas.length ? (
                <div className="play-thumb__tags" aria-label={`効く部位 ${areasLabel}`}>
                  {poseAreas.map((area) => (
                    <span key={area} className="play-thumb__tag">{area}</span>
                  ))}
                </div>
              ) : null}
              {levelValue > 0 && (
                <div className="play-thumb__level" aria-label={levelLabel}>
                  {stars.map((filled, idx) => (
                    <span
                      key={idx}
                      className={`play-thumb__star${filled ? " play-thumb__star--filled" : ""}`}
                      aria-hidden="true"
                    >
                      ★
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {showNextPreview && nextFrameInfo && (
          <div className="play-next">
            <span className="play-next__label">{TEXT.nextPose}</span>
            <div className="play-next__content">
              <div className="play-next__thumb">
                <img src={nextFrameInfo.frame.imageUrl} alt={nextPoseName} />
              </div>
              <div className="play-next__meta">
                <span className="play-next__name">{nextPoseName}</span>
                <span className="play-next__time">{nextFrameInfo.frame.seconds}{TEXT.seconds}</span>
              </div>
            </div>
          </div>
        )}

        <div className="play-pose-name">{pose?.name.ja}</div>
        <ol className="list list-numbered">
          {instructionItems.map((item, i) => (<li key={i}>{item}</li>))}
        </ol>

        <div className="play-controls">
          <button
            className="btn"
            onClick={() => {
              setFrameInitialElapsed(0);
              if (fi > 0) setFi(fi - 1);
              else if (si > 0) { const prev = seq.steps[si - 1]; setSi(si - 1); setFi(prev.frames.length - 1); }
            }}
          >
            {TEXT.back}
          </button>

          <div className="play-timer">
            <span className="muted">{TEXT.timeLabel}</span>
            <span className="time">{formattedTime}</span>
          </div>

          <button
            className="btn"
            onClick={() => {
              setFrameInitialElapsed(0);
              if (fi < step.frames.length - 1) setFi(fi + 1);
              else if (si < seq.steps.length - 1) { setSi(si + 1); setFi(0); }
              else handleFinish();
            }}
          >
            {TEXT.next}
          </button>
        </div>
      </div>
    </div>
  );
}
