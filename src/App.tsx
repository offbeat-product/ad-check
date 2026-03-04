import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

// Eagerly load the login page (first thing users see)
import Login from "./pages/Login";

// Lazy load all other pages for faster initial bundle
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ProjectPage = lazy(() => import("./pages/ProjectPage"));
const FileReviewPage = lazy(() => import("./pages/FileReviewPage"));
const ProductPage = lazy(() => import("./pages/ProductPage"));
const ClientPage = lazy(() => import("./pages/ClientPage"));
const AppLayout = lazy(() => import("./components/AppLayout"));
const SharedViewPage = lazy(() => import("./pages/SharedViewPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AcceptInvitePage = lazy(() => import("./pages/AcceptInvitePage"));
const RuleCandidatesPage = lazy(() => import("./pages/RuleCandidatesPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const ReportPage = lazy(() => import("./pages/ReportPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30s — avoid refetching on every mount
      gcTime: 5 * 60_000,      // 5min — keep cache longer
      refetchOnWindowFocus: false,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
});

function PageLoader() {
  return (
    <div className="flex flex-col gap-4 p-6 animate-in fade-in duration-200">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
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
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="checkgo-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                <Route path="/accept-invite" element={<AcceptInvitePage />} />
                <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/client/:id" element={<ClientPage />} />
                  <Route path="/product/:id" element={<ProductPage />} />
                  <Route path="/project/:id" element={<ProjectPage />} />
                  <Route path="/project/:projectId/file/:fileId" element={<FileReviewPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/rule-candidates" element={<RuleCandidatesPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/report" element={<ReportPage />} />
                </Route>
                <Route path="/shared/:token" element={<SharedViewPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
