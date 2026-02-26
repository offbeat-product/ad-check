import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { MATERIAL_TYPES, MATERIAL_TEMPLATES, extractTextFromXlsx, type ReferenceMaterial } from "@/lib/reference-materials";
import { parseWCheckFile, buildWCheckContentText, type WCheckParsedData } from "@/lib/wcheck-parser";
import WCheckPreview from "./WCheckPreview";
import OrientationTemplate, { orientationDataToText, type OrientationData } from "./templates/OrientationTemplate";
import WCheckTemplate, { wcheckDataToText, type WCheckData } from "./templates/WCheckTemplate";
import BrandGuidelineTemplate, { brandGuidelineDataToText, type BrandGuidelineData } from "./templates/BrandGuidelineTemplate";
import LegalRegulationTemplate, { legalRegulationDataToText, type LegalRegulationData } from "./templates/LegalRegulationTemplate";
import MediaRegulationTemplate, { mediaRegulationDataToText, type MediaRegulationData } from "./templates/MediaRegulationTemplate";
import CorrectionHistoryTemplate, { correctionHistoryDataToText, type CorrectionHistoryData } from "./templates/CorrectionHistoryTemplate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Upload, Link2, FileText, Sparkles, LayoutTemplate } from "lucide-react";

const N8N_REST_URL = "https://vhvgnslszruyztcoikqq.supabase.co/rest/v1/check_rules";
const N8N_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodmduc2xzenJ1eXp0Y29pa3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NzkxNzksImV4cCI6MjA4NzQ1NTE3OX0.JChqETzSd1HJFuSBJNZ8xJy6lPENql_lprbTVLvTFeA";
const PARSE_REFERENCE_URL = "https://offbeat-inc.app.n8n.cloud/webhook/parse-reference";
const ALL_PROCESS_TYPES = ["script", "styleframe", "storyboard", "na_script", "bgm", "narration", "vcon", "video_horizontal", "video_vertical"];

interface Props {
  materialType: string;
  scopeType: string;
  scopeId: string;
  existing?: ReferenceMaterial;
  productId: string;
  onSaved: () => void;
  onCancel: () => void;
}

type InputMethod = "file_upload" | "text_input" | "url_reference" | "template";

// Types that have structured templates
const TEMPLATE_TYPES = ["orientation", "wcheck", "brand_guideline", "legal_rule", "media_regulation", "correction_history"];

export default function MaterialForm({ materialType, scopeType, scopeId, existing, productId, onSaved, onCancel }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasTemplate = TEMPLATE_TYPES.includes(materialType);
  const defaultMethod = existing?.source_type as InputMethod || (hasTemplate && !existing ? "template" : "file_upload");

  const [title, setTitle] = useState(existing?.title || "");
  const [method, setMethod] = useState<InputMethod>(defaultMethod);
  const [contentText, setContentText] = useState(existing?.content_text || "");
  const [sourceUrl, setSourceUrl] = useState(existing?.source_url || "");
  const [fileName, setFileName] = useState(existing?.file_name || "");
  const [fileData, setFileData] = useState(existing?.file_data || "");
  const [saving, setSaving] = useState(false);
  const [extractMsg, setExtractMsg] = useState("");
  const [wcheckParsed, setWcheckParsed] = useState<WCheckParsedData | null>(null);
  const [autoGenerateRules, setAutoGenerateRules] = useState(true);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [pendingSaveResult, setPendingSaveResult] = useState<any>(null);

  // Template data states
  const [templateData, setTemplateData] = useState<OrientationData | WCheckData | BrandGuidelineData | LegalRegulationData | MediaRegulationData | CorrectionHistoryData | null>(null);

  const isWCheck = materialType === "wcheck";

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));

    const reader = new FileReader();
    reader.onload = () => setFileData(reader.result as string);
    reader.readAsDataURL(f);

    const ext = f.name.split(".").pop()?.toLowerCase() || "";

    if (isWCheck && ["xlsx", "xls"].includes(ext)) {
      setExtractMsg("Wチェックシートを解析中...");
      try {
        const parsed = await parseWCheckFile(f);
        const entries = Object.keys(parsed);
        if (entries.length > 0) {
          setWcheckParsed(parsed);
          const builtText = buildWCheckContentText(parsed);
          setContentText(builtText);
          setExtractMsg("");
        } else {
          setWcheckParsed(null);
          const text = await extractTextFromXlsx(f);
          setContentText(text);
          setExtractMsg("Wチェック形式として解析できませんでした。通常のテキスト抽出を行いました。");
        }
      } catch {
        setWcheckParsed(null);
        setExtractMsg("解析に失敗しました。手動で入力してください。");
      }
      return;
    }

    if (["xlsx", "xls", "csv"].includes(ext)) {
      setExtractMsg("テキストを抽出中...");
      try {
        if (ext === "csv") {
          const text = await f.text();
          setContentText(text);
        } else {
          const text = await extractTextFromXlsx(f);
          setContentText(text);
        }
        setExtractMsg("");
      } catch {
        setExtractMsg("テキスト抽出に失敗しました。手動で入力してください。");
      }
    } else if (ext === "txt") {
      const text = await f.text();
      setContentText(text);
    } else if (["pdf", "pptx"].includes(ext)) {
      setExtractMsg("PDFのテキスト抽出は自動では行えません。下のテキストエリアに内容をコピペしてください。");
    } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      setExtractMsg("画像からのテキスト抽出は自動では行えません。下のテキストエリアに内容を記載してください。");
    }
  };

  const checkExistingReferenceRules = async (): Promise<number> => {
    const res = await fetch(
      `${N8N_REST_URL}?product_id=eq.${productId}&source_type=eq.reference&select=id`,
      { headers: { apikey: N8N_API_KEY, Authorization: `Bearer ${N8N_API_KEY}` } }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return Array.isArray(data) ? data.length : 0;
  };

  const deleteExistingReferenceRules = async () => {
    await fetch(
      `${N8N_REST_URL}?product_id=eq.${productId}&source_type=eq.reference`,
      { method: "DELETE", headers: { apikey: N8N_API_KEY, Authorization: `Bearer ${N8N_API_KEY}` } }
    );
  };

  const callParseReferenceWebhook = async (text: string) => {
    toast({ title: "AIルール生成中...", description: "参考資料からチェックルールを自動生成しています" });
    try {
      const res = await fetch(PARSE_REFERENCE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, material_type: materialType, content_text: text, process_types: ALL_PROCESS_TYPES }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      toast({ title: "AIルールが生成されました", description: `${result.count || 0}件のチェックルールが追加されました。チェックルールタブで確認してください。` });
    } catch (err) {
      console.error("[parse-reference] error:", err);
      toast({ title: "ルール自動生成に失敗しました", description: "手動でチェックルールを追加してください", variant: "destructive" });
    }
  };

  const triggerRuleGeneration = async (savedContentText: string) => {
    const existingCount = await checkExistingReferenceRules();
    if (existingCount > 0) {
      setDuplicateCount(existingCount);
      setPendingSaveResult({ text: savedContentText });
      setShowDuplicateDialog(true);
    } else {
      await callParseReferenceWebhook(savedContentText);
    }
  };

  const handleDuplicateConfirm = async () => {
    setShowDuplicateDialog(false);
    if (!pendingSaveResult) return;
    const { text } = pendingSaveResult;
    await deleteExistingReferenceRules();
    await callParseReferenceWebhook(text);
    setPendingSaveResult(null);
  };

  const buildContentText = (): string => {
    if (method === "template" && templateData) {
      let aiText = "";
      if (templateData.template_type === "orientation") {
        aiText = orientationDataToText(templateData as OrientationData);
      } else if (templateData.template_type === "w_check") {
        aiText = wcheckDataToText(templateData as WCheckData);
      } else if (templateData.template_type === "brand_guideline") {
        aiText = brandGuidelineDataToText(templateData as BrandGuidelineData);
      } else if (templateData.template_type === "legal_regulation") {
      aiText = legalRegulationDataToText(templateData as LegalRegulationData);
      } else if (templateData.template_type === "media_regulation") {
        aiText = mediaRegulationDataToText(templateData as MediaRegulationData);
      } else if (templateData.template_type === "correction_history") {
        aiText = correctionHistoryDataToText(templateData as CorrectionHistoryData);
      }
      return aiText + "\n---TEMPLATE_JSON---\n" + JSON.stringify(templateData);
    }
    return contentText;
  };

  const handleSave = async () => {
    if (!title.trim()) { toast({ title: "タイトルを入力してください", variant: "destructive" }); return; }
    setSaving(true);

    const finalContentText = buildContentText();

    const payload = {
      scope_type: scopeType,
      scope_id: scopeId,
      material_type: materialType,
      title: title.trim(),
      content_text: finalContentText || null,
      file_name: fileName || null,
      file_data: method === "file_upload" ? fileData || null : null,
      source_url: method === "url_reference" ? sourceUrl || null : null,
      source_type: method === "template" ? "template" : method,
      is_active: true,
      sort_order: 0,
      created_by: user?.email || user?.id || null,
      updated_at: new Date().toISOString(),
    };

    let result, error;
    if (existing) {
      const res = await supabase.from("reference_materials").update(payload).eq("id", existing.id).select().single();
      result = res.data;
      error = res.error;
    } else {
      const res = await supabase.from("reference_materials").insert(payload).select().single();
      result = res.data;
      error = res.error;
    }

    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    } else {
      toast({ title: existing ? "更新しました" : "保存しました" });
      onSaved();
      if (autoGenerateRules && finalContentText) {
        triggerRuleGeneration(finalContentText);
      }
    }
    setSaving(false);
  };

  const handleMethodChange = (m: InputMethod) => {
    setMethod(m);
    if (m === "text_input" && !contentText && !existing) {
      setContentText(MATERIAL_TEMPLATES[materialType] || "");
    }
  };

  const methodButtons = [
    ...(hasTemplate ? [{ id: "template" as InputMethod, label: "テンプレート", icon: LayoutTemplate }] : []),
    { id: "file_upload" as InputMethod, label: "ファイル", icon: Upload },
    { id: "text_input" as InputMethod, label: "テキスト", icon: FileText },
    { id: "url_reference" as InputMethod, label: "URL", icon: Link2 },
  ];

  return (
    <>
      <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">タイトル *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`例: 001案件_${MATERIAL_TYPES.find(t => t.id === materialType)?.label || "参考資料"}`} className="h-8 text-sm" autoFocus />
        </div>

        <div className="flex gap-2 flex-wrap">
          {methodButtons.map((opt) => (
            <Button
              key={opt.id}
              size="sm"
              variant={method === opt.id ? "default" : "outline"}
              className="text-xs h-7"
              onClick={() => handleMethodChange(opt.id)}
            >
              <opt.icon className="h-3 w-3 mr-1" />{opt.label}
            </Button>
          ))}
        </div>

        {/* Template input */}
        {method === "template" && materialType === "orientation" && (
          <OrientationTemplate onChange={setTemplateData as any} />
        )}
        {method === "template" && materialType === "wcheck" && (
          <WCheckTemplate onChange={setTemplateData as any} />
        )}
        {method === "template" && materialType === "brand_guideline" && (
          <BrandGuidelineTemplate onChange={setTemplateData as any} />
        )}
        {method === "template" && materialType === "legal_rule" && (
          <LegalRegulationTemplate onChange={setTemplateData as any} />
        )}
        {method === "template" && materialType === "media_regulation" && (
          <MediaRegulationTemplate productId={productId} onChange={setTemplateData as any} />
        )}
        {method === "template" && materialType === "correction_history" && (
          <CorrectionHistoryTemplate onChange={setTemplateData as any} />
        )}

        {/* File upload */}
        {method === "file_upload" && (
          <div>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{fileName || "クリックしてファイルを選択"}</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">対応: .xlsx .xls .csv .pdf .png .jpg .pptx .txt</p>
              <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.pptx,.txt" onChange={handleFile} />
            </div>
            {extractMsg && <p className="text-xs text-amber-600 mt-1">{extractMsg}</p>}
          </div>
        )}

        {wcheckParsed && method === "file_upload" && <WCheckPreview parsedData={wcheckParsed} />}

        {/* URL input */}
        {method === "url_reference" && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">URL</label>
            <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." className="h-8 text-sm" />
            <p className="text-[10px] text-muted-foreground mt-1">リンク先の内容を下のテキストエリアにコピペしてください</p>
          </div>
        )}

        {/* Text area for non-template methods */}
        {method !== "template" && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">AIに送信するテキスト（自動抽出 or 手動入力）</label>
            <Textarea
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              placeholder={method === "file_upload" ? "ファイルアップロード後にテキストが自動抽出されます。内容を確認・編集してください。" : MATERIAL_TEMPLATES[materialType] || "テキストを入力..."}
              className="min-h-[150px] text-xs font-mono"
            />
          </div>
        )}

        {/* AI Rule Generation Toggle */}
        <div className="flex items-center gap-3 p-2 rounded-lg bg-primary/5 border border-primary/10">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1">
            <Label htmlFor="auto-generate-rules" className="text-xs font-medium cursor-pointer">AIルール自動生成</Label>
            <p className="text-[10px] text-muted-foreground mt-0.5">ONにすると、参考資料の内容からAIがチェックルールを自動生成します</p>
          </div>
          <Switch id="auto-generate-rules" checked={autoGenerateRules} onCheckedChange={setAutoGenerateRules} />
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="text-xs h-7" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "保存中..." : "保存"}
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={onCancel}>キャンセル</Button>
        </div>
      </div>

      {/* Duplicate Rules Confirmation Dialog */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>AI生成ルールの再生成</AlertDialogTitle>
            <AlertDialogDescription>
              この商材には既にAI生成ルールが{duplicateCount}件あります。再生成すると既存のAI生成ルールは削除されます。続行しますか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSaveResult(null)}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDuplicateConfirm}>続行</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
