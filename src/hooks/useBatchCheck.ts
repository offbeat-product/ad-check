import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { runSingleFileAiCheck } from "@/lib/run-single-file-ai-check";
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
    total: 0,
    current: 0,
    currentFileName: "",
    status: "idle",
    results: [],
  });

  const runBatchCheck = useCallback(
    async (
      files: ProjectFile[],
      product: Product,
      client: Client | null,
      projectId: string,
      onComplete?: () => void
    ) => {
      if (!user || files.length === 0) return;

      const targetFiles = files.filter((f) => f.file_data && !f.parent_file_id);
      if (targetFiles.length === 0) {
        toast({ title: "チェック対象のファイルがありません" });
        return;
      }

      const VIDEO_LIMITS: Record<string, number> = {
        vcon: 3,
        video_horizontal: 1,
        video_vertical: 1,
      };
      const processGroups = new Map<string, typeof targetFiles>();
      for (const f of targetFiles) {
        const key = f.process_type || "script";
        if (!processGroups.has(key)) processGroups.set(key, []);
        processGroups.get(key)!.push(f);
      }
      let limited = false;
      const limitedFiles: typeof targetFiles = [];
      for (const [key, group] of processGroups) {
        const limit = VIDEO_LIMITS[key];
        if (limit && group.length > limit) {
          limited = true;
          limitedFiles.push(...group.slice(0, limit));
        } else {
          limitedFiles.push(...group);
        }
      }
      const finalFiles = targetFiles.filter((f) => limitedFiles.includes(f));

      if (limited) {
        toast({
          title: "動画チェック件数制限",
          description: "Vコンは最大3件、横動画/縦動画は最大1件までです。制限内のファイルのみチェックします。",
        });
      }

      const MAX_BATCH = 5;
      if (finalFiles.length > MAX_BATCH) {
        toast({
          title: `一括チェックは最大${MAX_BATCH}件までです`,
          description: `先頭${MAX_BATCH}件をチェックします。`,
          variant: "destructive",
        });
      }
      const batchFiles = finalFiles.slice(0, MAX_BATCH);

      setProgress({ total: batchFiles.length, current: 0, currentFileName: "", status: "running", results: [] });

      const results: BatchCheckProgress["results"] = [];

      for (let i = 0; i < batchFiles.length; i++) {
        const file = batchFiles[i];
        setProgress((p) => ({ ...p, current: i + 1, currentFileName: file.file_name }));

        const r = await runSingleFileAiCheck({
          file,
          product,
          client,
          projectId,
          user: { id: user.id, email: user.email },
          claimUploaded: true,
        });

        if (r.skipped) {
          results.push({ fileId: file.id, fileName: file.file_name, success: false, error: "スキップ" });
        } else if (r.success) {
          results.push({
            fileId: file.id,
            fileName: file.file_name,
            success: true,
            grade: r.asyncAccepted ? "pending" : undefined,
          });
        } else {
          results.push({ fileId: file.id, fileName: file.file_name, success: false, error: r.error });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;
      setProgress((p) => ({ ...p, status: "done", results }));

      toast({
        title: `一括チェック完了`,
        description: `${successCount}件成功${failCount > 0 ? `、${failCount}件失敗` : ""}`,
        variant: failCount > 0 ? "destructive" : "default",
      });

      onComplete?.();
    },
    [user, toast]
  );

  const resetProgress = useCallback(() => {
    setProgress({ total: 0, current: 0, currentFileName: "", status: "idle", results: [] });
  }, []);

  return { progress, runBatchCheck, resetProgress };
}
