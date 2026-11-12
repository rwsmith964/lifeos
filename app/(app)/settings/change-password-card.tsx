"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, type ChangePasswordState } from "./password-actions";

const initial: ChangePasswordState = { error: null, done: false };

export function ChangePasswordCard() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (prev: ChangePasswordState, formData: FormData) => {
      const result = await changePasswordAction(prev, formData);
      if (result.done) formRef.current?.reset();
      return result;
    },
    initial
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h2 className="text-metadata text-ink-2">Change password</h2>
          <p className="font-sans text-metadata text-meta">Update your sign-in password right here.</p>
        </div>
        <form ref={formRef} action={action} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          {state.error && (
            <p role="alert" className="font-sans text-metadata text-destructive-soft-fg">
              {state.error}
            </p>
          )}
          {state.done && !state.error && (
            <p role="status" className="font-sans text-metadata text-ink-2">
              Password updated.
            </p>
          )}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Update password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
