import { notFound } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import { peopleRepo } from "@/lib/db/repositories/people";
import { EditPersonForm } from "./edit-person-form";

export default async function EditPersonPage({ params }: PageProps<"/people/[id]/edit">) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  const person = await peopleRepo.getById(supabase, id);
  if (!person || person.household_id !== household.id) notFound();

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Edit {person.full_name}</h1>
      <EditPersonForm person={person} />
    </div>
  );
}
