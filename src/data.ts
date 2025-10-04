// src/data.ts
import { Frame, Pose, PoseBlueprint, Sequence, Step, LangText } from "./types";

type PoseLibrary = Record<string, PoseBlueprint>;

type SequenceStepInput =
  | string
  | {
      pose: string;
      frames?: Frame[];
    };

type SequenceDefinition = {
  slug: string;
  title: LangText;
  level: 1 | 2 | 3;
  tags?: string[];
  steps: SequenceStepInput[];
  durationSec?: number;
};

const poseLibrary: PoseLibrary = {
  breath: {
    slug: "breath",
    name: { ja: "呼吸調整" },
    cues: [{ ja: "鼻から吸う" }, { ja: "長く吐く" }],
    imageUrl: "https://via.placeholder.com/400x300?text=Breath",
    frames: [
      { seconds: 60, imageUrl: "/img/breath-1.png", text: { ja: "背筋を伸ばしながら鼻から吸う" } },
      { seconds: 60, imageUrl: "/img/breath-2.png", text: { ja: "肩の力を抜いてゆっくり吐く" } },
    ],
  },
  "cat-cow": {
    slug: "cat-cow",
    name: { ja: "キャット＆カウ" },
    cues: [{ ja: "丸める" }, { ja: "反らす" }],
    imageUrl: "https://via.placeholder.com/400x300?text=Cat-Cow",
    frames: [
      { seconds: 30, imageUrl: "/img/cat.png", text: { ja: "息を吐きながら背中を丸める" } },
      { seconds: 30, imageUrl: "/img/cow.png", text: { ja: "息を吸って胸を開く" } },
    ],
  },
  child: {
    slug: "child",
    name: { ja: "チャイルドポーズ" },
    cues: [{ ja: "腰を引く" }, { ja: "呼吸を深く" }],
    imageUrl: "https://via.placeholder.com/400x300?text=Child",
    frames: [
      { seconds: 60, imageUrl: "/img/child-1.png", text: { ja: "お尻をかかとに乗せ背中を広げる" } },
      { seconds: 60, imageUrl: "/img/child-2.png", text: { ja: "呼吸を深めながら力を抜く" } },
    ],
  },
};

function cloneFrames(frames: Frame[]): Frame[] {
  return frames.map((frame) => ({
    seconds: frame.seconds,
    imageUrl: frame.imageUrl,
    text: { ...frame.text },
  }));
}

function buildStep(step: SequenceStepInput): Step {
  const slug = typeof step === "string" ? step : step.pose;
  const blueprint = poseLibrary[slug];
  if (!blueprint) {
    throw new Error(`Unknown pose slug: ${slug}`);
  }
  const frames = typeof step === "string" || !step.frames ? blueprint.frames : step.frames;
  return {
    poseSlug: blueprint.slug,
    frames: cloneFrames(frames),
  };
}

function buildSequence(def: SequenceDefinition): Sequence {
  const steps = def.steps.map(buildStep);
  const totalSeconds = steps.reduce(
    (sum, step) => sum + step.frames.reduce((acc, frame) => acc + frame.seconds, 0),
    0,
  );
  return {
    slug: def.slug,
    title: def.title,
    level: def.level,
    tags: def.tags,
    steps,
    durationSec: def.durationSec ?? totalSeconds,
  };
}

export const poses: Pose[] = Object.values(poseLibrary).map(({ frames, ...pose }) => pose);

export const sequences: Sequence[] = [
  buildSequence({
    slug: "morning-3min",
    title: { ja: "朝の3分フロー" },
    level: 1,
    tags: ["morning"],
    steps: ["breath", "cat-cow"],
  }),
  buildSequence({
    slug: "refresh-5min",
    title: { ja: "リフレッシュ5分" },
    level: 1,
    tags: ["refresh"],
    steps: ["breath", "child", "cat-cow"],
  }),
];

