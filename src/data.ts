// src/data.ts
import { Frame, Pose, PoseBlueprint, Sequence, Step, LangText } from "./types";
import { poseLibrary as poseLibrarySource } from "../data/poses.js";

type PoseLibrary = Record<string, PoseBlueprint>;
type SequenceStepInput =
  | string
  | { pose: string; frames?: Frame[] };

type SequenceDefinition = {
  slug: string;
  title: LangText;
  level: 1 | 2 | 3;
  tags?: string[];
  steps: SequenceStepInput[];
  thumbnailUrl?: string;
  durationSec?: number;
  bgm?: string;
};

const poseLibrary: PoseLibrary = poseLibrarySource;

function cloneFrames(frames: Frame[]): Frame[] {
  return frames.map((f) => ({ seconds: f.seconds, imageUrl: f.imageUrl, text: { ...f.text } }));
}

function buildStep(step: SequenceStepInput): Step {
  const slug = typeof step === "string" ? step : step.pose;
  const blueprint = poseLibrary[slug];
  if (!blueprint) throw new Error(`Unknown pose slug: ${slug}`);
  const frames = typeof step === "string" || !step.frames ? blueprint.frames : step.frames;
  return { poseSlug: blueprint.slug, frames: cloneFrames(frames) };
}

function buildSequence(def: SequenceDefinition): Sequence {
  const steps = def.steps.map(buildStep);
  const totalSeconds = steps.reduce(
    (sum, s) => sum + s.frames.reduce((acc, fr) => acc + fr.seconds, 0),
    0
  );
  return {
    slug: def.slug,
    title: def.title,
    thumbnailUrl: def.thumbnailUrl,
    level: def.level,
    tags: def.tags,
    steps,
    durationSec: def.durationSec ?? totalSeconds,
    bgm: def.bgm,
  };
}

export const poses: Pose[] = Object.values(poseLibrary).map(({ frames, ...pose }) => pose);

export function getPoseBlueprint(slug: string): PoseBlueprint | undefined {
  return poseLibrary[slug];
}

// ===== Sequences =====
// 3分コース（例: 2本）
const sequences3min: Sequence[] = [
  buildSequence({
    slug: "quick-mobility-3min",
    title: { ja: "クイック・モビリティ 3分" },
    thumbnailUrl: "/pose/cat-pose.png",
    level: 1,
    tags: ["3min", "morning", "mobility"],
    bgm: "Night_Show_Case.mp3",
    steps: [
      "cat-cow", // 60
      "down-dog", // 60
      "child", // 30
      {
        pose: "seated-twist", // 30（片側のみ）
        frames: [{ seconds: 30, imageUrl: "/pose/seated-twist-right.jpg", text: { ja: "右へねじる" } }],
      },
    ],
  }),
  buildSequence({
    slug: "chair-stretch-3min",
    title: { ja: "チェア・ストレッチ 3分" },
    thumbnailUrl: "/pose/inaho.png",
    level: 1,
    tags: ["3min", "chair", "desk"],
    bgm: "新緑の丘.mp3",
    steps: [
      { pose: "inaho", frames: [{ seconds: 30, imageUrl: "/pose/inaho.png", text: { ja: "" } }] },
      { pose: "reverse-prayer", frames: [{ seconds: 30, imageUrl: "/pose/Hands_clasped.png", text: { ja: "" } }] },
      "cow-face",                 // 60
      "seated-side-bend",         // 60（左右で計60）
    ],
  }),
  buildSequence({
    slug: "shoulder-care-3min",
    title: { ja: "肩まわりケア 3分" },
    thumbnailUrl: "/pose/triangle_right.png",
    level: 1,
    tags: ["3min", "desk"],
    bgm: "朝の訪れ.mp3",
    steps: [
      "triangle", // 30
      "cow-face", // 60
      "seated-side-bend", // 60
    ],
  }),
  
  
];

// 5分コース（例: 2本）
const sequences5min: Sequence[] = [
  buildSequence({
    slug: "full-relax-5min",
    title: { ja: "全身リラックス 5分" },
    thumbnailUrl: "/pose/child.png",
    level: 1,
    tags: ["5min", "morning"],
    bgm: "朝の訪れ.mp3",
    durationSec: 300,
    steps: [
      "child",       // 30s
      "cat-cow",     // 60s
      "down-dog",    // 60s
      "triangle",    // 60s (左右合わせ)
      "malasana",    // 30s
      "cobra",       // 30s
      "sukhasana",   // 30s
    ],
  }),
  buildSequence({
    slug: "hip-open-5min",
    title: { ja: "ヒップオープン 5分" },
    thumbnailUrl: "/pose/triangle_right.png",
    level: 1,
    tags: ["5min", "hips"],
    bgm: "Night_Show_Case.mp3",
    steps: [
      "triangle", // 60
      {
        pose: "sukhasana",
        frames: [{ seconds: 60, imageUrl: "/pose/Sukhasana.png", text: { ja: "座って整える" } }],
      },
      {
        pose: "malasana",
        frames: [{ seconds: 60, imageUrl: "/pose/malasana.png", text: { ja: "自然な呼吸でキープ" } }],
      },
      {
        pose: "frog",
        frames: [{ seconds: 60, imageUrl: "/pose/frog.png", text: { ja: "股関節をやさしく開く" } }],
      },
      "gate_pose_left", // 60
    ],
  }),
  buildSequence({
    slug: "backbend-core-5min",
    title: { ja: "やさしい後屈・背筋 5分" },
    thumbnailUrl: "/pose/Grasshopper.png",
    level: 1,
    tags: ["5min", "backbend"],
    bgm: "新緑の丘.mp3",
    steps: [
      "locust-easy", // 30
      {
        pose: "cobra",
        frames: [{ seconds: 60, imageUrl: "/pose/cobra.png", text: { ja: "肩を下げ首長く" } }],
      },
      "down-dog", // 60
      "tree", // 60
      "reverse-prayer", // 30
      "child", // 30
    ],
  }),
];

// 10分コース（例: 1本フルボディ）
const sequences10min: Sequence[] = [
  buildSequence({
    slug: "full-body-10min",
    title: { ja: "フルボディ 10分" },
    thumbnailUrl: "/pose/Sukhasana.png",
    level: 1,
    tags: ["10min", "full"],
    bgm: "朝の訪れ.mp3",
    steps: [
      "sukhasana", // 30
      "cat-cow", // 60
      "seated-side-bend", // 60
      "seated-twist", // 60（左右で60）
      "down-dog", // 60
      "triangle", // 60
      "parivrtta_right", // 60（左右で60）
      "tree", // 60
      {
        pose: "cobra",
        frames: [{ seconds: 60, imageUrl: "/pose/cobra.png", text: { ja: "胸をひらく" } }],
      },
      {
        pose: "child",
        frames: [{ seconds: 60, imageUrl: "/pose/child.png", text: { ja: "クールダウン" } }],
      },
      // 合計 570秒 → 調整で+30秒
      {
        pose: "locust-easy",
        frames: [{ seconds: 30, imageUrl: "/pose/Grasshopper.png", text: { ja: "優しく背筋活性" } }],
      },
    ],
  }),
];

export const sequences: Sequence[] = [
  ...sequences3min,
  ...sequences5min,
  ...sequences10min,
];
