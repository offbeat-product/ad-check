import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COMMENT_ATTACHMENT_BUCKET = "comment-attachments";
const COMMENT_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
const SIGNED_URL_EXPIRY_SECONDS = 3600;

const ALLOWED_ATTACHMENT_MIME_PREFIXES = ["image/"];
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
]);

interface AttachmentInput {
  file_name: string;
  mime_type: string;
  size_bytes: number;
  base64: string;
}

interface ShareLinkRow {
  id: string;
  check_result_id: string;
  allow_comment_write: boolean | null;
  allow_comment_read: boolean | null;
  expires_at: string | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").slice(0, 120) || "attachment";
}

function isAllowedAttachmentMime(mimeType: string): boolean {
  const normalized = (mimeType || "application/octet-stream").toLowerCase();
  if (ALLOWED_ATTACHMENT_MIME_TYPES.has(normalized)) return true;
  return ALLOWED_ATTACHMENT_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function loadShareLink(
  supabase: SupabaseClient,
  shareToken: string,
): Promise<{ link: ShareLinkRow | null; error?: string; status?: number }> {
  const { data: link, error } = await supabase
    .from("share_links")
    .select("id, check_result_id, allow_comment_write, allow_comment_read, expires_at")
    .eq("token", shareToken)
    .single();

  if (error || !link) {
    return { link: null, error: "Invalid share token", status: 403 };
  }

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { link: null, error: "Share link expired", status: 403 };
  }

  return { link: link as ShareLinkRow };
}

async function collectCheckResultChainIds(
  supabase: SupabaseClient,
  rootCheckResultId: string,
): Promise<string[]> {
  const ids = new Set<string>([rootCheckResultId]);
  let frontier = [rootCheckResultId];

  while (frontier.length > 0) {
    const { data: children, error } = await supabase
      .from("check_results")
      .select("id")
      .in("parent_check_result_id", frontier);

    if (error) throw error;

    const next = (children ?? [])
      .map((row) => row.id as string)
      .filter((id) => !ids.has(id));

    next.forEach((id) => ids.add(id));
    frontier = next;
  }

  return [...ids];
}

async function assertCheckResultAllowed(
  supabase: SupabaseClient,
  shareToken: string,
  checkResultId: string,
): Promise<{ ok: true; allowedCheckResultIds: string[] } | { ok: false; error: string; status: number }> {
  const { link, error, status } = await loadShareLink(supabase, shareToken);
  if (!link) {
    return { ok: false, error: error ?? "Invalid share token", status: status ?? 403 };
  }

  const allowedCheckResultIds = await collectCheckResultChainIds(supabase, link.check_result_id);
  if (!allowedCheckResultIds.includes(checkResultId)) {
    return { ok: false, error: "Check result not accessible for this share token", status: 403 };
  }

  return { ok: true, allowedCheckResultIds };
}

async function uploadGuestAttachments(args: {
  supabase: SupabaseClient;
  commentId: string;
  guestToken: string;
  attachments: AttachmentInput[];
}): Promise<{ uploaded: number; failed: number; errors: string[] }> {
  const { supabase, commentId, guestToken, attachments } = args;
  let uploaded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const attachment of attachments) {
    try {
      const mimeType = attachment.mime_type || "application/octet-stream";
      const sizeBytes = Number(attachment.size_bytes ?? 0);

      if (!attachment.file_name || !attachment.base64) {
        throw new Error("Invalid attachment payload");
      }
      if (sizeBytes <= 0 || sizeBytes > COMMENT_ATTACHMENT_MAX_BYTES) {
        throw new Error(`${attachment.file_name} exceeds 15MB limit`);
      }
      if (!isAllowedAttachmentMime(mimeType)) {
        throw new Error(`${attachment.file_name} has unsupported MIME type`);
      }

      const bytes = base64ToBytes(attachment.base64.replace(/^data:[^;]+;base64,/, ""));
      if (bytes.length > COMMENT_ATTACHMENT_MAX_BYTES) {
        throw new Error(`${attachment.file_name} exceeds 15MB limit`);
      }

      const storagePath = `guest/${commentId}/${Date.now()}_${crypto.randomUUID()}_${safeFileName(attachment.file_name)}`;
      const { error: uploadError } = await supabase.storage
        .from(COMMENT_ATTACHMENT_BUCKET)
        .upload(storagePath, bytes, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("comment_attachments").insert({
        comment_id: commentId,
        storage_path: storagePath,
        file_name: attachment.file_name,
        file_type: mimeType,
        file_size_bytes: bytes.length,
        uploaded_by_type: "guest",
        uploaded_by_id: guestToken,
      });

      if (insertError) throw insertError;
      uploaded += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Attachment upload failed";
      errors.push(message);
      console.error("[shared-comments] attachment failed:", message);
    }
  }

  return { uploaded, failed, errors };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "create";
    const shareToken = typeof body.share_token === "string" ? body.share_token : "";

    if (!shareToken) {
      return jsonResponse({ error: "Missing share_token" }, 400);
    }

    if (action === "get_attachment_urls") {
      const commentIds = Array.isArray(body.comment_ids)
        ? body.comment_ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
        : [];

      const { link, error, status } = await loadShareLink(supabase, shareToken);
      if (!link) {
        return jsonResponse({ error: error ?? "Invalid share token" }, status ?? 403);
      }
      if (!link.allow_comment_read) {
        return jsonResponse({ error: "Comment read permission denied" }, 403);
      }

      if (commentIds.length === 0) {
        return jsonResponse([]);
      }

      const allowedCheckResultIds = await collectCheckResultChainIds(supabase, link.check_result_id);
      const { data: comments, error: commentsError } = await supabase
        .from("comments")
        .select("id, check_result_id")
        .in("id", commentIds);

      if (commentsError) throw commentsError;

      const allowedCommentIds = new Set(
        (comments ?? [])
          .filter((comment) => allowedCheckResultIds.includes(comment.check_result_id as string))
          .map((comment) => comment.id as string),
      );

      if (allowedCommentIds.size === 0) {
        return jsonResponse([]);
      }

      const { data: attachmentRows, error: attachmentError } = await supabase
        .from("comment_attachments")
        .select("id, comment_id, storage_path, file_name, file_type, file_size_bytes")
        .in("comment_id", [...allowedCommentIds]);

      if (attachmentError) throw attachmentError;

      const results = [];
      for (const row of attachmentRows ?? []) {
        const storagePath = row.storage_path as string;
        const { data: signed, error: signedError } = await supabase.storage
          .from(COMMENT_ATTACHMENT_BUCKET)
          .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);

        if (signedError) {
          console.error("[shared-comments] signed url failed:", storagePath, signedError.message);
          continue;
        }

        results.push({
          id: row.id,
          comment_id: row.comment_id,
          file_name: row.file_name,
          file_type: row.file_type,
          file_size_bytes: row.file_size_bytes,
          storage_path: storagePath,
          signed_url: signed.signedUrl,
        });
      }

      return jsonResponse(results);
    }

    if (action === "update") {
      const commentId = typeof body.comment_id === "string" ? body.comment_id : "";
      const guestToken = typeof body.guest_token === "string" ? body.guest_token : "";
      const content = typeof body.content === "string" ? body.content.trim() : "";

      if (!commentId || !guestToken || !content) {
        return jsonResponse({ error: "Missing comment_id, guest_token, or content" }, 400);
      }

      const { link, error, status } = await loadShareLink(supabase, shareToken);
      if (!link || !link.allow_comment_write) {
        return jsonResponse({ error: error ?? "Write permission denied" }, status ?? 403);
      }

      const allowedCheckResultIds = await collectCheckResultChainIds(supabase, link.check_result_id);
      const { data: comment, error: commentError } = await supabase
        .from("comments")
        .select("id, guest_token, check_result_id")
        .eq("id", commentId)
        .single();

      if (commentError || !comment) {
        return jsonResponse({ error: "Comment not found" }, 404);
      }
      if (!allowedCheckResultIds.includes(comment.check_result_id as string)) {
        return jsonResponse({ error: "Comment not accessible for this share token" }, 403);
      }
      if (comment.guest_token !== guestToken) {
        return jsonResponse({ error: "Only the original guest can edit this comment" }, 403);
      }

      const { error: updateError } = await supabase
        .from("comments")
        .update({ content })
        .eq("id", commentId);

      if (updateError) throw updateError;
      return jsonResponse({ ok: true });
    }

    if (action === "delete") {
      const commentId = typeof body.comment_id === "string" ? body.comment_id : "";
      const guestToken = typeof body.guest_token === "string" ? body.guest_token : "";

      if (!commentId || !guestToken) {
        return jsonResponse({ error: "Missing comment_id or guest_token" }, 400);
      }

      const { link, error, status } = await loadShareLink(supabase, shareToken);
      if (!link || !link.allow_comment_write) {
        return jsonResponse({ error: error ?? "Write permission denied" }, status ?? 403);
      }

      const allowedCheckResultIds = await collectCheckResultChainIds(supabase, link.check_result_id);
      const { data: comment, error: commentError } = await supabase
        .from("comments")
        .select("id, guest_token, check_result_id")
        .eq("id", commentId)
        .single();

      if (commentError || !comment) {
        return jsonResponse({ error: "Comment not found" }, 404);
      }
      if (!allowedCheckResultIds.includes(comment.check_result_id as string)) {
        return jsonResponse({ error: "Comment not accessible for this share token" }, 403);
      }
      if (comment.guest_token !== guestToken) {
        return jsonResponse({ error: "Only the original guest can delete this comment" }, 403);
      }

      const { data: attachmentRows } = await supabase
        .from("comment_attachments")
        .select("storage_path")
        .eq("comment_id", commentId);

      const storagePaths = (attachmentRows ?? [])
        .map((row) => row.storage_path as string)
        .filter(Boolean);

      if (storagePaths.length > 0) {
        const { error: removeError } = await supabase.storage
          .from(COMMENT_ATTACHMENT_BUCKET)
          .remove(storagePaths);
        if (removeError) {
          console.warn("[shared-comments] attachment cleanup failed:", removeError.message);
        }
      }

      const { error: deleteError } = await supabase.from("comments").delete().eq("id", commentId);
      if (deleteError) throw deleteError;
      return jsonResponse({ ok: true });
    }

    if (action !== "create") {
      return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
    }

    const {
      check_result_id,
      author_name,
      author_email,
      content,
      check_item_id,
      annotation_data,
      media_timestamp,
      parent_id,
      guest_token,
      attachments,
    } = body;

    if (!check_result_id || !author_name || !content) {
      return jsonResponse(
        { error: "Missing required fields: check_result_id, author_name, content" },
        400,
      );
    }

    const access = await assertCheckResultAllowed(supabase, shareToken, check_result_id);
    if (!access.ok) {
      return jsonResponse({ error: access.error }, access.status);
    }

    const { link } = await loadShareLink(supabase, shareToken);
    if (!link?.allow_comment_write) {
      return jsonResponse({ error: "Write permission denied or invalid share token" }, 403);
    }

    const { data: insertedComment, error: insertError } = await supabase
      .from("comments")
      .insert({
        check_result_id,
        check_item_id: check_item_id || null,
        author_name: `[共有] ${author_name}`,
        author_email: author_email || "shared@guest",
        content,
        status: "open",
        annotation_data: annotation_data || null,
        media_timestamp: media_timestamp ?? null,
        parent_id: parent_id || null,
        guest_token: typeof guest_token === "string" ? guest_token : null,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    const uploadAttachments = Array.isArray(attachments)
      ? attachments.filter((item: unknown): item is AttachmentInput => {
          if (!item || typeof item !== "object") return false;
          const row = item as Record<string, unknown>;
          return typeof row.file_name === "string" &&
            typeof row.mime_type === "string" &&
            typeof row.base64 === "string" &&
            row.size_bytes != null;
        })
      : [];

    let attachmentSummary = { uploaded: 0, failed: 0, errors: [] as string[] };
    if (uploadAttachments.length > 0) {
      if (typeof guest_token !== "string" || !guest_token) {
        return jsonResponse({ error: "guest_token is required when attachments are included" }, 400);
      }

      attachmentSummary = await uploadGuestAttachments({
        supabase,
        commentId: insertedComment.id,
        guestToken: guest_token,
        attachments: uploadAttachments,
      });
    }

    return jsonResponse({
      id: insertedComment.id,
      attachments_uploaded: attachmentSummary.uploaded,
      attachments_failed: attachmentSummary.failed,
      attachment_errors: attachmentSummary.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[shared-comments]", message);
    return jsonResponse({ error: message }, 500);
  }
});
