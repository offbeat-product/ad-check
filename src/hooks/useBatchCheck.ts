import { useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { runSingleFileAiCheck } from "@/lib/run-single-file-ai-check";
import { waitForAiCheckCompletion } from "@/lib/wait-for-ai-check-completion";
import { mapBulkToBatchProgress } from "@/lib/bulk-sequential-check-map";
import type { BulkSequentialProgressState } from "@/lib/bulk-sequential-check-types";
import type { BatchCheckProgress } from "@/lib/bulk-sequential-check-types";
import type { ProjectFile, Product, Client } from "@/lib/db-types";
import { useAutoCheck } from "@/providers/AutoCheckProvider";

export type { BatchCheckProgress } from "@/lib/bulk-sequential-check-types";

export function useBatchCheck() {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    bulkSequentialProgress,
    setBulkSequentialProgress,
    registerBulkAbort,
    clearBulkSequentialProgress,
  } = useAutoCheck();

  const progress = useMemo(
    () => mapBulkToBatchProgress(bulkSequentialProgress),
    [bulkSequentialProgress]
  );

  const runBatchCheck = useCallback(
    async (
      files: ProjectFile[],
      product: Product,
      client: Client | null,
      projectId: string,
      meta: { projectName: string; processLabel: string; processType: string },
      onComplete?: () => void
    ) => {
      if (!user) return;

      const targetFiles = files.filter(
        (f) =>
          f.file_data &&
          !f.parent_file_id &&
          f.status === "uploaded" &&
          f.project_id === projectId &&
          (f.process_type || "script") === meta.processType
      );
      if (targetFiles.length === 0) {
        toast({
          title: "チェック対象がありません",
          description: "未チェック（アップロード済み）のファイルのみ一括実行できます。",
        });
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
          description:
            "Vコンは最大3件、横動画/縦動画は最大1件までです。制限内のファイルのみチェックします。",
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

      const ac = new AbortController();
      registerBulkAbort(ac);

      const initial: BulkSequentialProgressState = {
        status: "running",
        projectId,
        projectName: meta.projectName,
        processLabel: meta.processLabel,
        completed: 0,
        total: batchFiles.length,
        currentFileId: null,
        currentFileName: null,
        waitingN8n: false,
        results: [],
      };
      setBulkSequentialProgress(initial);

      const results: BatchCheckProgress["results"] = [];

      try {
        for (let i = 0; i < batchFiles.length; i++) {
          if (ac.signal.aborted) break;

          const file = batchFiles[i];
          setBulkSequentialProgress((p) =>
            p
              ? {
                  ...p,
                  currentFileId: file.id,
                  currentFileName: file.file_name,
                  waitingN8n: false,
                  completed: i,
                }
              : p
          );

          const r = await runSingleFileAiCheck({
            file,
            product,
            client,
            projectId,
            user: { id: user.id, email: user.email },
            claimUploaded: true,
          });

          if (ac.signal.aborted) break;

          if (r.skipped) {
            results.push({
              fileId: file.id,
              fileName: file.file_name,
              success: false,
              error: "スキップ",
            });
          } else if (r.success) {
            if (r.asyncAccepted && r.checkResultId) {
              setBulkSequentialProgress((p) => (p ? { ...p, waitingN8n: true } : p));
              const outcome = await waitForAiCheckCompletion({
                fileId: file.id,
                checkResultId: r.checkResultId,
                signal: ac.signal,
              });
              setBulkSequentialProgress((p) => (p ? { ...p, waitingN8n: false } : p));

              if (outcome === "cancelled") break;
              if (outcome === "timeout" || outcome === "failed") {
                results.push({
                  fileId: file.id,
                  fileName: file.file_name,
                  success: false,
                  error: outcome === "timeout" ? "タイムアウト（5分）" : "チェック失敗",
                });
              } else {
                results.push({
                  fileId: file.id,
                  fileName: file.file_name,
                  success: true,
                });
              }
            } else if (r.asyncAccepted && !r.checkResultId) {
              results.push({
                fileId: file.id,
                fileName: file.file_name,
                success: false,
                error: "結果IDがありません",
              });
            } else {
              results.push({
                fileId: file.id,
                fileName: file.file_name,
                success: true,
              });
            }
          } else {
            results.push({
              fileId: file.id,
              fileName: file.file_name,
              success: false,
              error: r.error,
            });
          }

          setBulkSequentialProgress((p) =>
            p
              ? {
                  ...p,
                  completed: i + 1,
                  results: [...results],
                }
              : p
          );
        }
      } finally {
        registerBulkAbort(null);
      }

      if (ac.signal.aborted) {
        setBulkSequentialProgress((p) =>
          p ? { ...p, status: "cancelled", currentFileId: null, results: [...results] } : null
        );
        toast({ title: "一括AIチェックを中止しました" });
        onComplete?.();
        return;
      }

      const successCount = results.filter((x) => x.success).length;
      const failCount = results.filter((x) => !x.success).length;

      setBulkSequentialProgress((p) =>
        p ? { ...p, status: "done", currentFileId: null, results: [...results] } : null
      );

      toast({
        title: `「${meta.projectName}」の${meta.processLabel} ${batchFiles.length}件のAIチェックが完了しました`,
        description:
          failCount > 0
            ? `${successCount}件成功、${failCount}件失敗`
            : `${successCount}件すべて成功`,
        variant: failCount > 0 ? "destructive" : "default",
      });

      onComplete?.();
    },
    [user, toast, registerBulkAbort, setBulkSequentialProgress]
  );

  const resetProgress = useCallback(() => {
    clearBulkSequentialProgress();
  }, [clearBulkSequentialProgress]);

  return { progress, runBatchCheck, resetProgress };
}
