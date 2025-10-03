import type { Profile } from "../types";

export function isSubscriptionActive(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  const status = profile.subscription_status;
  if (!status) return false;
  if (status === "active" || status === "trialing") {
    if (!profile.subscription_current_period_end) return true;
    return new Date(profile.subscription_current_period_end).getTime() > Date.now();
  }
  return false;
}

export function formatSubscriptionPeriodEnd(profile: Profile | null | undefined) {
  if (!profile?.subscription_current_period_end) return null;
  const date = new Date(profile.subscription_current_period_end);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}
