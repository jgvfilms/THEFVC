"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
  label?: string;
  fullScreen?: boolean;
}

/**
 * LoadingSpinner — a reusable loading indicator.
 *
 * Part of PRD-003 (Client Reliability) + PRD-014 (Shared Components).
 */
export function LoadingSpinner({
  size = "md",
  label = "Loading...",
  fullScreen = false,
  className,
  ...props
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  const spinner = (
    <div
      className={cn(
        "animate-spin rounded-full border-2 border-muted border-t-primary",
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          {spinner}
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2">
      {spinner}
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  );
}

/**
 * Skeleton — a reusable placeholder while content is loading.
 * Re-exports the shadcn Skeleton with a convenient alias.
 */
export { Skeleton } from "@/components/ui/skeleton";
