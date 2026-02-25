import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<"clients">;
type Product = Tables<"products">;

export default function SettingsPage() {
  const { user } = useAuth();
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const { toast } = useToast();

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  // Notification settings
  const [notifyCheckComplete, setNotifyCheckComplete] = useState(true);
  const [notifyComment, setNotifyComment] = useState(true);

  // Org management
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orgTab, setOrgTab] = useState("clients");
  const [newClientName, setNewClientName] = useState("");
  const [newProductName, setNewProductName] = useState("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setNotifyCheckComplete(profile.notify_check_complete);
      setNotifyComment(profile.notify_comment);
    }
  }, [profile]);

  useEffect(() => {
    const fetchOrg = async () => {
      const [cl, pr] = await Promise.all([
        supabase.from("clients").select("*").order("created_at"),
        supabase.from("products").select("*").order("created_at"),
      ]);
      setClients(cl.data ?? []);
      setProducts(pr.data ?? []);
    };
    fetchOrg();
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    const { error } = await updateProfile({ display_name: displayName.trim() || null }) ?? {};
    if (!error) toast({ title: "プロフィールを保存しました" });
    else toast({ title: "エラー", description: (error as any)?.message, variant: "destructive" });
    setSaving(false);
  };

  const handleSaveNotifications = async () => {
    const { error } = await updateProfile({
      notify_check_complete: notifyCheckComplete,
      notify_comment: notifyComment,
    }) ?? {};
    if (!error) toast({ title: "通知設定を保存しました" });
  };

  const handleAddClient = async () => {
    if (!newClientName.trim()) return;
    const { error } = await supabase.from("clients").insert({ name: newClientName.trim() });
    if (error) { toast({ title: "エラー", description: error.message, variant: "destructive" }); return; }
    toast({ title: "クライアントを追加しました" });
    setNewClientName("");
    const { data } = await supabase.from("clients").select("*").order("created_at");
    setClients(data ?? []);
  };

  const handleDeleteClient = async (id: string) => {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) { toast({ title: "エラー", description: error.message, variant: "destructive" }); return; }
    setClients((prev) => prev.filter((c) => c.id !== id));
    toast({ title: "クライアントを削除しました" });
  };

  if (profileLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-3 flex items-center bg-card">
        <div className="text-sm text-muted-foreground">設定</div>
      </header>

      <div className="p-6 max-w-3xl mx-auto">
        <Tabs defaultValue="profile">
          <TabsList className="mb-6">
            <TabsTrigger value="profile">プロフィール</TabsTrigger>
            <TabsTrigger value="notifications">通知設定</TabsTrigger>
            <TabsTrigger value="organization">組織管理</TabsTrigger>
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
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="表示名を入力"
                  className="h-9 text-sm max-w-md"
                />
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

          {/* Notification Tab */}
          <TabsContent value="notifications">
            <div className="glass-card p-6 space-y-5">
              <h2 className="text-sm font-semibold">通知設定</h2>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">AIチェック完了</p>
                  <p className="text-xs text-muted-foreground">チェック結果が出た時に通知</p>
                </div>
                <Switch
                  checked={notifyCheckComplete}
                  onCheckedChange={(v) => { setNotifyCheckComplete(v); }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">コメント・メンション</p>
                  <p className="text-xs text-muted-foreground">コメントやメンションがあった時に通知</p>
                </div>
                <Switch
                  checked={notifyComment}
                  onCheckedChange={(v) => { setNotifyComment(v); }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">プロジェクト招待</p>
                  <p className="text-xs text-muted-foreground">プロジェクトに招待された時に通知</p>
                </div>
                <Switch checked={true} disabled />
              </div>

              <p className="text-[10px] text-muted-foreground">※ 招待通知はOFFにできません</p>

              <Button size="sm" onClick={handleSaveNotifications}>保存</Button>
            </div>
          </TabsContent>

          {/* Organization Tab */}
          <TabsContent value="organization">
            <div className="glass-card p-6 space-y-5">
              <h2 className="text-sm font-semibold">組織管理</h2>

              <Tabs value={orgTab} onValueChange={setOrgTab}>
                <TabsList>
                  <TabsTrigger value="clients">クライアント</TabsTrigger>
                  <TabsTrigger value="products">商材</TabsTrigger>
                </TabsList>

                <TabsContent value="clients" className="mt-4 space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="クライアント名"
                      className="h-8 text-sm flex-1"
                      onKeyDown={(e) => e.key === "Enter" && handleAddClient()}
                    />
                    <Button size="sm" className="h-8 text-xs" onClick={handleAddClient}>
                      <Plus className="h-3 w-3 mr-1" />追加
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {clients.map((c) => {
                      const productCount = products.filter((p) => p.client_id === c.id).length;
                      return (
                        <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                          <div>
                            <p className="text-sm font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground">商材: {productCount}</p>
                          </div>
                          <button
                            onClick={() => handleDeleteClient(c.id)}
                            className="p-1 rounded hover:bg-muted transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      );
                    })}
                    {clients.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">クライアントがありません</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="products" className="mt-4 space-y-3">
                  <div className="space-y-1">
                    {products.map((p) => {
                      const clientName = clients.find((c) => c.id === p.client_id)?.name || "";
                      return (
                        <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: p.color ? `hsl(${p.color})` : "hsl(var(--primary))" }}
                            />
                            <div>
                              <p className="text-sm font-medium">{p.name}</p>
                              <p className="text-xs text-muted-foreground">{clientName} · {p.code}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px]">{p.label}</Badge>
                        </div>
                      );
                    })}
                    {products.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">商材がありません</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
