import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Info, ChevronDown } from "lucide-react";
import { PLATFORM_PRESETS } from "./media-platform-presets";
import { supabase } from "@/integrations/supabase/client";

export interface MediaRegulationData {
  template_type: "media_regulation";
  platforms: string[];
  preset_content: string;
  custom_notes: string;
  last_updated: string;
}

interface Props {
  initialData?: MediaRegulationData;
  suggestedPlatforms?: string[];
  productId?: string;
  onChange: (data: MediaRegulationData) => void;
}

// Map orientation media_channels to platform preset IDs
const ORIENTATION_TO_PLATFORM: Record<string, string> = {
  "Meta": "meta",
  "Google": "google",
  "YouTube": "google",
  "TikTok": "tiktok",
  "LINE": "line",
  "X(Twitter)": "x_twitter",
};

export default function MediaRegulationTemplate({ initialData, suggestedPlatforms, productId, onChange }: Props) {
  const [activePlatforms, setActivePlatforms] = useState<string[]>(
    initialData?.platforms ?? suggestedPlatforms ?? []
  );
  const [customNotes, setCustomNotes] = useState(initialData?.custom_notes || "");
  const [autoSuggestedPlatforms, setAutoSuggestedPlatforms] = useState<string[]>([]);
  const [showSuggestion, setShowSuggestion] = useState(false);

  // Auto-detect platforms from orientation sheets
  useEffect(() => {
    if (!productId || initialData) return;
    (async () => {
      const { data } = await supabase
        .from("reference_materials")
        .select("content_text")
        .eq("scope_id", productId)
        .eq("material_type", "orientation")
        .eq("is_active", true);
      if (!data || data.length === 0) return;

      const detected = new Set<string>();
      for (const mat of data) {
        if (!mat.content_text) continue;
        const jsonMatch = mat.content_text.split("---TEMPLATE_JSON---")[1];
        if (!jsonMatch) continue;
        try {
          const parsed = JSON.parse(jsonMatch.trim());
          const channels: string[] = parsed?.basic_info?.media_channels || [];
          for (const ch of channels) {
            const mapped = ORIENTATION_TO_PLATFORM[ch];
            if (mapped) detected.add(mapped);
          }
        } catch { /* ignore */ }
      }

      if (detected.size > 0) {
        const platforms = Array.from(detected);
        setAutoSuggestedPlatforms(platforms);
        setActivePlatforms(platforms);
        setShowSuggestion(true);
        buildAndNotify(platforms, customNotes);
      }
    })();
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildAndNotify = (platforms: string[], notes: string) => {
    const content = platforms
      .map(id => PLATFORM_PRESETS.find(p => p.id === id)?.content || "")
      .filter(Boolean)
      .join("\n\n");

    onChange({
      template_type: "media_regulation",
      platforms,
      preset_content: content,
      custom_notes: notes,
      last_updated: new Date().toISOString().split("T")[0],
    });
  };

  const toggle = (id: string) => {
    const next = activePlatforms.includes(id) ? activePlatforms.filter(p => p !== id) : [...activePlatforms, id];
    setActivePlatforms(next);
    buildAndNotify(next, customNotes);
  };

  const handleCustomNotesChange = (text: string) => {
    setCustomNotes(text);
    buildAndNotify(activePlatforms, text);
  };

  const suggestedLabels = autoSuggestedPlatforms
    .map(id => PLATFORM_PRESETS.find(p => p.id === id)?.label)
    .filter(Boolean)
    .join("・");

  return (
    <div className="space-y-4">
      {/* Suggestion banner */}
      {showSuggestion && autoSuggestedPlatforms.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-accent/50 border border-accent text-xs">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">オリエンシートの配信媒体設定に基づき、{suggestedLabels}を自動選択しました。</p>
            <p className="text-muted-foreground mt-0.5">手動でON/OFFを変更できます。</p>
          </div>
          <button onClick={() => setShowSuggestion(false)} className="text-muted-foreground hover:text-foreground shrink-0">✕</button>
        </div>
      )}

      {/* Step 1: Platform selection */}
      <div>
        <h4 className="text-xs font-semibold text-primary border-b border-border pb-1 mb-2">ステップ1: 配信媒体を選択</h4>
        <p className="text-[10px] text-muted-foreground mb-2">ONにすると、その媒体の入稿規定・審査ポリシーがAIチェックに含まれます。複数選択可。</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PLATFORM_PRESETS.map((platform) => {
            const isActive = activePlatforms.includes(platform.id);
            return (
              <div
                key={platform.id}
                className={`border rounded-lg p-3 transition-colors ${isActive ? "border-primary/40 bg-primary/5" : "border-border bg-muted/10"}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg shrink-0">{platform.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs font-medium cursor-pointer block">{platform.label}</Label>
                    <p className="text-[10px] text-muted-foreground">{platform.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {platform.badges.map(b => (
                        <Badge key={b} variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{b}</Badge>
                      ))}
                    </div>
                  </div>
                  <Switch checked={isActive} onCheckedChange={() => toggle(platform.id)} />
                </div>
              </div>
            );
          })}
        </div>
        {activePlatforms.length > 0 && (
          <p className="text-[10px] text-status-ok mt-2 font-medium">✅ {activePlatforms.length}媒体のレギュレーションが適用されます</p>
        )}
      </div>

      {/* Step 2: Accordion preview */}
      {activePlatforms.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-primary border-b border-border pb-1 mb-2">ステップ2: 内容プレビュー</h4>
          <div className="space-y-1.5">
            {activePlatforms.map(id => {
              const platform = PLATFORM_PRESETS.find(p => p.id === id);
              if (!platform) return null;
              return (
                <Collapsible key={id}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors text-xs font-medium group">
                    <span>{platform.emoji}</span>
                    <span className="flex-1">{platform.label}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-6 mr-2 mb-2 p-2 rounded bg-muted/30 border border-border text-[11px] font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {platform.content}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Custom notes */}
      <div>
        <h4 className="text-xs font-semibold text-primary border-b border-border pb-1 mb-2">ステップ3: 補足ルール追加</h4>
        <p className="text-[10px] text-muted-foreground mb-1.5">特定キャンペーンの制約や過去の不承認事例等を自由記述できます。</p>
        <Textarea
          value={customNotes}
          onChange={e => handleCustomNotesChange(e.target.value)}
          className="min-h-[80px] text-xs"
          placeholder="例: 過去にMeta審査でビフォーアフター画像が不承認になった事例あり。同一条件の撮影証明を必ず添付すること。"
        />
      </div>
    </div>
  );
}

export function mediaRegulationDataToText(d: MediaRegulationData): string {
  return [d.preset_content, d.custom_notes].filter(Boolean).join("\n\n");
}
