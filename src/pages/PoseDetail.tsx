import React, { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPoseBlueprint } from "../data";
import type { LangText } from "../types";

const TEXT = {
  back: "\u8a2d\u5b9a\u30da\u30fc\u30b8\u306b\u623b\u308b",
  notFound: "\u30dd\u30fc\u30ba\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093",
  level: "\u30ec\u30d9\u30eb {level}",
  areas: "\u5bfe\u8c61\u90e8\u4f4d",
  cues: "\u30dd\u30a4\u30f3\u30c8",
};

function resolveText(text?: LangText): string {
  if (!text) return "";
  return text.ja ?? text.en ?? "";
}

export default function PoseDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const nav = useNavigate();

  const pose = useMemo(() => (slug ? getPoseBlueprint(slug) : undefined), [slug]);
  const poseName = pose ? resolveText(pose.name) || pose.slug : "";
  const heroImage = pose?.imageUrl || pose?.frames?.[0]?.imageUrl || "";
  const poseAreas = pose?.areas?.filter((area) => area?.trim().length) ?? [];
  const cueTexts = pose?.cues?.map(resolveText).filter(Boolean) ?? [];

  const handleBack = () => {
    nav("/settings");
  };

  if (!pose) {
    return (
      <div className="container row">
        <button type="button" className="btn" onClick={handleBack}>
          {TEXT.back}
        </button>
        <div className="card row">
          <div style={{ fontWeight: 700 }}>{TEXT.notFound}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container row">
      <button type="button" className="btn" onClick={handleBack}>
        {TEXT.back}
      </button>
      <div className="card row">
        <div style={{ fontWeight: 700, fontSize: 22 }}>{poseName}</div>
        <div className="thumb" style={{ margin: 0 }}>
          {heroImage ? (
            <img src={heroImage} alt={poseName} loading="lazy" />
          ) : (
            <span className="muted">{poseName}</span>
          )}
        </div>
        <div className="muted">
          {TEXT.level.replace("{level}", String(pose.level))}
        </div>
        {poseAreas.length > 0 && (
          <div className="pill-group">
            {poseAreas.map((area) => (
              <span key={area} className="pill" style={{ cursor: "default" }}>
                {area}
              </span>
            ))}
          </div>
        )}
        {cueTexts.length > 0 && (
          <div className="row" style={{ gap: 8 }}>
            <div style={{ fontWeight: 600 }}>{TEXT.cues}</div>
            <ul className="list">
              {cueTexts.map((text, idx) => (
                <li key={`${text}-${idx}`}>{text}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
