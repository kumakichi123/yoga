import { useEffect, useRef, useState } from "react";
export default function Timer({ seconds, onEnd }: { seconds: number; onEnd?: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.floor(seconds)));
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const tick = (t: number) => {
      const remain = Math.max(seconds - Math.floor((t - start) / 1000), 0);
      setLeft(remain); if (remain === 0) { onEnd?.(); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [seconds, onEnd]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return <div style={{ fontFamily: "ui-monospace", fontSize: 20 }}>{mm}:{ss}</div>;
}
