import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { listHouseholdsForUser } from "@/lib/db/repositories/households";
import { OnboardingForm } from "./onboarding-form";
import { APP_NAME } from "@/lib/constants";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const households = await listHouseholdsForUser(supabase, user.id);
  if (households.length > 0) redirect("/");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Welcome to {APP_NAME}</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        First, let&apos;s set up your household — the Person Record spine everything else hangs off of.
      </p>
      <OnboardingForm defaultName={user.user_metadata?.display_name ?? ""} />
    </div>
  );
}
