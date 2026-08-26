import { requireHouseholdContext } from "@/lib/auth/session";
import { usersRepo } from "@/lib/db/repositories/households";
import { SettingsForm } from "./settings-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default async function SettingsPage() {
  const { supabase, household, userId } = await requireHouseholdContext();
  const user = await usersRepo.getById(supabase, userId);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Card>
        <CardContent className="flex flex-col gap-2">
          <Label>Appearance</Label>
          <ThemeToggle />
          <p className="text-xs text-muted-foreground">
            &quot;System&quot; follows your device&apos;s light/dark setting automatically.
          </p>
        </CardContent>
      </Card>
      <SettingsForm household={household} timezone={user?.timezone ?? "America/Los_Angeles"} />
    </div>
  );
}
