import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve the product ID to use for n8n webhook calls.
 * Uses external_product_id if available, falls back to internal UUID.
 */
export async function resolveWebhookProductId(internalId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("products")
      .select("external_product_id")
      .eq("id", internalId)
      .single();
    return data?.external_product_id || internalId;
  } catch {
    return internalId;
  }
}
