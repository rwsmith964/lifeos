import { createSupabaseServerClient } from "@/lib/db/client-server";
import { getChildcareRequestPreview } from "@/lib/db/repositories/childcare";
import { RespondButtons } from "./respond-buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

// Public landing page for a childcare request's accept/decline link
// (D-060) — outside app/(app), reachable with no auth at all, same
// "outside the authed shell" reasoning as app/invite/[token]/page.tsx, but
// simpler: there's no email-match or sign-in branch here at all, since the
// respond RPC doesn't check identity — only the token matters.
export default async function ChildcareRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const preview = await getChildcareRequestPreview(supabase, token);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <Card className="w-full max-w-sm">
        {!preview ? (
          <CardHeader>
            <CardTitle>Request not found</CardTitle>
            <CardDescription>This link isn&apos;t valid.</CardDescription>
          </CardHeader>
        ) : preview.status === "cancelled" ? (
          <CardHeader>
            <CardTitle>Request cancelled</CardTitle>
            <CardDescription>
              {preview.requester_name} cancelled this request. No action needed.
            </CardDescription>
          </CardHeader>
        ) : preview.status === "accepted" ? (
          <CardHeader>
            <CardTitle>Already accepted</CardTitle>
            <CardDescription>You already accepted this request.</CardDescription>
          </CardHeader>
        ) : preview.status === "declined" ? (
          <CardHeader>
            <CardTitle>Already declined</CardTitle>
            <CardDescription>You already declined this request.</CardDescription>
          </CardHeader>
        ) : preview.status === "expired" || new Date(preview.expires_at) < new Date() ? (
          <CardHeader>
            <CardTitle>Request expired</CardTitle>
            <CardDescription>
              This request from {preview.requester_name} has expired. Ask them to send a new one if it&apos;s
              still needed.
            </CardDescription>
          </CardHeader>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Childcare request</CardTitle>
              <CardDescription>
                {preview.requester_name} ({preview.household_name}) is asking if you can watch{" "}
                {preview.child_names.length > 0 ? preview.child_names.join(" and ") : "the kids"} on{" "}
                <strong>{preview.care_date}</strong>, from {preview.care_start_time} to{" "}
                {preview.care_end_time}.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {preview.event_title && (
                <p className="text-sm text-muted-foreground">Reason: {preview.event_title}</p>
              )}
              {preview.custom_note && (
                <p className="text-sm text-muted-foreground">
                  Note from {preview.requester_name}: &ldquo;{preview.custom_note}&rdquo;
                </p>
              )}
              {preview.drive_minutes_to_provider != null && (
                <p className="text-sm text-muted-foreground">
                  Estimated drive time to drop off: about {preview.drive_minutes_to_provider} minutes.
                </p>
              )}
              <RespondButtons token={token} />
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
