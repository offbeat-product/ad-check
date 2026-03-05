import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const {
      share_token,
      check_result_id,
      author_name,
      author_email,
      content,
      check_item_id,
      annotation_data,
      media_timestamp,
      parent_id,
    } = body;

    if (!share_token || !check_result_id || !author_name || !content) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: share_token, check_result_id, author_name, content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate share link with write permission
    const { data: link, error: linkError } = await supabase
      .from("share_links")
      .select("id, allow_comment_write")
      .eq("token", share_token)
      .single();

    if (linkError || !link || !link.allow_comment_write) {
      return new Response(
        JSON.stringify({ error: "Write permission denied or invalid share token" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert comment using service role (bypasses RLS)
    const { data, error } = await supabase.from("comments").insert({
      check_result_id,
      check_item_id: check_item_id || null,
      author_name: `[共有] ${author_name}`,
      author_email: author_email || "shared@guest",
      content,
      status: "open",
      annotation_data: annotation_data || null,
      media_timestamp: media_timestamp ?? null,
      parent_id: parent_id || null,
    }).select("id").single();

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
