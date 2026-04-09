import { supabase } from "@/integrations/supabase/client";
import { getWebhookUrl, webhookFetch, runScriptCheck, getRelatedProcessData, VIDEO_ASYNC_ACCEPTED } from "@/lib/webhook";
import { resolveWebhookProductId } from "@/lib/resolve-product-id";
import { gatherReferenceMaterials } from "@/lib/reference-materials";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import { tusUploadBlob } from "@/lib/tus-upload";
import type { CheckItem } from "@/lib/types";
import type { Json } from "@/integrations/supabase/types";
import type { ProjectFile, Product, Client } from "@/lib/db-types";

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

  if (claimUploaded) {
    const { data: claimed } = await supabase
      .from("project_files")
      .update({ status: "checking" })
      .eq("id", file.id)
      .eq("status", "uploaded")
      .select("id");
    if (!claimed?.length) {
      return { success: false, skipped: true };
    }
  } else {
    const { error } = await supabase.from("project_files").update({ status: "checking" }).eq("id", file.id);
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
        }
        inputData = { image_base64: file.file_data };
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
      }

      const rawRes = await webhookFetch(webhookUrl, body);
      if (rawRes === VIDEO_ASYNC_ACCEPTED) {
        if (body.record_id) {
          await supabase
            .from("project_files")
            .update({
              status: "checking",
              check_result_id: body.record_id as string,
            })
            .eq("id", file.id);
        }
        return {
          success: true,
          asyncAccepted: true,
          checkResultId: (body.record_id as string) || undefined,
        };
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
      })
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
