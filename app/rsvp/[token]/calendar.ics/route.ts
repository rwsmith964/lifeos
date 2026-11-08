import { createSupabaseServerClient } from "@/lib/db/client-server";
import { getInvitationDetails } from "@/lib/db/repositories/event-invitations";
import { buildInvitationIcs } from "@/lib/events/ics";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Not found", { status: 404 });
  const supabase = await createSupabaseServerClient();
  const details = await getInvitationDetails(supabase, token).catch(() => null);
  if (!details) return new Response("Not found", { status: 404 });
  return new Response(buildInvitationIcs(details, token), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="invitation.ics"',
    },
  });
}
