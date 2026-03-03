import { useEffect, useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { runScriptCheck, getWebhookUrl, webhookFetch, getRelatedProcessData, VIDEO_ASYNC_ACCEPTED } from "@/lib/webhook";
import { resolveWebhookProductId } from "@/lib/resolve-product-id";
import { useVideoCheckPolling } from "@/hooks/useVideoCheckPolling";
import { tusUploadBlob } from "@/lib/tus-upload";
import { gatherReferenceMaterials } from "@/lib/reference-materials";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import type { CheckItem } from "@/lib/types";
import { getEffectiveSubmitLabel } from "@/lib/check-display";
import type { MentionMember } from "@/components/comments/MentionInput";
import type { Json } from "@/integrations/supabase/types";
import type { ProjectFile, Product, Project, Client, CheckResultRow } from "@/lib/db-types";
// getWebhookPaths no longer needed — unified v2 webhook
import { useReviewState, useDownload, useExportCsv } from "@/hooks/useReviewState";
import { compressImage } from "@/lib/image-compress";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import ShareLinkModal from "@/components/ShareLinkModal";
import ImagePreview from "@/components/review/ImagePreview";
import ScriptDisplay from "@/components/review/ScriptDisplay";
import MediaPreview, { type MediaPreviewHandle } from "@/components/review/MediaPreview";
import ReviewRightPanel from "@/components/review/ReviewRightPanel";
import ComparisonLeftPanel, { type DraftEntry } from "@/components/review/ComparisonLeftPanel";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, ArrowDown, Download, GitCompare, Link2, CheckCircle2, Loader2, Bot, Upload, ChevronLeft, ChevronRight, Lock, Unlock, Trash2, Pencil, CalendarDays, User } from "lucide-react";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { FILE_STATUS_CONFIG } from "@/lib/db-types";
import { useCheckProgress, ESTIMATED_DURATION } from "@/hooks/useCheckProgress";
import { Progress } from "@/components/ui/progress";

interface AnnotationData {
  type: string;
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
  text?: string;
  imagePosition?: { x: number; y: number; width: number; height: number };
}

export default function FileReviewPage() {
  const { projectId, fileId } = useParams<{ projectId: string; fileId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { downloadFile } = useDownload();
  const { exportCsv } = useExportCsv();

  const [file, setFile] = useState<ProjectFile | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [record, setRecord] = useState<CheckResultRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const isRecheckingRef = useRef(false);
  
  const [shareOpen, setShareOpen] = useState(false);
  const [uploadRevisionOpen, setUploadRevisionOpen] = useState(false);
  const [versions, setVersions] = useState<ProjectFile[]>([]);
  const [savedAnnotations, setSavedAnnotations] = useState<AnnotationData[]>([]);
  const [highlightAnnotation, setHighlightAnnotation] = useState<AnnotationData | null>(null);
  const [siblingFiles, setSiblingFiles] = useState<ProjectFile[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const mediaPreviewRef = useRef<MediaPreviewHandle>(null);
  const [mediaCurrentTime, setMediaCurrentTime] = useState<number | null>(null);
  const [correctionCount, setCorrectionCount] = useState<number>(0);
  const [correctionRefreshKey, setCorrectionRefreshKey] = useState(0);
  const [candidateCount, setCandidateCount] = useState<number>(0);
  const [mentionMembers, setMentionMembers] = useState<MentionMember[]>([]);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [submitToClientOpen, setSubmitToClientOpen] = useState(false);
  const [internalRevisionOpen, setInternalRevisionOpen] = useState(false);
  const [comparisonDrafts, setComparisonDrafts] = useState<DraftEntry[]>([]);
  const [comparisonActivePairIndex, setComparisonActivePairIndex] = useState(0);
  const [commentRefreshKey, setCommentRefreshKey] = useState(0);
  const checkItems = record?.check_items ? (record.check_items as unknown as CheckItem[]) : null;
  const { items, markers, commentCounts, paintMode, setPaintMode, highlightCard, rightTab, setRightTab, commentFilter, scrollToCard, handleCommentClick } =
    useReviewState(record?.id, checkItems);

  // Poll media current time when comments tab is active
  useEffect(() => {
    const aiCfgLocal = file ? AI_CHECK_CONFIG[file.process_type] : null;
    const isMedia = aiCfgLocal?.inputMode === "audio" || aiCfgLocal?.inputMode === "video";
    if (!isMedia || rightTab !== "comments") { setMediaCurrentTime(null); return; }
    const interval = setInterval(() => {
      const t = mediaPreviewRef.current?.getCurrentTime() ?? 0;
      setMediaCurrentTime(t > 0 ? t : null);
    }, 500);
    return () => clearInterval(interval);
  }, [rightTab, file?.process_type]);

  const handleSeekMedia = useCallback((seconds: number) => {
    mediaPreviewRef.current?.seekTo(seconds);
  }, []);

  // Fetch correction stats
  useEffect(() => {
    if (!product?.id || !file?.process_type) return;
    const fetchStats = async () => {
      const { count: cCount } = await supabase
        .from("correction_logs")
        .select("*", { count: "exact", head: true })
        .eq("product_id", product.id)
        .eq("process_type", file.process_type);
      setCorrectionCount(cCount ?? 0);

      const { count: rCount } = await supabase
        .from("rule_candidates")
        .select("*", { count: "exact", head: true })
        .eq("product_id", product.id)
        .eq("status", "pending");
      setCandidateCount(rCount ?? 0);
    };
    fetchStats();
  }, [product?.id, file?.process_type, correctionRefreshKey]);

  const fetchVersions = async () => {
    if (!fileId) return;
    const { data: vers, error } = await supabase.from("project_files").select("*")
      .or(`id.eq.${fileId},parent_file_id.eq.${fileId}`)
      .order("version_number");
    handleSupabaseError(error, "versions");
    setVersions(vers ?? []);
  };

  useEffect(() => {
    if (!fileId || !projectId) return;
    let cancelled = false;
    (async () => {
      const { data: f, error: fErr } = await supabase.from("project_files").select("*").eq("id", fileId).maybeSingle();
      if (cancelled) return;
      if (handleSupabaseError(fErr, "file") || !f) { setLoading(false); return; }
      setFile(f);

      // Reset comparison state when navigating to a new file
      setComparisonMode(false);
      setComparisonDrafts([]);
      setComparisonActivePairIndex(0);

      const { data: proj, error: projErr } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
      if (cancelled) return;
      handleSupabaseError(projErr, "project");
      setProject(proj);

      let loadedProduct: Product | null = null;
      if (proj?.product_id) {
        const { data: prod, error: prodErr } = await supabase.from("products").select("*").eq("id", proj.product_id).maybeSingle();
        if (cancelled) return;
        handleSupabaseError(prodErr, "product");
        setProduct(prod);
        loadedProduct = prod;
        if (prod?.client_id) {
          const { data: cl, error: clErr } = await supabase.from("clients").select("*").eq("id", prod.client_id).maybeSingle();
          if (cancelled) return;
          handleSupabaseError(clErr, "client");
          setClient(cl);
        }
      }

      if (f.check_result_id && !isRecheckingRef.current) {
        const { data: cr, error: crErr } = await supabase.from("check_results").select("*").eq("id", f.check_result_id).maybeSingle();
        if (cancelled || isRecheckingRef.current) return;
        handleSupabaseError(crErr, "check_result");
        // If file is in "checking" state (e.g. batch check in progress), resume checking UI
        if (f.status === "checking" && (!cr || !cr.check_items || !(cr.check_items as unknown[]).length)) {
          // Check if the checking state is stale (> 15 minutes old)
          const checkingStarted = f.checking_started_at ? new Date(f.checking_started_at).getTime() : 0;
          const isStale = checkingStarted > 0 && (Date.now() - checkingStarted > 15 * 60 * 1000);
          if (isStale) {
            // Stale check — reset status so user can retry
            console.warn("[FileReview] Stale checking state detected, resetting file status");
            await supabase.from("project_files").update({ 
              status: cr ? "checked" : "uploaded", 
              checking_by: null, 
              checking_started_at: null 
            } as any).eq("id", f.id);
            setFile(prev => prev ? { ...prev, status: cr ? "checked" : "uploaded", checking_by: null, checking_started_at: null } : prev);
            if (cr) setRecord(cr);
          } else {
            setChecking(true);
          }
        } else {
          // Check for comparison history — if exists, show latest comparison result by default
          const { data: compHistory } = await supabase
            .from("check_results")
            .select("id, created_at, overall_status, ng_count, warning_count, ok_count, total_checks, check_items, comparison_round, input_data")
            .eq("parent_check_result_id", f.check_result_id)
            .eq("check_type", "comparison")
            .order("comparison_round", { ascending: false })
            .limit(1);

          if (!cancelled && compHistory && compHistory.length > 0) {
            const latest = compHistory[0];
            // Show latest comparison result by default
            setRecord(latest as any);

            // Restore the after-draft image from input_data
            const inputData = latest.input_data as Record<string, unknown> | null;
            const aiCfgLocal = AI_CHECK_CONFIG[f.process_type];
            const isImg = aiCfgLocal?.inputMode === "image";
            const isText = (aiCfgLocal?.inputMode || "text") === "text";

            if (inputData) {
              const afterData = isImg ? (inputData.after_image as string) : (inputData.after_text as string);
              if (afterData) {
                // Initialize comparison drafts with original + latest draft
                setComparisonDrafts([
                  { label: "初稿", data: f.file_data, text: isText ? (f.file_data || "") : "" },
                  { label: `第${(latest.comparison_round ?? 1) + 1}稿`, data: afterData, text: isImg ? "" : (afterData || "") },
                ]);
              }
            }
          } else {
            setRecord(cr);
          }
        }
      } else if (f.status === "checking") {
        // File marked as checking but no check_result_id yet
        // Check if the checking state is stale (> 15 minutes old)
        const checkingStarted = f.checking_started_at ? new Date(f.checking_started_at).getTime() : 0;
        const isStale = checkingStarted > 0 && (Date.now() - checkingStarted > 15 * 60 * 1000);
        if (isStale) {
          console.warn("[FileReview] Stale checking state (no result), resetting");
          await supabase.from("project_files").update({ 
            status: "uploaded", 
            checking_by: null, 
            checking_started_at: null 
          } as any).eq("id", f.id);
          setFile(prev => prev ? { ...prev, status: "uploaded", checking_by: null, checking_started_at: null } : prev);
        } else {
          setChecking(true);
        }
      }

      await fetchVersions();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fileId, projectId]);

  // Fetch sibling files for navigation (all patterns in same process, ordered by pattern sort_order then file_name)
  useEffect(() => {
    if (!file || !projectId) return;
    let cancelled = false;

    const fetchSiblings = async () => {
      // Fetch patterns for this project to get sort_order
      const { data: projectPatterns } = await supabase
        .from("patterns")
        .select("id, sort_order")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });

      // Fetch all root files in the same process
      const { data, error } = await supabase
        .from("project_files")
        .select("id, file_name, process_type, check_result_id, status, parent_file_id, pattern_id")
        .eq("project_id", projectId)
        .eq("process_type", file.process_type)
        .is("parent_file_id", null)
        .order("file_name", { ascending: true });

      if (cancelled) return;
      handleSupabaseError(error, "sibling files");

      const allFiles = (data ?? []) as ProjectFile[];

      // Sort: pattern sort_order (null/common first), then file_name within each pattern
      const patternOrderMap = new Map<string | null, number>();
      patternOrderMap.set(null, -1); // common files first
      (projectPatterns ?? []).forEach((p, idx) => patternOrderMap.set(p.id, p.sort_order ?? idx));

      allFiles.sort((a, b) => {
        const aOrder = patternOrderMap.get(a.pattern_id ?? null) ?? 9999;
        const bOrder = patternOrderMap.get(b.pattern_id ?? null) ?? 9999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.file_name || "").localeCompare(b.file_name || "", "ja");
      });

      setSiblingFiles(allFiles);
    };

    fetchSiblings();
    return () => { cancelled = true; };
  }, [file?.process_type, projectId, file?.id]);

  const currentIndex = siblingFiles.findIndex(f => f.id === fileId);
  const prevFile = currentIndex > 0 ? siblingFiles[currentIndex - 1] : null;
  const nextFile = currentIndex < siblingFiles.length - 1 ? siblingFiles[currentIndex + 1] : null;

  const navigateToFile = useCallback((targetFileId: string) => {
    navigate(`/project/${projectId}/file/${targetFileId}`, { replace: true });
  }, [navigate, projectId]);

  // Keyboard shortcuts for prev/next
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && prevFile) {
        e.preventDefault();
        navigateToFile(prevFile.id);
      } else if (e.key === "ArrowRight" && nextFile) {
        e.preventDefault();
        navigateToFile(nextFile.id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prevFile, nextFile, navigateToFile]);

  // Recovery: re-fetch file & check_result from DB (e.g. after webhook timeout but n8n completed)
  const recoverCheckResult = useCallback(async () => {
    if (!fileId || isRecheckingRef.current) return;
    const { data: freshFile } = await supabase.from("project_files").select("*").eq("id", fileId).maybeSingle();
    if (freshFile && !isRecheckingRef.current) {
      setFile(freshFile);
      if (freshFile.check_result_id) {
        const { data: cr } = await supabase.from("check_results").select("*").eq("id", freshFile.check_result_id).maybeSingle();
        if (cr && cr.check_items && !isRecheckingRef.current) {
          setRecord(cr);
          setChecking(false);
          // Update file status if still "checking"
          if (freshFile.status === "checking") {
            await supabase.from("project_files").update({ status: "checked" }).eq("id", fileId);
            setFile(prev => prev ? { ...prev, status: "checked" } : prev);
          }
          toast({ title: "チェック完了", description: `Grade: ${cr.overall_status}` });
          return;
        }
      }
    }
  }, [fileId]);

  // Poll for check result when checking is in progress (handles n8n completing after frontend timeout)
  // Timeout after 15 minutes to prevent infinite polling
  const pollingStartRef = useRef<number>(0);
  useEffect(() => {
    if (!checking || !file?.check_result_id || isRecheckingRef.current) return;
    if (!pollingStartRef.current) pollingStartRef.current = Date.now();
    const MAX_RECOVERY_POLL_MS = 15 * 60 * 1000; // 15 minutes
    const interval = setInterval(async () => {
      if (isRecheckingRef.current) return;
      // Check if we've been polling too long
      if (Date.now() - pollingStartRef.current > MAX_RECOVERY_POLL_MS) {
        console.warn("[FileReview] Recovery polling timed out, resetting checking state");
        setChecking(false);
        // Reset file status in DB
        await supabase.from("project_files").update({ 
          status: "uploaded", 
          checking_by: null, 
          checking_started_at: null 
        } as any).eq("id", file.id);
        setFile(prev => prev ? { ...prev, status: "uploaded", checking_by: null, checking_started_at: null } : prev);
        toast({ title: "チェック処理がタイムアウトしました", description: "再度AIチェックを実行してください。", variant: "destructive" });
        pollingStartRef.current = 0;
        return;
      }
      const { data: cr } = await supabase.from("check_results").select("*").eq("id", file.check_result_id!).maybeSingle();
      if (cr && cr.check_items && Array.isArray(cr.check_items) && (cr.check_items as unknown[]).length > 0 && !isRecheckingRef.current) {
        setRecord(cr);
        setChecking(false);
        pollingStartRef.current = 0;
        // Update file status in DB to "checked"
        await supabase.from("project_files").update({ status: "checked" }).eq("id", fileId);
        setFile(prev => prev ? { ...prev, status: "checked" } : prev);
        toast({ title: "チェック完了", description: `Grade: ${cr.overall_status}` });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [checking, file?.check_result_id]);

  const processInputMode = file ? (AI_CHECK_CONFIG[file.process_type]?.inputMode || "text") : "text";
  const checkProgress = useCheckProgress(ESTIMATED_DURATION[processInputMode] || 60_000);

  const isExecutingRef = useRef(false);
  const videoPolling = useVideoCheckPolling();
  const [lockedByUser, setLockedByUser] = useState<string | null>(null);

  // Check lock status on mount and periodically
  useEffect(() => {
    if (!fileId || !user) return;
    let cancelled = false;
    const checkLock = async () => {
      const { data: f } = await supabase.from("project_files").select("checking_by, checking_started_at").eq("id", fileId).maybeSingle();
      if (cancelled || !f) return;
      if (f.checking_by && f.checking_by !== user.id) {
        // Check if lock is stale (> 15 minutes old)
        const startedAt = f.checking_started_at ? new Date(f.checking_started_at).getTime() : 0;
        if (Date.now() - startedAt < 15 * 60 * 1000) {
          // Fetch the locking user's display name
          const { data: profile } = await supabase.from("profiles").select("display_name, email").eq("id", f.checking_by).maybeSingle();
          if (!cancelled) setLockedByUser(profile?.display_name || profile?.email?.split("@")[0] || "他のユーザー");
        } else {
          // Stale lock — release it
          await supabase.from("project_files").update({ checking_by: null, checking_started_at: null } as any).eq("id", fileId);
          if (!cancelled) setLockedByUser(null);
        }
      } else {
        if (!cancelled) setLockedByUser(null);
      }
    };
    checkLock();
    const interval = setInterval(checkLock, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [fileId, user?.id]);

  // Release lock on unmount / navigation
  useEffect(() => {
    return () => {
      if (fileId && user && isExecutingRef.current) {
        supabase.from("project_files").update({ checking_by: null, checking_started_at: null } as any).eq("id", fileId).eq("checking_by", user.id);
      }
    };
  }, [fileId, user?.id]);

  const acquireLock = async (): Promise<boolean> => {
    if (!fileId || !user) return false;
    // Try to acquire lock — only if not locked by someone else
    const { data: current } = await supabase.from("project_files").select("checking_by, checking_started_at").eq("id", fileId).maybeSingle();
    if (current?.checking_by && current.checking_by !== user.id) {
      const startedAt = current.checking_started_at ? new Date(current.checking_started_at).getTime() : 0;
      if (Date.now() - startedAt < 15 * 60 * 1000) {
        const { data: profile } = await supabase.from("profiles").select("display_name, email").eq("id", current.checking_by).maybeSingle();
        const name = profile?.display_name || profile?.email?.split("@")[0] || "他のユーザー";
        toast({ title: "チェック中のため操作できません", description: `${name}さんが現在チェック中です。完了をお待ちください。`, variant: "destructive" });
        return false;
      }
    }
    await supabase.from("project_files").update({ checking_by: user.id, checking_started_at: new Date().toISOString() } as any).eq("id", fileId);
    return true;
  };

  const releaseLock = async () => {
    if (!fileId || !user) return;
    await supabase.from("project_files").update({ checking_by: null, checking_started_at: null } as any).eq("id", fileId).eq("checking_by", user.id);
    setLockedByUser(null);
  };

  const handleRunCheck = async () => {
    if (!file || !product || !user || !projectId) return;
    if (isExecutingRef.current) return;

    // Acquire lock
    const locked = await acquireLock();
    if (!locked) return;

    isExecutingRef.current = true;
    // Save old check_result_id for recovery on timeout
    const previousCheckResultId = file.check_result_id;
    // Clear old results before re-check
    isRecheckingRef.current = true;
    setRecord(null);
    setChecking(true);
    checkProgress.start();
    let pendingRecordId: string | null = null;
    const processKey = file.process_type || "script";

    // Immediately mark file as "checking" in DB so ProjectPage can show the status
    await supabase.from("project_files").update({ status: "checking" }).eq("id", file.id);
    setFile(prev => prev ? { ...prev, status: "checking" } : prev);

    try {
      const aiCfg = AI_CHECK_CONFIG[processKey];
      const inputMode = aiCfg?.inputMode || "text";

      // Gather reference materials
      const refMaterials = await gatherReferenceMaterials(projectId, product.id, processKey);
      const referenceContext = JSON.stringify(refMaterials);

      let res: { overall_status: string; detected_case?: string; check_items: CheckItem[]; ng_count: number; warning_count: number; ok_count: number; total_checks: number };
      let inputData: Record<string, any> = {};

      if (inputMode === "text") {
        // Text processes: send directly (small payload)
        res = await runScriptCheck(product.id, file.file_data || "", processKey, referenceContext);
        inputData = { script_text: file.file_data };
      } else {
        // Media processes: upload to Storage and send public URL instead of base64
        const webhookUrl = getWebhookUrl(processKey);
        if (!webhookUrl) throw new Error(`この工程(${processKey})のWebhookが見つかりません`);

        const webhookProductId = await resolveWebhookProductId(product.id);
        const body: Record<string, any> = {
          product_id: webhookProductId,
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
          // Ensure all audio fields are present for n8n (matching runAudioCheck format)
          body.audio_url = body.audio_url || "";
          body.audio_mime_type = body.audio_mime_type || "";
          body.audio_base64 = body.audio_base64 || "";
          body.audio_description = "";
          body.metadata = { file_name: file.file_name, duration: null, format: body.audio_mime_type || null };
          body.script_text = file.file_data?.startsWith("data:") || file.file_data?.startsWith("http") ? "" : (file.file_data || "");
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
            // Derive mime type from URL extension
            const urlExt = fileData.split('.').pop()?.split('?')[0]?.toLowerCase() || "mp4";
            body.video_mime_type = urlExt === "webm" ? "video/webm" : urlExt === "mov" ? "video/quicktime" : "video/mp4";
          }
          body.script_text = file.file_data?.startsWith("data:") ? "" : (file.file_data || "");
          inputData = { script_text: body.script_text, video_url: body.video_url || "" };
        }

        // For video and audio processes, include related files from the same project
        // Include related files (all prior process FIX data) for cross-reference
        const isFirstProcess = processKey === "script";
        if (!isFirstProcess && projectId) {
          const relatedFiles = await getRelatedProcessData(projectId, processKey, file.pattern_id);
          if (Object.keys(relatedFiles).length > 0) {
            body.related_files = relatedFiles;
            console.log("[CheckMate] Including related_files:", Object.keys(relatedFiles));
          }
        }

        // For video/audio async checks, insert a pending record first so n8n can UPDATE it
        const isAsyncProcess = ["vcon", "video_horizontal", "video_vertical", "narration", "bgm"].includes(processKey);
        // pendingRecordId is hoisted above try block
        if (isAsyncProcess) {
          const { data: pendingCr, error: pendingErr } = await supabase.from("check_results").insert([{
            user_id: user.id,
            client_name: client?.name || "",
            product_code: product.code,
            product_name: product.name,
            process_type: processKey,
            input_type: "text",
            input_text: body.script_text || null,
            status: "pending",
            input_data: inputData as unknown as Json,
          }]).select("id").single();
          if (pendingErr || !pendingCr) {
            console.error("[CheckMate] Failed to create pending record:", pendingErr);
          } else {
            pendingRecordId = pendingCr.id;
            body.record_id = pendingRecordId;
            console.log("[CheckMate] Created pending record:", pendingRecordId);
          }
        }

        console.log('[CheckMate] Webhook URL:', webhookUrl);
        console.log('[CheckMate] Body size:', JSON.stringify(body).length, 'bytes');
        console.log('[CheckMate] Body keys:', Object.keys(body));
        const webhookSentAt = new Date().toISOString();
        const rawRes = await webhookFetch(webhookUrl, body);

        if (rawRes === VIDEO_ASYNC_ACCEPTED) {
          // Async check (video/audio): poll for result from DB using the pending record ID
          if (pendingRecordId) {
            // Link to file immediately so UI shows "checking" state
            await supabase.from("project_files").update({
              status: "checking",
              check_result_id: pendingRecordId,
            }).eq("id", file.id);
            setFile({ ...file, status: "checking", check_result_id: pendingRecordId });
          }
          const polled = await videoPolling.startPolling(product.code, processKey, webhookSentAt);
          if (!polled) {
            isRecheckingRef.current = false;
            // Check the pending record directly — n8n may have updated it
            if (pendingRecordId) {
              const { data: updatedCr } = await supabase.from("check_results").select("*").eq("id", pendingRecordId).maybeSingle();
              if (updatedCr && updatedCr.status === "completed" && updatedCr.check_items) {
                setRecord(updatedCr);
                await supabase.from("project_files").update({ status: "checked", check_result_id: updatedCr.id }).eq("id", file.id);
                setFile({ ...file, status: "checked", check_result_id: updatedCr.id });
                checkProgress.complete();
                toast({ title: "チェック完了", description: `Grade: ${updatedCr.overall_status}` });
                return;
              }
            }
            // Restore previous result if available, and reset file status
            if (previousCheckResultId) {
              const { data: prevCr } = await supabase.from("check_results").select("*").eq("id", previousCheckResultId).maybeSingle();
              if (prevCr) {
                setRecord(prevCr);
                await supabase.from("project_files").update({ 
                  status: "checked", 
                  check_result_id: prevCr.id,
                  checking_by: null,
                  checking_started_at: null,
                } as any).eq("id", file.id);
                setFile({ ...file, status: "checked", check_result_id: prevCr.id });
              }
            } else {
              // No previous result — reset to uploadable state
              await supabase.from("project_files").update({ 
                status: "uploaded", 
                checking_by: null, 
                checking_started_at: null,
              } as any).eq("id", file.id);
              setFile({ ...file, status: "uploaded" });
            }
            toast({ title: "チェック処理がタイムアウトしました", description: "再度AIチェックを実行してください。", variant: "destructive" });
            return;
          }
          // n8n wrote the result directly — load it
          setRecord(polled);
          // Link to file
          const { error: updateErr } = await supabase.from("project_files").update({
            status: "checked",
            check_result_id: polled.id,
          }).eq("id", file.id);
          handleSupabaseError(updateErr, "project_files update");
          setFile({ ...file, status: "checked", check_result_id: polled.id });
          checkProgress.complete();
          toast({ title: "チェック完了", description: `Grade: ${polled.overall_status}` });
          return;
        }

        res = rawRes;
      }

      const { data: crData, error: insertErr } = await supabase.from("check_results").insert([{
        user_id: user.id,
        client_name: client?.name || "",
        product_code: product.code,
        product_name: product.name,
        process_type: processKey,
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

      if (handleSupabaseError(insertErr, "check_results insert") || !crData) throw new Error("チェック結果の保存に失敗しました");

      const { error: updateErr } = await supabase.from("project_files").update({
        status: "checked",
        check_result_id: crData.id,
      }).eq("id", file.id);
      handleSupabaseError(updateErr, "project_files update");

      setFile({ ...file, status: "checked", check_result_id: crData.id });

      const { data: fullCr } = await supabase.from("check_results").select("*").eq("id", crData.id).maybeSingle();
      setRecord(fullCr);

      checkProgress.complete();
      toast({ title: "チェック完了", description: `Grade: ${res.overall_status}` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "不明なエラー";
      console.error("[FileReview] AIチェックエラー:", err);
      isRecheckingRef.current = false;

      // For video checks: "Failed to fetch" often means the connection timed out
      // but n8n is still processing. Poll the specific pending record by ID.
      const isVideoProcess = ["vcon", "video_horizontal", "video_vertical"].includes(processKey);
      if (pendingRecordId && isVideoProcess) {
        toast({ title: "動画分析中...", description: "接続がタイムアウトしましたが、AI分析は続行中です。結果を待っています..." });

        // Poll the specific pending record by ID until it's completed
        const MAX_POLL_MS = 600_000; // 10 min
        const POLL_INTERVAL = 10_000;
        const pollStart = Date.now();
        let foundResult = false;

        while (Date.now() - pollStart < MAX_POLL_MS) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL));
          const { data: cr } = await supabase
            .from("check_results")
            .select("*")
            .eq("id", pendingRecordId)
            .maybeSingle();

          if (cr && cr.status === "completed" && cr.check_items) {
            setRecord(cr);
            await supabase.from("project_files").update({ status: "checked", check_result_id: cr.id }).eq("id", file.id);
            setFile({ ...file, status: "checked", check_result_id: cr.id });
            checkProgress.complete();
            setChecking(false);
            toast({ title: "チェック完了", description: `Grade: ${cr.overall_status}` });
            foundResult = true;
            break;
          }
        }

        if (foundResult) return;
        // Polling timed out — clean up pending record
        await supabase.from("check_results").delete().eq("id", pendingRecordId).eq("status", "pending");
      }

      // Restore previous result so user doesn't see "未実行"
      if (previousCheckResultId) {
        const { data: prevCr } = await supabase.from("check_results").select("*").eq("id", previousCheckResultId).maybeSingle();
        if (prevCr) {
          setRecord(prevCr);
          await supabase.from("project_files").update({ 
            status: "checked", 
            check_result_id: prevCr.id,
            checking_by: null,
            checking_started_at: null,
          } as any).eq("id", file.id);
          setFile({ ...file, status: "checked", check_result_id: prevCr.id });
        }
      } else {
        // No previous result — reset to uploadable state so user can retry
        await supabase.from("project_files").update({ 
          status: "uploaded", 
          checking_by: null, 
          checking_started_at: null,
        } as any).eq("id", file.id);
        setFile({ ...file, status: "uploaded" });
      }
      toast({ title: "チェック送信に失敗しました", description: "n8nへの接続に失敗しました。再度お試しください。", variant: "destructive" });
    } finally {
      isRecheckingRef.current = false;
      setChecking(false);
      isExecutingRef.current = false;
      checkProgress.reset();
      videoPolling.cancelPolling();
      await releaseLock();
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!file) return;
    const { error } = await supabase.from("project_files").update({ status: newStatus }).eq("id", file.id);
    if (!handleSupabaseError(error, "status update")) {
      setFile({ ...file, status: newStatus });
    }
  };

  const handleDownload = () => {
    if (!file) return;
    const dlFile = latestVersionFile && latestVersionFile.id !== file.id ? latestVersionFile : file;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    if (dlFile.file_type === "image" && dlFile.file_data) {
      downloadFile(dlFile.file_data, `${file.file_name}_${date}.jpg`, true);
    } else {
      downloadFile(dlFile.file_data || "", `${file.file_name}_${date}.txt`, false);
    }
  };

  const handleExportCsv = () => {
    if (!record) return;
    exportCsv(items, `checkmate_${file?.file_name}_${Date.now()}.csv`);
  };

  // Fetch saved annotations from comments
  const fetchSavedAnnotations = useCallback(async () => {
    if (!record?.id) return;
    const { data, error } = await supabase
      .from("comments")
      .select("annotation_data")
      .eq("check_result_id", record.id)
      .not("annotation_data", "is", null);
    if (handleSupabaseError(error, "saved annotations")) return;
    const anns: AnnotationData[] = [];
    (data ?? []).forEach((c) => {
      const ad = c.annotation_data as Record<string, unknown> | null;
      if (ad && Array.isArray(ad.annotations)) {
        ad.annotations.forEach((a: unknown) => anns.push(a as AnnotationData));
      } else if (ad && ad.type) {
        anns.push(ad as unknown as AnnotationData);
      }
    });
    setSavedAnnotations(anns);
  }, [record?.id]);

  useEffect(() => { fetchSavedAnnotations(); }, [fetchSavedAnnotations]);

  // Fetch workspace members for mention in paint mode
  useEffect(() => {
    supabase.from("workspace_members").select("id, user_id, email, role, status").eq("status", "accepted").not("user_id", "is", null).then(({ data }) => {
      if (!data) return;
      const memberList: MentionMember[] = data.map((m) => ({
        id: m.id, user_id: m.user_id, display_name: m.email.split("@")[0], email: m.email,
      }));
      const userIds = data.filter((m) => m.user_id).map((m) => m.user_id!);
      if (userIds.length > 0) {
        supabase.rpc("get_profiles_by_ids", { p_ids: userIds }).then(({ data: profiles }) => {
          const profileMap: Record<string, string> = {};
          const activeUserIds = new Set<string>();
          (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p.display_name || p.email?.split("@")[0] || ""; activeUserIds.add(p.id); });
          setMentionMembers(memberList.filter((m) => m.user_id && activeUserIds.has(m.user_id)).map((m) => ({ ...m, display_name: profileMap[m.user_id!] || m.display_name })));
        });
      }
    });
  }, []);

  const handleAnnotationSave = async (annotations: unknown[], comment: string, mentionedUserIds?: string[], isCorrection?: boolean) => {
    if (!record?.id || !user) return;
    // Auto-capture media timestamp for video/audio annotations
    const currentMediaTime = mediaPreviewRef.current?.getCurrentTime() ?? null;
    const aiCfgLocal = file ? AI_CHECK_CONFIG[file.process_type] : null;
    const isMedia = aiCfgLocal?.inputMode === "audio" || aiCfgLocal?.inputMode === "video";
    const { data: savedComment, error } = await supabase.from("comments").insert([{
      check_result_id: record.id,
      author_name: user.email?.split("@")[0] || "User",
      author_email: user.email || "",
      content: comment || "アノテーション追加",
      annotation_data: { annotations } as unknown as Json,
      status: "open",
      mentions: mentionedUserIds && mentionedUserIds.length > 0 ? mentionedUserIds : null,
      media_timestamp: isMedia && currentMediaTime && currentMediaTime > 0 ? currentMediaTime : null,
    }]).select("id").single();
    if (!handleSupabaseError(error, "annotation save")) {
      toast({ title: "コメントを保存しました" });
      fetchSavedAnnotations();
      setCommentRefreshKey((k) => k + 1);

      // Save correction log if requested
      if (isCorrection && savedComment?.id && product?.id && file?.process_type) {
        try {
          await supabase.from("correction_logs").insert({
            product_id: product.id,
            project_id: projectId || null,
            process_type: file.process_type,
            pattern_id: file?.pattern_id || null,
            file_id: fileId || null,
            check_result_id: record.id,
            comment_id: savedComment.id,
            correction_text: comment,
            ai_scope: "project",
            created_by: user.id,
          } as any);
          setCorrectionRefreshKey((k) => k + 1);
        } catch (err) {
          console.error("[correction_logs] silent error:", err);
        }
      }

      // Send mention notifications
      if (mentionedUserIds && mentionedUserIds.length > 0) {
        const authorName = user.email?.split("@")[0] || "User";
        for (const uid of mentionedUserIds) {
          if (uid === user.id) continue;
          await supabase.from("notifications").insert({
            user_id: uid, type: "mention",
            title: "コメントでメンションされました",
            message: `${authorName}さんからメンション: ${comment.slice(0, 80)}`,
            data: { check_result_id: record.id },
          });
        }
      }

      // Send general comment notifications
      const authorName = user.email?.split("@")[0] || "User";
      const excludeSet = new Set([user.id, ...(mentionedUserIds || [])]);
      const { data: wsMembers } = await supabase.from("workspace_members").select("user_id").eq("status", "accepted").not("user_id", "is", null);
      const targetIds = (wsMembers || []).map((m) => m.user_id!).filter((uid) => !excludeSet.has(uid));
      if (targetIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, notify_comment").in("id", targetIds).eq("notify_comment", true);
        if (profiles && profiles.length > 0) {
          await supabase.from("notifications").insert(profiles.map((p) => ({
            user_id: p.id, type: "comment",
            title: "新しいコメントが投稿されました",
            message: `${authorName}: ${comment.slice(0, 80)}`,
            data: { check_result_id: record.id },
          })));
        }
      }
    }
  };

  const handleAnnotationClick = useCallback((annotationData: unknown) => {
    const ad = annotationData as Record<string, unknown> | null;
    if (!ad) return;
    let ann: AnnotationData | null = null;
    if (Array.isArray(ad.annotations) && ad.annotations.length > 0) {
      ann = ad.annotations[0] as AnnotationData;
    } else if (ad.type) {
      ann = ad as unknown as AnnotationData;
    }
    if (ann) {
      setHighlightAnnotation(ann);
      setTimeout(() => setHighlightAnnotation(null), 2500);
    }
  }, []);

  // Handle right panel marker click → jump to left panel location
  const handleMarkerJump = useCallback((patternId: string) => {
    const item = items.find((i) => i.pattern_id === patternId);
    if (!item) return;

    const aiCfg = file ? AI_CHECK_CONFIG[file.process_type] : null;
    const inputMode = aiCfg?.inputMode || "text";

    if (inputMode === "audio" || inputMode === "video") {
      // Parse timestamp from location and seek
      if (item.location) {
        const tsMatch = item.location.match(/(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)/);
        if (tsMatch) {
          const parts = tsMatch[1].split(".")[0].split(":").map(Number);
          let seconds = 0;
          if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
          else if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          const msPart = tsMatch[1].split(".")[1];
          if (msPart) seconds += Number(msPart) / (msPart.length === 1 ? 10 : msPart.length === 2 ? 100 : 1000);
          mediaPreviewRef.current?.seekTo(seconds);
        }
      }
    } else if (inputMode === "text") {
      // Scroll to the matching line in ScriptDisplay
      const el = document.querySelector(`[data-pattern-id="${patternId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2000);
      }
    }
    // For image: markers are already visible, flash them
    // No special handling needed since they're always on screen
  }, [items, file]);

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (!file) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">ファイルが見つかりません</div>;

  // Determine the latest version file to display (instead of always showing initial draft)
  const latestVersionFile = versions.length > 1
    ? versions.reduce((latest, v) => (v.version_number ?? 1) > (latest.version_number ?? 1) ? v : latest, versions[0])
    : null;
  const displayFile = latestVersionFile && latestVersionFile.id !== file.id ? latestVersionFile : file;
  const currentVersionNumber = displayFile.version_number ?? 1;
  const totalVersions = versions.length;

  const isSf = displayFile.file_type === "image" || AI_CHECK_CONFIG[displayFile.process_type]?.inputMode === "image";
  const currentStatus = file.status || "uploaded";
  const sc = FILE_STATUS_CONFIG[currentStatus] ?? FILE_STATUS_CONFIG.uploaded;
  const hasCheckResult = !!record;
  const hasVersions = versions.length > 1;
  const aiCfg = AI_CHECK_CONFIG[file.process_type];
  const canCheck = product && aiCfg?.enabled;
  const checkDisabled = product && aiCfg && !aiCfg.enabled;

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="border-b border-border bg-card shrink-0">
          {/* Row 1: Navigation + file name */}
          <div className="flex items-center gap-2 px-4 pt-2 pb-1">
            <button onClick={() => navigate(`/project/${projectId}`)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </button>

            <button
              onClick={() => prevFile && navigateToFile(prevFile.id)}
              disabled={!prevFile}
              className={cn("shrink-0 p-1 rounded transition-colors", prevFile ? "hover:bg-muted text-muted-foreground hover:text-foreground" : "text-muted-foreground/30 cursor-not-allowed")}
              title={prevFile ? `← ${prevFile.file_name}` : undefined}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {editingName ? (
              <form
                className="flex items-center gap-1 min-w-0 flex-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!file || !editName.trim()) return;
                  const { error } = await supabase.from("project_files").update({ file_name: editName.trim() }).eq("id", file.id);
                  if (!handleSupabaseError(error, "rename")) {
                    setFile({ ...file, file_name: editName.trim() });
                    toast({ title: "ファイル名を変更しました" });
                  }
                  setEditingName(false);
                }}
              >
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-6 text-sm flex-1 min-w-0"
                  autoFocus
                  onBlur={() => setEditingName(false)}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingName(false); }}
                />
              </form>
            ) : (
              <button
                className="text-sm font-medium truncate hover:text-primary transition-colors flex items-center gap-1 min-w-0"
                onClick={() => { setEditName(file?.file_name || ""); setEditingName(true); }}
                title={`${file?.file_name} — クリックして名前を編集`}
              >
                <span className="truncate">{file?.file_name}</span>
                <Pencil className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              </button>
            )}

            {/* Version badge */}
            <span className={cn(
              "shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap",
              totalVersions > 1
                ? "bg-primary/10 text-primary border border-primary/30"
                : "bg-muted text-muted-foreground"
            )}>
              {currentVersionNumber === 1 ? "初稿" : `第${currentVersionNumber}稿`}
            </span>

            {siblingFiles.length > 1 && (
              <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">({currentIndex + 1}/{siblingFiles.length})</span>
            )}

            <button
              onClick={() => nextFile && navigateToFile(nextFile.id)}
              disabled={!nextFile}
              className={cn("shrink-0 p-1 rounded transition-colors", nextFile ? "hover:bg-muted text-muted-foreground hover:text-foreground" : "text-muted-foreground/30 cursor-not-allowed")}
              title={nextFile ? `→ ${nextFile.file_name}` : undefined}
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="ml-auto flex items-center gap-2 shrink-0">
              {file?.created_at && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">
                  <CalendarDays className="h-3 w-3" />
                  {format(new Date(file.created_at), "MM/dd HH:mm")}
                </span>
              )}
              {file?.created_by && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">
                  <User className="h-3 w-3" />
                  {file.created_by.includes("@") ? file.created_by.split("@")[0] : file.created_by}
                </span>
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn("px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap", sc.class)}>{sc.label}</button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-2" align="end">
                  {Object.entries(FILE_STATUS_CONFIG).map(([key, cfg]) => (
                    <button key={key} onClick={() => handleStatusChange(key)}
                      className={cn("w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors", currentStatus === key ? "bg-muted" : "hover:bg-muted/50")}>
                      {cfg.label}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Correction stats badge */}
          {correctionCount > 0 && (
            <div className="flex items-center gap-1.5 px-4 pb-1">
              <span className="text-[10px] text-muted-foreground">
                📝 修正指示蓄積: <span className="font-medium text-foreground">{correctionCount}件</span>
                {candidateCount > 0 && (
                  <>（ルール候補: <span className="font-medium text-primary">{candidateCount}件待ち</span>）</>
                )}
              </span>
            </div>
          )}

          {/* Lock banner */}
          {lockedByUser && (
            <div className="flex items-center gap-2 px-4 pb-1">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                <Lock className="h-3 w-3" />
                <span className="font-medium">{lockedByUser}さんがチェック中</span>
                <span className="text-destructive/70">— チェック操作はロックされています</span>
              </div>
            </div>
          )}

          {/* Row 2: Action buttons */}
          <div className="flex items-center gap-1 px-4 pb-2 overflow-x-auto">
            {canCheck && !comparisonMode && (
              <div className="flex items-center gap-2">
                <Button size="sm" className="text-xs h-8" onClick={handleRunCheck} disabled={checking || videoPolling.pollingState.isPolling || !!lockedByUser}>
                  {checking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Bot className="h-3 w-3 mr-1" />}
                  {checking ? "チェック中..." : lockedByUser ? "ロック中" : "AIチェック実行"}
                </Button>
                {checking && !videoPolling.pollingState.isPolling && checkProgress.isRunning && (
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <Progress value={checkProgress.progress} className="h-2 flex-1" />
                    <span className="text-xs text-muted-foreground font-mono w-8">{checkProgress.progress}%</span>
                  </div>
                )}
                {videoPolling.pollingState.isPolling && (
                  <div className="flex items-center gap-2 min-w-[200px]">
                    <div className="flex flex-col gap-1 flex-1">
                      <span className="text-xs text-muted-foreground">{videoPolling.pollingState.message}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={Math.min((videoPolling.pollingState.elapsedSeconds / 300) * 100, 95)} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">経過: {videoPolling.formatElapsed(videoPolling.pollingState.elapsedSeconds)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {checkDisabled && !comparisonMode && (
              <Button size="sm" variant="outline" className="text-xs h-8 opacity-50" disabled>
                <Bot className="h-3 w-3 mr-1" />AIチェック（準備中）
              </Button>
            )}
            {/* Comparison check button */}
            {hasCheckResult && !comparisonMode && (
              <Button size="sm" variant="outline" className="text-xs h-8 border-primary/50 text-primary hover:bg-primary/10" onClick={() => {
                if (comparisonDrafts.length === 0) {
                  const inputMode = AI_CHECK_CONFIG[file.process_type]?.inputMode || "text";
                  const isText = inputMode === "text";
                  setComparisonDrafts([
                    { label: "初稿", data: file.file_data, text: isText ? (file.file_data || "") : "" },
                    { label: "第2稿", data: null, text: "" },
                  ]);
                  setComparisonActivePairIndex(0);
                }
                setComparisonMode(true);
                setRightTab("comparison");
              }}>
                <GitCompare className="h-3 w-3 mr-1" />比較チェック
              </Button>
            )}
            {/* FIX / Unfix button */}
            {hasCheckResult && currentStatus !== "fixed" && ["checked", "internal_revision", "client_review"].includes(currentStatus) && (
              <Button size="sm" variant="outline" className="text-xs h-8 border-status-ok text-status-ok hover:bg-status-ok/10" onClick={async () => {
                const confirmed = window.confirm(
                  'このクリエイティブをFIX（最終確定）しますか？\nFIXしたデータは他工程のAIチェック時に照合用として使用されます。'
                );
                if (!confirmed || !file) return;
                // Unfix other files in the same process
                if (projectId) {
                  await supabase.from("project_files")
                    .update({ status: "checked", fixed_at: null, fixed_by: null } as any)
                    .eq("project_id", projectId)
                    .eq("process_type", file.process_type)
                    .eq("status", "fixed");
                }
                const { error } = await supabase.from("project_files")
                  .update({ status: "fixed", fixed_at: new Date().toISOString(), fixed_by: user?.email || user?.id || null } as any)
                  .eq("id", file.id);
                if (error) {
                  toast({ title: "FIX更新に失敗しました", variant: "destructive" });
                } else {
                  setFile({ ...file, status: "fixed" });
                  toast({ title: "✅ FIX確定しました", description: "他工程のAIチェック時にこのデータが照合用として使用されます" });
                }
              }}>
                <Lock className="h-3 w-3 mr-1" />FIX確定
              </Button>
            )}
            {currentStatus === "fixed" && (
              <Button size="sm" variant="outline" className="text-xs h-8 border-status-warning text-status-warning hover:bg-status-warning/10" onClick={async () => {
                if (!file) return;
                const { error } = await supabase.from("project_files")
                  .update({ status: "checked", fixed_at: null, fixed_by: null } as any)
                  .eq("id", file.id);
                if (error) {
                  toast({ title: "FIX解除に失敗しました", variant: "destructive" });
                } else {
                  setFile({ ...file, status: "checked" });
                  toast({ title: "FIX解除しました" });
                }
              }}>
                <Unlock className="h-3 w-3 mr-1" />FIX解除
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setShareOpen(true)}>
              <Link2 className="h-3 w-3 mr-1" />共有
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleDownload}>
              <Download className="h-3 w-3 mr-1" />DL
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>ファイルを削除</AlertDialogTitle>
                  <AlertDialogDescription>
                    「{file?.file_name}」を削除します。{record ? "関連するチェック結果・コメントも全て削除されます。" : ""}この操作は元に戻せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      if (!file || !projectId) return;
                      // Delete related check results, comments, versions, correction_logs
                      if (record?.id) {
                        await Promise.all([
                          supabase.from("comments").delete().eq("check_result_id", record.id),
                          supabase.from("file_versions").delete().eq("check_result_id", record.id),
                          supabase.from("correction_logs").delete().eq("check_result_id", record.id),
                        ]);
                        await supabase.from("check_results").delete().eq("id", record.id);
                      }
                      // Also delete correction_logs linked to this file
                      await supabase.from("correction_logs").delete().eq("file_id", file.id);
                      // Delete storage file if applicable
                      if (file.file_data?.includes("/storage/v1/object/public/")) {
                        try {
                          const url = new URL(file.file_data);
                          const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
                          if (pathMatch) {
                            await supabase.storage.from(pathMatch[1]).remove([pathMatch[2]]);
                          }
                        } catch {}
                      }
                      // Delete child versions
                      await supabase.from("project_files").delete().eq("parent_file_id", file.id);
                      const { error } = await supabase.from("project_files").delete().eq("id", file.id);
                      if (error) {
                        toast({ title: "削除に失敗しました", description: error.message, variant: "destructive" });
                      } else {
                        toast({ title: "ファイルを削除しました" });
                        navigate(`/project/${projectId}`);
                      }
                    }}
                  >
                    削除する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {comparisonMode ? (
             <ComparisonLeftPanel
              file={file}
              drafts={comparisonDrafts}
              onDraftsChange={setComparisonDrafts}
              activePairIndex={comparisonActivePairIndex}
              onActivePairIndexChange={setComparisonActivePairIndex}
              onClose={() => setComparisonMode(false)}
              checkResultId={record?.id}
              onRevisionUploaded={async (fileData, fileType, versionNumber, originalFile) => {
                if (!file || !projectId || !user) return;
                // Count actual existing versions (not max version_number) to avoid gaps from deleted files
                const { count: existingCount } = await supabase.from("project_files").select("*", { count: "exact", head: true })
                  .or(`id.eq.${file.id},parent_file_id.eq.${file.id}`);
                const actualVersion = (existingCount ?? 1) + 1;

                const { error: insertErr } = await supabase.from("project_files").insert({
                  project_id: projectId,
                  process_type: file.process_type,
                  file_name: `${file.file_name}_v${actualVersion}`,
                  file_type: fileType,
                  file_data: fileData,
                  file_size_bytes: originalFile.size,
                  version_number: actualVersion,
                  parent_file_id: file.id,
                  pattern_id: file.pattern_id,
                  status: "uploaded",
                  created_by: user.email || user.id,
                });
                if (!handleSupabaseError(insertErr, "comparison revision save")) {
                  toast({ title: `v${actualVersion} を保存しました` });
                  fetchVersions();
                }
              }}
              paintMode={paintMode}
              onPaintModeToggle={() => setPaintMode(!paintMode)}
              onAnnotationSave={handleAnnotationSave}
              savedAnnotations={savedAnnotations}
              highlightAnnotation={highlightAnnotation}
              members={mentionMembers}
              submissionType={file.submission_type}
              onSubmitToClient={() => {
                if (!record?.check_items) {
                  toast({ title: "AIチェックを先に実行してください", description: "クライアント提出前にAIチェックが必要です。", variant: "destructive" });
                  return;
                }
                const effective = getEffectiveSubmitLabel(record.overall_status, record.check_items as unknown as CheckItem[], (record.resolved_items as unknown as string[]) ?? []);
                if (!effective.isOk) {
                  toast({ title: "NG項目が未解消です", description: "全てのNG項目を修正済みにしてからクライアントに提出してください。", variant: "destructive" });
                  return;
                }
                setSubmitToClientOpen(true);
              }}
              onInternalRevision={() => setInternalRevisionOpen(true)}
            />
          ) : (
          <div className="p-4">
            {isSf ? (
              <ImagePreview
                imageSrc={displayFile.file_data}
                markers={hasCheckResult ? markers : []}
                paintMode={paintMode}
                onPaintModeToggle={() => setPaintMode(!paintMode)}
                onMarkerClick={scrollToCard}
                onAnnotationSave={handleAnnotationSave}
                label={`${client?.name} / ${product?.name} / スタイルフレーム`}
                noDataMessage="プレビューなし"
                savedAnnotations={savedAnnotations}
                highlightAnnotation={highlightAnnotation}
                members={mentionMembers}
                overlay={!hasCheckResult && !checking && canCheck ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <Button onClick={handleRunCheck}><Bot className="h-4 w-4 mr-2" />AIチェック実行</Button>
                  </div>
                ) : undefined}
              />
            ) : aiCfg?.inputMode === "audio" || aiCfg?.inputMode === "video" ? (
              <div>
                <MediaPreview
                  ref={mediaPreviewRef}
                  src={displayFile.file_data}
                  mediaType={aiCfg.inputMode as "audio" | "video"}
                  label={`${client?.name} / ${product?.name} / ${aiCfg.inputMode === "audio" ? "音声" : "動画"}`}
                  noDataMessage="メディアファイルなし"
                  paintMode={paintMode}
                  onPaintModeToggle={() => setPaintMode(!paintMode)}
                  onAnnotationSave={handleAnnotationSave}
                  savedAnnotations={savedAnnotations}
                  highlightAnnotation={highlightAnnotation}
                  members={mentionMembers}
                />
              </div>
            ) : (
              <div>
                <ScriptDisplay text={displayFile.file_data || ""} items={items} markers={markers} onItemClick={scrollToCard} />
              </div>
            )}

            {/* File navigation bar below creative */}
            {siblingFiles.length > 1 && (
              <div className="flex items-center justify-between mt-4 px-2 py-3 rounded-lg border border-border bg-muted/30">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!prevFile}
                  onClick={() => prevFile && navigateToFile(prevFile.id)}
                  className="gap-1.5"
                >
                  <ChevronLeft className="h-4 w-4" />
                  前のファイル
                </Button>
                <span className="text-sm font-medium text-muted-foreground">
                  {currentIndex + 1} / {siblingFiles.length}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!nextFile}
                  onClick={() => nextFile && navigateToFile(nextFile.id)}
                  className="gap-1.5"
                >
                  次のファイル
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Submit to client button */}
            {file.submission_type !== "client" && (
              <div className="space-y-2 mt-4">
                <Button
                  size="lg"
                  className="w-full gap-2 text-sm font-bold h-12"
                  onClick={() => {
                    if (!record?.check_items) {
                      toast({ title: "AIチェックを先に実行してください", description: "クライアント提出前にAIチェックが必要です。", variant: "destructive" });
                      return;
                    }
                    const effective = getEffectiveSubmitLabel(record.overall_status, record.check_items as CheckItem[], (record.resolved_items as string[]) ?? []);
                    if (!effective.isOk) {
                      toast({ title: "NG項目が未解消です", description: "全てのNG項目を修正済みにしてからクライアントに提出してください。", variant: "destructive" });
                      return;
                    }
                    setSubmitToClientOpen(true);
                  }}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  クライアントに提出する
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full gap-2 text-sm h-12 border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => setInternalRevisionOpen(true)}
                >
                  <GitCompare className="h-5 w-5" />
                  修正版をアップロードして比較チェック（社内で初稿を修正する）
                </Button>
              </div>
            )}
            {file.submission_type === "client" && (
              <div className="space-y-2 mt-4">
                <div className="flex items-center justify-center gap-2 py-3 rounded-lg border border-primary/30 bg-primary/5 text-primary text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  クライアント提出済み
                </div>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full gap-2 text-sm h-12 border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => setInternalRevisionOpen(true)}
                >
                  <GitCompare className="h-5 w-5" />
                  修正版をアップロードして比較チェック（社内で初稿を修正する）
                </Button>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      <ReviewRightPanel
        rightTab={rightTab}
        onTabChange={setRightTab}
        items={items}
        markers={markers}
        productCode={record?.product_code || product?.code || ""}
        commentCounts={commentCounts}
        highlightCard={highlightCard}
        commentFilter={commentFilter}
        checkResultId={file.check_result_id || record?.id || null}
        hasCheckResult={!!record}
        onCommentClick={handleCommentClick}
        onCheckItemClick={scrollToCard}
        onMarkerClick={handleMarkerJump}
        onAnnotationClick={handleAnnotationClick}
        overallStatus={record?.overall_status}
        checkedAt={record?.created_at}
        file={file}
        productId={product?.id}
        projectId={projectId}
        patternId={file?.pattern_id}
        fileId={fileId}
        mediaCurrentTime={mediaCurrentTime}
        onSeekMedia={handleSeekMedia}
        onCommentDeleted={fetchSavedAnnotations}
        commentRefreshKey={commentRefreshKey}
        comparisonMode={comparisonMode}
        comparisonBeforeData={comparisonDrafts[comparisonActivePairIndex]?.data ?? null}
        comparisonAfterData={comparisonDrafts[comparisonActivePairIndex + 1]?.data ?? null}
        comparisonAfterText={comparisonDrafts[comparisonActivePairIndex + 1]?.text ?? ""}
        comparisonRoundLabel={comparisonDrafts[comparisonActivePairIndex + 1]?.label ?? ""}
        onOpenComparisonMode={() => { setComparisonMode(true); setRightTab("comparison"); }}
        onComparisonCheckComplete={(res) => {
          // Update record with comparison result — no-op here, handled in onComparisonSaved
        }}
        onComparisonSaved={async (entry) => {
          // Load full comparison result from DB and set as the current displayed record
          const { data: fullCr } = await supabase.from("check_results").select("*").eq("id", entry.id).maybeSingle();
          if (fullCr) {
            setRecord(fullCr);
          }
        }}
        onClearAfterData={() => {
          // After comparison check completes, do NOT add a new empty draft slot.
          // Keep the current drafts as-is so the user can decide to submit or revise.
        }}
        clientName={client?.name}
        productName={product?.name}
        lockedByUser={lockedByUser}
        onAcquireLock={acquireLock}
        onReleaseLock={releaseLock}
        submissionType={file.submission_type}
        onSubmitToClient={() => {
          if (!record?.check_items) {
            toast({ title: "AIチェックを先に実行してください", description: "クライアント提出前にAIチェックが必要です。", variant: "destructive" });
            return;
          }
          const effective = getEffectiveSubmitLabel(record.overall_status, record.check_items as CheckItem[], (record.resolved_items as string[]) ?? []);
          if (!effective.isOk) {
            toast({ title: "NG項目が未解消です", description: "全てのNG項目を修正済みにしてからクライアントに提出してください。", variant: "destructive" });
            return;
          }
          setSubmitToClientOpen(true);
        }}
        onInternalRevision={() => setInternalRevisionOpen(true)}
        emptyCheckMessage={
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6">
            <Bot className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">AIチェック未実行</p>
            <p className="text-xs mt-1">AIチェックを実行してください</p>
            {canCheck && (
              <div className="flex flex-col items-center gap-2">
                <Button size="sm" className="mt-4" onClick={handleRunCheck} disabled={checking || videoPolling.pollingState.isPolling}>
                  {checking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Bot className="h-3 w-3 mr-1" />}
                  {checking ? "チェック中..." : "AIチェック実行"}
                </Button>
                {checking && !videoPolling.pollingState.isPolling && checkProgress.isRunning && (
                  <div className="flex items-center gap-2 w-48">
                    <Progress value={checkProgress.progress} className="h-2 flex-1" />
                    <span className="text-xs text-muted-foreground font-mono w-8">{checkProgress.progress}%</span>
                  </div>
                )}
                {videoPolling.pollingState.isPolling && (
                  <div className="flex flex-col items-center gap-1 w-64 mt-2">
                    <span className="text-xs text-muted-foreground">{videoPolling.pollingState.message}</span>
                    <div className="flex items-center gap-2 w-full">
                      <Progress value={Math.min((videoPolling.pollingState.elapsedSeconds / 300) * 100, 95)} className="h-2 flex-1" />
                      <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">経過: {videoPolling.formatElapsed(videoPolling.pollingState.elapsedSeconds)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        }
      />

      {/* Upload revision */}
      <UploadRevisionModal open={uploadRevisionOpen} onOpenChange={setUploadRevisionOpen} file={file} projectId={projectId!}
        onUploaded={(fileData, fileType, versionNumber) => {
          try {
            setUploadRevisionOpen(false);
            fetchVersions();
            // Auto-switch to comparison mode with uploaded file as the new draft
            const aiCfgLocal = AI_CHECK_CONFIG[file.process_type];
            const inputMode = aiCfgLocal?.inputMode || "text";
            const isImg = inputMode === "image";
            const isText = inputMode === "text";
            setComparisonDrafts([
              { label: "初稿", data: file.file_data, text: isText ? (file.file_data || "") : "" },
              { label: "第2稿", data: fileData, text: isImg ? "" : fileData },
            ]);
            setComparisonActivePairIndex(0);
            setComparisonMode(true);
            setRightTab("comparison");
            toast({ title: "比較チェックモードに切り替えました", description: "右パネルの「比較チェック実行」ボタンを押してください" });
          } catch (err) {
            console.error("[onUploaded] Error switching to comparison mode:", err);
            toast({ title: "比較モード切替エラー", description: err instanceof Error ? err.message : "不明なエラー", variant: "destructive" });
          }
        }} />

      {record && <ShareLinkModal checkResultId={record.id} open={shareOpen} onOpenChange={setShareOpen} />}

      {/* Submit to client confirmation dialog */}
      <AlertDialog open={submitToClientOpen} onOpenChange={setSubmitToClientOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>クライアントに提出</AlertDialogTitle>
            <AlertDialogDescription>
              このファイルを「クライアント提出済み」としてマークします。品質レポートに反映されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              try {
                if (!file) return;
                // Determine which version is being submitted (latest version in comparison mode)
                const submitTarget = versions.length > 1
                  ? versions.reduce((latest, v) => (v.version_number ?? 1) > (latest.version_number ?? 1) ? v : latest, versions[0])
                  : file;
                const submitVersionNumber = submitTarget.version_number ?? 1;

                // Update the root file
                const { error } = await supabase.from("project_files").update({ submission_type: "client", status: "client_review" } as any).eq("id", file.id);
                if (error) {
                  toast({ title: "提出に失敗しました", description: error.message, variant: "destructive" });
                  return;
                }
                // Also update the submitted version file if different from root
                if (submitTarget.id !== file.id) {
                  await supabase.from("project_files").update({ submission_type: "client", status: "client_review" } as any).eq("id", submitTarget.id);
                }
                setFile({ ...file, submission_type: "client" as any, status: "client_review" });
                // Log the client submission action with correct version number
                await supabase.from("submission_logs").insert({
                  file_id: submitTarget.id,
                  project_id: file.project_id,
                  product_id: product?.id || null,
                  process_type: file.process_type,
                  action_type: "client_submit",
                  version_number: submitVersionNumber,
                  pattern_id: file.pattern_id,
                  created_by: user?.id || null,
                } as any);
                // Refresh versions and exit comparison mode to show latest draft
                await fetchVersions();
                setComparisonMode(false);
                toast({ title: `✅ 第${submitVersionNumber === 1 ? "初" : submitVersionNumber}稿をクライアント提出しました` });
              } catch (err) {
                console.error("[ClientSubmit] Error:", err);
                toast({ title: "エラーが発生しました", description: err instanceof Error ? err.message : "不明なエラー", variant: "destructive" });
              } finally {
                setSubmitToClientOpen(false);
              }
            }}>
              提出する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Internal revision confirmation dialog */}
      <AlertDialog open={internalRevisionOpen} onOpenChange={setInternalRevisionOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>社内修正 → 比較チェック</AlertDialogTitle>
            <AlertDialogDescription>
              修正版をアップロードすると、自動で比較チェックモードに切り替わります。初稿と修正稿を並べてAI比較チェックを実行できます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              try {
                if (!file) return;
                // Log the internal revision action
                const { error: logErr } = await supabase.from("submission_logs").insert({
                  file_id: file.id,
                  project_id: file.project_id,
                  product_id: product?.id || null,
                  process_type: file.process_type,
                  action_type: "internal_revision",
                  version_number: file.version_number ?? 1,
                  pattern_id: file.pattern_id,
                  created_by: user?.id || null,
                } as any);
                if (logErr) console.error("[InternalRevision] log error:", logErr);
                // Update status to internal_revision and ensure submission_type stays internal
                await supabase.from("project_files").update({ submission_type: "internal", status: "internal_revision" } as any).eq("id", file.id);
                setFile({ ...file, submission_type: "internal" as any, status: "internal_revision" });
                setInternalRevisionOpen(false);
                // Open the upload revision modal to add next draft
                setUploadRevisionOpen(true);
              } catch (err) {
                console.error("[InternalRevision] Error:", err);
                toast({ title: "エラーが発生しました", description: err instanceof Error ? err.message : "不明なエラー", variant: "destructive" });
                setInternalRevisionOpen(false);
              }
            }}>
              修正版をアップロード
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UploadRevisionModal({ open, onOpenChange, file, projectId, onUploaded }: {
  open: boolean; onOpenChange: (o: boolean) => void; file: ProjectFile; projectId: string;
  onUploaded: (fileData: string, fileType: string, versionNumber: number) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setUploading(true);
    try {
      let fileData = "";
      let fileType = file.file_type;
      const aiCfg = AI_CHECK_CONFIG[file.process_type];
      const inputMode = aiCfg?.inputMode || "text";

      if (f.type.startsWith("image/")) {
        const compressed = await compressImage(f);
        fileData = `data:${compressed.mediaType};base64,${compressed.base64}`;
        fileType = "image";
      } else if (f.type.startsWith("audio/") || f.type.startsWith("video/")) {
        // Upload media to storage and store public URL
        const ext = f.name.split(".").pop() || "mp4";
        const bucket = f.type.startsWith("audio/") ? "audios" : "videos";
        const storagePath = `${projectId}/${file.id}_rev_${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage.from(bucket).upload(storagePath, f, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
        fileData = urlData.publicUrl;
        fileType = f.type.startsWith("audio/") ? "audio" : "video";
      } else {
        fileData = await f.text();
        fileType = "text";
      }
      // Count actual existing versions (not max version_number) to avoid gaps from deleted files
      const { count: existingCount, error: verErr } = await supabase.from("project_files").select("*", { count: "exact", head: true })
        .or(`id.eq.${file.id},parent_file_id.eq.${file.id}`);
      if (verErr) {
        toast({ title: "バージョン確認に失敗しました", description: verErr.message, variant: "destructive" });
        setUploading(false);
        return;
      }
      const nextVersion = (existingCount ?? 1) + 1;

      const { error: insertErr } = await supabase.from("project_files").insert({
        project_id: projectId,
        process_type: file.process_type,
        file_name: `${file.file_name}_v${nextVersion}`,
        file_type: fileType,
        file_data: fileData,
        file_size_bytes: f.size,
        version_number: nextVersion,
        parent_file_id: file.id,
        pattern_id: file.pattern_id,
        status: "uploaded",
        created_by: user.email || user.id,
      });

      if (insertErr) {
        console.error("[UploadRevision] Insert error:", insertErr);
        toast({ title: "アップロードに失敗しました", description: insertErr.message, variant: "destructive" });
        setUploading(false);
        return;
      }
      toast({ title: `v${nextVersion} をアップロードしました` });
      onUploaded(fileData, fileType, nextVersion);
    } catch (err) {
      console.error("[UploadRevision] Error:", err);
      toast({ title: "アップロードに失敗しました", description: err instanceof Error ? err.message : "不明なエラー", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>修正版をアップロード</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{uploading ? "アップロード中..." : "ファイルを選択"}</p>
            <input ref={fileInputRef} type="file" className="hidden"
              accept={(() => {
                const inputMode = AI_CHECK_CONFIG[file.process_type]?.inputMode || "text";
                if (inputMode === "image") return "image/png,image/jpeg,image/webp";
                if (inputMode === "audio") return "audio/*";
                if (inputMode === "video") return "video/*";
                return ".txt,.docx";
              })()}
              onChange={handleUpload} />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            アップロード後、自動で比較チェックモードに切り替わります
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
