import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { listHouseholdMembershipsForUser } from "@/lib/db/repositories/households";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";
import { AcceptLinkForm } from "./accept-link-form";

export const metadata = {
  title: "Connect on LifeOS",
};

interface LinkPreview {
  household_name: string;
  invited_by: string;
  invited_email: string;
  status: string;
  expires_at: string;
}

// Public landing page for a "connect our households" invite. Reachable logged
// out (like /invite/[token]); only a signed-in account with the right email can
// accept, and only into a household it owns or is an adult of.
export default async function LinkInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: previewRows }, userResult] = await Promise.all([
    supabase.rpc("get_link_invite_preview", { p_token: token }),
    supabase.auth.getUser(),
  ]);
  const preview = ((previewRows ?? []) as LinkPreview[])[0] ?? null;
  const user = userResult.data.user;

  let households: Array<{ id: string; name: string; people: Array<{ id: string; name: string }> }> = [];
  if (user && preview && preview.status === "pending") {
    const memberships = (await listHouseholdMembershipsForUser(supabase, user.id)).filter(
      (m) => m.role === "owner" || m.role === "adult"
    );
    households = await Promise.all(
      memberships.map(async (m) => {
        const people = await listPeopleForHousehold(supabase, m.household.id);
        return {
          id: m.household.id,
          name: m.household.name,
          // People who aren't yet connected to an account and aren't me.
          people: people
            .filter((p) => !p.linked_user_id && !p.user_id && !p.is_archived)
            .map((p) => ({ id: p.id, name: p.nickname || p.full_name })),
        };
      })
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <Card className="w-full max-w-sm">
        {!preview ? (
          <CardHeader>
            <CardTitle>Invite not found</CardTitle>
            <CardDescription>This link isn&apos;t valid. Ask for a new one.</CardDescription>
          </CardHeader>
        ) : preview.status !== "pending" ? (
          <CardHeader>
            <CardTitle>This invite is no longer active</CardTitle>
            <CardDescription>It was already used, revoked, or has expired. Ask for a new one.</CardDescription>
          </CardHeader>
        ) : !user ? (
          <>
            <CardHeader>
              <CardTitle>{preview.invited_by} wants to connect</CardTitle>
              <CardDescription>
                Connect your {APP_NAME} with theirs to find times that work for both of you. You choose what you share, and you can
                disconnect any time. Sign in with {preview.invited_email} to continue.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button asChild>
                <Link href={`/login?next=${encodeURIComponent(`/link/${token}`)}`}>Sign in</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/signup?next=${encodeURIComponent(`/link/${token}`)}`}>Create an account</Link>
              </Button>
            </CardContent>
          </>
        ) : households.length === 0 ? (
          <CardHeader>
            <CardTitle>Set up your household first</CardTitle>
            <CardDescription>
              You need a {APP_NAME} household of your own to connect with {preview.invited_by}.{" "}
              <Link href="/onboarding" className="underline">
                Set one up
              </Link>
              , then open this link again.
            </CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle>{preview.invited_by} wants to connect</CardTitle>
              <CardDescription>
                You&apos;ll be able to plan things together. Nothing is shared until you choose to share it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcceptLinkForm token={token} inviterName={preview.invited_by} households={households} />
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
