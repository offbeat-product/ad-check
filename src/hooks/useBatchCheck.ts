import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { runSingleFileAiCheck } from "@/lib/run-single-file-ai-check";
import { waitForAiCheckCompletion } from "@/lib/wait-for-ai-check-completion";
import { mapBulkToBatchProgress } from "@/lib/bulk-sequential-check-map";
import type { BulkSequentialProgressState } from "@/lib/bulk-sequential-check-types";
import type { BatchCheckProgress } from "@/lib/bulk-sequential-check-types";
import type { BulkQueueEntry } from "@/lib/bulk-sequential-check-types";
import type { ProjectFile, Product, Client } from "@/lib/db-types";
import { useAutoCheck } from "@/providers/AutoCheckProvider";

export type { BatchCheckProgress } from "@/lib/bulk-sequential-check-types";

interface QueueTask {
  entry: BulkQueueEntry;
  files: ProjectFile[];
  product: Product;
  client: Client | null;
  projectId: string;
  user: { id: string; email?: string | null };
  onComplete?: () => void;
}

interface QueueRuntime {
  toast: ReturnType<typeof useToast>["toast"];
  setBulkSequentialProgress: Dispatch<SetStateAction<BulkSequentialProgressState | null>>;
  registerBulkAbort: (ac: AbortController | null) => void;
  setBulkQueue: Dispatch<SetStateAction<BulkQueueEntry[]>>;
  setBulkActiveTaskId: Dispatch<SetStateAction<string | null>>;
}

let queueTasks: QueueTask[] = [];
let processingQueue = false;

async function executeQueueTask(task: QueueTask, runtime: QueueRuntime, signal: AbortSignal) {
  const { files: batchFiles, product, client, projectId, user, entry, onComplete } = task;
  const { toast, setBulkSequentialProgress } = runtime;

  const initial: BulkSequentialProgressState = {
    status: "running",
    projectId,
    projectName: entry.projectName,
    processType: entry.processType,
    processLabel: entry.processLabel,
    completed: 0,
    total: batchFiles.length,
    currentFileId: null,
    currentFileName: null,
    waitingN8n: false,
    results: [],
  };
  setBulkSequentialProgress(initial);

  const results: BatchCheckProgress["results"] = [];

  for (let i = 0; i < batchFiles.length; i++) {
    if (signal.aborted) break;

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
      user,
      claimUploaded: true,
    });

    if (signal.aborted) break;

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
          signal,
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

  if (signal.aborted) {
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
    title: `「${entry.projectName}」の${entry.processLabel} ${batchFiles.length}件のAIチェックが完了しました`,
    description:
      failCount > 0 ? `${successCount}件成功、${failCount}件失敗` : `${successCount}件すべて成功`,
    variant: failCount > 0 ? "destructive" : "default",
    duration: 10000,
  });

  onComplete?.();
}

async function processGlobalQueue(runtime: QueueRuntime) {
  if (processingQueue) return;
  processingQueue = true;

  try {
    while (queueTasks.length > 0) {
      const task = queueTasks.shift()!;
      runtime.setBulkQueue((prev) => prev.filter((q) => q.id !== task.entry.id));
      runtime.setBulkActiveTaskId(task.entry.id);

      const ac = new AbortController();
      runtime.registerBulkAbort(ac);
      try {
        await executeQueueTask(task, runtime, ac.signal);
      } finally {
        runtime.registerBulkAbort(null);
        runtime.setBulkActiveTaskId(null);
      }
    }
  } finally {
    processingQueue = false;
  }
}

export function useBatchCheck() {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    bulkSequentialProgress,
    setBulkSequentialProgress,
    registerBulkAbort,
    registerBulkCancelHandler,
    clearBulkSequentialProgress,
    bulkQueue,
    setBulkQueue,
    bulkActiveTaskId,
    setBulkActiveTaskId,
  } = useAutoCheck();

  const progress = useMemo(
    () => mapBulkToBatchProgress(bulkSequentialProgress),
    [bulkSequentialProgress]
  );

  useEffect(() => {
    registerBulkCancelHandler(() => {
      queueTasks = [];
      setBulkQueue([]);
      setBulkActiveTaskId(null);
    });
    return () => registerBulkCancelHandler(null);
  }, [registerBulkCancelHandler, setBulkQueue, setBulkActiveTaskId]);

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

      const activeSameKey =
        bulkSequentialProgress?.status === "running" &&
        bulkSequentialProgress.projectId === projectId &&
        bulkSequentialProgress.processType === meta.processType;
      const queuedSameKey = bulkQueue.some(
        (q) => q.projectId === projectId && q.processType === meta.processType
      );
      if (activeSameKey || queuedSameKey) {
        toast({
          title: "すでに待機中です",
          description: `「${meta.processLabel}」の一括AIチェックは既に実行中または待機中です。`,
        });
        return;
      }

      const entry: BulkQueueEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        projectId,
        processType: meta.processType,
        projectName: meta.projectName,
        processLabel: meta.processLabel,
        total: batchFiles.length,
      };

      queueTasks.push({
        entry,
        files: batchFiles,
        product,
        client,
        projectId,
        user: { id: user.id, email: user.email },
        onComplete,
      });
      setBulkQueue((prev) => [...prev, entry]);

      if (bulkActiveTaskId) {
        const queuePosition = bulkQueue.length + 1;
        toast({
          title: "一括AIチェックを待機列に追加しました",
          description: `${entry.processLabel}（${queuePosition}番目）`,
        });
      }

      void processGlobalQueue({
        toast,
        setBulkSequentialProgress,
        registerBulkAbort,
        setBulkQueue,
        setBulkActiveTaskId,
      });
    },
    [
      user,
      toast,
      setBulkSequentialProgress,
      registerBulkAbort,
      setBulkQueue,
      setBulkActiveTaskId,
      bulkQueue,
      bulkSequentialProgress,
      bulkActiveTaskId,
    ]
  );

  const resetProgress = useCallback(() => {
    clearBulkSequentialProgress();
  }, [clearBulkSequentialProgress]);

  return { progress, runBatchCheck, resetProgress };
}
