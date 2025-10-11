// src/data.ts
import { Frame, Pose, PoseBlueprint, Sequence, Step, LangText } from "./types";

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

const poseLibrary: PoseLibrary = {
  child: {
    slug: "child",
    name: { ja: "チャイルドポーズ" },
    cues: [{ja:"リラックスしてキープ"}],
    imageUrl: "/pose/child.png",
    frames: [{ seconds: 30, imageUrl: "/pose/child.png", text: { ja: "呼吸により背面が膨らむ感覚を意識する" } }],
    level: 1,
    areas: ["背中",],
    tags: ["リラックス"],
  },

  "cat-cow": {
    slug: "cat-cow",
    name: { ja: "キャット＆カウ" },
    cues: [{ ja: "息を吸いながら背中をそらす" }, { ja: "1,2を繰り返す" }],
    imageUrl: "/pose/cat-pose.png",
    frames: [{ seconds: 60, imageUrl: "/pose/cat-pose.png", text: { ja: "息を吐きながら背中を丸める" } }],
    level: 1,
    areas: ["背中",],
    tags: ["モビリティ"],
  },

  "down-dog": {
    slug: "down-dog",
    name: { ja: "ダウンドッグ" },
    cues: [{ja: "しんどい場合は膝を曲げる"},],
    imageUrl: "/pose/down-dog.jpg",
    frames: [{ seconds: 60, imageUrl: "/pose/down-dog.jpg", text: { ja: "全身で床を押す" } }],
    level: 2,
    areas: ["背中", "脚", "腹部"],
    tags: ["全身"],
  },

  "seated-side-bend": {
    slug: "seated-side-bend",
    name: { ja: "座位体側伸ばし" },
    cues: [],
    imageUrl: "/pose/seated-side-bend-right.jpg",
    frames: [
      { seconds: 30, imageUrl: "/pose/seated-side-bend-right.jpg", text: { ja: "右へ倒す" } },
      { seconds: 30, imageUrl: "/pose/seated-side-bend-left.jpg", text: { ja: "左へ倒す" } },
    ],
    level: 1,
    areas: ["肩",],
    tags: ["ストレッチ"],
  },

  "seated-twist": {
    slug: "seated-twist",
    name: { ja: "座位ねじり" },
    cues: [],
    imageUrl: "/pose/seated-twist-right.jpg",
    frames: [
      { seconds: 30, imageUrl: "/pose/seated-twist-right.jpg", text: { ja: "右へねじる" } },
      { seconds: 30, imageUrl: "/pose/seated-twist-left.jpg", text: { ja: "左へねじる" } },
    ],
    level: 1,
    areas: ["背中", "腰"],
    tags: ["ツイスト"],
  },

  "locust-easy": {
    slug: "locust-easy",
    name: { ja: "バッタ（やさしい）" },
    cues: [{ ja: "みぞおちからやさしく持ち上げる" }],
    imageUrl: "/pose/Grasshopper.png",
    frames: [{ seconds: 30, imageUrl: "/pose/Grasshopper.png", text: { ja: "肩すくめず首長く" } }],
    level: 2,
    areas: ["背中", "胸"],
    tags: ["後屈", "背筋強化"],
  },

  malasana: {
    slug: "malasana",
    name: { ja: "花輪のポーズ（マラーサナ）" },
    cues: [{ja: "自然な呼吸でキープ"}],
    imageUrl: "/pose/malasana.png",
    frames: [{ seconds: 30, imageUrl: "/pose/malasana.png", text: { ja: "かかとを床につけ、肘で足を外側に押し広げる" } }],
    level: 1,
    areas: ["股関節",],
    tags: ["ヒップオープナー"],
  },

  triangle: {
    slug: "triangle",
    name: { ja: "三角のポーズ（トリコナーサナ）" },
    cues: [{ja: "肩回りの伸びを感じよう！"}],
    imageUrl: "/pose/triangle_right.png",
    frames: [
      { seconds: 30, imageUrl: "/pose/triangle_right.png", text: { ja: "姿勢を保つ" } },
      { seconds: 30, imageUrl: "/pose/triangle_left.png", text: { ja: "姿勢を保つ" } },
    ],
    level: 2,
    areas: ["脚", "肩",],
    tags: ["ストレッチ"],
  },

  inaho: {
    slug: "inaho",
    name: { ja: "いなほのポーズ" },
    cues: [{ ja: "肩を落とし胸ひらく" },{ja: "自然呼吸でキープ"}],
    imageUrl: "/pose/inaho.png",
    frames: [{ seconds: 30, imageUrl: "/pose/inaho.png", text: { ja: "自然呼吸でキープ" } }],
    level: 1,
    areas: ["肩", "背中", "胸"],
    tags: ["チェアヨガ", "ストレッチ"],
  },

  "cow-face": {
    slug: "cow-face",
    name: { ja: "牛の顔のポーズ（腕）" },
    cues: [{ ja: "下の肘を体側へ寄せる" }],
    imageUrl: "/pose/cow_face_right.png",
    frames: [
      { seconds: 30, imageUrl: "/pose/cow_face_right.png", text: { ja: "右腕上・左腕下" } },
      { seconds: 30, imageUrl: "/pose/cow_face_left.png", text: { ja: "左腕上・右腕下" } },
    ],
    level: 2,
    areas: ["肩", "背中", "胸"],
    tags: ["ストレッチ", "左右あり"],
  },

  "reverse-prayer": {
    slug: "reverse-prayer",
    name: { ja: "リバース合掌のポーズ" },
    cues: [{ ja: "合掌は胸の真裏" }],
    imageUrl: "/pose/Hands_clasped.png",
    frames: [{ seconds: 30, imageUrl: "/pose/Hands_clasped.png", text: { ja: "肩力まず胸ひらく" } }],
    level: 2,
    areas: ["肩","背中"],
    tags: ["ストレッチ"],
  },

  tree: {
    slug: "tree",
    name: { ja: "木のポーズ（ヴリクシャーサナ）" },
    cues: [{ ja: "軸足で床を押す" },{ja: "難しい場合は足の位置を下げても大丈夫です"}],
    imageUrl: "/pose/tree_right_pose.png",
    frames: [
      { seconds: 30, imageUrl: "/pose/tree_right_pose.png", text: { ja: "右足軸 → 合掌" } },
      { seconds: 30, imageUrl: "/pose/tree_left_pose.png", text: { ja: "左足軸 → 合掌" } },
    ],
    level: 2,
    areas: ["脚", "股関節",],
    tags: ["バランス", "左右あり"],
  },

  cobra: {
    slug: "cobra",
    name: { ja: "コブラのポーズ（ブジャンガーサナ）" },
    cues: [{ ja: "肩を下げ首長く" }],
    imageUrl: "/pose/cobra.png",
    frames: [{ seconds: 30, imageUrl: "/pose/cobra.png", text: { ja: "恥骨で床を押す" } }],
    level: 1,
    areas: ["背中", "胸", "腰"],
    tags: ["後屈"],
  },

  frog: {
    slug: "frog",
    name: { ja: "カエルのポーズ（マンドゥカーサナ）" },
    cues: [{ja: "つま先はできれば内側に向けるようにしましょう"}],
    imageUrl: "/pose/frog.png",
    frames: [{ seconds: 30, imageUrl: "/pose/frog.png", text: { ja: "股関節をやさしく開きながら態勢を低くする" } }],
    level: 1,
    areas: ["股関節"],
    tags: ["ヒップオープナー"],
  },

  parivrtta_right: {
    slug: "parivrtta_right",
    name: { ja: "ねじったランジ（右）" },
    cues: [],
    imageUrl: "/pose/Parivrtta_right.jpg",
    frames: [
      { seconds: 30, imageUrl: "/pose/Parivrtta_right.jpg", text: { ja: "前脚側へねじる" } },
      { seconds: 30, imageUrl: "/pose/Parivrtta_left.jpg", text: { ja: "前脚側へねじる" } },
    ],
    level: 2,
    areas: ["背中", "脚"],
    tags: ["ツイスト", "スタンディング"],
  },

  sukhasana: {
    slug: "sukhasana",
    name: { ja: "安楽座（スカーサナ）" },
    cues: [{ja: "自然な呼吸でキープ"}],
    imageUrl: "/pose/Sukhasana.png",
    frames: [{ seconds: 30, imageUrl: "/pose/Sukhasana.png", text: { ja: "胡坐の姿勢になり、背筋を伸ばす" } }],
    level: 1,
    areas: ["股関節", "背中"],
    tags: ["座位", "リラックス"],
  },

  gate_pose_left: {
    slug: "gate_pose_left",
    name: { ja: "門のポーズ" },
    cues: [{ja: "脇腹が伸びる感覚があれば成功です！"}],
    imageUrl: "/pose/Gate_Pose_left.jpg",
    frames: [
      { seconds: 30, imageUrl: "/pose/Gate_Pose_left.jpg", text: { ja: "右膝を床につけ左手を床につける" } },
      { seconds: 30, imageUrl: "/pose/Gate_Pose_right.jpg", text: { ja: "左膝を床につけ右手を床につける" } },
    ],
    level: 1,
    areas: ["腹部", "股関節"],
    tags: ["ストレッチ", "左右あり"],
  },
};

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
