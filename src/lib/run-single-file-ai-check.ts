import { supabase } from "@/integrations/supabase/client";
import { getWebhookUrl, webhookFetch, runScriptCheck, getRelatedProcessData, VIDEO_ASYNC_ACCEPTED } from "@/lib/webhook";
import { resolveWebhookProductId } from "@/lib/resolve-product-id";
import { gatherReferenceMaterials } from "@/lib/reference-materials";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import { tusUploadBlob } from "@/lib/tus-upload";
import type { CheckItem } from "@/lib/types";
import type { Json } from "@/integrations/supabase/types";
import type { ProjectFile, Product, Client } from "@/lib/db-types";

function dispatchWebhookInBackground(url: string, body: Record<string, unknown>) {
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error("[runSingleFileAiCheck] webhook dispatch failed:", err);
  });
}

function inferFileMimeType(fileNameOrUrl: string | null | undefined, fallback = "image/jpeg"): string {
  const clean = (fileNameOrUrl || "").split("?")[0]?.toLowerCase() || "";
  const ext = clean.split(".").pop();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "pdf":
      return "application/pdf";
    case "psd":
      return "image/vnd.adobe.photoshop";
    case "ai":
      return "application/pdf";
    default:
      return fallback;
  }
}

export interface RunSingleFileAiCheckUser {
  id: string;
  email?: string | null;
}

export interface RunSingleFileAiCheckParams {
  file: ProjectFile;
  product: Product;
  client: Client | null;
  projectId: string;
  user: RunSingleFileAiCheckUser;
  /** true: only start if status is uploaded (concurrent queue). false: force checking (manual batch). */
  claimUploaded: boolean;
}

export interface RunSingleFileAiCheckResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
  /** Video/audio accepted async; file stays checking until n8n completes */
  asyncAccepted?: boolean;
  /** 非同期完了待ち・結果参照用（sync 完了時も付与） */
  checkResultId?: string;
}

export async function runSingleFileAiCheck(
  params: RunSingleFileAiCheckParams
): Promise<RunSingleFileAiCheckResult> {
  const { file, product, client, projectId, user, claimUploaded } = params;

  if (!file.file_data || file.parent_file_id) {
    return { success: false, skipped: true };
  }

  const processKey = file.process_type || "script";
  if (!AI_CHECK_CONFIG[processKey]?.enabled) {
    return { success: false, skipped: true };
  }

  const checkingStartedAt = new Date().toISOString();

  if (claimUploaded) {
    const { data: claimed } = await supabase
      .from("project_files")
      .update({
        status: "checking",
        checking_by: user.id,
        checking_started_at: checkingStartedAt,
      } as Record<string, unknown>)
      .eq("id", file.id)
      .eq("status", "uploaded")
      .select("id");
    if (!claimed?.length) {
      return { success: false, skipped: true };
    }
  } else {
    const { error } = await supabase.from("project_files").update({
      status: "checking",
      checking_by: user.id,
      checking_started_at: checkingStartedAt,
    } as Record<string, unknown>).eq("id", file.id);
    if (error) {
      return { success: false, error: error.message };
    }
  }

  try {
    const aiCfg = AI_CHECK_CONFIG[processKey];
    const inputMode = aiCfg?.inputMode || "text";

    const refMaterials = await gatherReferenceMaterials(projectId, product.id, processKey);
    const referenceContext = JSON.stringify(refMaterials);

    let res: {
      overall_status: string;
      detected_case?: string;
      check_items: CheckItem[];
      ng_count: number;
      warning_count: number;
      ok_count: number;
      total_checks: number;
    };
    let inputData: Record<string, unknown> = {};

    if (inputMode === "text") {
      res = await runScriptCheck(product.id, file.file_data || "", processKey, referenceContext, projectId);
      inputData = { script_text: file.file_data };
    } else {
      const webhookUrl = getWebhookUrl(processKey);
      if (!webhookUrl) {
        throw new Error(`この工程(${processKey})のWebhookが見つかりません`);
      }

      const webhookProductId = await resolveWebhookProductId(product.id);
      const body: Record<string, unknown> = {
        product_id: webhookProductId,
        process_type: processKey,
        project_id: projectId,
        script_text: "",
        reference_context: refMaterials,
      };

      if (inputMode === "image") {
        const fileData = file.file_data || "";
        if (fileData.startsWith("data:")) {
          const mediaType = fileData.match(/^data:([^;]+);/)?.[1] || "image/jpeg";
          if (fileData.length < 20 * 1024 * 1024) {
            body.image_base64 = fileData;
          } else {
            const ext = mediaType.includes("png") ? "png" : "jpg";
            const storagePath = `${projectId}/${file.id}.${ext}`;
            const publicUrl = await tusUploadBlob("deliverables", storagePath, fileData, mediaType);
            body.image_url = publicUrl;
          }
          body.image_mime_type = mediaType;
        } else if (fileData.startsWith("http")) {
          body.image_url = fileData;
          body.image_mime_type = inferFileMimeType(file.file_name || fileData);
        }
        inputData = fileData.startsWith("http")
          ? { image_url: fileData }
          : { image_base64: file.file_data };
      } else if (inputMode === "audio") {
        const fileData = file.file_data || "";
        if (fileData.startsWith("data:")) {
          const mediaType = fileData.match(/^data:([^;]+);/)?.[1] || "audio/mpeg";
          if (fileData.length < 20 * 1024 * 1024) {
            body.audio_base64 = fileData;
          } else {
            const ext = mediaType.includes("wav") ? "wav" : mediaType.includes("m4a") ? "m4a" : "mp3";
            const storagePath = `${projectId}/${file.id}.${ext}`;
            const publicUrl = await tusUploadBlob("audios", storagePath, fileData, mediaType);
            body.audio_url = publicUrl;
          }
          body.audio_mime_type = mediaType;
        } else if (fileData.startsWith("http")) {
          body.audio_url = fileData;
          const urlExt = fileData.split(".").pop()?.split("?")[0]?.toLowerCase() || "mp3";
          body.audio_mime_type =
            urlExt === "wav" ? "audio/wav" : urlExt === "m4a" ? "audio/mp4" : urlExt === "ogg" ? "audio/ogg" : "audio/mpeg";
        }
        body.audio_url = body.audio_url || "";
        body.audio_mime_type = body.audio_mime_type || "";
        body.audio_base64 = body.audio_base64 || "";
        body.audio_description = "";
        body.metadata = { file_name: file.file_name, duration: null, format: body.audio_mime_type || null };
        body.script_text =
          file.file_data?.startsWith("data:") || file.file_data?.startsWith("http") ? "" : (file.file_data || "");
        inputData = { script_text: body.script_text, audio_url: body.audio_url, audio_base64: body.audio_base64 };
      } else if (inputMode === "video") {
        const fileData = file.file_data || "";
        if (fileData.startsWith("data:")) {
          const mediaType = fileData.match(/^data:([^;]+);/)?.[1] || "video/mp4";
          const ext = mediaType.includes("webm") ? "webm" : mediaType.includes("mov") ? "mov" : "mp4";
          const storagePath = `${projectId}/${file.id}.${ext}`;
          const publicUrl = await tusUploadBlob("videos", storagePath, fileData, mediaType);
          body.video_url = publicUrl;
          body.video_mime_type = mediaType;
        } else if (fileData.startsWith("http")) {
          body.video_url = fileData;
        }
      }

      const isFirstProcess = processKey === "script";
      if (!isFirstProcess) {
        const relatedFiles = await getRelatedProcessData(projectId, processKey, file.pattern_id);
        if (Object.keys(relatedFiles).length > 0) {
          body.related_files = relatedFiles;
        }
      }

      const isAsyncProcess = ["vcon", "video_horizontal", "video_vertical", "narration", "bgm"].includes(processKey);
      if (isAsyncProcess) {
        const { data: pendingCr } = await supabase
          .from("check_results")
          .insert([
            {
              user_id: user.id,
              client_name: client?.name || "",
              product_code: product.code,
              product_name: product.name,
              process_type: file.process_type,
              input_type: "text",
              input_text: (body.script_text as string) || null,
              status: "pending",
              input_data: inputData as unknown as Json,
            },
          ])
          .select("id")
          .single();
        if (pendingCr) {
          body.record_id = pendingCr.id;
        }

        // n8n responseMode(lastNode / immediately) に依存せず、DB polling で完了判定する。
        // webhook の失敗/タイムアウトはここでは失敗扱いにせず、polling 側(5分)で判定する。
        if (!body.record_id) {
          throw new Error("一括チェック用のrecord_id生成に失敗しました");
        }
        await supabase
          .from("project_files")
          .update({
            status: "checking",
            check_result_id: body.record_id as string,
            checking_by: user.id,
            checking_started_at: checkingStartedAt,
          } as Record<string, unknown>)
          .eq("id", file.id);

        dispatchWebhookInBackground(webhookUrl, body);

        return {
          success: true,
          asyncAccepted: true,
          checkResultId: body.record_id as string,
        };
      }

      const rawRes = await webhookFetch(webhookUrl, body);
      if (rawRes === VIDEO_ASYNC_ACCEPTED) {
        throw new Error("Unexpected async marker for non-async process");
      }
      res = rawRes as typeof res;
    }

    const { data: crData, error: insertErr } = await supabase
      .from("check_results")
      .insert([
        {
          user_id: user.id,
          client_name: client?.name || "",
          product_code: product.code,
          product_name: product.name,
          process_type: file.process_type,
          input_type: inputMode === "image" ? "image" : "text",
          input_text: inputMode === "image" ? null : file.file_data,
          overall_status: res.overall_status,
          detected_case: res.detected_case,
          ng_count: res.ng_count,
          warning_count: res.warning_count,
          ok_count: res.ok_count,
          total_checks: res.total_checks,
          check_items: res.check_items as unknown as Json,
          raw_response: res as unknown as Json,
          input_data: inputData as unknown as Json,
        },
      ])
      .select("id")
      .single();

    if (insertErr || !crData) {
      throw new Error("チェック結果の保存に失敗しました");
    }

    await supabase
      .from("project_files")
      .update({
        status: "checked",
        check_result_id: crData.id,
        checking_by: null,
        checking_started_at: null,
      } as Record<string, unknown>)
      .eq("id", file.id);

    return { success: true, checkResultId: crData.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    console.error(`[runSingleFileAiCheck] ${file.file_name}:`, err);
    await supabase
      .from("project_files")
      .update({
        status: "uploaded",
        check_result_id: null,
        checking_by: null,
        checking_started_at: null,
      } as Record<string, unknown>)
      .eq("id", file.id);
    return { success: false, error: message };
  }
}
