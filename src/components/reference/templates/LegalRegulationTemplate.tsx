import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Shield, Scale, Stethoscope, ShoppingCart, AlertTriangle } from "lucide-react";


export interface LegalRegulationData {
  template_type: "legal_regulation";
  presets: {
    laws: string[];
  };
  preset_content: string;
  custom_rules: string;
  last_updated: string;
}

interface LawPresetDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  content: string;
}

const LAW_PRESETS: LawPresetDef[] = [
  {
    id: "pharmaceutical",
    label: "薬機法（医薬品医療機器等法）",
    icon: <Shield className="h-4 w-4" />,
    description: "医薬品・化粧品・健康食品等の広告規制",
    content: `【薬機法 広告規制ルール（2025年改正対応）】

■ 基本原則
- 虚偽・誇大広告の禁止（第66条）：事実と異なる効能効果の表示は禁止
- 承認前広告の禁止（第68条）：未承認の医薬品等の広告は禁止
- 課徴金制度：違反時は対象商品売上額の4.5%が課徴金として徴収される

■ 禁止表現
- 効果を保証・断定する表現：「治る」「必ず効く」「完全に○○」
- 体験談による効果の暗示：個人の感想でも効能効果を暗示する表現はNG
- 最大級表現：「最高の効果」「世界一」（客観的データなし）
- 医師・専門家の推薦：「医師も推奨」は客観的事実に基づく場合のみ
- ビフォーアフター：医療広告ガイドライン要件（同一人物・同一条件・加工禁止）を遵守すること

■ 必須表示事項
- 医薬品の場合：承認された効能効果の範囲内で表現
- 副作用リスクの明記
- 自由診療の場合はその旨を明記
- 「※個人の感想です」だけでは免責にならない
- PR表記の義務化（ステルスマーケティング防止）

■ 商材カテゴリ別注意点
【医薬品】承認された効能効果の範囲内のみ。「治療」「予防」は医薬品のみ使用可
【医薬部外品】「薬用」表示可。予防効果の範囲内での表現に限定
【化粧品】表現できる効能効果は56種類に制限。「美白」は条件付き
【健康食品】医薬品的な効能効果表現は一切不可。「栄養補給」「食生活を整える」等の範囲内
【医療機器】クラス分類に応じた規制。承認された使用目的・性能の範囲内`,
  },
  {
    id: "fair_trade",
    label: "景品表示法",
    icon: <Scale className="h-4 w-4" />,
    description: "優良誤認・有利誤認・ステマ規制",
    content: `【景品表示法 広告規制ルール（2024年10月改正対応）】

■ 基本原則
- 優良誤認表示の禁止：実際よりも著しく優良であると誤認させる表示
- 有利誤認表示の禁止：実際よりも著しく有利であると誤認させる表示
- 直罰規定：行政指導なしで直接100万円以下の罰金が科される可能性あり（2024年改正）
- 課徴金：過去3年間の売上の3%が徴収。再犯は1.5倍

■ 禁止表現
- 根拠なき「No.1」「業界最安値」「日本一」→ 客観的調査データ（調査機関名・期間・対象）の明記必須
- 根拠なき「○○%の人が実感」→ 調査の母集団・方法・期間を明記
- 不当な二重価格表示：「通常価格○○円→今だけ○○円」は実際の販売実績が必要
- 「今だけ」「期間限定」→ 実際に期間限定でない場合はNG
- おとり広告：在庫僅少・販売期間限定の商品を大々的に宣伝

■ ステルスマーケティング規制（2023年10月～）
- インフルエンサーPR投稿には「広告」の明示的表記が必須（#PRだけでは不十分）
- 事業者が表示内容の決定に関与したものはすべて対象
- 2024年改正でインフルエンサー・広告代理店も罰則対象に

■ 打消し表示の注意
- 「※効果には個人差があります」等の小さな注釈に頼りすぎないこと
- 本体の表示が与える印象が強すぎる場合、注釈は法的に無効と判断される可能性あり`,
  },
  {
    id: "medical_ad",
    label: "医療広告ガイドライン",
    icon: <Stethoscope className="h-4 w-4" />,
    description: "医療機関・自由診療の広告規制",
    content: `【医療広告ガイドライン】

■ 基本原則
- 医療機関の広告は医療法で厳格に規制
- 広告可能事項は限定列挙方式

■ 禁止事項
- 治療前後の写真（ビフォーアフター）：詳細な説明なしでの掲載は禁止
- 患者の体験談の広告利用は原則禁止
- 「絶対安全」「100%成功」等の誇大表現
- 他院との比較広告

■ 自由診療の場合の必須表示
- 自由診療であること
- 治療内容・期間
- 費用（税込）
- 主なリスク・副作用`,
  },
  {
    id: "commercial_transactions",
    label: "特定商取引法",
    icon: <ShoppingCart className="h-4 w-4" />,
    description: "通信販売・定期購入の表示義務",
    content: `【特定商取引法 広告規制ルール】

■ 通信販売の広告表示義務
- 販売価格（税込）
- 送料
- 支払方法・時期
- 引渡し時期
- 返品・交換条件
- 事業者の名称・住所・電話番号

■ 誇大広告の禁止
- 商品の性能・品質について著しく事実と異なる表示の禁止
- 定期購入の場合は解約条件を明示

■ ネガティブオプション規制
- 注文していない商品の送りつけ販売の禁止`,
  },
  {
    id: "industry_custom",
    label: "業界固有ルール（カスタム）",
    icon: <AlertTriangle className="h-4 w-4" />,
    description: "AGA治療・着圧商品・媒体ポリシー等",
    content: "",
  },
];

interface Props {
  initialData?: LegalRegulationData;
  onChange: (data: LegalRegulationData) => void;
}

export default function LegalRegulationTemplate({ initialData, onChange }: Props) {
  const [activeLaws, setActiveLaws] = useState<string[]>(
    initialData?.presets?.laws ?? (Array.isArray(initialData?.presets) ? initialData.presets as unknown as string[] : ["pharmaceutical", "fair_trade"])
  );
  const [customRules, setCustomRules] = useState(initialData?.custom_rules || "");
  const [industryCustom, setIndustryCustom] = useState("");

  const buildAndNotify = (laws: string[], custom: string, industryText: string) => {
    const lawContents = laws
      .filter(id => id !== "industry_custom")
      .map(id => LAW_PRESETS.find(p => p.id === id)?.content || "")
      .filter(Boolean)
      .join("\n\n");

    const fullContent = [lawContents, industryText, custom].filter(Boolean).join("\n\n");

    const data: LegalRegulationData = {
      template_type: "legal_regulation",
      presets: { laws },
      preset_content: fullContent,
      custom_rules: custom,
      last_updated: new Date().toISOString().split("T")[0],
    };
    onChange(data);
  };

  // Emit initial data on mount so parent receives preset content
  useEffect(() => {
    buildAndNotify(activeLaws, customRules, industryCustom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleLaw = (id: string) => {
    const next = activeLaws.includes(id) ? activeLaws.filter(p => p !== id) : [...activeLaws, id];
    setActiveLaws(next);
    buildAndNotify(next, customRules, industryCustom);
  };

  const handleCustomChange = (text: string) => {
    setCustomRules(text);
    buildAndNotify(activeLaws, text, industryCustom);
  };

  const handleIndustryChange = (text: string) => {
    setIndustryCustom(text);
    buildAndNotify(activeLaws, customRules, text);
  };

  const lawCount = activeLaws.filter(id => id !== "industry_custom").length;

  return (
    <div className="space-y-4">

      {/* Step 1: Law presets */}
      <div>
        <h4 className="text-xs font-semibold text-primary border-b border-border pb-1 mb-2">📋 法令・規制</h4>
        <p className="text-[10px] text-muted-foreground mb-2">ONにすると、そのカテゴリのルールが自動的にAIチェックに含まれます。</p>
        <div className="space-y-2">
          {LAW_PRESETS.map((preset) => {
            const isActive = activeLaws.includes(preset.id);
            const isIndustry = preset.id === "industry_custom";
            return (
              <div key={preset.id}>
                <div className={`border rounded-lg p-3 transition-colors ${isActive ? "border-primary/40 bg-primary/5" : "border-border bg-muted/10"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}>{preset.icon}</div>
                    <div className="flex-1 min-w-0">
                      <Label className="text-xs font-medium cursor-pointer block">{preset.label}</Label>
                      <p className="text-[10px] text-muted-foreground">{preset.description}</p>
                    </div>
                    <Switch checked={isActive} onCheckedChange={() => toggleLaw(preset.id)} />
                  </div>
                </div>
                {isIndustry && isActive ? <div className="mt-1.5 ml-7">
                    <Textarea
                      value={industryCustom}
                      onChange={e => handleIndustryChange(e.target.value)}
                      className="min-h-[80px] text-xs"
                      placeholder="例: AGA治療広告の固有規制、着圧商品の表示ルール、特定媒体（Meta/Google等）のポリシー"
                    />
                  </div> : null}
              </div>
            );
          })}
        </div>
        {lawCount > 0 && (
          <p className="text-[10px] text-status-ok mt-2 font-medium">✅ {lawCount}カテゴリの法令ルールが適用されます</p>
        )}
      </div>


      {/* Step 2: Custom rules */}
      <div>
        <h4 className="text-xs font-semibold text-primary border-b border-border pb-1 mb-2">ステップ2: カスタムルール追加</h4>
        <p className="text-[10px] text-muted-foreground mb-1.5">プリセットに加えて、商材固有のルールを自由記述できます。</p>
        <Textarea
          value={customRules}
          onChange={e => handleCustomChange(e.target.value)}
          className="min-h-[100px] text-xs"
          placeholder="商材固有の広告規制や注意事項を記入..."
        />
      </div>
    </div>
  );
}

export function legalRegulationDataToText(d: LegalRegulationData): string {
  return d.preset_content || d.custom_rules || "";
}
