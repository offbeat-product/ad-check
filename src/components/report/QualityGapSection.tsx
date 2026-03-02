import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export interface GapFileRow {
  id: string;
  project_id: string;
  process_type: string;
  status: string | null;
  version_number: number | null;
  parent_file_id: string | null;
  fixed_at: string | null;
  created_at: string | null;
  submission_type: string;
}

interface PatternCounts {
  pattern1: number;
  pattern2: number;
  pattern3: number;
  both: number;
  total: number;
}

interface Props {
  files: GapFileRow[];
  projectNameMap: Map<string, string>;
  getProcessLabel: (key: string) => string;
}

/**
 * submission_type-based pattern detection:
 *
 * We group files by (project_id, process_type, pattern_id-or-null) to form "sequences".
 * Within each sequence, we sort by created_at and analyze the submission_type timeline:
 *
 * Pattern 1 (Ideal):       Client submission exists, and no re-upload after first client submission.
 * Pattern 2 (Rule gap):    Multiple client submissions exist (client → ... → client again).
 *                          → AIチェックルールの見直し・追加が必要
 * Pattern 3 (Creator gap): Multiple internal submissions before client submission.
 *                          → 社内ルール強化・クリエイター育成が必要
 * Both:                    Pattern 2 + Pattern 3 both detected in the same sequence.
 * Unclassified:            No client submission yet (still in internal cycle) — excluded from analysis.
 */
function computePatterns(files: GapFileRow[]): PatternCounts {
  // Group files by project + process to form submission sequences
  const groups = new Map<string, GapFileRow[]>();
  for (const f of files) {
    const key = `${f.project_id}::${f.process_type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  let pattern1 = 0, pattern2 = 0, pattern3 = 0, both = 0;

  for (const [, group] of groups) {
    // Sort by created_at ascending
    const sorted = [...group].sort((a, b) =>
      (a.created_at || "").localeCompare(b.created_at || "")
    );

    const clientSubmissions = sorted.filter(f => f.submission_type === "client");
    if (clientSubmissions.length === 0) continue; // Not yet submitted to client

    const firstClientIdx = sorted.indexOf(clientSubmissions[0]);
    const internalBeforeClient = sorted.slice(0, firstClientIdx).filter(f => f.submission_type === "internal");
    const hasMultipleInternalBefore = internalBeforeClient.length >= 2;
    const hasMultipleClientSubmissions = clientSubmissions.length >= 2;

    if (hasMultipleInternalBefore && hasMultipleClientSubmissions) {
      both++;
    } else if (hasMultipleClientSubmissions) {
      pattern2++;
    } else if (hasMultipleInternalBefore) {
      pattern3++;
    } else {
      pattern1++;
    }
  }

  const total = pattern1 + pattern2 + pattern3 + both;
  return { pattern1, pattern2, pattern3, both, total };
}

const PATTERN_CONFIG = [
  {
    key: "pattern1" as const,
    label: "パターン1: 理想",
    description: "クライアント提出が一発合格",
    icon: CheckCircle2,
    color: "text-status-ok",
    bgColor: "bg-status-ok/10",
    barColor: "hsl(var(--status-ok))",
    action: null,
  },
  {
    key: "pattern2" as const,
    label: "パターン2: ルール不備",
    description: "クライアント提出が複数回発生",
    icon: ShieldAlert,
    color: "text-status-ng",
    bgColor: "bg-status-ng/10",
    barColor: "hsl(var(--status-ng))",
    action: "チェックルールの見直し・追加が必要",
  },
  {
    key: "pattern3" as const,
    label: "パターン3: 制作課題",
    description: "社内提出で複数回修正後にクライアント提出",
    icon: AlertTriangle,
    color: "text-status-warning",
    bgColor: "bg-status-warning/10",
    barColor: "hsl(var(--status-warning))",
    action: "社内ルール強化・クリエイター育成が必要",
  },
  {
    key: "both" as const,
    label: "両方発生",
    description: "社内修正ループ＋クライアント再提出の両方",
    icon: ShieldAlert,
    color: "text-status-ng",
    bgColor: "bg-status-ng/10",
    barColor: "hsl(var(--destructive))",
    action: "ルール見直し＋クリエイター育成の両方が必要",
  },
];

export default function QualityGapSection({ files, projectNameMap, getProcessLabel }: Props) {
  const overall = useMemo(() => computePatterns(files), [files]);

  const byProject = useMemo(() => {
    const projectIds = [...new Set(files.map((f) => f.project_id).filter(Boolean))];
    return projectIds
      .map((pid) => {
        const pFiles = files.filter((f) => f.project_id === pid);
        const counts = computePatterns(pFiles);
        return { id: pid, name: projectNameMap.get(pid) || "不明", ...counts };
      })
      .filter((p) => p.total > 0)
      .sort((a, b) => (b.pattern2 + b.pattern3 + b.both) - (a.pattern2 + a.pattern3 + a.both));
  }, [files, projectNameMap]);

  const byProcess = useMemo(() => {
    const keys = [...new Set(files.map((f) => f.process_type))];
    return keys
      .map((key) => {
        const pFiles = files.filter((f) => f.process_type === key);
        const counts = computePatterns(pFiles);
        return { key, label: getProcessLabel(key), ...counts };
      })
      .filter((p) => p.total > 0)
      .sort((a, b) => (b.pattern2 + b.pattern3 + b.both) - (a.pattern2 + a.pattern3 + a.both));
  }, [files, getProcessLabel]);

  const chartData = PATTERN_CONFIG.map((p) => ({
    name: p.label.split(": ")[1] || p.label,
    count: overall[p.key],
    fill: p.barColor,
  })).filter((d) => d.count > 0 || PATTERN_CONFIG.findIndex((p) => p.label.includes(d.name)) < 3);

  const chartConfig = { count: { label: "件数" } };

  if (overall.total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4" />品質ギャップ分析
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            分析対象のデータがありません（クライアント提出済みのシーケンスが必要です）
          </p>
        </CardContent>
      </Card>
    );
  }

  // Only show patterns that have data (always show 1-3, show "both" only if > 0)
  const visiblePatterns = PATTERN_CONFIG.filter(
    (p) => p.key !== "both" || overall.both > 0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold">品質ギャップ分析</h2>
        <Badge variant="outline" className="text-[10px]">自動推定</Badge>
        <span className="text-[10px] text-muted-foreground ml-auto">分析対象: {overall.total}件</span>
      </div>

      <div className="text-[11px] text-muted-foreground bg-muted/50 rounded-md px-3 py-2 space-y-0.5">
        <p>• <strong>社内提出</strong>: submission_type=internal のアップロード</p>
        <p>• <strong>クライアント提出</strong>: submission_type=client のアップロード</p>
        <p>• 分析単位: 案件×工程ごとの提出シーケンス</p>
      </div>

      {/* Overview cards */}
      <div className={cn("grid grid-cols-1 gap-3", visiblePatterns.length <= 3 ? "md:grid-cols-3" : "md:grid-cols-4")}>
        {visiblePatterns.map((p) => {
          const count = overall[p.key];
          const rate = overall.total > 0 ? Math.round((count / overall.total) * 100) : 0;
          const Icon = p.icon;
          return (
            <Card key={p.key}>
              <CardContent className="pt-4 pb-3 px-4 space-y-2">
                <div className="flex items-start gap-2">
                  <div className={cn("p-1.5 rounded-md", p.bgColor)}>
                    <Icon className={cn("h-4 w-4", p.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{p.label}</p>
                    <p className="text-[10px] text-muted-foreground">{p.description}</p>
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <span className={cn("text-2xl font-bold", p.color)}>{rate}%</span>
                  <span className="text-[10px] text-muted-foreground">{count}/{overall.total}件</span>
                </div>
                <Progress value={rate} className="h-1.5" />
                {p.action && count > 0 && (
                  <p className="text-[10px] text-muted-foreground border-t border-border pt-1.5 mt-1">
                    → {p.action}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium">パターン分布</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <BarChart data={chartData.filter((d) => d.count > 0)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.filter((d) => d.count > 0).map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* By-project breakdown */}
      {byProject.length > 0 && (
        <GapTable
          title="案件別ギャップ"
          rows={byProject.map((r) => ({ key: r.id, name: r.name, ...r }))}
          showBoth={overall.both > 0}
        />
      )}

      {/* By-process breakdown */}
      {byProcess.length > 0 && (
        <GapTable
          title="工程別ギャップ"
          rows={byProcess.map((r) => ({ key: r.key, name: r.label, ...r }))}
          showBoth={overall.both > 0}
        />
      )}
    </div>
  );
}

function GapTable({ title, rows, showBoth }: {
  title: string;
  rows: { key: string; name: string; pattern1: number; pattern2: number; pattern3: number; both: number; total: number }[];
  showBoth: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs min-w-[500px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="px-4 py-2 font-medium">名称</th>
              <th className="px-4 py-2 font-medium text-right">理想</th>
              <th className="px-4 py-2 font-medium text-right">ルール不備</th>
              <th className="px-4 py-2 font-medium text-right">制作課題</th>
              {showBoth && <th className="px-4 py-2 font-medium text-right">両方</th>}
              <th className="px-4 py-2 font-medium text-right">合計</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border/50">
                <td className="px-4 py-2 font-medium">{row.name}</td>
                <td className="px-4 py-2 text-right text-status-ok font-medium">{row.pattern1}</td>
                <td className="px-4 py-2 text-right">
                  <CellValue value={row.pattern2} color="text-status-ng" />
                </td>
                <td className="px-4 py-2 text-right">
                  <CellValue value={row.pattern3} color="text-status-warning" />
                </td>
                {showBoth && (
                  <td className="px-4 py-2 text-right">
                    <CellValue value={row.both} color="text-status-ng" />
                  </td>
                )}
                <td className="px-4 py-2 text-right text-muted-foreground">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CellValue({ value, color }: { value: number; color: string }) {
  return value > 0 ? (
    <span className={cn("font-bold", color)}>{value}</span>
  ) : (
    <span className="text-muted-foreground">0</span>
  );
}
