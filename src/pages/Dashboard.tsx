import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { CheckRecord, CheckItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CheckResultView from "@/components/CheckResultView";
import { ClipboardCheck, AlertTriangle, BarChart3, TrendingUp, FileText } from "lucide-react";

const gradeColorMap: Record<string, string> = {
  A: "bg-[hsl(var(--grade-a))]/10 text-[hsl(var(--grade-a))] border-[hsl(var(--grade-a))]/30",
  B: "bg-[hsl(var(--grade-b))]/10 text-[hsl(var(--grade-b))] border-[hsl(var(--grade-b))]/30",
  C: "bg-[hsl(var(--grade-c))]/10 text-[hsl(var(--grade-c))] border-[hsl(var(--grade-c))]/30",
  D: "bg-[hsl(var(--grade-d))]/10 text-[hsl(var(--grade-d))] border-[hsl(var(--grade-d))]/30",
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<CheckRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<CheckRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("check_results")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRecords((data as any as CheckRecord[]) || []);
        setLoading(false);
      });
  }, [user]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayChecks = records.filter(r => new Date(r.created_at) >= today).length;
    const totalNg = records.reduce((s, r) => s + (r.ng_count || 0), 0);
    const grades = records.map(r => r.overall_status);
    const gradeScore: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
    const avgGrade = grades.length > 0
      ? (grades.reduce((s, g) => s + (gradeScore[g] || 0), 0) / grades.length)
      : 0;
    const avgLabel = avgGrade >= 3.5 ? "A" : avgGrade >= 2.5 ? "B" : avgGrade >= 1.5 ? "C" : "D";
    const week = new Date();
    week.setDate(week.getDate() - 7);
    const weekChecks = records.filter(r => new Date(r.created_at) >= week).length;
    return { todayChecks, totalNg, avgLabel, weekChecks };
  }, [records]);

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-card">
        <div className="text-sm text-muted-foreground">ホーム</div>
        <button
          onClick={() => navigate("/check")}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          + 新規チェック
        </button>
      </header>

      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={ClipboardCheck} label="今日のチェック数" value={stats.todayChecks} color="text-primary" />
          <StatCard icon={AlertTriangle} label="NG検出数（累計）" value={stats.totalNg} color="text-status-ng" />
          <StatCard icon={BarChart3} label="平均Grade" value={stats.avgLabel} color="text-status-ok" />
          <StatCard icon={TrendingUp} label="直近7日" value={`${stats.weekChecks} 件`} color="text-primary" />
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Recent checks */}
          <div className="lg:col-span-3 glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold">最近のチェック結果</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-2.5 font-medium">日時</th>
                  <th className="px-4 py-2.5 font-medium">商材</th>
                  <th className="px-4 py-2.5 font-medium">工程</th>
                  <th className="px-4 py-2.5 font-medium text-center">Grade</th>
                  <th className="px-4 py-2.5 font-medium text-center">NG</th>
                  <th className="px-4 py-2.5 font-medium text-center">WARN</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">読み込み中...</td></tr>
                ) : records.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">チェック結果がありません</td></tr>
                ) : (
                  records.slice(0, 20).map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedRecord(r)}
                      className="border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{r.product_name}</td>
                      <td className="px-4 py-2.5">{r.process_type}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant="outline" className={gradeColorMap[r.overall_status] || ""}>
                          {r.overall_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-center text-status-ng font-bold">{r.ng_count}</td>
                      <td className="px-4 py-2.5 text-center text-status-warning font-bold">{r.warning_count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Recent files placeholder */}
          <div className="lg:col-span-2 glass-card">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold">最近のファイル</h2>
            </div>
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">ファイルはまだありません</p>
              <p className="text-xs mt-1">チェックを実行するとここに表示されます</p>
            </div>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      <Dialog open={!!selectedRecord} onOpenChange={() => setSelectedRecord(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>チェック詳細</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <CheckResultView
              result={{
                detected_case: selectedRecord.detected_case,
                check_items: (selectedRecord.check_items || []) as CheckItem[],
                overall_status: selectedRecord.overall_status as any,
                ng_count: selectedRecord.ng_count,
                warning_count: selectedRecord.warning_count,
                ok_count: selectedRecord.ok_count,
                total_checks: selectedRecord.total_checks,
              }}
              title={`${selectedRecord.client_name} / ${selectedRecord.product_name} / ${selectedRecord.process_type}`}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="glass-card p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg bg-muted ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}
