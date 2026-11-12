"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setAiConsentAction } from "@/app/(app)/ai-consent-actions";
import { APP_NAME } from "@/lib/constants";

/**
 * Shown once, before anything is sent to the AI provider (App Store Review
 * Guideline 5.1.2(i)). Declining keeps the app fully usable -- only the
 * AI-assisted parts switch off -- and the choice can be changed in Settings.
 */
export function AiConsentScreen() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(choice: "granted" | "declined") {
    setError(null);
    startTransition(async () => {
      const result = await setAiConsentAction(choice);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-ground px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-6 text-action" aria-hidden="true" />
            <h1 className="font-sans text-card-headline text-ink">Before we start: AI and your data</h1>
          </div>

          <p className="font-sans text-body text-ink-2">
            {APP_NAME} uses an AI service to read what you type, say or photograph and turn it into events, to-dos,
            gift ideas, your daily brief and day plans.
          </p>

          <div className="flex flex-col gap-3 font-sans text-body text-ink-2">
            <div>
              <h2 className="text-metadata font-bold text-ink">What is sent</h2>
              <p>
                The text and photos you give the assistant, plus the details it needs to answer well: your calendar,
                the people and places in your household, and notes you&apos;ve saved. Children&apos;s names are replaced
                with a placeholder before anything is sent.
              </p>
            </div>
            <div>
              <h2 className="text-metadata font-bold text-ink">Who receives it</h2>
              <p>
                Anthropic, the company behind the Claude AI model. They process it only to produce your answer, and
                under their API terms don&apos;t use it to train their models. We never sell your data.
              </p>
            </div>
            <div>
              <h2 className="text-metadata font-bold text-ink">Your choice</h2>
              <p>
                If you choose &ldquo;Not now,&rdquo; nothing is sent. The calendar, people, to-dos and everything else
                still work; only the AI features are off. You can change this any time in Settings.
              </p>
            </div>
          </div>

          <p className="font-sans text-metadata text-meta">
            Read our{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>{" "}
            for the full details.
          </p>

          {error && (
            <p role="alert" className="font-sans text-metadata text-destructive-soft-fg">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="button" disabled={pending} onClick={() => choose("granted")} className="sm:flex-1">
              I agree
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => choose("declined")} className="sm:flex-1">
              Not now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
