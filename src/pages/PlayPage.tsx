import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { sequences, poses } from "../data";
import type { Frame, Sequence, Pose } from "../types";
import { insertSession } from "../store.remote";

const TEXT = {
  notFound: "\u30E1\u30CB\u30E5\u30FC\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093",
  back: "\u623B\u308B",
  finish: "\u7D42\u4E86",
  nextPose: "\u6B21\u306E\u30DD\u30FC\u30BA",
  seconds: "\u79D2",
  next: "\u6B21\u3078",
} as const;

type NextFrameInfo = {
  frame: Frame;
  pose?: Pose;
};

function useTicker(seconds: number, onEnd: () => void, resetKey: React.Key) {
  const [left, setLeft] = useState(seconds);
  const raf = useRef<number | null>(null);
  const start = useRef(0);
  const endRef = useRef(onEnd);

  useEffect(() => {
    endRef.current = onEnd;
  }, [onEnd]);

  useEffect(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    setLeft(seconds);
    start.current = performance.now();

    const tick = (t: number) => {
      const remaining = Math.max(seconds - Math.floor((t - start.current) / 1000), 0);
      setLeft(remaining);
      if (remaining === 0) {
        endRef.current();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [seconds, resetKey]);

  return left;
}

export default function PlayPage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const seq = useMemo<Sequence | undefined>(() => sequences.find((s) => s.slug === slug), [slug]);
  const poseMap = useMemo(() => new Map(poses.map((p) => [p.slug, p])), []);
  const [si, setSi] = useState(0);
  const [fi, setFi] = useState(0);
  const savedRef = useRef(false);

  useEffect(() => {
    if (!seq) return;
    const urls = seq.steps.flatMap((s) => s.frames.map((f) => f.imageUrl));
    urls.forEach((u) => {
      const img = new Image();
      img.src = u;
    });
  }, [seq?.slug]);

  if (!seq) {
    return (
      <div className="container">
        {TEXT.notFound}
        <button className="btn" onClick={() => nav("/")}>
          {TEXT.back}
        </button>
      </div>
    );
  }

  const step = seq.steps[si];
  const frame: Frame = step.frames[fi];
  const pose = poseMap.get(step.poseSlug);

  const handleEnd = useCallback(() => {
    setFi((fiPrev) => {
      const stepNow = seq.steps[si];
      if (fiPrev < stepNow.frames.length - 1) return fiPrev + 1;
      setSi((siPrev) => {
        if (siPrev < seq.steps.length - 1) {
          setFi(0);
          return siPrev + 1;
        }
        if (!savedRef.current) {
          savedRef.current = true;
          insertSession(seq.slug, seq.durationSec).catch(() => {});
          setTimeout(() => nav(-1), 300);
        }
        return siPrev;
      });
      return fiPrev;
    });
  }, [nav, seq.slug, seq.durationSec, seq.steps, si]);

  const resetKey = `${si}-${fi}-${frame.imageUrl}`;
  const left = useTicker(frame.seconds, handleEnd, resetKey);

  const instructionItems = useMemo(() => {
    const items: string[] = [];
    if (frame.text?.ja) items.push(frame.text.ja);
    if (pose?.cues?.length) {
      pose.cues.forEach((cue) => {
        if (cue.ja) items.push(cue.ja);
      });
    }
    return items;
  }, [frame, pose]);

  const nextFrameInfo = useMemo<NextFrameInfo | null>(() => {
    if (fi < step.frames.length - 1) {
      return { frame: step.frames[fi + 1], pose };
    }
    if (si < seq.steps.length - 1) {
      const nextStep = seq.steps[si + 1];
      const nextFrame = nextStep.frames[0];
      if (!nextFrame) return null;
      const nextPose = poseMap.get(nextStep.poseSlug);
      return { frame: nextFrame, pose: nextPose };
    }
    return null;
  }, [fi, pose, poseMap, seq.steps, si, step.frames]);

  const elapsed =
    seq.steps
      .slice(0, si)
      .reduce(
        (total, s) => total + s.frames.reduce((sum, f) => sum + f.seconds, 0),
        0,
      ) +
    step.frames.slice(0, fi).reduce((acc, f) => acc + f.seconds, 0) +
    (frame.seconds - left);
  const pct = Math.min(100, Math.round((100 * elapsed) / seq.durationSec));
  const showNextPreview = left <= 5 && !!nextFrameInfo;
  const nextPoseName = nextFrameInfo?.pose?.name.ja ?? TEXT.nextPose;

  return (
    <div className="container row">
      <div className="card row play-card">
        <div className="play-header">
          <div>{seq.title.ja}</div>
          <button className="btn" onClick={() => nav(-1)}>
            {TEXT.finish}
          </button>
        </div>
        <div className="bar play-progress">
          <i style={{ width: `${pct}%` }} />
        </div>

        <div className="thumb play-thumb">
          <img src={frame.imageUrl} alt={pose?.name.ja} />
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
          {instructionItems.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>

        <div className="play-controls">
          <button
            className="btn"
            onClick={() => {
              if (fi > 0) setFi(fi - 1);
              else if (si > 0) {
                const prev = seq.steps[si - 1];
                setSi(si - 1);
                setFi(prev.frames.length - 1);
              }
            }}
          >
            {TEXT.back}
          </button>
          <div className="play-timer">
            {`${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`}
          </div>
          <button
            className="btn"
            onClick={() => {
              if (fi < step.frames.length - 1) setFi(fi + 1);
              else if (si < seq.steps.length - 1) {
                setSi(si + 1);
                setFi(0);
              } else if (!savedRef.current) {
                savedRef.current = true;
                insertSession(seq.slug, seq.durationSec).catch(() => {});
                setTimeout(() => nav(-1), 300);
              }
            }}
          >
            {TEXT.next}
          </button>
        </div>
      </div>
    </div>
  );
}
