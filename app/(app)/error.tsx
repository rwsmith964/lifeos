"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Route-segment error boundary for everything under the authenticated app
// shell. Before this file existed, ANY uncaught error from a page or the
// Server Actions it calls — a Postgres constraint violation, an RLS
// denial, a non-serializable return value — blanked the entire app with
// Next's generic "This page couldn't load" screen (React error #441,
// reproduced three separate times across two remediation passes on three
// different underlying causes). This is the backstop: whatever the next
// uncaught cause turns out to be, it lands here instead of a blank page.
// See DECISIONS.md D-032.
//
// Next 16.3 note: the recovery callback here is `retry` (stable as of
// 16.3.0), not `reset` — `reset` is a different, rarely-needed function
// that clears error state without re-fetching. Using the wrong one is a
// silent no-op button, not a type error.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <AlertTriangle className="size-8 text-destructive" />
          <p className="text-sm font-medium">Something went wrong.</p>
          <p className="text-xs text-muted-foreground">
            That didn&apos;t go through. Try again, or come back to this later.
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
