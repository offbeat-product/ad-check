import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  notify_check_complete: boolean;
  notify_comment: boolean;
  notify_invitation: boolean;
  created_at: string;
  updated_at: string;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setProfile(null); setLoading(false); return; }

    let cancelled = false;

    const ensureAndFetch = async (retryCount = 0) => {
      try {
        // Ensure profile exists
        await supabase.rpc("ensure_profile", {
          p_user_id: user.id,
          p_email: user.email || "",
        });

        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (!cancelled) {
          setProfile(data);
          setLoading(false);
        }
      } catch (e) {
        if (retryCount < 3 && !cancelled) {
          console.warn(`[Profile] Fetch failed (attempt ${retryCount + 1}), retrying...`, e);
          await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, retryCount), 8000)));
          return ensureAndFetch(retryCount + 1);
        }
        console.error("[Profile] Fetch failed after retries:", e);
        if (!cancelled) setLoading(false);
      }
    };

    ensureAndFetch();
    return () => { cancelled = true; };
  }, [user]);

  const updateProfile = async (updates: Partial<Pick<Profile, "display_name" | "avatar_url" | "notify_check_complete" | "notify_comment" | "notify_invitation">>) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select()
      .maybeSingle();
    if (!error && data) setProfile(data);
    return { error };
  };

  return { profile, loading, updateProfile };
}
