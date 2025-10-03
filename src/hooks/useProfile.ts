import { useCallback, useEffect, useState } from "react";
import type { Profile } from "../types";
import { fetchProfile } from "../store.remote";
import { useAuth } from "./useAuth";

export function useProfile() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProfile();
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("profile_fetch_failed"));
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    profile,
    loading: authLoading || loading,
    error,
    refresh,
  };
}
