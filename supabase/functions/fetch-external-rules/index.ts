import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXTERNAL_SUPABASE_URL = "https://vhvgnslszruyztcoikqq.supabase.co/rest/v1/check_rules";
const EXTERNAL_SUPABASE_ANON = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodmduc2xzenJ1eXp0Y29pa3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NzkxNzksImV4cCI6MjA4NzQ1NTE3OX0.JChqETzSd1HJFuSBJNZ8xJy6lPENql_lprbTVLvTFeA";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { product_ids } = await req.json();

    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return new Response(JSON.stringify({ data: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch from external Supabase for each product_id
    let allRules: any[] = [];
    for (const pid of product_ids) {
      const res = await fetch(
        `${EXTERNAL_SUPABASE_URL}?product_id=eq.${encodeURIComponent(pid)}&select=*`,
        {
          headers: {
            apikey: EXTERNAL_SUPABASE_ANON,
            Authorization: `Bearer ${EXTERNAL_SUPABASE_ANON}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          allRules = allRules.concat(data);
          break; // Found rules, stop trying
        }
      }
    }

    return new Response(JSON.stringify({ data: allRules }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-external-rules error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
