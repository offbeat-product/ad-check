import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getWebhookUrl, webhookFetch, runScriptCheck, getRelatedProcessData, VIDEO_ASYNC_ACCEPTED } from "@/lib/webhook";
import { gatherReferenceMaterials } from "@/lib/reference-materials";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { tusUploadBlob } from "@/lib/tus-upload";
import type { CheckItem } from "@/lib/types";
import type { Json } from "@/integrations/supabase/types";
import type { ProjectFile, Product, Client } from "@/lib/db-types";

export interface BatchCheckProgress {
  total: number;
  current: number;
  currentFileName: string;
  status: "idle" | "running" | "done" | "error";
  results: { fileId: string; fileName: string; success: boolean; grade?: string; error?: string }[];
}

export function useBatchCheck() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [progress, setProgress] = useState<BatchCheckProgress>({
    total: 0, current: 0, currentFileName: "", status: "idle", results: [],
  });

  const runBatchCheck = useCallback(async (
    files: ProjectFile[],
    product: Product,
    client: Client | null,
    projectId: string,
    onComplete?: () => void,
  ) => {
    if (!user || files.length === 0) return;

    // Use files as-is — caller already filters for selection/unchecked
    const targetFiles = files.filter(f => f.file_data && !f.parent_file_id);
    if (targetFiles.length === 0) {
      toast({ title: "チェック対象のファイルがありません" });
      return;
    }

    // Enforce max 5 files per batch
    const MAX_BATCH = 5;
    if (targetFiles.length > MAX_BATCH) {
      toast({ title: `一括チェックは最大${MAX_BATCH}件までです`, description: `${targetFiles.length}件選択されています。${MAX_BATCH}件以下に絞ってください。`, variant: "destructive" });
      return;
    }

    setProgress({ total: targetFiles.length, current: 0, currentFileName: "", status: "running", results: [] });

    const results: BatchCheckProgress["results"] = [];

    for (let i = 0; i < targetFiles.length; i++) {
      const file = targetFiles[i];
      setProgress(p => ({ ...p, current: i + 1, currentFileName: file.file_name }));

      try {
        const processKey = file.process_type || "script";
        const aiCfg = AI_CHECK_CONFIG[processKey];
        const inputMode = aiCfg?.inputMode || "text";

        const refMaterials = await gatherReferenceMaterials(projectId, product.id, processKey);
        const referenceContext = JSON.stringify(refMaterials);

        let res: { overall_status: string; detected_case?: string; check_items: CheckItem[]; ng_count: number; warning_count: number; ok_count: number; total_checks: number };
        let inputData: Record<string, any> = {};

        if (inputMode === "text") {
          res = await runScriptCheck(product.id, file.file_data || "", processKey, referenceContext);
          inputData = { script_text: file.file_data };
        } else {
          const webhookUrl = getWebhookUrl(processKey);
          if (!webhookUrl) throw new Error(`この工程(${processKey})のWebhookが見つかりません`);

          const body: Record<string, any> = {
            product_id: product.id,
            process_type: processKey,
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
              const urlExt = fileData.split('.').pop()?.split('?')[0]?.toLowerCase() || "mp3";
              body.audio_mime_type = urlExt === "wav" ? "audio/wav" : urlExt === "m4a" ? "audio/mp4" : urlExt === "ogg" ? "audio/ogg" : "audio/mpeg";
            }
            body.script_text = file.file_data?.startsWith("data:") || file.file_data?.startsWith("http") ? "" : (file.file_data || "");
            inputData = { script_text: body.script_text, audio_url: body.audio_url || "" };
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
            body.script_text = file.file_data?.startsWith("data:") ? "" : (file.file_data || "");
            inputData = { script_text: body.script_text, video_url: body.video_url || "" };

            // Related files for video and audio processes
            // Include related files (all prior process FIX data) for cross-reference
            const isFirstProcess = processKey === "script";
            if (!isFirstProcess) {
              const relatedFiles = await getRelatedProcessData(projectId, processKey, file.pattern_id);
              if (Object.keys(relatedFiles).length > 0) {
                body.related_files = relatedFiles;
              }
            }
          }

          // For video async, insert pending record first so n8n can UPDATE it
          const isVideoProcess = ["vcon", "video_horizontal", "video_vertical"].includes(processKey);
          if (isVideoProcess) {
            const { data: pendingCr } = await supabase.from("check_results").insert([{
              user_id: user.id,
              client_name: client?.name || "",
              product_code: product.code,
              product_name: product.name,
              process_type: file.process_type,
              input_type: "text",
              input_text: body.script_text || null,
              status: "pending",
              input_data: inputData as unknown as Json,
            }]).select("id").single();
            if (pendingCr) {
              body.record_id = pendingCr.id;
              console.log("[BatchCheck] Created pending record:", pendingCr.id);
            }
          }

          const rawRes = await webhookFetch(webhookUrl, body);
          if (rawRes === VIDEO_ASYNC_ACCEPTED) {
            // Video async — n8n will update the pending record
            console.log("[BatchCheck] Video check accepted asynchronously");
            continue;
          }
          res = rawRes as { overall_status: string; detected_case?: string; check_items: CheckItem[]; ng_count: number; warning_count: number; ok_count: number; total_checks: number };
        }

        // Save check result
        const { data: crData, error: insertErr } = await supabase.from("check_results").insert([{
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
        }]).select("id").single();

        if (insertErr || !crData) throw new Error("チェック結果の保存に失敗しました");

        // Update file status
        await supabase.from("project_files").update({
          status: "checked",
          check_result_id: crData.id,
        }).eq("id", file.id);

        results.push({ fileId: file.id, fileName: file.file_name, success: true, grade: res.overall_status });
      } catch (err) {
        const message = err instanceof Error ? err.message : "不明なエラー";
        console.error(`[BatchCheck] ${file.file_name} failed:`, err);
        results.push({ fileId: file.id, fileName: file.file_name, success: false, error: message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    setProgress(p => ({ ...p, status: "done", results }));

    toast({
      title: `一括チェック完了`,
      description: `${successCount}件成功${failCount > 0 ? `、${failCount}件失敗` : ""}`,
      variant: failCount > 0 ? "destructive" : "default",
    });

    onComplete?.();
  }, [user, toast]);

  const resetProgress = useCallback(() => {
    setProgress({ total: 0, current: 0, currentFileName: "", status: "idle", results: [] });
  }, []);

  return { progress, runBatchCheck, resetProgress };
}
