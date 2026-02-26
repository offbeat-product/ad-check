import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface OrientationData {
  template_type: "orientation";
  basic_info: {
    client_name: string;
    product_name: string;
    product_official_name: string;
    campaign_name: string;
    media_channels: string[];
    delivery_start_date: string;
    production_count: string;
    video_durations: string[];
  };
  target_info: {
    gender: string;
    age_groups: string[];
    needs: string;
    action_goal: string;
  };
  appeal_info: {
    main_appeal: string;
    sub_appeal: string;
    tone_manner: string[];
    required_words: string;
    prohibited_words: string;
    competitor_info: string;
  };
  notes: {
    regulation_notes: string;
    other_notes: string;
  };
}

const MEDIA_OPTIONS = ["Meta", "Google", "YouTube", "TikTok", "LINE", "X(Twitter)", "その他"];
const DURATION_OPTIONS = ["6秒", "15秒", "30秒", "60秒", "その他"];
const GENDER_OPTIONS = ["男性", "女性", "指定なし"];
const AGE_OPTIONS = ["10代", "20代", "30代", "40代", "50代", "60代以上"];
const TONE_OPTIONS = ["信頼感", "高級感", "カジュアル", "元気・活発", "クール", "ナチュラル", "その他"];

interface Props {
  initialData?: OrientationData;
  onChange: (data: OrientationData) => void;
}

export default function OrientationTemplate({ initialData, onChange }: Props) {
  const [data, setData] = useState<OrientationData>(initialData || {
    template_type: "orientation",
    basic_info: { client_name: "", product_name: "", product_official_name: "", campaign_name: "", media_channels: [], delivery_start_date: "", production_count: "", video_durations: [] },
    target_info: { gender: "", age_groups: [], needs: "", action_goal: "" },
    appeal_info: { main_appeal: "", sub_appeal: "", tone_manner: [], required_words: "", prohibited_words: "", competitor_info: "" },
    notes: { regulation_notes: "", other_notes: "" },
  });

  const update = (path: string, value: any) => {
    const newData = JSON.parse(JSON.stringify(data));
    const keys = path.split(".");
    let obj = newData;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    setData(newData);
    onChange(newData);
  };

  const toggleArray = (path: string, value: string) => {
    const keys = path.split(".");
    let obj: any = data;
    for (const k of keys) obj = obj[k];
    const arr = obj as string[];
    const newArr = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
    update(path, newArr);
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h4 className="text-xs font-semibold text-primary border-b border-border pb-1 mb-2">{children}</h4>
  );

  const FieldLabel = ({ children, optional }: { children: React.ReactNode; optional?: boolean }) => (
    <label className="text-xs font-medium text-muted-foreground mb-0.5 block">
      {children}{optional && <span className="text-muted-foreground/50 ml-1">（任意）</span>}
    </label>
  );

  const deliveryDate = data.basic_info.delivery_start_date ? new Date(data.basic_info.delivery_start_date) : undefined;

  return (
    <div className="space-y-4">
      {/* Section 1: Basic Info */}
      <div className="space-y-2">
        <SectionTitle>セクション1: 基本情報</SectionTitle>
        <div>
          <FieldLabel>クライアント名</FieldLabel>
          <Input value={data.basic_info.client_name} onChange={e => update("basic_info.client_name", e.target.value)} className="h-8 text-sm" placeholder="例: 株式会社ABC" />
        </div>
        <div>
          <FieldLabel>商材名</FieldLabel>
          <Input value={data.basic_info.product_name} onChange={e => update("basic_info.product_name", e.target.value)} className="h-8 text-sm" placeholder="例: ABCサプリメント" />
        </div>
        <div>
          <FieldLabel>商材正式名称</FieldLabel>
          <Input value={data.basic_info.product_official_name} onChange={e => update("basic_info.product_official_name", e.target.value)} className="h-8 text-sm" placeholder="広告内での正確な表記" />
        </div>
        <div>
          <FieldLabel optional>キャンペーン名</FieldLabel>
          <Input value={data.basic_info.campaign_name} onChange={e => update("basic_info.campaign_name", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <FieldLabel>配信媒体（複数選択可）</FieldLabel>
          <div className="flex flex-wrap gap-3 mt-1">
            {MEDIA_OPTIONS.map(opt => (
              <label key={opt} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox checked={data.basic_info.media_channels.includes(opt)} onCheckedChange={() => toggleArray("basic_info.media_channels", opt)} />
                {opt}
              </label>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel optional>配信開始日</FieldLabel>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-8 text-sm", !deliveryDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-3 w-3" />
                {deliveryDate ? format(deliveryDate, "yyyy/MM/dd") : "日付を選択"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={deliveryDate} onSelect={d => update("basic_info.delivery_start_date", d ? d.toISOString() : "")} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <FieldLabel>制作本数</FieldLabel>
          <Input type="number" value={data.basic_info.production_count} onChange={e => update("basic_info.production_count", e.target.value)} className="h-8 text-sm w-24" />
        </div>
        <div>
          <FieldLabel>動画尺（複数選択可）</FieldLabel>
          <div className="flex flex-wrap gap-3 mt-1">
            {DURATION_OPTIONS.map(opt => (
              <label key={opt} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox checked={data.basic_info.video_durations.includes(opt)} onCheckedChange={() => toggleArray("basic_info.video_durations", opt)} />
                {opt}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Section 2: Target Info */}
      <div className="space-y-2">
        <SectionTitle>セクション2: ターゲット情報</SectionTitle>
        <div>
          <FieldLabel>ターゲット性別</FieldLabel>
          <div className="flex gap-3 mt-1">
            {GENDER_OPTIONS.map(opt => (
              <label key={opt} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="radio" name="gender" checked={data.target_info.gender === opt} onChange={() => update("target_info.gender", opt)} className="accent-primary" />
                {opt}
              </label>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>ターゲット年齢層（複数選択可）</FieldLabel>
          <div className="flex flex-wrap gap-3 mt-1">
            {AGE_OPTIONS.map(opt => (
              <label key={opt} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox checked={data.target_info.age_groups.includes(opt)} onCheckedChange={() => toggleArray("target_info.age_groups", opt)} />
                {opt}
              </label>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>ターゲットの悩み・ニーズ</FieldLabel>
          <Textarea value={data.target_info.needs} onChange={e => update("target_info.needs", e.target.value)} className="min-h-[60px] text-xs" placeholder="ターゲットが抱える課題やニーズ" />
        </div>
        <div>
          <FieldLabel>ターゲットの行動ゴール</FieldLabel>
          <Input value={data.target_info.action_goal} onChange={e => update("target_info.action_goal", e.target.value)} className="h-8 text-sm" placeholder="例: 購入、申込、来店、資料請求" />
        </div>
      </div>

      {/* Section 3: Appeal Info */}
      <div className="space-y-2">
        <SectionTitle>セクション3: 訴求・表現方針</SectionTitle>
        <div>
          <FieldLabel>メイン訴求ポイント</FieldLabel>
          <Textarea value={data.appeal_info.main_appeal} onChange={e => update("appeal_info.main_appeal", e.target.value)} className="min-h-[60px] text-xs" />
        </div>
        <div>
          <FieldLabel optional>サブ訴求ポイント</FieldLabel>
          <Textarea value={data.appeal_info.sub_appeal} onChange={e => update("appeal_info.sub_appeal", e.target.value)} className="min-h-[60px] text-xs" />
        </div>
        <div>
          <FieldLabel>トーン&マナー（複数選択可）</FieldLabel>
          <div className="flex flex-wrap gap-3 mt-1">
            {TONE_OPTIONS.map(opt => (
              <label key={opt} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox checked={data.appeal_info.tone_manner.includes(opt)} onCheckedChange={() => toggleArray("appeal_info.tone_manner", opt)} />
                {opt}
              </label>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>使用必須ワード</FieldLabel>
          <Textarea value={data.appeal_info.required_words} onChange={e => update("appeal_info.required_words", e.target.value)} className="min-h-[60px] text-xs" placeholder="例: 商品名、キャッチコピー、CTA文言" />
        </div>
        <div>
          <FieldLabel>使用禁止ワード・表現</FieldLabel>
          <Textarea value={data.appeal_info.prohibited_words} onChange={e => update("appeal_info.prohibited_words", e.target.value)} className="min-h-[60px] text-xs" />
        </div>
        <div>
          <FieldLabel optional>競合・参考情報</FieldLabel>
          <Textarea value={data.appeal_info.competitor_info} onChange={e => update("appeal_info.competitor_info", e.target.value)} className="min-h-[60px] text-xs" />
        </div>
      </div>

      {/* Section 4: Notes */}
      <div className="space-y-2">
        <SectionTitle>セクション4: 注意事項</SectionTitle>
        <div>
          <FieldLabel>レギュレーション注意点</FieldLabel>
          <Textarea value={data.notes.regulation_notes} onChange={e => update("notes.regulation_notes", e.target.value)} className="min-h-[60px] text-xs" placeholder="例: 薬機法、景表法、業界規制" />
        </div>
        <div>
          <FieldLabel>その他補足・自由記入</FieldLabel>
          <Textarea value={data.notes.other_notes} onChange={e => update("notes.other_notes", e.target.value)} className="min-h-[60px] text-xs" />
        </div>
      </div>
    </div>
  );
}

export function orientationDataToText(d: OrientationData): string {
  const lines: string[] = [];
  lines.push("【基本情報】");
  if (d.basic_info.client_name) lines.push(`クライアント名: ${d.basic_info.client_name}`);
  if (d.basic_info.product_name) lines.push(`商材名: ${d.basic_info.product_name}`);
  if (d.basic_info.product_official_name) lines.push(`商材正式名称: ${d.basic_info.product_official_name}`);
  if (d.basic_info.campaign_name) lines.push(`キャンペーン名: ${d.basic_info.campaign_name}`);
  if (d.basic_info.media_channels.length) lines.push(`配信媒体: ${d.basic_info.media_channels.join(", ")}`);
  if (d.basic_info.delivery_start_date) lines.push(`配信開始日: ${d.basic_info.delivery_start_date.split("T")[0]}`);
  if (d.basic_info.production_count) lines.push(`制作本数: ${d.basic_info.production_count}本`);
  if (d.basic_info.video_durations.length) lines.push(`動画尺: ${d.basic_info.video_durations.join(", ")}`);

  lines.push("\n【ターゲット情報】");
  if (d.target_info.gender) lines.push(`性別: ${d.target_info.gender}`);
  if (d.target_info.age_groups.length) lines.push(`年齢層: ${d.target_info.age_groups.join(", ")}`);
  if (d.target_info.needs) lines.push(`悩み・ニーズ: ${d.target_info.needs}`);
  if (d.target_info.action_goal) lines.push(`行動ゴール: ${d.target_info.action_goal}`);

  lines.push("\n【訴求・表現方針】");
  if (d.appeal_info.main_appeal) lines.push(`メイン訴求: ${d.appeal_info.main_appeal}`);
  if (d.appeal_info.sub_appeal) lines.push(`サブ訴求: ${d.appeal_info.sub_appeal}`);
  if (d.appeal_info.tone_manner.length) lines.push(`トーン&マナー: ${d.appeal_info.tone_manner.join(", ")}`);
  if (d.appeal_info.required_words) lines.push(`使用必須ワード: ${d.appeal_info.required_words}`);
  if (d.appeal_info.prohibited_words) lines.push(`使用禁止ワード: ${d.appeal_info.prohibited_words}`);
  if (d.appeal_info.competitor_info) lines.push(`競合・参考情報: ${d.appeal_info.competitor_info}`);

  lines.push("\n【注意事項】");
  if (d.notes.regulation_notes) lines.push(`レギュレーション: ${d.notes.regulation_notes}`);
  if (d.notes.other_notes) lines.push(`その他: ${d.notes.other_notes}`);

  return lines.join("\n");
}
