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
  description?: LangText;
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
    description: def.description,
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
    slug: "sunrise-flow-3min",
    title: { ja: "サンライズフロー 3分" },
    description: { ja: "朝一番に体をゆっくり起こすライトな全身ルーティンです。" },
    level: 1,
    tags: ["3min", "morning"],
    steps: ["upward-salute", "cat-cow", "down-dog", "child"],
  }),
  buildSequence({
    slug: "desk-refresh-3min",
    title: { ja: "デスクリフレッシュ 3分" },
    description: { ja: "肩と背中をほぐして姿勢を整えるデスクワーク向けセット。" },
    level: 1,
    tags: ["3min", "desk"],
    steps: ["inaho", "reverse-prayer", "cow-face", "seated-side-bend"],
  }),
  buildSequence({
    slug: "hip-release-3min",
    title: { ja: "ヒップリリース 3分" },
    description: { ja: "股関節と腰まわりを緩めるショートリリースです。" },
    level: 1,
    tags: ["3min", "hips"],
    steps: ["malasana", "frog", "gas-release", "gate_pose_left"],
  }),
  buildSequence({
    slug: "twist-reset-3min",
    title: { ja: "ツイストリセット 3分" },
    description: { ja: "背骨を3ステップでねじり、内側から巡りを整えます。" },
    level: 1,
    tags: ["3min", "twist"],
    steps: ["seated-twist", "parivrtta_right", "tree"],
  }),
  buildSequence({
    slug: "standing-balance-3min",
    title: { ja: "スタンディングバランス 3分" },
    description: { ja: "立ちポーズでバランスと集中力を高めるショートフロー。" },
    level: 2,
    tags: ["3min", "standing"],
    steps: ["triangle", "crescent-moon", "cow", "camel", "half-forward-fold", "upward-salute"],
  }),
  buildSequence({
    slug: "core-focus-3min",
    title: { ja: "コアフォーカス 3分" },
    description: { ja: "体幹と前面をテンポよく刺激する6ステップ。" },
    level: 2,
    tags: ["3min", "core"],
    steps: ["dolphin-plank", "locust-easy", "cobra", "sukhasana", "inaho", "reverse-prayer"],
  }),
  buildSequence({
    slug: "calm-breath-3min",
    title: { ja: "カームブレス 3分" },
    description: { ja: "座位と軽い前屈で呼吸を深める静かなセット。" },
    level: 1,
    tags: ["3min", "calm"],
    steps: ["bridge", "half-forward-fold", "crescent-moon", "upward-salute", "inaho", "reverse-prayer", "child"],
  }),
];

// 5分コース（例: 2本）
const sequences5min: Sequence[] = [
  buildSequence({
    slug: "evening-relax-5min",
    title: { ja: "イブニングリラックス 5分" },
    description: { ja: "背面と呼吸をゆるめて一日の疲れを手放す夜向けフローです。" },
    level: 1,
    tags: ["5min", "evening"],
    steps: ["child", "cat-cow", "down-dog", "gas-release", "cobra", "sukhasana", "malasana"],
  }),
  buildSequence({
    slug: "standing-strength-5min",
    title: { ja: "スタンディングストレングス 5分" },
    description: { ja: "脚と体幹をまんべんなく使う立ちポーズのエネルギーフロー。" },
    level: 2,
    tags: ["5min", "standing"],
    steps: ["triangle", "tree", "dolphin-plank", "locust-easy", "camel", "cobra", "crescent-moon", "half-forward-fold", "cow"],
  }),
  buildSequence({
    slug: "core-align-5min",
    title: { ja: "コアアライン 5分" },
    description: { ja: "背骨を整えながら体幹を安定させる5分の調整フロー。" },
    level: 1,
    tags: ["5min", "core"],
    steps: ["seated-twist", "parivrtta_right", "gate_pose_left", "cow-face", "reverse-prayer", "inaho"],
  }),
  buildSequence({
    slug: "hip-mobility-5min",
    title: { ja: "ヒップモビリティ 5分" },
    description: { ja: "股関節と腰をじっくり開く動きで下半身の重さを解消します。" },
    level: 1,
    tags: ["5min", "hips"],
    steps: ["malasana", "frog", "gas-release", "crescent-moon", "cow", "child", "down-dog", "half-forward-fold", "upward-salute"],
  }),
];

// 10分コース（例: 1本フルボディ）
const sequences10min: Sequence[] = [
  buildSequence({
    slug: "full-body-refresh-10min",
    title: { ja: "フルボディリフレッシュ 10分" },
    description: { ja: "全身をまんべんなく動かして気分を切り替える10分の整えフロー。" },
    level: 1,
    tags: ["10min", "full"],
    steps: [
      "cat-cow",
      "down-dog",
      "seated-side-bend",
      "seated-twist",
      "cow-face",
      "triangle",
      "tree",
      "parivrtta_right",
      "gate_pose_left",
      "gas-release",
    ],
  }),
  buildSequence({
    slug: "strength-restore-10min",
    title: { ja: "ストレングスリストア 10分" },
    description: { ja: "体幹強化とリリースをバランス良く組み合わせた調整フローです。" },
    level: 2,
    tags: ["10min", "strength"],
    steps: [
      "down-dog",
      "triangle",
      "tree",
      "gate_pose_left",
      "dolphin-plank",
      "locust-easy",
      "camel",
      "cobra",
      "malasana",
      "frog",
      "child",
      "upward-salute",
      "bridge",
      "half-forward-fold",
      "crescent-moon",
      "cow",
      "bridge",
      "half-forward-fold",
    ],
  }),
];

export const sequences: Sequence[] = [
  ...sequences3min,
  ...sequences5min,
  ...sequences10min,
];






