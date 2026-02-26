import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

export interface BrandGuidelineData {
  template_type: "brand_guideline";
  brand_info: {
    brand_name: string;
    brand_concept: string;
    brand_keywords: string;
  };
  visual_rules: {
    main_colors: { color: string; label: string }[];
    sub_colors: { color: string; label: string }[];
    ng_colors: string;
    designated_fonts: string;
    ng_fonts: string;
    logo_rules: string;
  };
  tone_rules: {
    recommended_tone: string;
    ng_tone: string;
    model_rules: string;
    music_policy: string;
  };
  other: {
    credit_rules: string;
    other_guidelines: string;
  };
}

interface Props {
  initialData?: BrandGuidelineData;
  onChange: (data: BrandGuidelineData) => void;
}

export default function BrandGuidelineTemplate({ initialData, onChange }: Props) {
  const [data, setData] = useState<BrandGuidelineData>(initialData || {
    template_type: "brand_guideline",
    brand_info: { brand_name: "", brand_concept: "", brand_keywords: "" },
    visual_rules: { main_colors: [{ color: "#3B82F6", label: "" }], sub_colors: [], ng_colors: "", designated_fonts: "", ng_fonts: "", logo_rules: "" },
    tone_rules: { recommended_tone: "", ng_tone: "", model_rules: "", music_policy: "" },
    other: { credit_rules: "", other_guidelines: "" },
  });

  const updateAndNotify = (newData: BrandGuidelineData) => {
    setData(newData);
    onChange(newData);
  };

  const updateField = (path: string, value: any) => {
    const newData = JSON.parse(JSON.stringify(data));
    const keys = path.split(".");
    let obj = newData;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    updateAndNotify(newData);
  };

  const addColor = (type: "main_colors" | "sub_colors") => {
    const newData = { ...data, visual_rules: { ...data.visual_rules, [type]: [...data.visual_rules[type], { color: "#888888", label: "" }] } };
    updateAndNotify(newData);
  };

  const removeColor = (type: "main_colors" | "sub_colors", idx: number) => {
    const newData = { ...data, visual_rules: { ...data.visual_rules, [type]: data.visual_rules[type].filter((_, i) => i !== idx) } };
    updateAndNotify(newData);
  };

  const updateColor = (type: "main_colors" | "sub_colors", idx: number, field: "color" | "label", value: string) => {
    const arr = [...data.visual_rules[type]];
    arr[idx] = { ...arr[idx], [field]: value };
    updateAndNotify({ ...data, visual_rules: { ...data.visual_rules, [type]: arr } });
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h4 className="text-xs font-semibold text-primary border-b border-border pb-1 mb-2">{children}</h4>
  );

  const FieldLabel = ({ children, optional }: { children: React.ReactNode; optional?: boolean }) => (
    <label className="text-xs font-medium text-muted-foreground mb-0.5 block">
      {children}{optional && <span className="text-muted-foreground/50 ml-1">（任意）</span>}
    </label>
  );

  const renderColorList = (type: "main_colors" | "sub_colors", label: string) => (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="space-y-1.5">
        {data.visual_rules[type].map((c, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input type="color" value={c.color} onChange={e => updateColor(type, idx, "color", e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer" />
            <Input value={c.label} onChange={e => updateColor(type, idx, "label", e.target.value)} className="h-7 text-xs flex-1" placeholder="例: #3B82F6 ブランドブルー" />
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeColor(type, idx)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" className="text-xs h-6" onClick={() => addColor(type)}>
          <Plus className="h-3 w-3 mr-1" />追加
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SectionTitle>セクション1: ブランド基本情報</SectionTitle>
        <div>
          <FieldLabel>ブランド名</FieldLabel>
          <Input value={data.brand_info.brand_name} onChange={e => updateField("brand_info.brand_name", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <FieldLabel>ブランドコンセプト</FieldLabel>
          <Textarea value={data.brand_info.brand_concept} onChange={e => updateField("brand_info.brand_concept", e.target.value)} className="min-h-[60px] text-xs" />
        </div>
        <div>
          <FieldLabel>ブランドの世界観・キーワード</FieldLabel>
          <Textarea value={data.brand_info.brand_keywords} onChange={e => updateField("brand_info.brand_keywords", e.target.value)} className="min-h-[60px] text-xs" />
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle>セクション2: ビジュアル規定</SectionTitle>
        {renderColorList("main_colors", "メインカラー")}
        {renderColorList("sub_colors", "サブカラー")}
        <div>
          <FieldLabel optional>NGカラー</FieldLabel>
          <Input value={data.visual_rules.ng_colors} onChange={e => updateField("visual_rules.ng_colors", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <FieldLabel>指定フォント</FieldLabel>
          <Input value={data.visual_rules.designated_fonts} onChange={e => updateField("visual_rules.designated_fonts", e.target.value)} className="h-8 text-sm" placeholder="例: モリサワ ゴシックMB101" />
        </div>
        <div>
          <FieldLabel optional>NGフォント</FieldLabel>
          <Input value={data.visual_rules.ng_fonts} onChange={e => updateField("visual_rules.ng_fonts", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <FieldLabel>ロゴ使用ルール</FieldLabel>
          <Textarea value={data.visual_rules.logo_rules} onChange={e => updateField("visual_rules.logo_rules", e.target.value)} className="min-h-[60px] text-xs" placeholder="例: 最小サイズ、余白、背景色制約" />
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle>セクション3: トーン&マナー規定</SectionTitle>
        <div>
          <FieldLabel>推奨トーン</FieldLabel>
          <Textarea value={data.tone_rules.recommended_tone} onChange={e => updateField("tone_rules.recommended_tone", e.target.value)} className="min-h-[60px] text-xs" placeholder="例: 清潔感、信頼感、知的" />
        </div>
        <div>
          <FieldLabel>NGトーン</FieldLabel>
          <Textarea value={data.tone_rules.ng_tone} onChange={e => updateField("tone_rules.ng_tone", e.target.value)} className="min-h-[60px] text-xs" placeholder="例: チープ、派手、過度にカジュアル" />
        </div>
        <div>
          <FieldLabel optional>モデル・タレント使用ルール</FieldLabel>
          <Textarea value={data.tone_rules.model_rules} onChange={e => updateField("tone_rules.model_rules", e.target.value)} className="min-h-[60px] text-xs" />
        </div>
        <div>
          <FieldLabel optional>音楽・SE方針</FieldLabel>
          <Textarea value={data.tone_rules.music_policy} onChange={e => updateField("tone_rules.music_policy", e.target.value)} className="min-h-[60px] text-xs" />
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle>セクション4: その他</SectionTitle>
        <div>
          <FieldLabel>クレジット・注釈の表示ルール</FieldLabel>
          <Textarea value={data.other.credit_rules} onChange={e => updateField("other.credit_rules", e.target.value)} className="min-h-[60px] text-xs" />
        </div>
        <div>
          <FieldLabel>その他ガイドライン</FieldLabel>
          <Textarea value={data.other.other_guidelines} onChange={e => updateField("other.other_guidelines", e.target.value)} className="min-h-[60px] text-xs" />
        </div>
      </div>
    </div>
  );
}

export function brandGuidelineDataToText(d: BrandGuidelineData): string {
  const lines: string[] = [];
  lines.push("【ブランド基本情報】");
  if (d.brand_info.brand_name) lines.push(`ブランド名: ${d.brand_info.brand_name}`);
  if (d.brand_info.brand_concept) lines.push(`コンセプト: ${d.brand_info.brand_concept}`);
  if (d.brand_info.brand_keywords) lines.push(`世界観・キーワード: ${d.brand_info.brand_keywords}`);

  lines.push("\n【ビジュアル規定】");
  if (d.visual_rules.main_colors.length) lines.push(`メインカラー: ${d.visual_rules.main_colors.map(c => `${c.color}${c.label ? ` (${c.label})` : ""}`).join(", ")}`);
  if (d.visual_rules.sub_colors.length) lines.push(`サブカラー: ${d.visual_rules.sub_colors.map(c => `${c.color}${c.label ? ` (${c.label})` : ""}`).join(", ")}`);
  if (d.visual_rules.ng_colors) lines.push(`NGカラー: ${d.visual_rules.ng_colors}`);
  if (d.visual_rules.designated_fonts) lines.push(`指定フォント: ${d.visual_rules.designated_fonts}`);
  if (d.visual_rules.ng_fonts) lines.push(`NGフォント: ${d.visual_rules.ng_fonts}`);
  if (d.visual_rules.logo_rules) lines.push(`ロゴ使用ルール: ${d.visual_rules.logo_rules}`);

  lines.push("\n【トーン&マナー規定】");
  if (d.tone_rules.recommended_tone) lines.push(`推奨トーン: ${d.tone_rules.recommended_tone}`);
  if (d.tone_rules.ng_tone) lines.push(`NGトーン: ${d.tone_rules.ng_tone}`);
  if (d.tone_rules.model_rules) lines.push(`モデル・タレント: ${d.tone_rules.model_rules}`);
  if (d.tone_rules.music_policy) lines.push(`音楽・SE方針: ${d.tone_rules.music_policy}`);

  lines.push("\n【その他】");
  if (d.other.credit_rules) lines.push(`クレジット・注釈: ${d.other.credit_rules}`);
  if (d.other.other_guidelines) lines.push(`その他: ${d.other.other_guidelines}`);

  return lines.join("\n");
}
