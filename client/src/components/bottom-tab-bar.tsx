import React from "react";
import { useLocation } from "wouter";

interface TabItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  label: string;
}

const tabs: TabItem[] = [
  {
    name: "dashboard",
    path: "/dashboard",
    label: "Home",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2v8a2 2 0 002 2h10a2 2 0 002-2V10l2-2" />
      </svg>
    ),
  },
  {
    name: "productions",
    path: "/productions",
    label: "Productions",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 4v16M7 4l4 4m-4 0L3 8m8 0V4m-4 4v16m-4-4h16" />
      </svg>
    ),
  },
  {
    name: "crew",
    path: "/crew-finder",
    label: "Crew Finder",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 4.354a1 1 0 011 1.397l-7 10a1 1 0 01-1.397 0L3 10.751V6a1 1 0 011-1h4.5a.5.5 0 01.5.5v1.5a.5.5 0 00.5.5h2a.5.5 0 00.5-.5V6a1 1 0 011-1h1z" />
      </svg>
    ),
  },
  {
    name: "profile",
    path: "/profile",
    label: "Profile",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M5.121 12m0 0l-.895.895A1 1 0 005.121 14h2.758a1 1 0 00.707-.293l.895-.895m-2.55 0V15a1 1 0 001 1h.5m-1.5-3h3m-3 0h-3" />
      </svg>
    ),
  },
  {
    name: "payments",
    path: "/payments",
    label: "Payments",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 10h4l3-3 4 4 7-7v10a2 2 0 01-2 2H5a2 2 0 01-2-2V10z" />
      </svg>
    ),
  },
];

/**
 * PRD-012: Mobile-First UX
 * Bottom tab bar for mobile navigation.
 * Shows on screens below md breakpoint, hidden on desktop where sidebar is used.
 */
export function BottomTabBar() {
  const [location, setLocation] = useLocation();

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return location === "/" || location === "/dashboard" || location.startsWith("/dashboard");
    }
    return location.startsWith(path);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around
                 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700
                 md:hidden pb-safe"
    >
      {tabs.map((tab) => {
        const active = isActive(tab.path);
        return (
          <button
            key={tab.name}
            onClick={() => setLocation(tab.path)}
            className={`flex flex-col items-center justify-center flex-1 py-3
                       transition-all duration-200
                       ${active
                         ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                         : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                       }`}
            aria-label={tab.label}
          >
            <div className="mb-0.5">{tab.icon}</div>
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
