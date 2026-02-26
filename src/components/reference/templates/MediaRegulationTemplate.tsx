import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_PRESETS } from "./media-platform-presets";

export interface MediaRegulationData {
  template_type: "media_regulation";
  platforms: string[];
  preset_content: string;
  last_updated: string;
}

interface Props {
  initialData?: MediaRegulationData;
  suggestedPlatforms?: string[];
  onChange: (data: MediaRegulationData) => void;
}

export default function MediaRegulationTemplate({ initialData, suggestedPlatforms, onChange }: Props) {
  const [activePlatforms, setActivePlatforms] = useState<string[]>(
    initialData?.platforms ?? suggestedPlatforms ?? []
  );

  const buildAndNotify = (platforms: string[]) => {
    const content = platforms
      .map(id => PLATFORM_PRESETS.find(p => p.id === id)?.content || "")
      .filter(Boolean)
      .join("\n\n");

    onChange({
      template_type: "media_regulation",
      platforms,
      preset_content: content,
      last_updated: new Date().toISOString().split("T")[0],
    });
  };

  const toggle = (id: string) => {
    const next = activePlatforms.includes(id) ? activePlatforms.filter(p => p !== id) : [...activePlatforms, id];
    setActivePlatforms(next);
    buildAndNotify(next);
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-xs font-semibold text-primary border-b border-border pb-1 mb-2">📱 配信媒体を選択</h4>
        <p className="text-[10px] text-muted-foreground mb-2">ONにすると、その媒体の入稿規定・審査ポリシーがAIチェックに含まれます。</p>
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
    </div>
  );
}

export function mediaRegulationDataToText(d: MediaRegulationData): string {
  return d.preset_content || "";
}
