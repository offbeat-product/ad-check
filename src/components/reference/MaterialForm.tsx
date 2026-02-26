import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { MATERIAL_TEMPLATES, extractTextFromXlsx, type ReferenceMaterial } from "@/lib/reference-materials";
import { parseWCheckFile, buildWCheckContentText, type WCheckParsedData } from "@/lib/wcheck-parser";
import WCheckPreview from "./WCheckPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Link2, FileText } from "lucide-react";

interface Props {
  materialType: string;
  scopeType: string;
  scopeId: string;
  existing?: ReferenceMaterial;
  onSaved: () => void;
  onCancel: () => void;
}

type InputMethod = "file_upload" | "text_input" | "url_reference";

export default function MaterialForm({ materialType, scopeType, scopeId, existing, onSaved, onCancel }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(existing?.title || "");
  const [method, setMethod] = useState<InputMethod>((existing?.source_type as InputMethod) || "file_upload");
  const [contentText, setContentText] = useState(existing?.content_text || "");
  const [sourceUrl, setSourceUrl] = useState(existing?.source_url || "");
  const [fileName, setFileName] = useState(existing?.file_name || "");
  const [fileData, setFileData] = useState(existing?.file_data || "");
  const [saving, setSaving] = useState(false);
  const [extractMsg, setExtractMsg] = useState("");
  const [wcheckParsed, setWcheckParsed] = useState<WCheckParsedData | null>(null);

  const isWCheck = materialType === "wcheck";

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));

    // Store as base64
    const reader = new FileReader();
    reader.onload = () => setFileData(reader.result as string);
    reader.readAsDataURL(f);

    // Extract text
    const ext = f.name.split(".").pop()?.toLowerCase() || "";

    // W-Check special handling for Excel files
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
          // Fallback to regular extraction
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

  const handleSave = async () => {
    if (!title.trim()) { toast({ title: "タイトルを入力してください", variant: "destructive" }); return; }
    setSaving(true);

    const payload = {
      scope_type: scopeType,
      scope_id: scopeId,
      material_type: materialType,
      title: title.trim(),
      content_text: contentText || null,
      file_name: fileName || null,
      file_data: method === "file_upload" ? fileData || null : null,
      source_url: method === "url_reference" ? sourceUrl || null : null,
      source_type: method,
      is_active: true,
      sort_order: 0,
      created_by: user?.email || user?.id || null,
      updated_at: new Date().toISOString(),
    };

    console.log("[ReferenceMaterial] 保存開始:", { existing: !!existing, scopeType, scopeId, materialType, title: title.trim() });

    let result, error;
    if (existing) {
      const res = await supabase.from("reference_materials").update(payload).eq("id", existing.id).select().single();
      result = res.data;
      error = res.error;
      console.log("[ReferenceMaterial] UPDATE結果:", { data: result, error });
    } else {
      const res = await supabase.from("reference_materials").insert(payload).select().single();
      result = res.data;
      error = res.error;
      console.log("[ReferenceMaterial] INSERT結果:", { data: result, error });
    }

    if (error) {
      console.error("[ReferenceMaterial] 保存エラー:", error);
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    } else {
      console.log("[ReferenceMaterial] 保存成功:", result?.id);
      toast({ title: existing ? "更新しました" : "保存しました" });
      onSaved();
    }
    setSaving(false);
  };

  // Pre-fill template if new and empty
  const handleMethodChange = (m: InputMethod) => {
    setMethod(m);
    if (m === "text_input" && !contentText && !existing) {
      setContentText(MATERIAL_TEMPLATES[materialType] || "");
    }
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">タイトル *</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 001案件_追加オリエン" className="h-8 text-sm" autoFocus />
      </div>

      <div className="flex gap-2">
        {([
          { id: "file_upload" as InputMethod, label: "ファイル", icon: Upload },
          { id: "text_input" as InputMethod, label: "テキスト", icon: FileText },
          { id: "url_reference" as InputMethod, label: "URL", icon: Link2 },
        ]).map((opt) => (
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

      {method === "file_upload" && (
        <div>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
          >
            <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{fileName || "クリックしてファイルを選択"}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">対応: .xlsx .xls .csv .pdf .png .jpg .pptx .txt</p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.pptx,.txt"
              onChange={handleFile}
            />
          </div>
          {extractMsg && <p className="text-xs text-amber-600 mt-1">{extractMsg}</p>}
        </div>
      )}

      {/* W-Check parse preview */}
      {wcheckParsed && <WCheckPreview parsedData={wcheckParsed} />}

      {method === "url_reference" && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">URL</label>
          <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." className="h-8 text-sm" />
          <p className="text-[10px] text-muted-foreground mt-1">リンク先の内容を下のテキストエリアにコピペしてください</p>
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">AIに送信するテキスト（自動抽出 or 手動入力）</label>
        <Textarea
          value={contentText}
          onChange={(e) => setContentText(e.target.value)}
          placeholder={method === "file_upload" ? "ファイルアップロード後にテキストが自動抽出されます。内容を確認・編集してください。" : MATERIAL_TEMPLATES[materialType] || "テキストを入力..."}
          className="min-h-[150px] text-xs font-mono"
        />
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="text-xs h-7" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? "保存中..." : "保存"}
        </Button>
        <Button size="sm" variant="outline" className="text-xs h-7" onClick={onCancel}>キャンセル</Button>
      </div>
    </div>
  );
}
