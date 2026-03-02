import { useEffect, useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { runScriptCheck, getWebhookUrl, webhookFetch, getRelatedProcessData, VIDEO_ASYNC_ACCEPTED } from "@/lib/webhook";
import { useVideoCheckPolling } from "@/hooks/useVideoCheckPolling";
import { tusUploadBlob } from "@/lib/tus-upload";
import { gatherReferenceMaterials } from "@/lib/reference-materials";
import { AI_CHECK_CONFIG } from "@/lib/process-config";
import type { CheckItem } from "@/lib/types";
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
import CompareView from "@/components/CompareView";
import ShareLinkModal from "@/components/ShareLinkModal";
import ImagePreview from "@/components/review/ImagePreview";
import ScriptDisplay from "@/components/review/ScriptDisplay";
import MediaPreview, { type MediaPreviewHandle } from "@/components/review/MediaPreview";
import ReviewRightPanel from "@/components/review/ReviewRightPanel";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Download, GitCompare, Link2, CheckCircle2, Loader2, Bot, Upload, ChevronLeft, ChevronRight, Lock, Unlock, Trash2, Pencil, CalendarDays, User } from "lucide-react";
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
  const [compareOpen, setCompareOpen] = useState(false);
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
  const [candidateCount, setCandidateCount] = useState<number>(0);
  const [mentionMembers, setMentionMembers] = useState<MentionMember[]>([]);

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
  }, [product?.id, file?.process_type]);

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

      const { data: proj, error: projErr } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
      if (cancelled) return;
      handleSupabaseError(projErr, "project");
      setProject(proj);

      if (proj?.product_id) {
        const { data: prod, error: prodErr } = await supabase.from("products").select("*").eq("id", proj.product_id).maybeSingle();
        if (cancelled) return;
        handleSupabaseError(prodErr, "product");
        setProduct(prod);
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
        setRecord(cr);
      }

      await fetchVersions();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fileId, projectId]);

  // Fetch sibling files for navigation
  useEffect(() => {
    if (!file || !projectId) return;
    let cancelled = false;
    supabase.from("project_files").select("id, file_name, process_type, check_result_id, status, parent_file_id")
      .eq("project_id", projectId)
      .eq("process_type", file.process_type)
      .is("parent_file_id", null)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        handleSupabaseError(error, "sibling files");
        setSiblingFiles((data ?? []) as ProjectFile[]);
      });
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
          toast({ title: "チェック完了", description: `Grade: ${cr.overall_status}` });
          return;
        }
      }
    }
  }, [fileId]);

  // Poll for check result when checking is in progress (handles n8n completing after frontend timeout)
  useEffect(() => {
    if (!checking || !file?.check_result_id || isRecheckingRef.current) return;
    const interval = setInterval(async () => {
      if (isRecheckingRef.current) return;
      const { data: cr } = await supabase.from("check_results").select("*").eq("id", file.check_result_id!).maybeSingle();
      if (cr && cr.check_items && Array.isArray(cr.check_items) && (cr.check_items as unknown[]).length > 0 && !isRecheckingRef.current) {
        setRecord(cr);
        setChecking(false);
        toast({ title: "チェック完了", description: `Grade: ${cr.overall_status}` });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [checking, file?.check_result_id]);

  const processInputMode = file ? (AI_CHECK_CONFIG[file.process_type]?.inputMode || "text") : "text";
  const checkProgress = useCheckProgress(ESTIMATED_DURATION[processInputMode] || 60_000);

  const isExecutingRef = useRef(false);
  const videoPolling = useVideoCheckPolling();

  const handleRunCheck = async () => {
    if (!file || !product || !user || !projectId) return;
    if (isExecutingRef.current) return;
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
          }
          body.script_text = file.file_data?.startsWith("data:") ? "" : (file.file_data || "");
          inputData = { script_text: body.script_text, audio_url: body.audio_url || "", audio_base64: body.audio_base64 || file.file_data || "" };
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

        // For video processes, include related files from the same project
        const isVideoProc = ["vcon", "video_horizontal", "video_vertical"].includes(processKey);
        if (isVideoProc && projectId) {
          const relatedFiles = await getRelatedProcessData(projectId, processKey, file.pattern_id);
          if (Object.keys(relatedFiles).length > 0) {
            body.related_files = relatedFiles;
            console.log("[CheckMate] Including related_files:", Object.keys(relatedFiles));
          }
        }

        // For video async checks, insert a pending record first so n8n can UPDATE it
        const isVideoProcess = ["vcon", "video_horizontal", "video_vertical"].includes(processKey);
        // pendingRecordId is hoisted above try block
        if (isVideoProcess) {
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
          // Async video check: poll for result from DB using the pending record ID
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
            // Restore previous result if available
            if (previousCheckResultId) {
              const { data: prevCr } = await supabase.from("check_results").select("*").eq("id", previousCheckResultId).maybeSingle();
              if (prevCr) setRecord(prevCr);
            }
            toast({ title: "チェック処理がタイムアウトしました", description: "n8nの結果書き込みを確認してください。前回の結果を表示しています。", variant: "destructive" });
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
          await supabase.from("project_files").update({ status: "checked", check_result_id: prevCr.id }).eq("id", file.id);
          setFile({ ...file, status: "checked", check_result_id: prevCr.id });
        }
      }
      toast({ title: "チェック送信に失敗しました", description: "n8nへの接続に失敗しました。再度お試しください。", variant: "destructive" });
    } finally {
      isRecheckingRef.current = false;
      setChecking(false);
      isExecutingRef.current = false;
      checkProgress.reset();
      videoPolling.cancelPolling();
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
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    if (file.file_type === "image" && file.file_data) {
      downloadFile(file.file_data, `${file.file_name}_${date}.jpg`, true);
    } else {
      downloadFile(file.file_data || "", `${file.file_name}_${date}.txt`, false);
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

  const handleAnnotationSave = async (annotations: unknown[], comment: string, mentionedUserIds?: string[]) => {
    if (!record?.id || !user) return;
    const { data: savedComment, error } = await supabase.from("comments").insert([{
      check_result_id: record.id,
      author_name: user.email?.split("@")[0] || "User",
      author_email: user.email || "",
      content: comment || "アノテーション追加",
      annotation_data: { annotations } as unknown as Json,
      status: "open",
      mentions: mentionedUserIds && mentionedUserIds.length > 0 ? mentionedUserIds : null,
    }]).select("id").single();
    if (!handleSupabaseError(error, "annotation save")) {
      toast({ title: "コメントを保存しました" });
      fetchSavedAnnotations();

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

  const isSf = file.file_type === "image" || AI_CHECK_CONFIG[file.process_type]?.inputMode === "image";
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

          {/* Row 2: Action buttons */}
          <div className="flex items-center gap-1 px-4 pb-2 overflow-x-auto">
            {canCheck && (
              <div className="flex items-center gap-2">
                <Button size="sm" className="text-xs h-8" onClick={handleRunCheck} disabled={checking || videoPolling.pollingState.isPolling}>
                  {checking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Bot className="h-3 w-3 mr-1" />}
                  {checking ? "チェック中..." : "AIチェック実行"}
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
            {checkDisabled && (
              <Button size="sm" variant="outline" className="text-xs h-8 opacity-50" disabled>
                <Bot className="h-3 w-3 mr-1" />AIチェック（準備中）
              </Button>
            )}
            {/* FIX / Unfix button */}
            {hasCheckResult && currentStatus !== "fixed" && ["checked", "revision_requested", "revised", "approved"].includes(currentStatus) && (
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
            {hasCheckResult && (
              <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setRightTab("ai-check")}>
                <CheckCircle2 className="h-3 w-3 mr-1" />AI結果
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setShareOpen(true)}>
              <Link2 className="h-3 w-3 mr-1" />共有
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleDownload}>
              <Download className="h-3 w-3 mr-1" />DL
            </Button>
            {hasCheckResult && (
              <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleExportCsv}>CSV</Button>
            )}
            {hasVersions && (
              <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setCompareOpen(true)}>
                <GitCompare className="h-3 w-3 mr-1" />比較
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setUploadRevisionOpen(true)}>
              <Upload className="h-3 w-3 mr-1" />修正版
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
                      // Delete related check results, comments, versions
                      if (record?.id) {
                        await Promise.all([
                          supabase.from("comments").delete().eq("check_result_id", record.id),
                          supabase.from("file_versions").delete().eq("check_result_id", record.id),
                        ]);
                        await supabase.from("check_results").delete().eq("id", record.id);
                      }
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
          <div className="p-4">
            {isSf ? (
              <ImagePreview
                imageSrc={file.file_data}
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
                  src={file.file_data}
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
                <ScriptDisplay text={file.file_data || ""} items={items} markers={markers} onItemClick={scrollToCard} />
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
          </div>
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
        checkResultId={record?.id || null}
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
        onUploaded={() => { setUploadRevisionOpen(false); fetchVersions(); }} />

      {/* Compare: use project_files mode */}
      <CompareView
        projectFileId={fileId}
        projectFiles={versions}
        processType={file.process_type}
        originalText={file.file_data}
        open={compareOpen}
        onOpenChange={setCompareOpen}
      />
      {record && <ShareLinkModal checkResultId={record.id} open={shareOpen} onOpenChange={setShareOpen} />}
    </div>
  );
}

function UploadRevisionModal({ open, onOpenChange, file, projectId, onUploaded }: {
  open: boolean; onOpenChange: (o: boolean) => void; file: ProjectFile; projectId: string; onUploaded: () => void;
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
      if (f.type.startsWith("image/")) {
        const compressed = await compressImage(f);
        fileData = `data:${compressed.mediaType};base64,${compressed.base64}`;
        fileType = "image";
      } else {
        fileData = await f.text();
        fileType = "text";
      }
      const { data: existing, error: verErr } = await supabase.from("project_files").select("version_number")
        .or(`id.eq.${file.id},parent_file_id.eq.${file.id}`).order("version_number", { ascending: false }).limit(1);
      handleSupabaseError(verErr, "version check");
      const nextVersion = existing && existing.length > 0 ? (existing[0].version_number ?? 1) + 1 : 2;

      const { error: insertErr } = await supabase.from("project_files").insert({
        project_id: projectId,
        process_type: file.process_type,
        file_name: `${file.file_name}_v${nextVersion}`,
        file_type: fileType,
        file_data: fileData,
        file_size_bytes: f.size,
        version_number: nextVersion,
        parent_file_id: file.id,
        status: "revised",
        created_by: user.email || user.id,
      });

      if (handleSupabaseError(insertErr, "revision upload")) return;
      toast({ title: `v${nextVersion} をアップロードしました` });
      onUploaded();
    } catch {
      toast({ title: "エラー", variant: "destructive" });
    }
    setUploading(false);
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
              accept={file.file_type === "image" ? "image/png,image/jpeg,image/webp" : ".txt,.docx"}
              onChange={handleUpload} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
