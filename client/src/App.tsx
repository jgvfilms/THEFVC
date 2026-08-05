import { useEffect } from "react";
import { Switch, Route, Router, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./lib/auth";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./lib/theme";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { NotificationsProvider } from "@/components/notifications-bell";
import { Landing } from "./pages/landing";
import { AuthPage } from "./pages/auth";
import { DashboardLayout } from "./pages/layout";
import { DashboardHome } from "./pages/dashboard-home";
import { ProfileEdit } from "./pages/profile-edit";
import { PublicProfile } from "./pages/public-profile";
import { CrewFinder } from "./pages/crew-finder";
import { PaymentsPage } from "./pages/payments";
import { W9FormPage } from "./pages/w9-form";
import { ProductionsList } from "./pages/productions";
import { ProductionDetail } from "./pages/production-detail";
import { AdminBetaPage } from "./pages/admin-beta";
import NotFound from "./pages/not-found";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!user && !loading) {
      navigate("/auth");
    }
  }, [user, loading]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}

function DashboardPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <DashboardLayout>{children}</DashboardLayout>
    </ProtectedRoute>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/u/:handle" component={PublicProfile} />
      <Route path="/crew" component={CrewFinder} />
      <Route path="/app">{() => <DashboardPage><DashboardHome /></DashboardPage>}</Route>
      <Route path="/app/profile">{() => <DashboardPage><ProfileEdit /></DashboardPage>}</Route>
      <Route path="/app/productions/:id">{() => <DashboardPage><ProductionDetail /></DashboardPage>}</Route>
      <Route path="/app/productions">{() => <DashboardPage><ProductionsList /></DashboardPage>}</Route>
      <Route path="/app/admin">{() => <DashboardPage><AdminBetaPage /></DashboardPage>}</Route>
      <Route path="/app/payments">{() => <DashboardPage><PaymentsPage /></DashboardPage>}</Route>
      <Route path="/app/w9">{() => <DashboardPage><W9FormPage /></DashboardPage>}</Route>
      {/* Bare handle URLs (thefvc.is/handle) — must stay last so it never shadows a route above */}
      <Route path="/:handle" component={PublicProfile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <NotificationsProvider>
          <TooltipProvider>
          <Toaster />
          <ErrorBoundary
            title="Navigation error"
            description="Something went wrong while rendering this page. Please try again."
          >
            <Router>
              <AppRouter />
            </Router>
          </ErrorBoundary>
          </TooltipProvider>
          </NotificationsProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
