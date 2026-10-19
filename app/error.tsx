"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAutoRetryOnce } from "@/lib/hooks/use-auto-retry-once";

// B-02: root-level backstop. An error.tsx only catches errors thrown by its
// own segment's *children*, never by the layout.tsx that defines the same
// segment -- so a throw inside app/(app)/layout.tsx itself (e.g. the
// household-context lookup, before this file existed) skipped
// app/(app)/error.tsx entirely and fell all the way to app/global-error.tsx,
// which has to be bare/unstyled (it replaces the whole <html>, since a root
// LAYOUT failure can't be trusted to have working providers). This file
// sits one level up specifically to catch that (app)-layout case: since the
// failure is in the nested layout, not the root layout, the root layout's
// own providers (fonts, theme, palette) already rendered successfully by
// the time this mounts, so unlike global-error.tsx it's safe to use the
// real design system here instead of inline styles.
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Root error boundary caught:", error);
  }, [error]);

  const readyToShow = useAutoRetryOnce(error, retry);

  if (!readyToShow) {
    return <div className="flex min-h-dvh items-center justify-center bg-ground" />;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ground p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <AlertTriangle className="size-8 text-destructive" />
          <p className="text-sm font-medium">Something went wrong.</p>
          <p className="text-xs text-muted-foreground">
            LifeOS hit an unexpected error loading the app. Try again, or come back to this later.
          </p>
          {error.digest && <p className="text-[10px] text-muted-foreground">Reference: {error.digest}</p>}
          <Button size="sm" onClick={() => retry()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
