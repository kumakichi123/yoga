export type LangText = { ja: string; en?: string };

export type Pose = {
  slug: string;
  name: LangText;
  cues: LangText[];
  imageUrl?: string;
};

export type PoseBlueprint = Pose & {
  frames: Frame[];
};

export type Frame = {
  seconds: number;
  imageUrl: string;
  text: LangText;
};

export type Step = {
  poseSlug: string;
  frames: Frame[];
};

export type Sequence = {
  slug: string;
  title: LangText;
  durationSec: number;
  level: 1 | 2 | 3;
  steps: Step[];
  tags?: string[];
};

export type ChatMsg = {
  role: "user" | "assistant";
  text: string;
  at: string; // ISO8601
};

export type SessionLog = {
  at: string;
  sequenceSlug: string;
  durationSec: number;
};

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type Profile = {
  user_id: string;
  goal_per_week: number | null;
  tz?: string | null;
  display_name?: string | null;
  experience_level?: ExperienceLevel | null;
  subscription_status?: string | null;
  subscription_current_period_end?: string | null;
  subscription_provider?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

