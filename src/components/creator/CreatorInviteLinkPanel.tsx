import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2 } from "lucide-react";

interface CreatorInviteLinkPanelProps {
  inviteUrl: string;
  onCopy: () => void;
  onClose: () => void;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  hint?: string;
}

export function CreatorInviteLinkPanel({
  inviteUrl,
  onCopy,
  onClose,
  secondaryAction,
  hint = "このリンクを Chatwork や Slack でクリエイター本人に送付してください。",
}: CreatorInviteLinkPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-sm">
        <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <p className="font-medium">クリエイターを追加しました</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">招待リンク</p>
        <div className="flex items-center gap-2">
          <Input readOnly value={inviteUrl} className="h-9 text-xs bg-muted font-mono" />
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onCopy}>
            コピー
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>

      <div className="flex justify-end gap-2 pt-1">
        {secondaryAction ? (
          <Button type="button" variant="outline" size="sm" onClick={secondaryAction.onClick}>
            {secondaryAction.label}
          </Button>
        ) : null}
        <Button type="button" size="sm" onClick={onClose}>
          閉じる
        </Button>
      </div>
    </div>
  );
}
