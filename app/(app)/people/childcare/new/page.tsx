import Link from "next/link";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listChildcareProvidersForHousehold, listChildrenForHousehold } from "@/lib/db/repositories/people";
import { Card, CardContent } from "@/components/ui/card";
import { ChildcareRequestForm } from "./childcare-request-form";

export default async function NewChildcareRequestPage() {
  const { supabase, household } = await requireHouseholdContext();
  const [providers, childPeople] = await Promise.all([
    listChildcareProvidersForHousehold(supabase, household.id),
    listChildrenForHousehold(supabase, household.id),
  ]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Request childcare</h1>

      {providers.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No childcare providers tagged yet. Open a person&apos;s edit page (e.g. a grandparent or
            babysitter) and check &ldquo;This person can provide childcare&rdquo; first.{" "}
            <Link href="/people" className="underline">
              Go to People
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ChildcareRequestForm providers={providers} childPeople={childPeople} />
      )}
    </div>
  );
}
