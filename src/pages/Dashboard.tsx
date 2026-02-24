import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { CheckRecord, CheckItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CheckResultView from "@/components/CheckResultView";
import { Plus, LogOut } from "lucide-react";

const gradeColors: Record<string, string> = {
  A: "bg-status-ok/15 text-status-ok",
  B: "bg-status-info/15 text-status-info",
  C: "bg-status-warning/15 text-status-warning",
  D: "bg-status-ng/15 text-status-ng",
};

export default function Dashboard() {
  const { user, signOut } = useAuth();
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

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">
          <span className="mr-2">♟</span>
          <span className="gradient-text">CheckMate AI</span>
          <span className="text-xs text-muted-foreground ml-3">Dashboard</span>
        </h1>
        <div className="flex items-center gap-3">
          <Button onClick={() => navigate("/check")} className="gradient-bg text-primary-foreground font-semibold hover:opacity-90">
            <Plus className="h-4 w-4 mr-1" /> 新規チェック
          </Button>
          <Button variant="ghost" size="icon" onClick={handleSignOut} title="ログアウト">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-left">
                <th className="px-4 py-3 font-medium">日時</th>
                <th className="px-4 py-3 font-medium">クライアント</th>
                <th className="px-4 py-3 font-medium">商材</th>
                <th className="px-4 py-3 font-medium">工程</th>
                <th className="px-4 py-3 font-medium text-center">Grade</th>
                <th className="px-4 py-3 font-medium text-center">NG</th>
                <th className="px-4 py-3 font-medium text-center">WARN</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">読み込み中...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">チェック結果がありません</td></tr>
              ) : (
                records.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedRecord(r)}
                    className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">{r.client_name}</td>
                    <td className="px-4 py-3">{r.product_name}</td>
                    <td className="px-4 py-3">{r.process_type}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={gradeColors[r.overall_status] || ""}>
                        {r.overall_status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-status-ng font-bold">{r.ng_count}</td>
                    <td className="px-4 py-3 text-center text-status-warning font-bold">{r.warning_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      <Dialog open={!!selectedRecord} onOpenChange={() => setSelectedRecord(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">チェック詳細</DialogTitle>
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
