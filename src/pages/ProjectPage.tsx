import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { compressImage } from "@/lib/image-compress";
import { useToast } from "@/hooks/use-toast";
import type { Project, Product, Client, ProjectFile, CheckResultRow } from "@/lib/db-types";
import { FILE_STATUS_CONFIG, PROCESS_SECTIONS } from "@/lib/db-types";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TopCorrectionPatterns } from "@/components/CorrectionPatterns";
import {
  Upload, FileText, Image, Film, MessageCircle, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const gradeColorMap: Record<string, string> = {
  A: "bg-[hsl(var(--grade-a))]/10 text-[hsl(var(--grade-a))] border-[hsl(var(--grade-a))]/30",
  B: "bg-[hsl(var(--grade-b))]/10 text-[hsl(var(--grade-b))] border-[hsl(var(--grade-b))]/30",
  C: "bg-[hsl(var(--grade-c))]/10 text-[hsl(var(--grade-c))] border-[hsl(var(--grade-c))]/30",
  D: "bg-[hsl(var(--grade-d))]/10 text-[hsl(var(--grade-d))] border-[hsl(var(--grade-d))]/30",
};

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadTextInput, setUploadTextInput] = useState("");
  const [useTextInput, setUseTextInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checkResults, setCheckResults] = useState<Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count">>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

    // Batch fetch check results
    const checkResultIds = fileData.filter((f) => f.check_result_id).map((f) => f.check_result_id!);
    if (checkResultIds.length > 0) {
      const { data: results, error: crErr } = await supabase
        .from("check_results")
        .select("id, overall_status, ng_count, warning_count")
        .in("id", checkResultIds);
      if (cancelled) return;
      handleSupabaseError(crErr, "check_results");
      const map: Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count">> = {};
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

  // Count comments per file
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
      (data ?? []).forEach((c) => {
        counts[c.check_result_id] = (counts[c.check_result_id] || 0) + 1;
      });
      setCommentCounts(counts);
    });
    return () => { cancelled = true; };
  }, [files, id]);

  const handleFileUpload = async () => {
    if (!uploadModal || !id || !user) return;
    setUploading(true);

    let fileData = "";
    let fileType = "text";
    let fileSize = 0;
    let fileName = uploadFileName.trim();

    if (useTextInput && uploadModal === "script") {
      fileData = uploadTextInput;
      fileSize = new Blob([uploadTextInput]).size;
      if (!fileName) fileName = `字コンテ_${Date.now()}`;
      fileType = "text";
    } else if (selectedFile) {
      if (!fileName) fileName = selectedFile.name;
      fileSize = selectedFile.size;

      if (selectedFile.type.startsWith("image/")) {
        fileType = "image";
        try {
          const compressed = await compressImage(selectedFile);
          fileData = `data:${compressed.mediaType};base64,${compressed.base64}`;
        } catch {
          toast({ title: "エラー", description: "画像の圧縮に失敗しました", variant: "destructive" });
          setUploading(false);
          return;
        }
      } else {
        fileType = "text";
        fileData = await selectedFile.text();
      }
    } else {
      setUploading(false);
      return;
    }

    const { error } = await supabase.from("project_files").insert({
      project_id: id,
      process_type: uploadModal,
      file_name: fileName,
      file_type: fileType,
      file_data: fileData,
      file_size_bytes: fileSize,
      created_by: user.email || user.id,
    });

    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "アップロード完了" });
    }
    setUploadModal(null);
    setSelectedFile(null);
    setUploadFileName("");
    setUploadTextInput("");
    setUseTextInput(false);
    setUploading(false);
    fetchData();
  };

  const getFilesForProcess = (processType: string) =>
    files.filter((f) => f.process_type === processType);

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (!project || !product) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">プロジェクトが見つかりません</div>;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-card">
        <div>
          <div className="text-xs text-muted-foreground">
            {client?.name} &gt; {product.name} &gt; {project.name}
          </div>
          <h1 className="text-lg font-bold mt-0.5">{project.name}</h1>
        </div>
        <Badge variant="outline" className="text-xs">{project.status === "active" ? "進行中" : project.status}</Badge>
      </header>

      <div className="p-6 max-w-6xl mx-auto">
        <Tabs defaultValue="files">
          <TabsList className="mb-6">
            <TabsTrigger value="files">ファイル</TabsTrigger>
            <TabsTrigger value="history">チェック履歴</TabsTrigger>
            <TabsTrigger value="patterns">修正パターン</TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="space-y-6">
            {PROCESS_SECTIONS.map((section) => {
              const sectionFiles = getFilesForProcess(section.id);
              return (
                <div key={section.id} className="glass-card overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <h2 className="text-sm font-semibold">{section.label}</h2>
                    <Button size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => { setUploadModal(section.id); setUseTextInput(false); setSelectedFile(null); setUploadFileName(""); }}>
                      <Plus className="h-3 w-3 mr-1" />アップロード
                    </Button>
                  </div>
                  <div className="p-4">
                    {sectionFiles.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 italic py-4 text-center">ファイルなし — アップロードしてください</p>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {sectionFiles.map((file) => {
                          const cr = file.check_result_id ? checkResults[file.check_result_id] : null;
                          const st = FILE_STATUS_CONFIG[file.status ?? "uploaded"] ?? FILE_STATUS_CONFIG.uploaded;
                          const cc = file.check_result_id ? (commentCounts[file.check_result_id] || 0) : 0;
                          const isImageFile = file.file_type === "image";
                          const childVersions = files.filter(f => f.parent_file_id === file.id);
                          const versionLabel = file.parent_file_id ? `v${file.version_number}` : childVersions.length > 0 ? "v1" : null;

                          return (
                            <button key={file.id} onClick={() => navigate(`/project/${id}/file/${file.id}`)}
                              className="glass-card p-3 text-left hover:border-primary/30 transition-colors group">
                              <div className="h-20 rounded-md bg-muted/50 flex items-center justify-center mb-2 overflow-hidden">
                                {isImageFile && file.file_data ? (
                                  <img src={file.file_data} alt="" className="w-full h-full object-cover" />
                                ) : section.id === "script" ? (
                                  <FileText className="h-8 w-8 text-muted-foreground/30" />
                                ) : section.id === "master" ? (
                                  <Film className="h-8 w-8 text-muted-foreground/30" />
                                ) : (
                                  <Image className="h-8 w-8 text-muted-foreground/30" />
                                )}
                              </div>
                              <p className="text-xs font-medium truncate">{file.file_name}</p>
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", st.class)}>{st.label}</Badge>
                                {cr && (
                                  <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", gradeColorMap[cr.overall_status ?? ""] ?? "")}>
                                    {cr.overall_status}
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
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="history">
            <CheckHistory projectId={id!} files={files} checkResults={checkResults} />
          </TabsContent>

          <TabsContent value="patterns">
            <TopCorrectionPatterns productCode={product.code} limit={10} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Upload modal */}
      <Dialog open={!!uploadModal} onOpenChange={(o) => !o && setUploadModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>ファイルアップロード</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {uploadModal === "script" && (
              <div className="flex gap-2">
                <Button size="sm" variant={useTextInput ? "outline" : "default"} onClick={() => setUseTextInput(false)} className="text-xs">ファイル選択</Button>
                <Button size="sm" variant={useTextInput ? "default" : "outline"} onClick={() => setUseTextInput(true)} className="text-xs">テキスト直接入力</Button>
              </div>
            )}
            {useTextInput && uploadModal === "script" ? (
              <Textarea value={uploadTextInput} onChange={(e) => setUploadTextInput(e.target.value)}
                placeholder="冒頭：\n前半：\n中盤：\n後半：\n締め：" className="min-h-[150px] text-sm font-mono" />
            ) : (
              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{selectedFile ? selectedFile.name : "クリックしてファイルを選択"}</p>
                <input ref={fileInputRef} type="file" className="hidden"
                  accept={PROCESS_SECTIONS.find(s => s.id === uploadModal)?.accepts}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSelectedFile(f); if (!uploadFileName) setUploadFileName(f.name); } }} />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ファイル名</label>
              <Input value={uploadFileName} onChange={(e) => setUploadFileName(e.target.value)} placeholder="ファイル名" className="h-9 text-sm" />
            </div>
            <Button onClick={handleFileUpload} disabled={uploading || (!selectedFile && !uploadTextInput.trim())} className="w-full">
              {uploading ? "アップロード中..." : "アップロード"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckHistory({ projectId, files, checkResults }: {
  projectId: string;
  files: ProjectFile[];
  checkResults: Record<string, Pick<CheckResultRow, "id" | "overall_status" | "ng_count" | "warning_count">>;
}) {
  const navigate = useNavigate();
  const filesWithChecks = files.filter(f => f.check_result_id && checkResults[f.check_result_id]);

  if (filesWithChecks.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">チェック履歴はまだありません</p>;
  }

  return (
    <div className="glass-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-left">
            <th className="px-4 py-2.5 font-medium">ファイル名</th>
            <th className="px-4 py-2.5 font-medium">工程</th>
            <th className="px-4 py-2.5 font-medium text-center">Grade</th>
            <th className="px-4 py-2.5 font-medium text-center">NG</th>
            <th className="px-4 py-2.5 font-medium text-center">WARN</th>
          </tr>
        </thead>
        <tbody>
          {filesWithChecks.map((f) => {
            const cr = checkResults[f.check_result_id!];
            return (
              <tr key={f.id} onClick={() => navigate(`/project/${projectId}/file/${f.id}`)} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer">
                <td className="px-4 py-2.5 font-medium">{f.file_name}</td>
                <td className="px-4 py-2.5">{f.process_type}</td>
                <td className="px-4 py-2.5 text-center">
                  <Badge variant="outline" className={gradeColorMap[cr?.overall_status ?? ""] ?? ""}>{cr?.overall_status}</Badge>
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
