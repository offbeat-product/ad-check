import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** Portal / 同一ティックの大量 setState などで起きうる React の一過性 DOM 不整合 */
function isLikelyTransientDomReconcileError(error: Error): boolean {
  const msg = error?.message ?? "";
  return (
    (msg.includes("removeChild") && msg.includes("not a child")) ||
    (msg.includes("insertBefore") && msg.includes("not a child"))
  );
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    if (isLikelyTransientDomReconcileError(error)) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (isLikelyTransientDomReconcileError(error)) {
      console.warn("[ErrorBoundary] Transient DOM reconcile error (recovered without full-screen UI)", error, errorInfo);
      return;
    }
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold">予期しないエラーが発生しました</h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || "アプリケーションでエラーが発生しました。"}
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={this.handleReset}>
                <RefreshCw className="h-4 w-4 mr-2" />再試行
              </Button>
              <Button onClick={() => window.location.reload()}>
                ページを再読み込み
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

