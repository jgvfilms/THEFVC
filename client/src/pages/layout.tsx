import { Switch, Route, Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { FeedbackButton } from "@/components/feedback-button";
import { NotificationsBell } from "@/components/notifications-bell";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import {
  LayoutDashboard,
  User,
  Users,
  Clapperboard,
  LogOut,
  Film,
  Shield,
} from "lucide-react";
import NotFound from "./not-found";

const NAV_ITEMS = [
  { path: "/app", label: "Dashboard", icon: LayoutDashboard },
  { path: "/app/profile", label: "My Profile", icon: User },
  { path: "/app/productions", label: "Productions", icon: Clapperboard },
  { path: "/crew", label: "Crew Finder", icon: Users },
];

function SidebarLink({ path, label, icon: Icon }: { path: string; label: string; icon: typeof User }) {
  const [location] = useLocation();
  const active = location === path || (path !== "/app" && location.startsWith(path));
  return (
    <Link href={path}>
      <Button
        variant={active ? "default" : "ghost"}
        className="w-full justify-start gap-3"
        data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Button>
    </Link>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const initials = user?.handle?.slice(0, 2).toUpperCase() || "U";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-full border border-primary">
            <Film className="h-4 w-4 text-primary" />
          </div>
          <span className="font-display text-lg font-semibold">THEFVC.IS</span>
          <div className="ml-auto flex items-center gap-2">
            <NotificationsBell />
            <ThemeToggle />
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <SidebarLink key={item.path} {...item} />
          ))}
          {user?.isAdmin && (
            <SidebarLink path="/app/admin" label="Beta Admin" icon={Shield} />
          )}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">@{user?.handle}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 mt-1 text-muted-foreground"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-border bg-sidebar px-4 py-3">
        <Link href="/app" className="flex items-center gap-2">
          <Film className="h-4 w-4 text-primary" />
          <span className="font-display font-semibold">THEFVC.IS</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationsBell />
          <ThemeToggle />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        <div className="container max-w-5xl mx-auto px-4 py-6 pb-20 md:px-8 md:py-8 md:pb-20">
          {children}
        </div>
        {/* Floating feedback button */}
        <div className="fixed bottom-4 right-4 z-40">
          <FeedbackButton user={user} />
        </div>
      </main>

      {/* PRD-012: Mobile bottom tab bar */}
      <BottomTabBar />
    </div>
  );
}
