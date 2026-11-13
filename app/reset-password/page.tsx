"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { updatePasswordAfterReset, type AuthActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

const initialState: AuthActionState = { error: null };

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(updatePasswordAfterReset, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // Confirm-password mismatch is caught client-side before the action ever
  // runs — there's no server-side equivalent check to duplicate, since the
  // action only ever receives the one `password` field.
  const [mismatch, setMismatch] = useState(false);
  // The emailed link carries recovery tokens in the URL fragment (only the
  // browser can read it): hand them to the server to set the session, then show
  // the form. No fragment means the older flow already set the session.
  const [linkState, setLinkState] = useState<"checking" | "ready" | "failed">("checking");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const linkError = hash.get("error") ?? hash.get("error_code");
    if (linkError) {
      history.replaceState(null, "", window.location.pathname);
      void Promise.resolve().then(() => setLinkState("failed"));
      return;
    }
    if (!accessToken || !refreshToken) {
      void Promise.resolve().then(() => setLinkState("ready"));
      return;
    }
    history.replaceState(null, "", window.location.pathname);
    fetch("/api/auth/recovery-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, refreshToken }),
    })
      .then((res) => setLinkState(res.ok ? "ready" : "failed"))
      .catch(() => setLinkState("failed"));
  }, []);

  function handleSubmit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    action(formData);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>Choose a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {linkState === "checking" && <p className="text-sm text-muted-foreground">Checking your reset link…</p>}
          {linkState === "failed" && (
            <div className="flex flex-col gap-3">
              <p role="alert" className="text-sm text-destructive">
                That reset link didn&apos;t work. It may have expired or already been used. Request a new one and open
                the newest email.
              </p>
              <Link href="/forgot-password" className="text-sm underline underline-offset-2">
                Request a new reset link
              </Link>
            </div>
          )}
          {linkState === "ready" && (
          <form ref={formRef} action={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                onChange={() => setMismatch(false)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                aria-invalid={mismatch || undefined}
                onChange={() => setMismatch(false)}
              />
              {mismatch && <p className="text-xs text-destructive">Passwords don&apos;t match.</p>}
            </div>
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save new password"}
            </Button>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
