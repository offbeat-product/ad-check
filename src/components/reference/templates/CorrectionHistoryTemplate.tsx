import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export interface CorrectionItem {
  location: string;
  content: string;
  reason: string;
  severity: string;
}

export interface CorrectionHistoryData {
  template_type: "correction_history";
  target_product: string;
  target_creative: string;
  process_type: string;
  correction_source: string;
  items: CorrectionItem[];
  learnings: string;
  rules_to_add: string;
}

const PROCESS_OPTIONS = [
  { value: "script", label: "構成/字コンテ" },
  { value: "na_script", label: "NA原稿" },
  { value: "bgm", label: "BGM" },
  { value: "narration", label: "ナレーション" },
  { value: "vcon", label: "Vコン" },
  { value: "styleframe", label: "スタイルフレーム" },
  { value: "storyboard", label: "絵コンテ" },
  { value: "video_horizontal", label: "横動画" },
  { value: "video_vertical", label: "縦動画" },
];

const REASON_OPTIONS = ["表現NG", "薬事法違反", "トンマナ不一致", "情報不足", "素材品質", "テンポ", "その他"];
const SEVERITY_OPTIONS = [
  { value: "critical", label: "致命的" },
  { value: "important", label: "重要" },
  { value: "minor", label: "軽微" },
];
const SOURCE_OPTIONS = [
  { value: "internal_qm", label: "社内QM" },
  { value: "client", label: "クライアント" },
  { value: "both", label: "両方" },
];

interface Props {
  initialData?: CorrectionHistoryData;
  onChange: (data: CorrectionHistoryData) => void;
}

export default function CorrectionHistoryTemplate({ initialData, onChange }: Props) {
  const [data, setData] = useState<CorrectionHistoryData>(initialData || {
    template_type: "correction_history",
    target_product: "",
    target_creative: "",
    process_type: "video_horizontal",
    correction_source: "client",
    items: [{ location: "", content: "", reason: "表現NG", severity: "important" }],
    learnings: "",
    rules_to_add: "",
  });

  const updateAndNotify = (newData: CorrectionHistoryData) => {
    setData(newData);
    onChange(newData);
  };

  const updateField = (field: keyof CorrectionHistoryData, value: any) => {
    updateAndNotify({ ...data, [field]: value });
  };

  const addItem = () => {
    updateAndNotify({ ...data, items: [...data.items, { location: "", content: "", reason: "表現NG", severity: "important" }] });
  };

  const removeItem = (idx: number) => {
    updateAndNotify({ ...data, items: data.items.filter((_, i) => i !== idx) });
  };

  const updateItem = (idx: number, field: keyof CorrectionItem, value: string) => {
    const newItems = [...data.items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    updateAndNotify({ ...data, items: newItems });
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h4 className="text-xs font-semibold text-primary border-b border-border pb-1 mb-2">{children}</h4>
  );

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="text-xs font-medium text-muted-foreground mb-0.5 block">{children}</label>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SectionTitle>セクション1: 基本情報</SectionTitle>
        <div>
          <FieldLabel>対象動画/クリエイティブ名</FieldLabel>
          <Input value={data.target_creative} onChange={e => updateField("target_creative", e.target.value)} className="h-8 text-sm" placeholder="例: 001_商品紹介_30秒" />
        </div>
        <div>
          <FieldLabel>対象工程</FieldLabel>
          <Select value={data.process_type} onValueChange={v => updateField("process_type", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROCESS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <FieldLabel>修正指示元</FieldLabel>
          <Select value={data.correction_source} onValueChange={v => updateField("correction_source", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle>セクション2: 修正項目</SectionTitle>
        <div className="space-y-2">
          {data.items.map((item, idx) => (
            <div key={idx} className="border border-border rounded p-2 bg-muted/20 space-y-1.5">
              <div className="flex gap-1.5 items-center">
                <Input value={item.location} onChange={e => updateItem(idx, "location", e.target.value)} className="h-7 text-xs flex-1" placeholder="修正箇所（例: 冒頭3秒）" />
                <Select value={item.severity} onValueChange={v => updateItem(idx, "severity", v)}>
                  <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive shrink-0" onClick={() => removeItem(idx)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Textarea value={item.content} onChange={e => updateItem(idx, "content", e.target.value)} className="min-h-[40px] text-xs" placeholder="修正内容" />
              <Select value={item.reason} onValueChange={v => updateItem(idx, "reason", v)}>
                <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="修正理由" /></SelectTrigger>
                <SelectContent>
                  {REASON_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="text-xs h-7" onClick={addItem}>
          <Plus className="h-3 w-3 mr-1" />修正項目を追加
        </Button>
        <p className="text-[10px] text-muted-foreground">{data.items.filter(i => i.content.trim()).length} 件の修正項目</p>
      </div>

      <div className="space-y-2">
        <SectionTitle>セクション3: 学び・今後の注意点</SectionTitle>
        <div>
          <FieldLabel>今後の制作で注意すべきこと</FieldLabel>
          <Textarea value={data.learnings} onChange={e => updateField("learnings", e.target.value)} className="min-h-[60px] text-xs" placeholder="今回の修正から得た教訓・注意点" />
        </div>
        <div>
          <FieldLabel>ルール化すべきこと</FieldLabel>
          <Textarea value={data.rules_to_add} onChange={e => updateField("rules_to_add", e.target.value)} className="min-h-[60px] text-xs" placeholder="AIルール自動生成の入力になります" />
          <p className="text-[10px] text-muted-foreground mt-0.5">ここに記載された内容がAIルール自動生成の元になります</p>
        </div>
      </div>
    </div>
  );
}

export function correctionHistoryDataToText(d: CorrectionHistoryData): string {
  const processLabel = {
    script: "構成/字コンテ", na_script: "NA原稿", bgm: "BGM", narration: "ナレーション",
    vcon: "Vコン", styleframe: "スタイルフレーム", storyboard: "絵コンテ",
    video_horizontal: "横動画", video_vertical: "縦動画",
  }[d.process_type] || d.process_type;

  const sourceLabel = { internal_qm: "社内QM", client: "クライアント", both: "両方" }[d.correction_source] || d.correction_source;
  const sevLabel: Record<string, string> = { critical: "致命的", important: "重要", minor: "軽微" };

  const lines: string[] = [];
  lines.push("【修正履歴】");
  if (d.target_creative) lines.push(`対象: ${d.target_creative}`);
  lines.push(`工程: ${processLabel}`);
  lines.push(`指示元: ${sourceLabel}`);
  lines.push("");
  lines.push("【修正項目】");
  d.items.filter(i => i.content.trim()).forEach((item, idx) => {
    lines.push(`${idx + 1}. [${item.location || "—"}][${sevLabel[item.severity] || item.severity}][${item.reason}] ${item.content}`);
  });
  if (d.learnings) {
    lines.push("");
    lines.push(`【学び・注意点】\n${d.learnings}`);
  }
  if (d.rules_to_add) {
    lines.push("");
    lines.push(`【ルール化すべきこと】\n${d.rules_to_add}`);
  }
  return lines.join("\n");
}
