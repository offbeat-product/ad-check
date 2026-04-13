import { useState, useEffect } from "react";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Users, Sun, Moon, Monitor, KeyRound } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { SettingsMembersSection } from "@/components/settings/SettingsMembersSection";

const PASSWORD_MIN_LENGTH = 8;

export default function SettingsPage() {
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Notification settings
  const [notifyCheckComplete, setNotifyCheckComplete] = useState(true);
  const [notifyComment, setNotifyComment] = useState(true);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setNotifyCheckComplete(profile.notify_check_complete);
      setNotifyComment(profile.notify_comment);
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    setSaving(true);
    const { error } = await updateProfile({ display_name: displayName.trim() || null }) ?? {};
    if (!error) toast({ title: "プロフィールを保存しました" });
    else toast({ title: "エラー", description: (error as { message?: string })?.message, variant: "destructive" });
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      toast({
        title: "エラー",
        description: `パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください`,
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "エラー", description: "パスワードが一致しません", variant: "destructive" });
      return;
    }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "パスワードを変更しました" });
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSaveNotifications = async () => {
    const { error } = await updateProfile({
      notify_check_complete: notifyCheckComplete,
      notify_comment: notifyComment,
    }) ?? {};
    if (!error) toast({ title: "通知設定を保存しました" });
  };

  if (profileLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-4 md:px-6 py-3 flex items-center bg-card">
        <div className="text-sm text-muted-foreground">設定</div>
      </header>

      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <Tabs defaultValue="profile">
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger value="profile">プロフィール</TabsTrigger>
            <TabsTrigger value="password" className="flex items-center gap-1">
              <KeyRound className="h-3.5 w-3.5" />パスワード
            </TabsTrigger>
            <TabsTrigger value="notifications">通知設定</TabsTrigger>
              <TabsTrigger value="members" className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />メンバー
              </TabsTrigger>
              <TabsTrigger value="appearance">表示</TabsTrigger>
            </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <div className="glass-card p-6 space-y-6">
              <h2 className="text-sm font-semibold">プロフィール設定</h2>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold">
                  {(displayName || profile?.email || "U").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{displayName || profile?.email?.split("@")[0]}</p>
                  <p className="text-xs text-muted-foreground">{profile?.email}</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">表示名</label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="表示名を入力" className="h-9 text-sm max-w-md" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">メールアドレス</label>
                <p className="text-sm text-muted-foreground">{profile?.email} <span className="text-xs">(変更不可)</span></p>
              </div>
              <Button size="sm" onClick={handleSaveProfile} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </TabsContent>

          {/* Password Tab */}
          <TabsContent value="password">
            <div className="glass-card p-6 space-y-6">
              <h2 className="text-sm font-semibold">パスワード変更</h2>
              <p className="text-xs text-muted-foreground">
                新しいパスワードを{PASSWORD_MIN_LENGTH}文字以上で設定してください。
              </p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">新しいパスワード</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="新しいパスワード"
                  autoComplete="new-password"
                  className="h-9 text-sm max-w-md"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">新しいパスワード（確認）</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="もう一度入力"
                  autoComplete="new-password"
                  className="h-9 text-sm max-w-md"
                />
              </div>
              <Button
                size="sm"
                onClick={handleChangePassword}
                disabled={passwordSaving || !newPassword || !confirmPassword}
              >
                {passwordSaving ? "変更中..." : "パスワードを変更"}
              </Button>
            </div>
          </TabsContent>

          {/* Notification Tab */}
          <TabsContent value="notifications">
            <div className="glass-card p-6 space-y-5">
              <h2 className="text-sm font-semibold">通知設定</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">AIチェック完了</p>
                  <p className="text-xs text-muted-foreground">チェック結果が出た時に通知</p>
                </div>
                <Switch checked={notifyCheckComplete} onCheckedChange={setNotifyCheckComplete} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">コメント・メンション</p>
                  <p className="text-xs text-muted-foreground">コメントやメンションがあった時に通知</p>
                </div>
                <Switch checked={notifyComment} onCheckedChange={setNotifyComment} />
              </div>
              <Button size="sm" onClick={handleSaveNotifications}>保存</Button>
            </div>
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold">メンバー</h2>
              <SettingsMembersSection />
            </div>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance">
            <div className="glass-card p-6 space-y-6">
              <h2 className="text-sm font-semibold">表示設定</h2>
              <div>
                <p className="text-sm font-medium mb-3">テーマ</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "light", label: "ライト", icon: Sun },
                    { value: "dark", label: "ダーク", icon: Moon },
                    { value: "system", label: "システム", icon: Monitor },
                  ].map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                        theme === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card hover:border-primary/30 text-muted-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
