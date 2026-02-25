import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lightbulb, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CorrectionPattern {
  id: string;
  rule_id: string;
  rule_title: string | null;
  original_content: string;
  corrected_content: string;
  frequency: number;
}

interface CorrectionPatternCardProps {
  ruleId: string;
  productCode: string;
  onApply?: (correctedContent: string) => void;
}

export function CorrectionPatternCard({ ruleId, productCode, onApply }: CorrectionPatternCardProps) {
  const [pattern, setPattern] = useState<CorrectionPattern | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    supabase
      .from("correction_patterns")
      .select("*")
      .eq("product_code", productCode)
      .eq("rule_id", ruleId)
      .order("frequency", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setPattern(data[0] as any);
      });
  }, [ruleId, productCode]);

  if (!pattern || dismissed) return null;

  return (
    <div className="bg-status-ok/5 border border-status-ok/20 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-status-ok">
        <Lightbulb className="h-3.5 w-3.5" />
        過去の修正パターン ({pattern.frequency}回検出)
      </div>
      <p className="text-xs text-foreground/80">
        前回の修正: 「{pattern.corrected_content}」
      </p>
      <div className="flex gap-2">
        {onApply && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-status-ok/30 text-status-ok hover:bg-status-ok/10"
            onClick={() => onApply(pattern.corrected_content)}
          >
            <Check className="h-3 w-3 mr-1" />
            この修正を適用
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => setDismissed(true)}
        >
          <X className="h-3 w-3 mr-1" />
          無視
        </Button>
      </div>
    </div>
  );
}

interface TopPatternsProps {
  limit?: number;
}

export function TopCorrectionPatterns({ limit = 5 }: TopPatternsProps) {
  const [patterns, setPatterns] = useState<CorrectionPattern[]>([]);

  useEffect(() => {
    supabase
      .from("correction_patterns")
      .select("*")
      .order("frequency", { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        setPatterns((data as any as CorrectionPattern[]) || []);
      });
  }, [limit]);

  if (patterns.length === 0) return null;

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-status-warning" />
        <h2 className="text-sm font-semibold">よくある修正パターン</h2>
      </div>
      <div className="divide-y divide-border">
        {patterns.map((p) => (
          <div key={p.id} className="px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-status-warning/10 flex items-center justify-center text-xs font-bold text-status-warning shrink-0">
              {p.frequency}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{p.rule_id}: {p.rule_title || "不明"}</p>
              <p className="text-xs text-muted-foreground truncate">修正: {p.corrected_content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
