"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signUpWithPassword, type AuthActionState } from "../actions";
import { isSafeRedirectPath } from "@/lib/http/safe-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

const initialState: AuthActionState = { error: null };

export default function SignupPage() {
  const [state, action, pending] = useActionState(signUpWithPassword, initialState);
  // See app/login/page.tsx's identical comment — carries the household-
  // invite `next` target through signup too, so a brand-new account
  // created from an invite link lands on the invite's accept screen
  // instead of the normal "create your own household" onboarding.
  const rawNext = useSearchParams().get("next");
  const next = isSafeRedirectPath(rawNext) ? rawNext : null;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>Single-user account — you&apos;ll set up your household next.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-4">
            {next && <input type="hidden" name="next" value={next} />}
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName">Your name</Label>
              <Input id="displayName" name="displayName" autoComplete="name" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
            </div>
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
