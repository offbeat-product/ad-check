import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { compressImage } from "@/lib/image-compress";
import { useToast } from "@/hooks/use-toast";
import { validateFileSize, formatFileSize } from "@/lib/file-validation";
import { tusUpload } from "@/lib/tus-upload";
import type { Project, Product, Client, ProjectFile, CheckResultRow } from "@/lib/db-types";
import { FILE_STATUS_CONFIG } from "@/lib/db-types";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { useProjectProcesses, type ProjectProcess } from "@/hooks/useProjectProcesses";
import { PROJECT_STATUS_CONFIG, PROCESS_STATUS_CONFIG, PROCESS_FILE_CONFIG, getProcessWebhookPath, AI_CHECK_CONFIG } from "@/lib/process-config";
import { PROJECT_TREE_QUERY_KEY } from "@/hooks/useProjectTree";
import { usePatterns } from "@/hooks/usePatterns";
import ProcessManagementModal from "@/components/ProcessManagementModal";
import ProcessTimeline from "@/components/ProcessTimeline";
import PatternMatrix from "@/components/patterns/PatternMatrix";
import AddPatternDialog from "@/components/patterns/AddPatternDialog";
import BulkPatternDialog from "@/components/patterns/BulkPatternDialog";
import CopyToPatternDialog from "@/components/patterns/CopyToPatternDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { TopCorrectionPatterns } from "@/components/CorrectionPatterns";
import ReferenceMaterialsSection from "@/components/reference/ReferenceMaterialsSection";
import CheckRulesTab from "@/components/product/CheckRulesTab";
import {
  Upload, FileText, Image, Film, MessageCircle, Plus, Settings, GripVertical,
  ChevronDown, ChevronRight, CalendarIcon, AlertTriangle, Trash2, Grid3X3, List, Bot, Loader2, Pencil, Lock, CheckSquare, Send,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import NotificationBell from "@/components/NotificationBell";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { format, differenceInDays, isPast } from "date-fns";
import { useBatchCheck } from "@/hooks/useBatchCheck";
import BatchCheckFloatingBar from "@/components/BatchCheckFloatingBar";

import { getSubmitBadgeClass, getSubmitLabel, getEffectiveSubmitLabel, getEffectiveSubmitBadgeClass } from "@/lib/check-display";

function DeadlineDisplay({ deadline, className, isCompleted, label }: { deadline: string | null; className?: string; isCompleted?: boolean; label?: string }) {
  const prefix = label || "納期";
  if (!deadline) return <span className={cn("text-xs text-muted-foreground/50", className)}>{prefix}未設定</span>;
  const d = new Date(deadline);
  const daysUntil = differenceInDays(d, new Date());
  const past = isPast(d) && daysUntil < 0;
  const soon = daysUntil >= 0 && daysUntil <= 3;
  const dateStr = format(d, "MM/dd");

  if (isCompleted) {
    return <span className={cn("text-xs text-muted-foreground", className)}>{prefix}: {dateStr}</span>;
  }

  return (
    <span className={cn("text-xs flex items-center gap-1", className,
      past ? "text-status-ng font-medium" : soon ? "text-status-warning font-medium" : "text-muted-foreground"
    )}>
      {(past || soon) && <AlertTriangle className="h-3 w-3" />}
      {past ? `${prefix}超過 (${dateStr})` : `${prefix}: ${dateStr}`}
    </span>
  );
}

function DeadlinePicker({ deadline, onChange, isCompleted, label }: { deadline: string | null; onChange: (d: string | null) => void; isCompleted?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const selected = deadline ? new Date(deadline) : undefined;
  const prefix = label || "納期";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="hover:bg-muted/50 rounded px-1 py-0.5 transition-colors">
          <DeadlineDisplay deadline={deadline} isCompleted={isCompleted} label={label} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
          className="p-3 pointer-events-auto"
        />
        {deadline && (
          <div className="px-3 pb-3">
            <Button size="sm" variant="ghost" className="text-xs w-full" onClick={() => { onChange(null); setOpen(false); }}>
              {prefix}をクリア
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [project, setProject] = useState<Project | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState<string | null>(null);
  const [uploadPatternId, setUploadPatternId] = useState<string | null>(null);
  const [uploadPatternMode, setUploadPatternMode] = useState<"common" | "specific">("common");
  const [uploadSubmissionType, setUploadSubmissionType] = useState<"internal" | "client">("internal");
  const [uploadTextInput, setUploadTextInput] = useState("");
  const [useTextInput, setUseTextInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [checkResults, setCheckResults] = useState<Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count" | "created_at" | "user_id" | "check_type" | "comparison_round"> & { resolved_items?: unknown; check_items?: unknown }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ file: ProjectFile; hasCheck: boolean } | null>(null);
  const [submissionChangeTarget, setSubmissionChangeTarget] = useState<string | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState("");
  const [addPatternOpen, setAddPatternOpen] = useState(false);
  const [bulkPatternOpen, setBulkPatternOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"matrix" | "list">("list");
  const [copyToPatternInfo, setCopyToPatternInfo] = useState<{
    sourcePatternId: string;
    processType: string;
    fileData: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number;
  } | null>(null);

  const { patterns, addPattern, addPatternsBulk, deletePattern, updatePattern, refetch: refetchPatterns } = usePatterns(id);

  const { processes, updateProcess, reorderProcesses, addProcess, deleteProcess, resetToDefaults } = useProjectProcesses(id);

  const { progress: batchProgress, runBatchCheck, resetProgress: resetBatchProgress } = useBatchCheck();
  const [batchFixing, setBatchFixing] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [collapsedProcesses, setCollapsedProcesses] = useState<Set<string>>(new Set());

  // Auto-collapse completed processes on load
  useEffect(() => {
    if (processes.length > 0) {
      const completedIds = new Set(
        processes.filter(p => p.status === "completed").map(p => p.id)
      );
      if (completedIds.size > 0) {
        setCollapsedProcesses(prev => {
          const next = new Set(prev);
          completedIds.forEach(id => next.add(id));
          return next;
        });
      }
    }
  }, [processes]);
  const handleBatchFix = async (processFiles: ProjectFile[], processKey: string) => {
    if (!id || !user) return;
    // All root files with check_result_id are targets for batch fix
    const allTargetFiles = processFiles.filter(f => 
      f.check_result_id && !f.parent_file_id
    );
    const unfixedFiles = allTargetFiles.filter(f => f.status !== "fixed");
    if (allTargetFiles.length === 0) {
      toast({ title: "FIX対象のファイルがありません", description: "チェック済みのファイルが必要です" });
      return;
    }
    if (unfixedFiles.length === 0) {
      toast({ title: "すべてのファイルは既にFIX済みです" });
      return;
    }
    const confirmed = window.confirm(
      `この工程の${unfixedFiles.length}件のチェック済みファイルを一括FIX（最終確定）しますか？\nFIXしたデータは他工程のAIチェック時に照合用として使用されます。`
    );
    if (!confirmed) return;

    setBatchFixing(true);
    try {
      // Fix all unfixed target files
      const now = new Date().toISOString();
      const fixBy = user.email || user.id || null;
      for (const f of unfixedFiles) {
        await supabase.from("project_files")
          .update({ status: "fixed", fixed_at: now, fixed_by: fixBy } as any)
          .eq("id", f.id);
      }

      toast({ title: `✅ ${unfixedFiles.length}件を一括FIXしました`, description: "他工程のAIチェック時にこれらのデータが照合用として使用されます" });
      fetchData();
    } catch (err) {
      console.error("[BatchFix] error:", err);
      toast({ title: "一括FIXに失敗しました", variant: "destructive" });
    } finally {
      setBatchFixing(false);
    }
  };

  const handleChangeSubmissionType = async (fileId: string) => {
    const { error } = await supabase.from("project_files").update({ submission_type: "client", status: "client_review" } as any).eq("id", fileId);
    if (!handleSupabaseError(error, "submission_type")) {
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, submission_type: "client" as any, status: "client_review" } : f));
      toast({ title: "クライアント提出に変更しました" });
    }
  };

  const handleRenameFile = async (fileId: string, newName: string) => {
    if (!newName.trim()) { setEditingFileId(null); return; }
    const { error } = await supabase.from("project_files").update({ file_name: newName.trim() }).eq("id", fileId);
    if (!handleSupabaseError(error, "rename")) {
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, file_name: newName.trim() } : f));
      toast({ title: "ファイル名を変更しました" });
    }
    setEditingFileId(null);
  };

  const handleBulkSubmitToClient = async () => {
    if (selectedFileIds.size === 0) return;
    const targetFiles = files.filter(f => selectedFileIds.has(f.id));
    // Only files with completed AI checks can be submitted
    const eligible = targetFiles.filter(f => f.check_result_id && f.submission_type !== "client");
    const ineligible = targetFiles.filter(f => !f.check_result_id);
    if (eligible.length === 0) {
      toast({
        title: "クライアント提出できるファイルがありません",
        description: ineligible.length > 0
          ? "AIチェックが完了しているファイルのみクライアント提出できます。"
          : "選択されたファイルは既にクライアント提出済みです。",
        variant: "destructive",
      });
      return;
    }
    if (ineligible.length > 0) {
      toast({
        title: `${ineligible.length}件はAIチェック未実行のため除外されます`,
        description: "AIチェック済みのファイルのみ提出されます。",
      });
    }
    const confirmed = window.confirm(
      `${eligible.length}件のファイルをクライアント提出済みに変更しますか？\nこの操作は品質レポートに反映されます。`
    );
    if (!confirmed) return;
    try {
      for (const f of eligible) {
        await supabase.from("project_files").update({ submission_type: "client", status: "client_review" } as any).eq("id", f.id);
      }
      setFiles(prev => prev.map(f => eligible.some(e => e.id === f.id) ? { ...f, submission_type: "client" as any, status: "client_review" } : f));
      toast({ title: `${eligible.length}件をクライアント提出済みに変更しました` });
      setSelectedFileIds(new Set());
      setSelectMode(false);
    } catch (err) {
      toast({ title: "提出変更エラー", description: err instanceof Error ? err.message : "変更に失敗しました", variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedFileIds.size === 0) return;
    const targetFiles = files.filter(f => selectedFileIds.has(f.id));
    const hasChecked = targetFiles.some(f => f.check_result_id);
    const confirmed = window.confirm(
      `${targetFiles.length}件のファイルを削除しますか？この操作は元に戻せません。${hasChecked ? "\n⚠️ チェック結果も同時に削除されます。" : ""}`
    );
    if (!confirmed) return;
    try {
      for (const f of targetFiles) {
        const bucket = getStorageBucket(f.process_type);
        if (bucket && f.file_data && !f.file_data.startsWith("data:")) {
          try {
            const url = new URL(f.file_data);
            const pathMatch = url.pathname.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+)`));
            if (pathMatch) await supabase.storage.from(bucket).remove([decodeURIComponent(pathMatch[1])]);
          } catch {}
        }
        if (f.check_result_id) {
          await supabase.from("comments").delete().eq("check_result_id", f.check_result_id);
          await supabase.from("check_results").delete().eq("id", f.check_result_id);
        }
        const childFiles = files.filter(cf => cf.parent_file_id === f.id);
        for (const child of childFiles) {
          if (child.check_result_id) {
            await supabase.from("comments").delete().eq("check_result_id", child.check_result_id);
            await supabase.from("check_results").delete().eq("id", child.check_result_id);
          }
          await supabase.from("project_files").delete().eq("id", child.id);
        }
        await supabase.from("project_files").delete().eq("id", f.id);
      }
      toast({ title: `${targetFiles.length}件のファイルを削除しました` });
      setSelectedFileIds(new Set());
      setSelectMode(false);
      fetchData();
    } catch (err) {
      toast({ title: "削除エラー", description: err instanceof Error ? err.message : "削除に失敗しました", variant: "destructive" });
    }
  };

  // Drag state for process sections
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const fetchData = useCallback(async (cancelled = false) => {
    if (!id) return;
    const { data: proj, error: projErr } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
    if (cancelled) return;
    if (handleSupabaseError(projErr, "project")) { setLoading(false); return; }
    if (!proj) { setLoading(false); return; }
    setProject(proj);

    const [prodRes, fileRes] = await Promise.all([
      supabase.from("products").select("*").eq("id", proj.product_id!).maybeSingle(),
      supabase.from("project_files").select("*").eq("project_id", id).order("created_at", { ascending: true }),
    ]);
    if (cancelled) return;
    handleSupabaseError(prodRes.error, "product");
    handleSupabaseError(fileRes.error, "project_files");

    setProduct(prodRes.data);
    const fileData = fileRes.data ?? [];
    setFiles(fileData);

    if (prodRes.data?.client_id) {
      const { data: cl, error: clErr } = await supabase.from("clients").select("*").eq("id", prodRes.data.client_id).maybeSingle();
      if (cancelled) return;
      handleSupabaseError(clErr, "client");
      setClient(cl);
    }

    const checkResultIds = fileData.filter((f) => f.check_result_id).map((f) => f.check_result_id!);
    if (checkResultIds.length > 0) {
      const { data: results, error: crErr } = await supabase
        .from("check_results")
        .select("id, overall_status, ng_count, warning_count, created_at, user_id, check_type, comparison_round, resolved_items, check_items")
        .in("id", checkResultIds);
      if (cancelled) return;
      handleSupabaseError(crErr, "check_results");
      const map: Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count" | "created_at" | "user_id" | "check_type" | "comparison_round"> & { resolved_items?: unknown; check_items?: unknown }> = {};
      (results ?? []).forEach((r) => { map[r.id] = r; });
      setCheckResults(map);
    }

    if (!cancelled) setLoading(false);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    fetchData(cancelled);
    return () => { cancelled = true; };
  }, [fetchData]);

  // Realtime subscription: update files & check results when project_files change
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`project-files:${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_files",
          filter: `project_id=eq.${id}`,
        },
        async (payload) => {
          console.log("[ProjectPage] Realtime project_files change:", payload.eventType);
          const newFile = payload.new as ProjectFile | undefined;
          const oldFile = payload.old as { id?: string } | undefined;

          if (payload.eventType === "DELETE" && oldFile?.id) {
            setFiles(prev => prev.filter(f => f.id !== oldFile.id));
            return;
          }

          if (newFile) {
            setFiles(prev => {
              const idx = prev.findIndex(f => f.id === newFile.id);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = newFile;
                return updated;
              }
              return [...prev, newFile];
            });

            // If a check_result_id appeared/changed, fetch the check result
            if (newFile.check_result_id) {
              const { data: cr } = await supabase
                .from("check_results")
                .select("id, overall_status, ng_count, warning_count, created_at, user_id, check_type, comparison_round, resolved_items, check_items")
                .eq("id", newFile.check_result_id)
                .maybeSingle();
              if (cr) {
                setCheckResults(prev => ({ ...prev, [cr.id]: cr }));
              }
            }
          }
        }
      )
      .subscribe();

    // Also subscribe to check_results changes (resolved_items updates from review page)
    const crChannel = supabase
      .channel(`project-check-results:${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "check_results",
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;
          setCheckResults(prev => {
            if (!prev[updated.id]) return prev;
            return { ...prev, [updated.id]: { ...prev[updated.id], ...updated } };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(crChannel);
    };
  }, [id]);

  // Watch for check_results updates (n8n completing async checks) and auto-update file status
  useEffect(() => {
    if (!id) return;
    const checkingFiles = files.filter(f => f.status === "checking" && f.check_result_id);
    if (checkingFiles.length === 0) return;

    const interval = setInterval(async () => {
      for (const f of checkingFiles) {
        const { data: cr } = await supabase
          .from("check_results")
          .select("id, overall_status, ng_count, warning_count, check_items, created_at, user_id, check_type, comparison_round")
          .eq("id", f.check_result_id!)
          .maybeSingle();
        if (cr && cr.check_items && Array.isArray(cr.check_items) && (cr.check_items as unknown[]).length > 0) {
          // Check result is complete — update file status
          await supabase.from("project_files").update({ status: "checked" }).eq("id", f.id);
          setFiles(prev => prev.map(pf => pf.id === f.id ? { ...pf, status: "checked" } : pf));
          setCheckResults(prev => ({ ...prev, [cr.id]: cr as any }));
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [id, files.filter(f => f.status === "checking").map(f => f.id).join(",")]);

  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const fileCheckIds = files.filter(f => f.check_result_id).map(f => f.check_result_id!);
    if (fileCheckIds.length === 0) return;
    supabase.from("comments").select("check_result_id").in("check_result_id", fileCheckIds).then(({ data, error }) => {
      if (cancelled) return;
      if (handleSupabaseError(error, "comment counts")) return;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((c) => { counts[c.check_result_id] = (counts[c.check_result_id] || 0) + 1; });
      setCommentCounts(counts);
    });
    return () => { cancelled = true; };
  }, [files, id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!project || !id) return;

    // 案件完了バリデーション: 全ファイルがFIX済みでなければ完了不可
    if (newStatus === "completed") {
      const rootFiles = files.filter(f => !f.parent_file_id);
      const nonFixedFiles = rootFiles.filter(f => f.status !== "fixed");
      if (nonFixedFiles.length > 0) {
        toast({
          title: "完了にできません",
          description: `FIX済みでないファイルが${nonFixedFiles.length}件あります。全てのクリエイティブをFIXしてから完了にしてください。`,
          variant: "destructive",
        });
        return;
      }
    }

    const { error } = await supabase.from("projects").update({ status: newStatus }).eq("id", id);
    if (!handleSupabaseError(error, "status update")) {
      setProject({ ...project, status: newStatus });
      toast({ title: "ステータスを更新しました" });
      queryClient.invalidateQueries({ queryKey: PROJECT_TREE_QUERY_KEY });
    }
  };

  const handleDeadlineChange = async (deadline: string | null) => {
    if (!project || !id) return;
    const { error } = await supabase.from("projects").update({ overall_deadline: deadline }).eq("id", id);
    if (!handleSupabaseError(error, "deadline update")) {
      setProject({ ...project, overall_deadline: deadline });
      toast({ title: "納期を更新しました" });
    }
  };

  const handleProcessDeadlineChange = async (processId: string, field: "internal_deadline" | "client_deadline", value: string | null) => {
    await updateProcess(processId, { [field]: value } as Partial<ProjectProcess>);
    toast({ title: field === "internal_deadline" ? "社内期限を更新しました" : "クライアント期限を更新しました" });
  };

  const handleProcessStatusChange = async (processId: string, status: string) => {
    // 工程完了バリデーション: クライアント提出済み or FIX済みでないファイルがあれば完了不可
    if (status === "completed") {
      const proc = processes.find(p => p.id === processId);
      if (proc) {
        const processFiles = files.filter(f => f.process_type === proc.process_key && !f.parent_file_id);
        const blockers = processFiles.filter(f => {
          // Must be either client-submitted or fixed
          const isClientSubmitted = f.submission_type === "client";
          const isFixed = f.status === "fixed";
          return !(isClientSubmitted || isFixed);
        });
        if (blockers.length > 0) {
          toast({
            title: "工程を完了にできません",
            description: `クライアント提出済みまたはFIX済みでないファイルが${blockers.length}件あります。`,
            variant: "destructive",
          });
          return;
        }
      }
    }
    await updateProcess(processId, { status } as Partial<ProjectProcess>);
    toast({ title: "工程ステータスを更新しました" });
  };

  const handleDeleteProject = async () => {
    if (!id) return;
    // Delete related data first
    await Promise.all([
      supabase.from("project_files").delete().eq("project_id", id),
      supabase.from("project_processes").delete().eq("project_id", id),
      supabase.from("project_members").delete().eq("project_id", id),
    ]);
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) {
      toast({ title: "削除エラー", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "プロジェクトを削除しました" });
      queryClient.invalidateQueries({ queryKey: PROJECT_TREE_QUERY_KEY });
      navigate("/dashboard");
    }
  };

  // Sanitize filename for storage paths (ASCII only for Supabase Storage compatibility)
  const sanitizeFileName = (name: string): string => {
    const lastDot = name.lastIndexOf(".");
    const ext = lastDot > 0 ? name.slice(lastDot) : "";
    const base = lastDot > 0 ? name.slice(0, lastDot) : name;
    const safeName = base
      .replace(/[^a-zA-Z0-9_\-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    return (safeName || `file_${Date.now()}`) + ext;
  };

  // Validate deadlines before allowing upload
  const canUploadToProcess = (processKey: string): string | null => {
    const overallDeadline = (project as any)?.overall_deadline;
    if (!overallDeadline) return "案件の納期が設定されていません。先に納期を設定してください。";
    const proc = processes.find(p => p.process_key === processKey);
    if (!proc) return "工程が見つかりません。";
    if (!proc.internal_deadline) return `「${proc.process_label}」の社内期限が設定されていません。先に期限を設定してください。`;
    if (!proc.client_deadline) return `「${proc.process_label}」のクライアント期限が設定されていません。先に期限を設定してください。`;
    return null;
  };

  // Wrapper to validate deadlines before opening upload modal
  const openUploadModal = (processKey: string, patternId?: string | null, patternMode?: "common" | "specific") => {
    const err = canUploadToProcess(processKey);
    if (err) {
      toast({ title: "アップロード不可", description: err, variant: "destructive" });
      return;
    }
    setUploadModal(processKey);
    setUploadPatternId(patternId ?? null);
    setUploadPatternMode(patternMode ?? "common");
    setUseTextInput(false);
    setSelectedFiles([]);
  };

  // Determine storage bucket by process type
  const getStorageBucket = (processType: string): string | null => {
    const audioProcesses = ["narration", "bgm"];
    const videoProcesses = ["vcon", "video_horizontal", "video_vertical"];
    if (audioProcesses.includes(processType)) return "audios";
    if (videoProcesses.includes(processType)) return "videos";
    return null; // images & text stay in DB
  };

  const getFileFormatHint = (processType: string): string => {
    const hints: Record<string, string> = {
      script: "TXT / DOCX",
      na_script: "TXT / DOCX",
      narration: "MP3 / WAV / M4A（最大500MB）",
      bgm: "MP3 / WAV / M4A（最大500MB）",
      vcon: "MP4 / MOV / WebM（最大500MB）",
      styleframe: "JPG / PNG / PSD / AI",
      storyboard: "JPG / PNG / PDF / PSD",
      video_horizontal: "MP4 / MOV / WebM（最大500MB）",
      video_vertical: "MP4 / MOV / WebM（最大500MB）",
    };
    return hints[processType] || "";
  };

  const isImageProcess = (processType: string) => ["styleframe", "storyboard"].includes(processType);

  const handleFileUpload = async () => {
    if (!uploadModal || !id || !user) return;
    setUploading(true);
    setUploadProgress(0);

    const cfg = PROCESS_FILE_CONFIG[uploadModal];
    const resolvedPatternId = (patterns.length > 0 && uploadPatternMode === "specific") ? uploadPatternId : null;

    try {
      if (useTextInput && cfg?.allowTextInput) {
        const fileData = uploadTextInput;
        const fileSize = new Blob([uploadTextInput]).size;
        const fileName = `${cfg?.label || uploadModal}_${Date.now()}.txt`;
        setUploadProgress(50);

        const { error } = await supabase.from("project_files").insert({
          project_id: id, process_type: uploadModal, file_name: fileName,
          file_type: "text", file_data: fileData, file_size_bytes: fileSize,
          created_by: user.email || user.id, pattern_id: resolvedPatternId,
          submission_type: uploadSubmissionType,
        } as any);
        if (error) throw error;
        setUploadProgress(100);
        toast({ title: "アップロード完了" });
      } else if (selectedFiles.length > 0) {
        const total = selectedFiles.length;
        let lastFileData = "";
        let lastFileName = "";
        let lastFileType = "";
        let lastFileSize = 0;

        for (let i = 0; i < total; i++) {
          const file = selectedFiles[i];
          const sizeError = validateFileSize(file, uploadModal);
          if (sizeError) {
            toast({ title: "エラー", description: `${file.name}: ${sizeError}`, variant: "destructive" });
            continue;
          }

          const fileName = sanitizeFileName(file.name);
          const fileSize = file.size;
          let fileData = "";
          let fileType = "text";
          const bucket = getStorageBucket(uploadModal);

          if (bucket) {
            fileType = file.type.startsWith("audio/") ? "audio" : "video";
            const storagePath = `${id}/${Date.now()}_${i}_${fileName}`;

            const result = await tusUpload({
              bucketName: bucket,
              path: storagePath,
              file,
              contentType: file.type,
              onProgress: (pct) => {
                const fileProgress = pct / 100;
                setUploadProgress(Math.round(((i + fileProgress) / total) * 90));
              },
            });
            fileData = result.publicUrl;
          } else if (file.type.startsWith("image/")) {
            fileType = "image";
            const compressed = await compressImage(file);
            fileData = `data:${compressed.mediaType};base64,${compressed.base64}`;
          } else {
            fileType = "text";
            fileData = await file.text();
          }

          const { error } = await supabase.from("project_files").insert({
            project_id: id, process_type: uploadModal, file_name: fileName,
            file_type: fileType, file_data: fileData, file_size_bytes: fileSize,
            created_by: user.email || user.id, pattern_id: resolvedPatternId,
            submission_type: uploadSubmissionType,
          } as any);
          if (error) throw error;

          lastFileData = fileData;
          lastFileName = fileName;
          lastFileType = fileType;
          lastFileSize = fileSize;
          setUploadProgress(Math.round(((i + 1) / total) * 95));
        }

        setUploadProgress(100);
        toast({ title: `${total}件アップロード完了` });

        // Offer to copy to other patterns (uses last file info for single, skips for multi)
        if (resolvedPatternId && patterns.length > 1 && total === 1) {
          setCopyToPatternInfo({
            sourcePatternId: resolvedPatternId,
            processType: uploadModal,
            fileData: lastFileData,
            fileName: lastFileName,
            fileType: lastFileType,
            fileSizeBytes: lastFileSize,
          });
        }
      } else {
        setUploading(false);
        setUploadProgress(null);
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "アップロードに失敗しました";
      toast({ title: "アップロードエラー", description: message, variant: "destructive" });
    } finally {
      setUploadModal(null);
      setSelectedFiles([]);
      setUploadTextInput("");
      setUseTextInput(false);
      setUploading(false);
      setUploadProgress(null);
      setUploadPatternId(null);
      setUploadPatternMode("common");
      setUploadSubmissionType("internal");
      fetchData();
    }
  };

  const getFilesForProcess = (processKey: string) =>
    files.filter((f) => f.process_type === processKey && !f.parent_file_id);

  const handleProcessDragStart = (index: number) => { dragItem.current = index; };
  const handleProcessDragEnter = (index: number) => { dragOver.current = index; setDragOverIdx(index); };
  const handleProcessDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) {
      setDragOverIdx(null); return;
    }
    const activeProcesses = processes.filter(p => p.is_active);
    const reordered = [...activeProcesses];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOver.current, 0, removed);
    reorderProcesses(reordered);
    dragItem.current = null; dragOver.current = null; setDragOverIdx(null);
  };

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (!project || !product) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">プロジェクトが見つかりません</div>;

  const statusCfg = PROJECT_STATUS_CONFIG[project.status || "in_progress"] || PROJECT_STATUS_CONFIG.in_progress;
  const activeProcesses = processes.filter(p => p.is_active);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-4 md:px-6 py-3 bg-card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground truncate">
              {client?.name} &gt; {product.name} &gt; {project.name}
            </div>
            <h1 className="text-base md:text-lg font-bold mt-0.5 truncate">{project.name}</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Deadline compliance badge */}
            {(() => {
              const overallDeadline = (project as any).overall_deadline;
              if (project.status === "completed" && overallDeadline) {
                const dl = new Date(overallDeadline + "T23:59:59");
                const completedAt = new Date(project.updated_at || "");
                const isLate = completedAt > dl;
                return (
                  <Badge className={cn("text-xs font-bold gap-1", isLate ? "bg-status-ng/10 text-status-ng border-status-ng" : "bg-status-ok/10 text-status-ok border-status-ok")} variant="outline">
                    {isLate ? <AlertTriangle className="h-3 w-3" /> : <CheckSquare className="h-3 w-3" />}
                    {isLate ? "遅延" : "納期遵守OK"}
                  </Badge>
                );
              }
              if (overallDeadline && !["completed"].includes(project.status || "")) {
                const dl = new Date(overallDeadline + "T23:59:59");
                if (isPast(dl)) {
                  return (
                    <Badge className="text-xs font-bold gap-1 bg-status-ng/10 text-status-ng border-status-ng" variant="outline">
                      <AlertTriangle className="h-3 w-3" />遅延
                    </Badge>
                  );
                }
              }
              return null;
            })()}
            <DeadlinePicker
              deadline={(project as any).overall_deadline ?? null}
              onChange={handleDeadlineChange}
            />
            <NotificationBell />
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1 transition-colors hover:opacity-80", statusCfg.badgeClass)}>
                  {statusCfg.label}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-2" align="end">
                {Object.entries(PROJECT_STATUS_CONFIG).map(([key, cfg]) => (
                  <button key={key} onClick={() => handleStatusChange(key)}
                    className={cn("w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2",
                      project.status === key ? "bg-muted" : "hover:bg-muted/50")}>
                    <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dotClass)} />
                    {cfg.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>プロジェクトを削除</AlertDialogTitle>
                  <AlertDialogDescription>
                    「{project.name}」を削除します。関連するファイル・工程データも全て削除されます。この操作は元に戻せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    削除する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </header>

      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <Tabs defaultValue="files">
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="files">ファイル</TabsTrigger>
            <TabsTrigger value="history">チェック履歴</TabsTrigger>
            <TabsTrigger value="patterns">修正パターン</TabsTrigger>
            <TabsTrigger value="rules">チェックルール</TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="space-y-6">
            <ProcessTimeline processes={processes} />

            {product && (
              <ReferenceMaterialsSection
                projectId={id!}
                productId={product.id}
                productName={product.name}
                projectName={project.name}
              />
            )}

            {/* Pattern management section */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">パターン管理</h2>
                {patterns.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {patterns.length}パターン
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center border border-border rounded-md h-7 overflow-hidden">
                  <button
                    onClick={() => setViewMode("list")}
                    className={cn("px-2 h-full flex items-center text-xs transition-colors", viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                    title="リスト表示"
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode("matrix")}
                    className={cn("px-2 h-full flex items-center text-xs transition-colors", viewMode === "matrix" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                    title="パターン管理"
                  >
                    <Grid3X3 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setBulkPatternOpen(true)}>
                  一括生成
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setAddPatternOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" />パターン追加
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setProcessModalOpen(true)}>
                  <Settings className="h-3 w-3 mr-1" />工程管理
                </Button>
              </div>
            </div>

            {/* Conditional: matrix view vs legacy list */}
            {patterns.length > 0 && viewMode === "matrix" ? (
              <PatternMatrix
                projectId={id!}
                patterns={patterns}
                processes={processes}
                files={files}
                checkResults={checkResults}
                onUpload={(processKey, patternId) => {
                  openUploadModal(processKey, patternId, patternId ? "specific" : "common");
                }}
                onUpdatePattern={updatePattern}
                onDeletePattern={deletePattern}
                onToggleProcessCommon={async (processId, isCommon) => {
                  const ok = await updateProcess(processId, { is_common: isCommon } as Partial<ProjectProcess>);
                  if (ok) toast({ title: isCommon ? "共通素材に移動しました" : "パターン別に移動しました" });
                  return !!ok;
                }}
              />
            ) : (
              /* Legacy list view (no patterns) */
              <>
                {activeProcesses.map((proc, index) => {
                  const sectionFiles = getFilesForProcess(proc.process_key);
                  const psCfg = PROCESS_STATUS_CONFIG[proc.status] || PROCESS_STATUS_CONFIG.preparing;
                  const cfg = PROCESS_FILE_CONFIG[proc.process_key];
                  const webhookAvailable = !!AI_CHECK_CONFIG[proc.process_key]?.enabled;

                  const isCollapsed = collapsedProcesses.has(proc.id);
                  const toggleCollapse = () => {
                    setCollapsedProcesses(prev => {
                      const next = new Set(prev);
                      if (next.has(proc.id)) next.delete(proc.id); else next.add(proc.id);
                      return next;
                    });
                  };
                  const fileCount = sectionFiles.filter(f => !f.parent_file_id).length;
                  const checkedCount = sectionFiles.filter(f => f.status === "checked" || f.status === "fixed").length;

                  const isProcessCompleted = proc.status === "completed";

                  return (
                    <div
                      key={proc.id}
                      draggable
                      onDragStart={() => handleProcessDragStart(index)}
                      onDragEnter={() => handleProcessDragEnter(index)}
                      onDragEnd={handleProcessDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                    className={cn("glass-card overflow-hidden transition-all relative",
                      dragOverIdx === index && "ring-2 ring-primary/30",
                      (isProcessCompleted || (sectionFiles.length > 0 && sectionFiles.filter(f => !f.parent_file_id).every(f => f.status === "fixed"))) && "border-muted-foreground/30")}
                    >
                      {/* Completed / All-FIX overlay */}
                      {(() => {
                        const rootFiles = sectionFiles.filter(f => !f.parent_file_id);
                        const allFixed = rootFiles.length > 0 && rootFiles.every(f => f.status === "fixed");
                        if (isProcessCompleted && isCollapsed) {
                          return (
                            <div className="absolute inset-0 bg-foreground/40 z-10 pointer-events-none rounded-lg flex items-center justify-center">
                              <span className="bg-muted/90 text-muted-foreground text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 pointer-events-none">
                                <Lock className="h-3 w-3" /> 完了
                              </span>
                            </div>
                          );
                        }
                        if (allFixed && !isProcessCompleted && isCollapsed) {
                          return (
                            <div className="absolute inset-0 bg-foreground/30 z-10 pointer-events-none rounded-lg flex items-center justify-center">
                              <span className="bg-muted-foreground/90 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 pointer-events-none">
                                <Lock className="h-3 w-3" /> 全FIX済
                              </span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2 cursor-pointer select-none"
                        onClick={(e) => {
                          // Don't toggle if clicking on buttons/popovers inside the header
                          if ((e.target as HTMLElement).closest("button, [role='combobox'], [data-radix-popper-content-wrapper]")) return;
                          toggleCollapse();
                        }}>
                        <button className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors" onClick={(e) => { e.stopPropagation(); toggleCollapse(); }}>
                          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" onClick={(e) => e.stopPropagation()} />
                        <span className="text-xs text-muted-foreground shrink-0">
                          {String.fromCodePoint(0x2460 + index)}
                        </span>
                        <h2 className="text-sm font-semibold">{proc.process_label}</h2>

                        <DeadlinePicker
                          deadline={proc.internal_deadline}
                          onChange={(d) => handleProcessDeadlineChange(proc.id, "internal_deadline", d)}
                          isCompleted={isProcessCompleted}
                          label="社内"
                        />
                        <DeadlinePicker
                          deadline={proc.client_deadline}
                          onChange={(d) => handleProcessDeadlineChange(proc.id, "client_deadline", d)}
                          isCompleted={isProcessCompleted}
                          label="Client"
                        />

                        <Popover>
                          <PopoverTrigger asChild>
                            <button className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1", psCfg.badgeClass)}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", psCfg.dotClass)} />
                              {psCfg.label}
                              <ChevronDown className="h-2.5 w-2.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-36 p-1.5" align="start">
                            {Object.entries(PROCESS_STATUS_CONFIG).map(([key, c]) => (
                              <button key={key} onClick={() => handleProcessStatusChange(proc.id, key)}
                                className={cn("w-full text-left px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1.5",
                                  proc.status === key ? "bg-muted" : "hover:bg-muted/50")}>
                                <span className={cn("w-1.5 h-1.5 rounded-full", c.dotClass)} />
                                {c.label}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>

                        {!webhookAvailable && (
                          <Badge variant="outline" className="text-[9px] ml-1 text-muted-foreground">準備中</Badge>
                        )}
                        {sectionFiles.some(f => f.status === "fixed") && (
                          <Badge variant="outline" className="text-[9px] ml-1 border-muted-foreground text-muted-foreground bg-muted font-bold gap-0.5">
                            <Lock className="h-2.5 w-2.5" /> FIX済 ({sectionFiles.filter(f => f.status === "fixed").length})
                          </Badge>
                        )}
                        {fileCount > 0 && (
                          <Badge variant="secondary" className="text-[9px] ml-1 gap-0.5">
                            {fileCount}件{checkedCount > 0 && ` (${checkedCount}✓)`}
                          </Badge>
                        )}

                        {!isCollapsed && (
                          <div className="ml-auto flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                           {webhookAvailable && sectionFiles.filter(f => f.file_data && !f.parent_file_id).length > 0 && (() => {
                            const allTargets = sectionFiles.filter(f => f.file_data && !f.parent_file_id);
                            // Sort by pattern order (left to right), then by created_at within same pattern
                            const patternOrderMap = new Map<string | null, number>();
                            patterns.forEach((p, idx) => patternOrderMap.set(p.id, idx));
                            const sortedTargets = [...allTargets].sort((a, b) => {
                              const aOrder = patternOrderMap.get(a.pattern_id ?? null) ?? -1;
                              const bOrder = patternOrderMap.get(b.pattern_id ?? null) ?? -1;
                              if (aOrder !== bOrder) return aOrder - bOrder;
                              return (a.created_at ?? "").localeCompare(b.created_at ?? "");
                            });
                            const selectedInSection = sortedTargets.filter(f => selectedFileIds.has(f.id));
                            const uncheckedTargets = sortedTargets.filter(f => f.status !== "checked" && f.status !== "fixed" && f.status !== "checking");
                            const hasSelection = selectedInSection.length > 0;
                            const actualTargets = hasSelection ? selectedInSection : uncheckedTargets;
                            // Apply video limits
                            const VIDEO_LIMITS: Record<string, number> = { vcon: 3, video_horizontal: 1, video_vertical: 1 };
                            const videoLimit = VIDEO_LIMITS[proc.process_key];
                            const MAX_BATCH = videoLimit ? Math.min(5, videoLimit) : 5;
                            const overLimit = actualTargets.length > MAX_BATCH;
                            const label = hasSelection
                              ? `選択分をAIチェック (${selectedInSection.length}${overLimit ? `/最大${MAX_BATCH}` : ""})`
                              : `未チェック分を一括AIチェック (${Math.min(uncheckedTargets.length, MAX_BATCH)}/${uncheckedTargets.length})`;
                            const limitedTargets = actualTargets.slice(0, MAX_BATCH);
                            return (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 gap-1"
                                disabled={batchProgress.status === "running" || actualTargets.length === 0}
                                onClick={() => {
                                  if (!product || !id) return;
                                  if (overLimit) {
                                    toast({ title: `最大${MAX_BATCH}件まで一括チェック可能です`, description: `先頭${MAX_BATCH}件をチェックします。`, variant: "default" });
                                  }
                                  runBatchCheck(limitedTargets, product, client, id, () => {
                                    fetchData();
                                    setSelectedFileIds(new Set());
                                    setSelectMode(false);
                                  });
                                }}
                              >
                                {batchProgress.status === "running" ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Bot className="h-3 w-3" />
                                )}
                                {label}
                              </Button>
                            );
                          })()}
                          {sectionFiles.some(f => f.check_result_id && !f.parent_file_id && f.status !== "fixed") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 gap-1 border-muted-foreground text-muted-foreground hover:bg-muted"
                              disabled={batchFixing}
                              onClick={() => handleBatchFix(sectionFiles, proc.process_key)}
                            >
                              {batchFixing ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Lock className="h-3 w-3" />
                              )}
                              一括FIX ({sectionFiles.filter(f => f.check_result_id && !f.parent_file_id && f.status !== "fixed").length})
                            </Button>
                          )}
                          {(() => {
                            const eligibleForSubmit = sectionFiles.filter(f => f.check_result_id && !f.parent_file_id && f.submission_type !== "client" && f.status !== "fixed");
                            return eligibleForSubmit.length > 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 gap-1 border-primary/50 text-primary hover:bg-primary/10"
                                onClick={async () => {
                                  const confirmed = window.confirm(
                                    `この工程のチェック済み${eligibleForSubmit.length}件をクライアント提出済みに変更しますか？\nこの操作は品質レポートに反映されます。`
                                  );
                                  if (!confirmed) return;
                                  try {
                                    for (const f of eligibleForSubmit) {
                                      await supabase.from("project_files").update({ submission_type: "client", status: "client_review" } as any).eq("id", f.id);
                                    }
                                    setFiles(prev => prev.map(f => eligibleForSubmit.some(e => e.id === f.id) ? { ...f, submission_type: "client" as any, status: "client_review" } : f));
                                    toast({ title: `${eligibleForSubmit.length}件をクライアント提出済みに変更しました` });
                                  } catch (err) {
                                    toast({ title: "提出変更エラー", variant: "destructive" });
                                  }
                                }}
                              >
                                <Send className="h-3 w-3" />
                                一括クライアント提出 ({eligibleForSubmit.length})
                              </Button>
                            ) : null;
                          })()}
                          {sectionFiles.length > 0 && (
                            <Button size="sm" variant={selectMode ? "default" : "outline"} className="text-xs h-7 gap-1"
                              onClick={() => {
                                setSelectMode(!selectMode);
                                setSelectedFileIds(new Set());
                              }}>
                              <CheckSquare className="h-3 w-3" />
                              {selectMode ? "選択解除" : "選択"}
                            </Button>
                          )}
                          {selectMode && selectedFileIds.size > 0 && (
                            <>
                              {(() => {
                                const selectedInProc = sectionFiles.filter(f => selectedFileIds.has(f.id));
                                const eligibleCount = selectedInProc.filter(f => f.check_result_id && f.submission_type !== "client").length;
                                return eligibleCount > 0 ? (
                                  <Button size="sm" variant="outline" className="text-xs h-7 gap-1 border-primary/50 text-primary hover:bg-primary/10"
                                    onClick={handleBulkSubmitToClient}>
                                    <Send className="h-3 w-3" />
                                    {eligibleCount}件クライアント提出
                                  </Button>
                                ) : null;
                              })()}
                              <Button size="sm" variant="destructive" className="text-xs h-7 gap-1"
                                onClick={handleBulkDelete}>
                                <Trash2 className="h-3 w-3" />
                                {selectedFileIds.size}件削除
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => openUploadModal(proc.process_key)}>
                            <Plus className="h-3 w-3 mr-1" />アップロード
                          </Button>
                          </div>
                        )}
                        {isCollapsed && fileCount === 0 && (
                          <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="outline" className="text-xs h-7"
                              onClick={() => openUploadModal(proc.process_key)}>
                              <Plus className="h-3 w-3 mr-1" />アップロード
                            </Button>
                          </div>
                        )}
                      </div>
                      {!isCollapsed && (
                      <div className="p-4">
                        {sectionFiles.length === 0 ? (
                          <p className="text-xs text-muted-foreground/60 italic py-4 text-center">ファイルなし — アップロードしてください</p>
                        ) : (() => {
                          // Group files by pattern
                          const groupedFiles: { label: string; files: ProjectFile[] }[] = [];
                          if (patterns.length > 0) {
                            const patternMap = new Map<string | null, ProjectFile[]>();
                            for (const f of sectionFiles) {
                              const key = f.pattern_id || null;
                              if (!patternMap.has(key)) patternMap.set(key, []);
                              patternMap.get(key)!.push(f);
                            }
                            // Common files first
                            const commonFiles = patternMap.get(null);
                            if (commonFiles && commonFiles.length > 0) {
                              groupedFiles.push({ label: "共通", files: commonFiles });
                            }
                            // Then by pattern
                            for (const p of patterns) {
                              const pFiles = patternMap.get(p.id);
                              if (pFiles && pFiles.length > 0) {
                                groupedFiles.push({ label: p.name, files: pFiles });
                              }
                            }
                          } else {
                            groupedFiles.push({ label: "", files: sectionFiles });
                          }

                          return (
                            <div>
                              {patterns.length > 0 ? (
                                <div className="flex gap-4 overflow-x-auto pb-2">
                                  {groupedFiles.map((group, gi) => (
                                    <div key={gi} className="min-w-[160px] max-w-[200px] flex-shrink-0">
                                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                                        <Badge variant="outline" className="text-[10px] font-bold">{group.label}</Badge>
                                        <span className="text-[9px] text-muted-foreground/60">{group.files.length}件</span>
                                      </h4>
                                      <div className="space-y-2">
                                    {group.files.map((file) => {
                                      const cr = file.check_result_id ? checkResults[file.check_result_id] : null;
                                      const st = FILE_STATUS_CONFIG[file.status ?? "uploaded"] ?? FILE_STATUS_CONFIG.uploaded;
                                      const cc = file.check_result_id ? (commentCounts[file.check_result_id] || 0) : 0;
                                      const isImageFile = file.file_type === "image";
                                      const childVersions = files.filter(f => f.parent_file_id === file.id);
                                      // Use latest version's file_data for thumbnail
                                      const latestVersion = childVersions.length > 0
                                        ? childVersions.sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0))[0]
                                        : null;
                                      const thumbnailData = latestVersion?.file_data || file.file_data;
                                      const versionLabel = file.parent_file_id ? `v${file.version_number}` : childVersions.length > 0 ? "v1" : null;
                                      const isSelected = selectedFileIds.has(file.id);

                                      return (
                                        <div key={file.id} className="relative group">
                                          {selectMode && (
                                            <div className="absolute top-1 left-1 z-20" onClick={(e) => e.stopPropagation()}>
                                              <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={(checked) => {
                                                  setSelectedFileIds(prev => {
                                                    const next = new Set(prev);
                                                    if (checked) next.add(file.id); else next.delete(file.id);
                                                    return next;
                                                  });
                                                }}
                                              />
                                            </div>
                                          )}
                                          <button onClick={() => {
                                              if (selectMode) {
                                                setSelectedFileIds(prev => {
                                                  const next = new Set(prev);
                                                  if (next.has(file.id)) next.delete(file.id); else next.add(file.id);
                                                  return next;
                                                });
                                              } else {
                                                navigate(`/project/${id}/file/${file.id}`);
                                              }
                                            }}
                                            className={cn("glass-card p-2 text-left hover:border-primary/30 transition-colors w-full relative overflow-hidden",
                                              file.status === "fixed" && "border-muted-foreground/30 ring-1 ring-muted-foreground/20",
                                              isSelected && selectMode && "ring-2 ring-primary border-primary/50"
                                            )}>
                                            {/* Ribbon removed — submission type managed via check screen */}
                                            {file.status === "fixed" && (
                                              <>
                                                <div className="absolute inset-0 bg-foreground/50 rounded-lg z-[1] pointer-events-none" />
                                                <div className="absolute top-1.5 left-1.5 z-10 bg-muted-foreground text-white rounded-full p-0.5">
                                                  <Lock className="h-3 w-3" />
                                                </div>
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1 bg-muted-foreground/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm pointer-events-none">
                                                  <Lock className="h-2.5 w-2.5" /> FIX済
                                                </div>
                                              </>
                                            )}
                                            <div className="h-16 rounded-md bg-muted/50 flex items-center justify-center mb-1.5 overflow-hidden">
                                              {isImageFile && thumbnailData ? (
                                                <img src={thumbnailData} alt="" className="w-full h-full object-cover" />
                                              ) : (file.file_type === "video" || proc.process_key.includes("video") || proc.process_key === "vcon") && thumbnailData ? (
                                                <video src={thumbnailData} className="w-full h-full object-cover" muted preload="metadata" />
                                              ) : file.file_type === "video" || proc.process_key.includes("video") || proc.process_key === "vcon" ? (
                                                <Film className="h-8 w-8 text-muted-foreground/30" />
                                              ) : file.file_type === "audio" || proc.process_key === "na_narration" || proc.process_key === "bgm" ? (
                                                <FileText className="h-8 w-8 text-muted-foreground/30" />
                                              ) : proc.process_key.includes("script") || proc.process_key === "na_script" ? (
                                                <FileText className="h-8 w-8 text-muted-foreground/30" />
                                              ) : thumbnailData && (thumbnailData.startsWith("data:image") || thumbnailData.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)) ? (
                                                <img src={thumbnailData} alt="" className="w-full h-full object-cover" />
                                              ) : (
                                                <Image className="h-8 w-8 text-muted-foreground/30" />
                                              )}
                                            </div>
                                            {editingFileId === file.id ? (
                                              <form onSubmit={(e) => { e.preventDefault(); handleRenameFile(file.id, editFileName); }}
                                                onClick={(e) => e.stopPropagation()}>
                                                <Input value={editFileName} onChange={(e) => setEditFileName(e.target.value)}
                                                  className="h-5 text-xs w-full" autoFocus
                                                  onBlur={() => handleRenameFile(file.id, editFileName)}
                                                  onKeyDown={(e) => { if (e.key === "Escape") setEditingFileId(null); }} />
                                              </form>
                                            ) : (
                                              <p className="text-xs font-medium truncate flex items-center gap-1 group/name">
                                                <span className="truncate">{file.file_name}</span>
                                                <button onClick={(e) => { e.stopPropagation(); setEditingFileId(file.id); setEditFileName(file.file_name); }}
                                                  className="opacity-0 group-hover/name:opacity-100 shrink-0 text-muted-foreground/50 hover:text-primary transition-all">
                                                  <Pencil className="h-2.5 w-2.5" />
                                                </button>
                                              </p>
                                            )}
                                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                                              {file.created_at && <span>{format(new Date(file.created_at), "MM/dd HH:mm")}</span>}
                                              {file.created_by && <span>/ {(file.created_by as string).includes("@") ? (file.created_by as string).split("@")[0] : file.created_by}</span>}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                              <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", st.class)}>{st.label}</Badge>
                                                {cr && (
                                                <Badge className={cn("text-[10px] h-4 px-1.5", getEffectiveSubmitBadgeClass(cr.overall_status, cr.check_items as any, cr.resolved_items as any))}>
                                                  {getEffectiveSubmitLabel(cr.overall_status, cr.check_items as any, cr.resolved_items as any).label}
                                                </Badge>
                                              )}
                                              {versionLabel && <span className="text-[10px] text-muted-foreground">{versionLabel}</span>}
                                            </div>
                                            {cc > 0 && (
                                              <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                                                <MessageCircle className="h-3 w-3" />{cc}
                                              </div>
                                            )}
                                          </button>
                                          {!selectMode && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteTarget({ file, hasCheck: !!cr });
                                              }}
                                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:scale-110 z-10"
                                              title="削除"
                                            >
                                              <span className="text-xs font-bold leading-none">×</span>
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                                  {groupedFiles[0]?.files.map((file) => {
                                    const cr = file.check_result_id ? checkResults[file.check_result_id] : null;
                                    const st = FILE_STATUS_CONFIG[file.status ?? "uploaded"] ?? FILE_STATUS_CONFIG.uploaded;
                                    const cc = file.check_result_id ? (commentCounts[file.check_result_id] || 0) : 0;
                                    const isImageFile = file.file_type === "image";
                                    const childVersions = files.filter(f => f.parent_file_id === file.id);
                                    const latestVersion = childVersions.length > 0
                                      ? childVersions.sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0))[0]
                                      : null;
                                    const thumbnailData = latestVersion?.file_data || file.file_data;
                                    const versionLabel = file.parent_file_id ? `v${file.version_number}` : childVersions.length > 0 ? "v1" : null;
                                    const isSelected = selectedFileIds.has(file.id);

                                    return (
                                      <div key={file.id} className="relative group">
                                        {selectMode && (
                                          <div className="absolute top-1 left-1 z-20" onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                              checked={isSelected}
                                              onCheckedChange={(checked) => {
                                                setSelectedFileIds(prev => {
                                                  const next = new Set(prev);
                                                  if (checked) next.add(file.id); else next.delete(file.id);
                                                  return next;
                                                });
                                              }}
                                            />
                                          </div>
                                        )}
                                        <button onClick={() => {
                                            if (selectMode) {
                                              setSelectedFileIds(prev => {
                                                const next = new Set(prev);
                                                if (next.has(file.id)) next.delete(file.id); else next.add(file.id);
                                                return next;
                                              });
                                            } else {
                                              navigate(`/project/${id}/file/${file.id}`);
                                            }
                                          }}
                                          className={cn("glass-card p-2 text-left hover:border-primary/30 transition-colors w-full relative overflow-hidden",
                                            file.status === "fixed" && "border-muted-foreground/30 ring-1 ring-muted-foreground/20",
                                            isSelected && selectMode && "ring-2 ring-primary border-primary/50"
                                          )}>
                                          {/* Ribbon removed — submission type managed via check screen */}
                                          {file.status === "fixed" && (
                                            <>
                                              <div className="absolute inset-0 bg-foreground/50 rounded-lg z-[1] pointer-events-none" />
                                              <div className="absolute top-1.5 left-1.5 z-10 bg-muted-foreground text-white rounded-full p-0.5">
                                                <Lock className="h-3 w-3" />
                                              </div>
                                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1 bg-muted-foreground/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm pointer-events-none">
                                                <Lock className="h-2.5 w-2.5" /> FIX済
                                              </div>
                                            </>
                                          )}
                                          <div className="h-16 rounded-md bg-muted/50 flex items-center justify-center mb-1.5 overflow-hidden">
                                            {isImageFile && thumbnailData ? (
                                              <img src={thumbnailData} alt="" className="w-full h-full object-cover" />
                                            ) : (file.file_type === "video" || proc.process_key.includes("video") || proc.process_key === "vcon") && thumbnailData ? (
                                              <video src={thumbnailData} className="w-full h-full object-cover" muted preload="metadata" />
                                            ) : file.file_type === "video" || proc.process_key.includes("video") || proc.process_key === "vcon" ? (
                                              <Film className="h-8 w-8 text-muted-foreground/30" />
                                            ) : file.file_type === "audio" || proc.process_key === "narration" || proc.process_key === "bgm" ? (
                                              <FileText className="h-8 w-8 text-muted-foreground/30" />
                                            ) : proc.process_key.includes("script") || proc.process_key === "na_script" ? (
                                              <FileText className="h-8 w-8 text-muted-foreground/30" />
                                            ) : thumbnailData && (thumbnailData.startsWith("data:image") || thumbnailData.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)) ? (
                                              <img src={thumbnailData} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                              <Image className="h-8 w-8 text-muted-foreground/30" />
                                            )}
                                          </div>
                                          {editingFileId === file.id ? (
                                            <form onSubmit={(e) => { e.preventDefault(); handleRenameFile(file.id, editFileName); }}
                                              onClick={(e) => e.stopPropagation()}>
                                              <Input value={editFileName} onChange={(e) => setEditFileName(e.target.value)}
                                                className="h-5 text-xs w-full" autoFocus
                                                onBlur={() => handleRenameFile(file.id, editFileName)}
                                                onKeyDown={(e) => { if (e.key === "Escape") setEditingFileId(null); }} />
                                            </form>
                                          ) : (
                                            <p className="text-xs font-medium truncate flex items-center gap-1 group/name">
                                              <span className="truncate">{file.file_name}</span>
                                              <button onClick={(e) => { e.stopPropagation(); setEditingFileId(file.id); setEditFileName(file.file_name); }}
                                                className="opacity-0 group-hover/name:opacity-100 shrink-0 text-muted-foreground/50 hover:text-primary transition-all">
                                                <Pencil className="h-2.5 w-2.5" />
                                              </button>
                                            </p>
                                          )}
                                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                                            {file.created_at && <span>{format(new Date(file.created_at), "MM/dd HH:mm")}</span>}
                                            {file.created_by && <span>/ {(file.created_by as string).includes("@") ? (file.created_by as string).split("@")[0] : file.created_by}</span>}
                                          </div>
                                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                            <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", st.class)}>{st.label}</Badge>
                                            {cr && (
                                              <Badge className={cn("text-[10px] h-4 px-1.5", getEffectiveSubmitBadgeClass(cr.overall_status, cr.check_items as any, cr.resolved_items as any))}>
                                                {getEffectiveSubmitLabel(cr.overall_status, cr.check_items as any, cr.resolved_items as any).label}
                                              </Badge>
                                            )}
                                            {versionLabel && <span className="text-[10px] text-muted-foreground">{versionLabel}</span>}
                                          </div>
                                          {cc > 0 && (
                                            <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                                              <MessageCircle className="h-3 w-3" />{cc}
                                            </div>
                                          )}
                                        </button>
                                        {!selectMode && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDeleteTarget({ file, hasCheck: !!cr });
                                            }}
                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:scale-110 z-10"
                                            title="削除"
                                          >
                                            <span className="text-xs font-bold leading-none">×</span>
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </TabsContent>

          <TabsContent value="history">
            <CheckHistory projectId={id!} files={files} checkResults={checkResults} onRenameFile={handleRenameFile} patterns={patterns} />
          </TabsContent>

          <TabsContent value="patterns">
            <TopCorrectionPatterns productCode={product.code} limit={10} />
          </TabsContent>

          <TabsContent value="rules">
            {product && <CheckRulesTab productId={product.id} />}
          </TabsContent>

        </Tabs>
      </div>

      {/* File delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ファイルを削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.file.file_name}」を削除します。この操作は元に戻せません。
              {deleteTarget?.hasCheck && (
                <span className="block mt-2 text-status-warning font-medium">
                  ⚠️ チェック結果も同時に削除されます。
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return;
                const f = deleteTarget.file;
                try {
                  // Delete from storage if applicable
                  const bucket = getStorageBucket(f.process_type);
                  if (bucket && f.file_data && !f.file_data.startsWith("data:")) {
                    // Extract path from public URL
                    const url = new URL(f.file_data);
                    const pathMatch = url.pathname.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+)`));
                    if (pathMatch) {
                      await supabase.storage.from(bucket).remove([decodeURIComponent(pathMatch[1])]);
                    }
                  }
                  // Delete related check results, comments, etc.
                  if (f.check_result_id) {
                    await supabase.from("comments").delete().eq("check_result_id", f.check_result_id);
                    await supabase.from("file_versions").delete().eq("check_result_id", f.check_result_id);
                    await supabase.from("check_results").delete().eq("id", f.check_result_id);
                  }
                  // Delete child versions
                  const childFiles = files.filter(cf => cf.parent_file_id === f.id);
                  for (const child of childFiles) {
                    if (child.check_result_id) {
                      await supabase.from("comments").delete().eq("check_result_id", child.check_result_id);
                      await supabase.from("file_versions").delete().eq("check_result_id", child.check_result_id);
                      await supabase.from("check_results").delete().eq("id", child.check_result_id);
                    }
                    await supabase.from("project_files").delete().eq("id", child.id);
                  }
                  // Delete the file itself
                  const { error } = await supabase.from("project_files").delete().eq("id", f.id);
                  if (error) throw error;
                  toast({ title: "ファイルを削除しました" });
                  setFiles(prev => prev.filter(pf => pf.id !== f.id && pf.parent_file_id !== f.id));
                } catch (err) {
                  toast({ title: "削除エラー", description: err instanceof Error ? err.message : "削除に失敗しました", variant: "destructive" });
                }
                setDeleteTarget(null);
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submission type change confirmation */}
      <AlertDialog open={!!submissionChangeTarget} onOpenChange={(o) => !o && setSubmissionChangeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>クライアント提出に変更</AlertDialogTitle>
            <AlertDialogDescription>
              このファイルを「クライアント提出」としてマークします。このファイルを「クライアント提出」としてマークします。品質レポートに反映されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (submissionChangeTarget) {
                handleChangeSubmissionType(submissionChangeTarget);
                setSubmissionChangeTarget(null);
              }
            }}>
              変更する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload modal */}
      <Dialog open={!!uploadModal} onOpenChange={(o) => !o && setUploadModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>ファイルアップロード</DialogTitle></DialogHeader>
          <div className="space-y-4">



            {/* Pattern selection (only when patterns exist) */}
            {patterns.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">対象</Label>
                <RadioGroup value={uploadPatternMode} onValueChange={(v) => setUploadPatternMode(v as "common" | "specific")} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="common" id="pattern-common" />
                    <Label htmlFor="pattern-common" className="text-xs">全パターン共通</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="specific" id="pattern-specific" />
                    <Label htmlFor="pattern-specific" className="text-xs">特定パターン</Label>
                  </div>
                </RadioGroup>
                {uploadPatternMode === "specific" && (
                  <Select value={uploadPatternId || ""} onValueChange={setUploadPatternId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="パターンを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {patterns.map(p => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}{p.description ? ` — ${p.description}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {PROCESS_FILE_CONFIG[uploadModal || ""]?.allowTextInput && (
              <div className="flex gap-2">
                <Button size="sm" variant={useTextInput ? "outline" : "default"} onClick={() => setUseTextInput(false)} className="text-xs">ファイル選択</Button>
                <Button size="sm" variant={useTextInput ? "default" : "outline"} onClick={() => setUseTextInput(true)} className="text-xs">テキスト直接入力</Button>
              </div>
            )}
            {useTextInput && PROCESS_FILE_CONFIG[uploadModal || ""]?.allowTextInput ? (
              <Textarea value={uploadTextInput} onChange={(e) => setUploadTextInput(e.target.value)}
                placeholder="テキストを入力..." className="min-h-[150px] text-sm font-mono" />
            ) : (
              <div onClick={() => !uploading && fileInputRef.current?.click()}
                className={cn("border-2 border-dashed border-border rounded-xl p-8 text-center transition-colors",
                  uploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50")}>
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {selectedFiles.length > 0 ? (
                    selectedFiles.length === 1
                      ? <span>{selectedFiles[0].name} <span className="text-muted-foreground/60">({formatFileSize(selectedFiles[0].size)})</span></span>
                      : <span>{selectedFiles.length}件のファイルを選択中</span>
                  ) : (
                    isImageProcess(uploadModal || "") ? "クリックしてファイルを選択（複数可）" : "クリックしてファイルを選択"
                  )}
                </p>
                {selectedFiles.length > 1 && (
                  <div className="mt-2 text-xs text-muted-foreground/60 space-y-0.5">
                    {selectedFiles.map((f, i) => (
                      <p key={i}>{f.name} ({formatFileSize(f.size)})</p>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground/60 mt-1">{getFileFormatHint(uploadModal || "")}</p>
                <input ref={fileInputRef} type="file" className="hidden"
                  accept={PROCESS_FILE_CONFIG[uploadModal || ""]?.accept}
                  multiple={isImageProcess(uploadModal || "")}
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) setSelectedFiles(Array.from(files));
                  }} />
              </div>
            )}
            {uploading && uploadProgress !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>アップロード中...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}
            <Button onClick={handleFileUpload} disabled={uploading || (selectedFiles.length === 0 && !uploadTextInput.trim())} className="w-full">
              {uploading ? "アップロード中..." : "アップロード"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pattern dialogs */}
      <AddPatternDialog open={addPatternOpen} onOpenChange={setAddPatternOpen} onAdd={addPattern} />
      <BulkPatternDialog open={bulkPatternOpen} onOpenChange={setBulkPatternOpen} onGenerate={addPatternsBulk} />

      {/* Process management modal */}
      <ProcessManagementModal
        open={processModalOpen}
        onOpenChange={setProcessModalOpen}
        processes={processes}
        onUpdate={updateProcess}
        onReorder={reorderProcesses}
        onAdd={addProcess}
        onDelete={deleteProcess}
        onReset={resetToDefaults}
      />

      {/* Batch check floating progress bar */}
      <BatchCheckFloatingBar
        progress={batchProgress}
        onDismiss={resetBatchProgress}
        getGradeLabel={(g) => getSubmitLabel(g)}
        getGradeBadgeClass={(g) => getSubmitBadgeClass(g)}
      />

      {/* Copy to other patterns dialog */}
      {copyToPatternInfo && (
        <CopyToPatternDialog
          open={!!copyToPatternInfo}
          onOpenChange={(o) => { if (!o) setCopyToPatternInfo(null); }}
          sourcePattern={patterns.find(p => p.id === copyToPatternInfo.sourcePatternId)!}
          allPatterns={patterns}
          processLabel={
            processes.find(p => p.process_key === copyToPatternInfo.processType)?.process_label || copyToPatternInfo.processType
          }
          onConfirm={async (targetIds) => {
            if (!id || !user) return;
            const rows = targetIds.map(patId => ({
              project_id: id,
              process_type: copyToPatternInfo.processType,
              file_name: copyToPatternInfo.fileName,
              file_type: copyToPatternInfo.fileType,
              file_data: copyToPatternInfo.fileData,
              file_size_bytes: copyToPatternInfo.fileSizeBytes,
              created_by: user.email || user.id,
              pattern_id: patId,
            }));
            const { error } = await supabase.from("project_files").insert(rows as any);
            if (error) {
              toast({ title: "コピーエラー", description: error.message, variant: "destructive" });
            } else {
              toast({ title: `${targetIds.length}件のパターンにコピーしました` });
              fetchData();
            }
            setCopyToPatternInfo(null);
          }}
        />
      )}
    </div>
  );
}

function CheckHistory({ projectId, files, checkResults, onRenameFile, patterns }: {
  projectId: string;
  files: ProjectFile[];
  checkResults: Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count" | "created_at" | "user_id" | "check_type" | "comparison_round"> & { resolved_items?: unknown; check_items?: unknown }>;
  onRenameFile: (fileId: string, newName: string) => Promise<void>;
  patterns: { id: string; name: string }[];
}) {
  const navigate = useNavigate();
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editFileName, setEditFileName] = useState("");
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});

  const filesWithChecks = files.filter(f => f.check_result_id && checkResults[f.check_result_id]);

  useEffect(() => {
    const userIds = [...new Set(filesWithChecks.map(f => checkResults[f.check_result_id!]?.user_id).filter(Boolean))] as string[];
    if (userIds.length === 0) return;
    supabase.rpc("get_profiles_by_ids", { p_ids: userIds }).then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((p: { id: string; display_name: string; email: string }) => {
          map[p.id] = p.display_name || p.email?.split("@")[0] || "不明";
        });
        setProfileMap(map);
      }
    });
  }, [filesWithChecks.length]);

  if (filesWithChecks.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">チェック履歴はまだありません</p>;
  }

  const sorted = [...filesWithChecks].sort((a, b) => {
    const aDate = checkResults[a.check_result_id!]?.created_at || "";
    const bDate = checkResults[b.check_result_id!]?.created_at || "";
    return bDate.localeCompare(aDate);
  });

  const processLabelMap: Record<string, string> = {
    script: "構成/字コンテ", na_script: "NA原稿", narration: "ナレーション", bgm: "BGM",
    vcon: "Vコン", styleframe: "スタイルフレーム", storyboard: "絵コンテ",
    video_horizontal: "横動画", video_vertical: "縦動画",
  };

  const patternMap = new Map(patterns.map(p => [p.id, p.name]));

  return (
    <div className="glass-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="px-4 py-2.5 font-medium">チェック日時</th>
            <th className="px-4 py-2.5 font-medium">実行者</th>
            <th className="px-4 py-2.5 font-medium">工程</th>
            {patterns.length > 0 && <th className="px-4 py-2.5 font-medium">パターン</th>}
            <th className="px-4 py-2.5 font-medium">ファイル名</th>
            <th className="px-4 py-2.5 font-medium text-center">稿数</th>
            <th className="px-4 py-2.5 font-medium text-center">Grade</th>
            <th className="px-4 py-2.5 font-medium text-center">NG</th>
            <th className="px-4 py-2.5 font-medium text-center">WARN</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => {
            const cr = checkResults[f.check_result_id!];
            const userName = cr?.user_id ? (profileMap[cr.user_id] || "...") : "—";
            const checkDate = cr?.created_at ? format(new Date(cr.created_at), "MM/dd HH:mm") : "—";
            const processLabel = processLabelMap[f.process_type] || f.process_type;
            const isComparison = cr?.check_type === "comparison";
            const draftLabel = isComparison ? `第${(cr?.comparison_round ?? 0) + 1}稿` : "初稿";
            const patternName = f.pattern_id ? patternMap.get(f.pattern_id) || "—" : "共通";

            return (
              <tr key={f.id} onClick={() => navigate(`/project/${projectId}/file/${f.id}`)} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer">
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{checkDate}</td>
                <td className="px-4 py-2.5">{userName}</td>
                <td className="px-4 py-2.5">
                  <Badge variant="outline" className="text-[10px] font-normal">{processLabel}</Badge>
                </td>
                {patterns.length > 0 && (
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{patternName}</td>
                )}
                <td className="px-4 py-2.5 font-medium">
                  {editingFileId === f.id ? (
                    <form onSubmit={(e) => { e.preventDefault(); onRenameFile(f.id, editFileName).then(() => setEditingFileId(null)); }}
                      onClick={(e) => e.stopPropagation()}>
                      <Input value={editFileName} onChange={(e) => setEditFileName(e.target.value)}
                        className="h-6 text-sm w-48" autoFocus
                        onBlur={() => onRenameFile(f.id, editFileName).then(() => setEditingFileId(null))}
                        onKeyDown={(e) => { if (e.key === "Escape") setEditingFileId(null); }} />
                    </form>
                  ) : (
                    <span className="flex items-center gap-1 group/name">
                      <span>{f.file_name}</span>
                      <button onClick={(e) => { e.stopPropagation(); setEditingFileId(f.id); setEditFileName(f.file_name); }}
                        className="opacity-0 group-hover/name:opacity-100 text-muted-foreground/50 hover:text-primary transition-all">
                        <Pencil className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <Badge variant={isComparison ? "secondary" : "outline"} className="text-[10px]">{draftLabel}</Badge>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <Badge className={cn("text-[10px] font-bold", getEffectiveSubmitBadgeClass(cr?.overall_status, cr?.check_items as any, cr?.resolved_items as any))}>
                    {getEffectiveSubmitLabel(cr?.overall_status, cr?.check_items as any, cr?.resolved_items as any).label}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-center text-status-ng font-bold">{cr?.ng_count ?? 0}</td>
                <td className="px-4 py-2.5 text-center text-status-warning font-bold">{cr?.warning_count ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
