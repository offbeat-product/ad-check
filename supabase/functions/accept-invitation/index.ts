/**
 * 招待受諾 Edge Function（本番 2026-05-19 デプロイ済み）。
 * リポジトリ正: 変更後は `supabase functions deploy accept-invitation` が必要（Vercel には含まれない）。
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type InvitationRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  display_name: string | null;
  invited_by: string | null;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string } | null> {
  const normalized = email.toLowerCase();

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profile?.id) return { id: profile.id };

  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (found) return { id: found.id };
    if (data.users.length < perPage) break;
    page++;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const displayName =
      typeof body.display_name === "string" ? body.display_name.trim() : "";

    if (!token || !password) {
      return jsonResponse({ ok: false, error: "token and password are required" }, 400);
    }

    if (password.length < 6) {
      return jsonResponse({ ok: false, error: "password must be at least 6 characters" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "Server configuration error" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: inv, error: invErr } = await admin
      .from("invitations")
      .select("id, email, role, status, expires_at, display_name, invited_by")
      .eq("token", token)
      .single();

    if (invErr || !inv) {
      return jsonResponse({ ok: false, error: "invalid token" }, 400);
    }

    const invitation = inv as InvitationRow;

    if (invitation.status !== "pending") {
      return jsonResponse({ ok: false, error: "expired or already accepted" }, 400);
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return jsonResponse({ ok: false, error: "expired or already accepted" }, 400);
    }

    const profileDisplayName =
      displayName ||
      invitation.display_name ||
      invitation.email.split("@")[0];

    const existing = await findAuthUserByEmail(admin, invitation.email);

    let userId: string;

    if (existing) {
      const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: { display_name: profileDisplayName },
      });
      if (error) {
        console.error("[accept-invitation] updateUserById", error);
        return jsonResponse({ ok: false, error: error.message }, 500);
      }
      userId = data.user.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: invitation.email,
        password,
        email_confirm: true,
        user_metadata: { display_name: profileDisplayName },
      });

      if (error) {
        const retryExisting = await findAuthUserByEmail(admin, invitation.email);
        if (retryExisting) {
          const { data: updated, error: updateErr } = await admin.auth.admin.updateUserById(
            retryExisting.id,
            {
              password,
              email_confirm: true,
              user_metadata: { display_name: profileDisplayName },
            },
          );
          if (updateErr) {
            console.error("[accept-invitation] updateUserById retry", updateErr);
            return jsonResponse({ ok: false, error: updateErr.message }, 500);
          }
          userId = updated.user.id;
        } else {
          console.error("[accept-invitation] createUser", error);
          return jsonResponse({ ok: false, error: error.message }, 500);
        }
      } else {
        userId = data.user.id;
      }
    }

    const { error: profileErr } = await admin.from("profiles").upsert(
      {
        id: userId,
        email: invitation.email,
        role: invitation.role,
        is_active: true,
        display_name: profileDisplayName,
        invited_by: invitation.invited_by,
        invited_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (profileErr) {
      console.error("[accept-invitation] profiles upsert", profileErr);
      return jsonResponse({ ok: false, error: profileErr.message }, 500);
    }

    const { error: wmErr } = await admin
      .from("workspace_members")
      .update({
        user_id: userId,
        status: "accepted",
        role: invitation.role,
      })
      .eq("email", invitation.email);

    if (wmErr) {
      console.error("[accept-invitation] workspace_members update", wmErr);
      return jsonResponse({ ok: false, error: wmErr.message }, 500);
    }

    const { error: invUpdateErr } = await admin
      .from("invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    if (invUpdateErr) {
      console.error("[accept-invitation] invitations update", invUpdateErr);
      return jsonResponse({ ok: false, error: invUpdateErr.message }, 500);
    }

    return jsonResponse({ ok: true, email: invitation.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[accept-invitation]", err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
