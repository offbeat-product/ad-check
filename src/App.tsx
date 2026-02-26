import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Check from "./pages/Check";
import CheckResultDetail from "./pages/CheckResultDetail";
import ProjectPage from "./pages/ProjectPage";
import FileReviewPage from "./pages/FileReviewPage";
import ProductPage from "./pages/ProductPage";
import ClientPage from "./pages/ClientPage";
import AppLayout from "./components/AppLayout";
import NotFound from "./pages/NotFound";
import SharedViewPage from "./pages/SharedViewPage";
import SettingsPage from "./pages/SettingsPage";
import TeamPage from "./pages/TeamPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">読み込み中...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/check" element={<Check />} />
              <Route path="/check-result/:id" element={<CheckResultDetail />} />
              <Route path="/client/:id" element={<ClientPage />} />
              <Route path="/product/:id" element={<ProductPage />} />
              <Route path="/project/:id" element={<ProjectPage />} />
              <Route path="/project/:projectId/file/:fileId" element={<FileReviewPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/team" element={<TeamPage />} />
            </Route>
            <Route path="/shared/:token" element={<SharedViewPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
