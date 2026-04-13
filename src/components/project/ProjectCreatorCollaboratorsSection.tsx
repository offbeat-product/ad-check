import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getCreatorShareUrl } from "@/lib/creator-share";
import { Button } from "@/components/ui/button";
import { User, Link2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";

export interface ProjectCreatorCollaboratorRow {
  id: string;
  share_token: string;
  last_accessed_at: string | null;
  invited_at: string | null;
  creators: {
    id: string;
    name: string;
    email: string;
    slack_user_id: string | null;
  } | null;
}

interface ProjectCreatorCollaboratorsSectionProps {
  projectId: string;
  refreshKey: number;
}

function accessLabel(iso: string | null): string {
  if (!iso) return "未アクセス";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ja });
  } catch {
    return "未アクセス";
  }
}

export function ProjectCreatorCollaboratorsSection({ projectId, refreshKey }: ProjectCreatorCollaboratorsSectionProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ProjectCreatorCollaboratorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    const { data, error: qErr } = await supabase
      .from("project_collaborators")
      .select(`
        id, share_token, last_accessed_at, invited_at,
        creators (id, name, email, slack_user_id)
      `)
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("invited_at", { ascending: false });
    if (qErr) {
      setError(qErr.message);
      setRows([]);
    } else {
      setRows((data ?? []) as ProjectCreatorCollaboratorRow[]);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const copyLink = async (shareToken: string) => {
    try {
      await navigator.clipboard.writeText(getCreatorShareUrl(shareToken));
      toast({ title: "共有リンクをコピーしました" });
    } catch {
      toast({ title: "コピーに失敗しました", variant: "destructive" });
    }
  };

  if (loading && rows.length === 0) {
    return null;
  }

  if (error) {
    return (
      <div className="glass-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-xs text-destructive">招待中のクリエイターを読み込めませんでした</p>
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          再試行
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/20">
        <h2 className="text-xs font-semibold text-muted-foreground">招待中のクリエイター</h2>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const name = row.creators?.name ?? "（不明）";
          return (
            <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <User className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{name}</p>
                <p className="text-xs text-muted-foreground">
                  最終アクセス: {accessLabel(row.last_accessed_at)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 shrink-0 text-muted-foreground"
                title="共有リンクをコピー"
                onClick={() => void copyLink(row.share_token)}
              >
                <Link2 className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
