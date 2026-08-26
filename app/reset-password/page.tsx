"use client";

import { useActionState, useRef, useState } from "react";
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
        </CardContent>
      </Card>
    </div>
  );
}
