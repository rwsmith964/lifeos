"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { sendMagicLink, signInWithPassword, type AuthActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

const initialState: AuthActionState = { error: null };

export default function LoginPage() {
  const [mode, setMode] = useState<"password" | "magic-link">("password");
  const [passwordState, passwordAction, passwordPending] = useActionState(signInWithPassword, initialState);
  const [magicLinkState, magicLinkAction, magicLinkPending] = useActionState(sendMagicLink, initialState);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            {mode === "password" ? "Use your email and password." : "We'll email you a sign-in link."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {mode === "password" ? (
            <form action={passwordAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required />
              </div>
              {passwordState.error && <p className="text-sm text-destructive">{passwordState.error}</p>}
              <Button type="submit" disabled={passwordPending}>
                {passwordPending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          ) : (
            <form
              action={async (formData) => {
                await magicLinkAction(formData);
                setMagicLinkSent(true);
              }}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="magic-email">Email</Label>
                <Input id="magic-email" name="email" type="email" autoComplete="email" required />
              </div>
              {magicLinkState.error && <p className="text-sm text-destructive">{magicLinkState.error}</p>}
              {magicLinkSent && !magicLinkState.error && (
                <p className="text-sm text-muted-foreground">Check your email for a sign-in link.</p>
              )}
              <Button type="submit" disabled={magicLinkPending}>
                {magicLinkPending ? "Sending…" : "Send magic link"}
              </Button>
            </form>
          )}

          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => setMode(mode === "password" ? "magic-link" : "password")}
          >
            {mode === "password" ? "Use a magic link instead" : "Use a password instead"}
          </button>

          <p className="text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
