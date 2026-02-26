import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ListPlus } from "lucide-react";

export interface WCheckItem {
  category: string;
  content: string;
  severity: string;
}

export interface WCheckData {
  template_type: "w_check";
  process_type: string;
  items: WCheckItem[];
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



const CATEGORY_OPTIONS = ["構成", "テキスト", "デザイン", "音声", "動き・演出", "薬事・法規", "トンマナ", "素材・権利", "その他"];
const SEVERITY_OPTIONS = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

interface Props {
  initialData?: WCheckData;
  onChange: (data: WCheckData) => void;
}

export default function WCheckTemplate({ initialData, onChange }: Props) {
  const [data, setData] = useState<WCheckData>(initialData || {
    template_type: "w_check",
    process_type: "script",
    items: [{ category: "構成", content: "", severity: "medium" }],
  });
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const updateAndNotify = (newData: WCheckData) => {
    setData(newData);
    onChange(newData);
  };

  const addItem = () => {
    updateAndNotify({ ...data, items: [...data.items, { category: "構成", content: "", severity: "medium" }] });
  };

  const removeItem = (idx: number) => {
    updateAndNotify({ ...data, items: data.items.filter((_, i) => i !== idx) });
  };

  const updateItem = (idx: number, field: keyof WCheckItem, value: string) => {
    const newItems = [...data.items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    updateAndNotify({ ...data, items: newItems });
  };

  const parseBulk = () => {
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    const newItems: WCheckItem[] = lines.map(line => ({
      category: "その他",
      content: line.replace(/^[□■●・\-]\s*/, ""),
      severity: "medium",
    }));
    if (newItems.length > 0) {
      updateAndNotify({ ...data, items: [...data.items, ...newItems] });
      setBulkText("");
      setBulkMode(false);
    }
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h4 className="text-xs font-semibold text-primary border-b border-border pb-1 mb-2">{children}</h4>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SectionTitle>セクション1: 基本情報</SectionTitle>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-0.5 block">対象工程</label>
          <Select value={data.process_type} onValueChange={v => updateAndNotify({ ...data, process_type: v })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROCESS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>


      </div>

      <div className="space-y-2">
        <SectionTitle>セクション2: チェック項目</SectionTitle>
        <div className="space-y-2">
          {data.items.map((item, idx) => (
            <div key={idx} className="flex gap-1.5 items-start border border-border rounded p-2 bg-muted/20">
              <div className="flex-1 space-y-1.5">
                <div className="flex gap-1.5">
                  <Select value={item.category} onValueChange={v => updateItem(idx, "category", v)}>
                    <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={item.severity} onValueChange={v => updateItem(idx, "severity", v)}>
                    <SelectTrigger className="h-7 text-xs w-16"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Input value={item.content} onChange={e => updateItem(idx, "content", e.target.value)} className="h-7 text-xs" placeholder="チェック内容を入力" />
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive shrink-0 mt-0.5" onClick={() => removeItem(idx)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={addItem}>
            <Plus className="h-3 w-3 mr-1" />チェック項目を追加
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setBulkMode(!bulkMode)}>
            <ListPlus className="h-3 w-3 mr-1" />一括入力
          </Button>
        </div>

        {bulkMode && (
          <div className="space-y-1.5 border border-border rounded p-2 bg-muted/20">
            <label className="text-xs font-medium text-muted-foreground">改行区切りで一括入力（カテゴリ: その他、重要度: 中 で追加）</label>
            <Textarea value={bulkText} onChange={e => setBulkText(e.target.value)} className="min-h-[80px] text-xs font-mono" placeholder="冒頭3秒でフックがあるか&#10;CTAが明確か&#10;ロゴサイズが規定内か" />
            <Button size="sm" className="text-xs h-7" onClick={parseBulk} disabled={!bulkText.trim()}>
              パースして追加
            </Button>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">現在 {data.items.filter(i => i.content.trim()).length} 件のチェック項目</p>
      </div>
    </div>
  );
}

export function wcheckDataToText(d: WCheckData): string {
  const processLabel = {
    script: "構成/字コンテ", na_script: "NA原稿", bgm: "BGM", narration: "ナレーション",
    vcon: "Vコン", styleframe: "スタイルフレーム", storyboard: "絵コンテ",
    video_horizontal: "横動画", video_vertical: "縦動画",
  }[d.process_type] || d.process_type;

  const lines: string[] = [];
  lines.push(`【Wチェックシート】`);
  lines.push(`対象工程: ${processLabel}`);
  lines.push("");
  lines.push("【チェック項目】");
  d.items.filter(i => i.content.trim()).forEach((item, idx) => {
    const sev = { high: "高", medium: "中", low: "低" }[item.severity] || item.severity;
    lines.push(`${idx + 1}. [${item.category}][重要度:${sev}] ${item.content}`);
  });
  return lines.join("\n");
}
