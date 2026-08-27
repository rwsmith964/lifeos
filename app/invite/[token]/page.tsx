import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { getHouseholdInvitePreview } from "@/lib/db/repositories/households";
import { AcceptInviteButton } from "./accept-button";
import { InviteSignOutButton } from "./sign-out-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  adult: "Adult (full access)",
  child: "Child",
  viewer: "Viewer (read only)",
};

// Public landing page for a household invite link — reachable logged-out.
// Deliberately outside app/(app) (which forces every route through
// requireHouseholdContext() and would bounce a logged-out or
// not-yet-a-member visitor before they ever saw this page). Handles five
// distinct states: invalid token, already-resolved invite (accepted/
// revoked/expired), logged-out visitor, logged-in with the wrong email,
// and logged-in with the right email (the only state with a working
// Accept button).
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();

  const [preview, userResult] = await Promise.all([
    getHouseholdInvitePreview(supabase, token),
    supabase.auth.getUser(),
  ]);
  const user = userResult.data.user;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <Card className="w-full max-w-sm">
        {!preview ? (
          <>
            <CardHeader>
              <CardTitle>Invite not found</CardTitle>
              <CardDescription>This invite link isn&apos;t valid. Ask for a new one.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  Go to sign in
                </Button>
              </Link>
            </CardContent>
          </>
        ) : preview.status === "accepted" ? (
          <>
            <CardHeader>
              <CardTitle>Already accepted</CardTitle>
              <CardDescription>This invite has already been used.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/">
                <Button variant="outline" className="w-full">
                  Go to {APP_NAME}
                </Button>
              </Link>
            </CardContent>
          </>
        ) : preview.status === "revoked" ? (
          <CardHeader>
            <CardTitle>Invite revoked</CardTitle>
            <CardDescription>
              {preview.inviter_name} revoked this invite. Ask them to send a new one if this was a mistake.
            </CardDescription>
          </CardHeader>
        ) : preview.status === "expired" || new Date(preview.expires_at) < new Date() ? (
          <CardHeader>
            <CardTitle>Invite expired</CardTitle>
            <CardDescription>
              This invite from {preview.inviter_name} has expired. Ask them to send a new one.
            </CardDescription>
          </CardHeader>
        ) : !user ? (
          <>
            <CardHeader>
              <CardTitle>You&apos;re invited</CardTitle>
              <CardDescription>
                {preview.inviter_name} invited you to join <strong>{preview.household_name}</strong> as{" "}
                {ROLE_LABEL[preview.role] ?? preview.role}.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Sign in or create an account with <strong>{preview.invited_email}</strong> to accept.
              </p>
              <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
                <Button className="w-full">Sign in</Button>
              </Link>
              <Link href={`/signup?next=${encodeURIComponent(`/invite/${token}`)}`}>
                <Button variant="outline" className="w-full">
                  Create an account
                </Button>
              </Link>
            </CardContent>
          </>
        ) : user.email?.toLowerCase() !== preview.invited_email.toLowerCase() ? (
          <>
            <CardHeader>
              <CardTitle>Wrong account</CardTitle>
              <CardDescription>
                This invite was sent to <strong>{preview.invited_email}</strong>, but you&apos;re signed in as{" "}
                {user.email}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InviteSignOutButton />
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>You&apos;re invited</CardTitle>
              <CardDescription>
                {preview.inviter_name} invited you to join <strong>{preview.household_name}</strong> as{" "}
                {ROLE_LABEL[preview.role] ?? preview.role}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcceptInviteButton token={token} />
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
