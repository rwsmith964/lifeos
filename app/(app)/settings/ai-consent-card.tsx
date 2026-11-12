"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setAiConsentAction } from "../ai-consent-actions";

export function AiConsentCard({ granted }: { granted: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(choice: "granted" | "declined") {
    setError(null);
    startTransition(async () => {
      const result = await setAiConsentAction(choice);
      if (result.error) setError(result.error);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <h2 className="text-metadata text-ink-2">AI features</h2>
        <p className="font-sans text-metadata text-meta">
          {granted
            ? "On. Text and photos you give the assistant are sent to Anthropic (Claude) to produce your answers. Children's names are replaced with placeholders first."
            : "Off. Nothing is sent to an AI service, so the assistant, photo reading, daily brief and day planner won't work."}{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
        </p>
        {error && (
          <p role="alert" className="font-sans text-metadata text-destructive-soft-fg">
            {error}
          </p>
        )}
        <div>
          {granted ? (
            <Button type="button" variant="outline" disabled={pending} onClick={() => change("declined")}>
              Turn off AI features
            </Button>
          ) : (
            <Button type="button" disabled={pending} onClick={() => change("granted")}>
              Turn on AI features
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
