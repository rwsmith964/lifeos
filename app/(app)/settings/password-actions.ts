"use server";

import { requireHouseholdContext } from "@/lib/auth/session";

export interface ChangePasswordState {
  error: string | null;
  done: boolean;
}

// Change password from inside the app, no emailed link needed. The email
// reset link opens in the phone's browser while the app keeps its own
// separate session, which is why that flow dead-ends inside the iOS app.
// Asks for the current password first so a borrowed, unlocked phone can't
// be used to take over the account.
export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!current) return { error: "Enter your current password.", done: false };
  if (next.length < 8) return { error: "Your new password needs at least 8 characters.", done: false };
  if (next !== confirm) return { error: "The new passwords don't match.", done: false };
  if (next === current) return { error: "Choose a password different from your current one.", done: false };

  const { supabase } = await requireHouseholdContext();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Please sign in again, then try once more.", done: false };

  const verify = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (verify.error) return { error: "Your current password isn't right.", done: false };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message, done: false };

  return { error: null, done: true };
}
