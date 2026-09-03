import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { listHouseholdsForUser } from "@/lib/db/repositories/households";
import { OnboardingWizard } from "./onboarding-wizard";
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
        Let&apos;s get your household set up — a few quick steps to add the people you want to keep
        organized, their schedules, and what they&apos;re into.
      </p>
      <OnboardingWizard defaultName={user.user_metadata?.display_name ?? ""} />
    </div>
  );
}
