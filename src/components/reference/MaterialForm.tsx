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
import { Upload, Link2, FileText, Sparkles, LayoutTemplate, Loader2 } from "lucide-react";
import { extractTextFromPdf, extractTextFromImage, extractTextFromPptx } from "@/lib/file-extractors";
import { resolveWebhookProductId } from "@/lib/resolve-product-id";

const PARSE_REFERENCE_URL = "https://offbeat-inc.app.n8n.cloud/webhook/parse-reference";
const EXTERNAL_SUPABASE_URL = "https://vhvgnslszruyztcoikqq.supabase.co/rest/v1/check_rules";
const EXTERNAL_SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodmduc2xzenJ1eXp0Y29pa3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NzkxNzksImV4cCI6MjA4NzQ1NTE3OX0.JChqETzSd1HJFuSBJNZ8xJy6lPENql_lprbTVLvTFeA";
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

  // Auto-fill title for template mode
  const getDefaultTitle = () => {
    if (existing?.title) return existing.title;
    if (hasTemplate && !existing) {
      const mt = MATERIAL_TYPES.find(t => t.id === materialType);
      return mt?.label || "";
    }
    return "";
  };

  const [title, setTitle] = useState(getDefaultTitle());
  const [method, setMethod] = useState<InputMethod>(defaultMethod);
  const [contentText, setContentText] = useState(existing?.content_text || "");
  const [sourceUrl, setSourceUrl] = useState(existing?.source_url || "");
  const [fileName, setFileName] = useState(existing?.file_name || "");
  const [fileData, setFileData] = useState(existing?.file_data || "");
  const [saving, setSaving] = useState(false);
  const [extractMsg, setExtractMsg] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [wcheckParsed, setWcheckParsed] = useState<WCheckParsedData | null>(null);
  const [autoGenerateRules, setAutoGenerateRules] = useState(true);

  // Multi-file upload state
  interface QueuedFile {
    file: File;
    name: string;
    dataUrl: string;
    contentText: string;
    extracting: boolean;
  }
  const [multiFiles, setMultiFiles] = useState<QueuedFile[]>([]);

  // Template data states
  const [templateData, setTemplateData] = useState<OrientationData | WCheckData | BrandGuidelineData | LegalRegulationData | MediaRegulationData | CorrectionHistoryData | null>(null);

  const isWCheck = materialType === "wcheck";

  const readFileAsDataUrl = (f: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(f);
    });

  const extractTextFromFile = async (f: File): Promise<string> => {
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    if (["xlsx", "xls"].includes(ext)) {
      if (isWCheck) {
        try {
          const parsed = await parseWCheckFile(f);
          if (Object.keys(parsed).length > 0) {
            setWcheckParsed(parsed);
            return buildWCheckContentText(parsed);
          }
        } catch { /* fall through */ }
      }
      return await extractTextFromXlsx(f);
    }
    if (ext === "csv") return await f.text();
    if (ext === "txt") return await f.text();
    if (ext === "pdf") {
      try { return await extractTextFromPdf(f); } catch { return ""; }
    }
    if (ext === "pptx") {
      try { return await extractTextFromPptx(f); } catch { return ""; }
    }
    if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      try { return await extractTextFromImage(f); } catch { return ""; }
    }
    return "";
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Single file (existing or editing) - use legacy single-file flow
    if (files.length === 1 && existing) {
      const f = files[0];
      setFileName(f.name);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
      const dataUrl = await readFileAsDataUrl(f);
      setFileData(dataUrl);
      setExtracting(true);
      setExtractMsg("テキストを抽出中...");
      try {
        const text = await extractTextFromFile(f);
        setContentText(text);
        setExtractMsg(text ? "テキストを自動抽出しました。" : "");
      } catch {
        setExtractMsg("テキスト抽出に失敗しました。");
      } finally {
        setExtracting(false);
      }
      return;
    }

    // Multi-file: queue all files
    const newQueued: QueuedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      newQueued.push({
        file: files[i],
        name: files[i].name,
        dataUrl: "",
        contentText: "",
        extracting: true,
      });
    }
    setMultiFiles(prev => [...prev, ...newQueued]);

    // Auto-fill title if empty
    if (!title && files.length === 1) {
      setTitle(files[0].name.replace(/\.[^.]+$/, ""));
    } else if (!title && files.length > 1) {
      const mt = MATERIAL_TYPES.find(t => t.id === materialType);
      setTitle(`${mt?.label || "参考資料"}（${files.length}件）`);
    }

    // Process each file in background
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const idx = multiFiles.length + i; // index in the combined array
      (async () => {
        try {
          const [dataUrl, text] = await Promise.all([
            readFileAsDataUrl(f),
            extractTextFromFile(f),
          ]);
          setMultiFiles(prev => prev.map((q, j) =>
            j === idx ? { ...q, dataUrl, contentText: text, extracting: false } : q
          ));
        } catch {
          setMultiFiles(prev => prev.map((q, j) =>
            j === idx ? { ...q, extracting: false } : q
          ));
        }
      })();
    }

    // Also set single-file state for backward compat (first file)
    if (!existing) {
      const f = files[0];
      setFileName(f.name);
      const dataUrl = await readFileAsDataUrl(f);
      setFileData(dataUrl);
      try {
        const text = await extractTextFromFile(f);
        setContentText(text);
      } catch { /* ignore */ }
    }
  };



  const syncRulesToLocalDb = async (): Promise<number> => {
    const webhookPid = await resolveWebhookProductId(productId);

    // Fetch rules directly from external Supabase DB
    const idsToTry = [webhookPid];
    if (webhookPid !== productId) idsToTry.push(productId);

    let externalRules: any[] = [];
    for (const pid of idsToTry) {
      const res = await fetch(
        `${EXTERNAL_SUPABASE_URL}?product_id=eq.${pid}&select=*`,
        {
          headers: {
            apikey: EXTERNAL_SUPABASE_ANON,
            Authorization: `Bearer ${EXTERNAL_SUPABASE_ANON}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          externalRules = data;
          break;
        }
      }
    }

    const normalizedRules = externalRules
      .filter((r: any) => r?.rule_id && r?.process_type && r?.category && r?.description)
      .map((r: any) => ({
        product_id: productId,
        process_type: String(r.process_type),
        rule_id: String(r.rule_id),
        category: String(r.category),
        title: String(r.title || ""),
        description: String(r.description),
        severity: String(r.severity || "medium"),
        sort_order: Number.isFinite(r.sort_order) ? r.sort_order : 999,
        is_active: r.is_active ?? true,
      }));

    if (normalizedRules.length === 0) {
      throw new Error("外部DBにルールが見つかりません");
    }

    // Upsert: add new rules, update duplicates (by rule_id + process_type), keep existing non-duplicate rules
    let upsertedCount = 0;
    for (const rule of normalizedRules) {
      // Check if rule with same rule_id and process_type already exists
      const { data: existing } = await supabase
        .from("check_rules")
        .select("id")
        .eq("product_id", productId)
        .eq("rule_id", rule.rule_id)
        .eq("process_type", rule.process_type)
        .maybeSingle();

      if (existing) {
        // Update existing rule
        await supabase.from("check_rules").update(rule).eq("id", existing.id);
      } else {
        // Insert new rule
        const { error } = await supabase.from("check_rules").insert(rule);
        if (error) console.error("[syncRules] insert error:", error);
      }
      upsertedCount++;
    }

    return upsertedCount;
  };

  const callParseReferenceWebhook = async (text: string) => {
    toast({ title: "AIルール生成中...", description: "参考資料からチェックルールを自動生成しています" });
    try {
      const res = await fetch(PARSE_REFERENCE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: await resolveWebhookProductId(productId), material_type: materialType, content_text: text, process_types: ALL_PROCESS_TYPES }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      const generatedCount = result.count || 0;
      toast({ title: "AIルールが生成されました", description: `${generatedCount}件のチェックルールが追加されました。同期中...` });

      // Wait for n8n to finish writing to external DB, then sync with retries
      let syncedCount = 0;
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        // Wait before each attempt (10s, 15s, 20s)
        const delay = 10000 + attempt * 5000;
        toast({ title: "ルール同期待機中...", description: `外部DBの反映を待っています（${attempt + 1}/3）` });
        await new Promise(r => setTimeout(r, delay));
        try {
          syncedCount = await syncRulesToLocalDb();
          lastError = null;
          break;
        } catch (err) {
          lastError = err as Error;
          console.warn(`[syncRules] attempt ${attempt + 1} failed:`, err);
        }
      }
      if (lastError) {
        console.error("[syncRules] all attempts failed:", lastError);
        toast({ title: "ルール同期に失敗しました", description: "n8nでのルール生成は完了していますが、ローカルDBへの同期に失敗しました。チェックルールタブから手動同期してください。", variant: "destructive" });
      } else {
        toast({ title: "ルール同期完了", description: `${syncedCount}件を反映しました。` });
      }
    } catch (err) {
      console.error("[parse-reference] error:", err);
      toast({ title: "ルール自動生成に失敗しました", description: "n8nへのリクエストに失敗しました。再実行してください。", variant: "destructive" });
    }
  };

  // Always proceed directly — upsert logic preserves existing rules
  const triggerRuleGeneration = async (savedContentText: string): Promise<boolean> => {
    await callParseReferenceWebhook(savedContentText);
    return false;
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
    // Multi-file mode: save each file as a separate record
    if (method === "file_upload" && multiFiles.length > 1 && !existing) {
      const anyExtracting = multiFiles.some(q => q.extracting);
      if (anyExtracting) {
        toast({ title: "ファイルの処理中です。少々お待ちください。", variant: "destructive" });
        return;
      }
      setSaving(true);
      const payloads = multiFiles.map((q, i) => ({
        scope_type: scopeType,
        scope_id: scopeId,
        material_type: materialType,
        title: multiFiles.length === 1 ? title.trim() : q.name.replace(/\.[^.]+$/, ""),
        content_text: q.contentText || null,
        file_name: q.name,
        file_data: q.dataUrl || null,
        source_type: "file_upload" as const,
        is_active: true,
        sort_order: i,
        created_by: user?.email || user?.id || null,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from("reference_materials").insert(payloads);
      if (error) {
        toast({ title: "エラー", description: error.message, variant: "destructive" });
        setSaving(false);
      } else {
        toast({ title: `${payloads.length}件の資料を保存しました` });
        setSaving(false);
        onSaved();
        // AI rule generation on combined text
        if (autoGenerateRules) {
          const combinedText = payloads.map(p => p.content_text).filter(Boolean).join("\n\n");
          if (combinedText) {
            triggerRuleGeneration(combinedText).catch(console.error);
          }
        }
      }
      return;
    }

    // Single file / template / text / URL mode
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
      setSaving(false);
    } else {
      toast({ title: existing ? "更新しました" : "保存しました" });
      setSaving(false);
      onSaved();

      if (autoGenerateRules && finalContentText) {
        triggerRuleGeneration(finalContentText).catch(console.error);
      }
    }
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
              <p className="text-xs text-muted-foreground">
                {multiFiles.length > 0
                  ? `${multiFiles.length}件のファイルを選択済み（追加可能）`
                  : fileName || "クリックしてファイルを選択（複数選択可）"}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">対応: .xlsx .xls .csv .pdf .png .jpg .pptx .txt</p>
              <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.pptx,.txt,.webp" multiple onChange={handleFile} />
            </div>

            {/* Queued file list */}
            {multiFiles.length > 1 && (
              <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                {multiFiles.map((q, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1">
                    {q.extracting ? (
                      <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
                    ) : (
                      <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="truncate flex-1">{q.name}</span>
                    <button
                      type="button"
                      className="text-destructive hover:text-destructive/80 text-[10px] shrink-0"
                      onClick={(e) => { e.stopPropagation(); setMultiFiles(prev => prev.filter((_, j) => j !== i)); }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {extractMsg && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                {extracting && <Loader2 className="h-3 w-3 animate-spin" />}
                {extractMsg}
              </p>
            )}
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

        {/* Text area for non-template methods - hide when multi-file */}
        {method !== "template" && multiFiles.length <= 1 && (
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
          <Button size="sm" className="text-xs h-7" onClick={handleSave} disabled={saving || extracting || multiFiles.some(q => q.extracting) || (multiFiles.length <= 1 && !title.trim())}>
            {saving ? "保存中..." : extracting || multiFiles.some(q => q.extracting) ? "テキスト抽出中..." : multiFiles.length > 1 ? `${multiFiles.length}件を保存` : "保存"}
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={onCancel}>キャンセル</Button>
        </div>
      </div>
    </>
  );
}
