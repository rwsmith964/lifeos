"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail, type AuthActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

const initialState: AuthActionState = { error: null };

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(sendPasswordResetEmail, initialState);
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>Enter your email and we&apos;ll send you a reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          {submitted && !state.error ? (
            <p className="text-sm text-muted-foreground">
              If an account exists for that email, a reset link is on its way. Check your inbox.
            </p>
          ) : (
            <form
              action={async (formData) => {
                await action(formData);
                setSubmitted(true);
              }}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              {state.error && <p className="text-sm text-destructive">{state.error}</p>}
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}
          <Link href="/login" className="mt-4 block text-center text-sm underline underline-offset-2">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
