import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";

type UserRole = "admin" | "member" | "viewer";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: UserRole;
  roleLoading: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  canManageTeam: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>("viewer");
  const [roleLoading, setRoleLoading] = useState(true);
  const { toast } = useToast();

  const fetchRole = useCallback(async (userId: string) => {
    setRoleLoading(true);
    try {
      const { data } = await supabase.rpc("get_user_role", { _user_id: userId });
      if (data) setRole(data as UserRole);
    } catch (e) {
      console.warn("[Auth] Failed to fetch role:", e);
    } finally {
      setRoleLoading(false);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        // Defer to avoid Supabase deadlock
        setTimeout(() => fetchRole(session.user.id), 0);
      } else {
        setRole("viewer");
        setRoleLoading(false);
      }

      if (event === "TOKEN_REFRESHED" && !session) {
        toast({
          title: "セッションの有効期限が切れました",
          description: "再度ログインしてください",
          variant: "destructive",
        });
      }

      if (event === "SIGNED_OUT") {
        setUser(null);
        setSession(null);
        setRole("viewer");
      }
    });

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.warn("[Auth] Session recovery failed:", error.message);
        supabase.auth.signOut();
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        fetchRole(session.user.id);
      } else {
        setRoleLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [toast, fetchRole]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Update last_login_at (non-blocking — don't let DB issues block login)
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) {
        supabase.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", u.id)
          .then(({ error: e }) => { if (e) console.warn("[Auth] last_login_at update failed:", e.message); });
      }
    } catch (e) {
      console.warn("[Auth] Post-login profile update skipped:", e);
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) throw error;
  }, []);

  const isAdmin = role === "admin";
  const canEdit = role === "admin" || role === "member";
  const canManageTeam = role === "admin";

  return (
    <AuthContext.Provider value={{ user, session, loading, role, roleLoading, isAdmin, canEdit, canManageTeam, signIn, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
