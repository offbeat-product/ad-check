import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface FileRow {
  id: string;
  project_id: string;
  process_type: string;
  status: string | null;
  version_number: number | null;
  parent_file_id: string | null;
  check_result_id: string | null;
  created_at: string | null;
}

interface CheckResultMini {
  id: string;
  ng_count: number | null;
  warning_count: number | null;
  ok_count: number | null;
  overall_status: string | null;
}

interface PatternCounts {
  pattern1: number;
  pattern2: number;
  pattern3: number;
  total: number;
}

interface Props {
  files: FileRow[];
  checkResults: CheckResultMini[];
  projectNameMap: Map<string, string>;
  getProcessLabel: (key: string) => string;
}

function computePatterns(files: FileRow[], checkResultMap: Map<string, CheckResultMini>): PatternCounts {
  // Build set of parent_file_ids that have children (= v2+ exists)
  const filesWithRevision = new Set(
    files.filter((f) => f.parent_file_id).map((f) => f.parent_file_id!)
  );

  let pattern1 = 0;
  let pattern2 = 0;
  let pattern3 = 0;

  // Only analyze v1 files that have been checked
  const v1Checked = files.filter(
    (f) => (f.version_number ?? 1) === 1 && f.check_result_id && f.status && f.status !== "uploaded" && f.status !== "checking"
  );

  for (const file of v1Checked) {
    const cr = checkResultMap.get(file.check_result_id!);
    if (!cr) continue;

    const aiFoundIssues = (cr.ng_count ?? 0) > 0;
    const hasRevision = filesWithRevision.has(file.id);

    if (!aiFoundIssues && !hasRevision) {
      pattern1++; // AI OK, client OK
    } else if (!aiFoundIssues && hasRevision) {
      pattern2++; // AI OK but client requested revision → rule gap
    } else if (aiFoundIssues && !hasRevision) {
      pattern3++; // AI NG, fixed internally, client OK → creator education needed
    }
    // aiFoundIssues && hasRevision is an edge case (both issues), not classified
  }

  return { pattern1, pattern2, pattern3, total: v1Checked.length };
}

const PATTERN_CONFIG = [
  {
    key: "pattern1" as const,
    label: "パターン1: 理想",
    description: "AI OK → クライアントGO",
    icon: CheckCircle2,
    color: "text-status-ok",
    bgColor: "bg-status-ok/10",
    barColor: "hsl(var(--status-ok))",
    action: "問題なし",
  },
  {
    key: "pattern2" as const,
    label: "パターン2: ルール不備",
    description: "AI OK → クライアント修正",
    icon: ShieldAlert,
    color: "text-status-ng",
    bgColor: "bg-status-ng/10",
    barColor: "hsl(var(--status-ng))",
    action: "チェックルールの見直し・追加が必要",
  },
  {
    key: "pattern3" as const,
    label: "パターン3: 制作課題",
    description: "AI NG → 内部修正 → クライアントGO",
    icon: AlertTriangle,
    color: "text-status-warning",
    bgColor: "bg-status-warning/10",
    barColor: "hsl(var(--status-warning))",
    action: "社内ルール強化・クリエイター育成が必要",
  },
];

export default function QualityGapSection({ files, checkResults, projectNameMap, getProcessLabel }: Props) {
  const checkResultMap = useMemo(
    () => new Map(checkResults.map((cr) => [cr.id, cr])),
    [checkResults]
  );

  const overall = useMemo(() => computePatterns(files, checkResultMap), [files, checkResultMap]);

  // By project breakdown
  const byProject = useMemo(() => {
    const projectIds = [...new Set(files.map((f) => f.project_id).filter(Boolean))];
    return projectIds
      .map((pid) => {
        const pFiles = files.filter((f) => f.project_id === pid);
        const counts = computePatterns(pFiles, checkResultMap);
        return { id: pid, name: projectNameMap.get(pid) || "不明", ...counts };
      })
      .filter((p) => p.total > 0)
      .sort((a, b) => (b.pattern2 + b.pattern3) - (a.pattern2 + a.pattern3));
  }, [files, checkResultMap, projectNameMap]);

  // By process breakdown
  const byProcess = useMemo(() => {
    const keys = [...new Set(files.map((f) => f.process_type))];
    return keys
      .map((key) => {
        const pFiles = files.filter((f) => f.process_type === key);
        const counts = computePatterns(pFiles, checkResultMap);
        return { key, label: getProcessLabel(key), ...counts };
      })
      .filter((p) => p.total > 0)
      .sort((a, b) => (b.pattern2 + b.pattern3) - (a.pattern2 + a.pattern3));
  }, [files, checkResultMap, getProcessLabel]);

  const chartData = PATTERN_CONFIG.map((p) => ({
    name: p.label.split(": ")[1],
    count: overall[p.key],
    fill: p.barColor,
  }));

  const chartConfig = {
    count: { label: "件数" },
  };

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
            分析対象のデータがありません（チェック済みの初稿ファイルが必要です）
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overview cards */}
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold">品質ギャップ分析</h2>
        <Badge variant="outline" className="text-[10px]">自動推定</Badge>
        <span className="text-[10px] text-muted-foreground ml-auto">分析対象: {overall.total}件</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PATTERN_CONFIG.map((p) => {
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
                {p.key !== "pattern1" && count > 0 && (
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
            <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* By-project breakdown */}
      {byProject.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">案件別ギャップ</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-2 font-medium">案件</th>
                  <th className="px-4 py-2 font-medium text-right">理想</th>
                  <th className="px-4 py-2 font-medium text-right">ルール不備</th>
                  <th className="px-4 py-2 font-medium text-right">制作課題</th>
                  <th className="px-4 py-2 font-medium text-right">合計</th>
                </tr>
              </thead>
              <tbody>
                {byProject.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="px-4 py-2 font-medium">{row.name}</td>
                    <td className="px-4 py-2 text-right text-status-ok font-medium">{row.pattern1}</td>
                    <td className="px-4 py-2 text-right">
                      {row.pattern2 > 0 ? (
                        <span className="text-status-ng font-bold">{row.pattern2}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {row.pattern3 > 0 ? (
                        <span className="text-status-warning font-bold">{row.pattern3}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* By-process breakdown */}
      {byProcess.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">工程別ギャップ</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-2 font-medium">工程</th>
                  <th className="px-4 py-2 font-medium text-right">理想</th>
                  <th className="px-4 py-2 font-medium text-right">ルール不備</th>
                  <th className="px-4 py-2 font-medium text-right">制作課題</th>
                  <th className="px-4 py-2 font-medium text-right">合計</th>
                </tr>
              </thead>
              <tbody>
                {byProcess.map((row) => (
                  <tr key={row.key} className="border-b border-border/50">
                    <td className="px-4 py-2 font-medium">{row.label}</td>
                    <td className="px-4 py-2 text-right text-status-ok font-medium">{row.pattern1}</td>
                    <td className="px-4 py-2 text-right">
                      {row.pattern2 > 0 ? (
                        <span className="text-status-ng font-bold">{row.pattern2}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {row.pattern3 > 0 ? (
                        <span className="text-status-warning font-bold">{row.pattern3}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
