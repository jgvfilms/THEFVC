"use client";

import * as React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
  title?: string;
  description?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches render errors in its subtree and displays a
 * user-friendly fallback UI instead of crashing the whole app.
 *
 * Part of PRD-003 (Client Reliability) + PRD-014 (Shared Components).
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console in development; in production you'd send to an error service
    if (process.env.NODE_ENV === "development") {
      console.error("ErrorBoundary caught:", error, info);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            {this.props.title || "Something went wrong"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {this.props.description ||
              this.state.error?.message ||
              "An unexpected error occurred. Please try again."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleReset}
            className="w-full"
            data-testid="button-error-retry"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }
}

/**
 * Hook version — returns error state and a reset function.
 * Useful for inline error handling in components.
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const captureError = React.useCallback((err: Error) => {
    setError(err);
  }, []);

  return { error, captureError, resetError, hasError: !!error };
}
