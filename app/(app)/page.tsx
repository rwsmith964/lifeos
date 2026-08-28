import { format } from "date-fns";
import Link from "next/link";
import { CalendarClock, Cloud, Gift, Sparkles, Users, Zap } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { generateDailyBrief } from "@/lib/brief/generate";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { briefsRepo, getBriefForPersonAndDate } from "@/lib/db/repositories/system";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { listOpenOpportunitiesForHousehold } from "@/lib/db/repositories/opportunities";
import type { BriefContent } from "@/lib/brief/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RegenerateBriefButton } from "./regenerate-brief-button";

export default async function BriefPage() {
  const { supabase, household, selfPerson } = await requireHouseholdContext();

  const today = new Date();
  const todayDateStr = format(today, "yyyy-MM-dd");

  let brief = await getBriefForPersonAndDate(supabase, selfPerson.id, todayDateStr);
  if (!brief) {
    // briefs has no insert policy for regular users by design (only the
    // service role — the cron job — is allowed to write brief rows; see
    // migration 20260820000012). This on-demand fallback (for a user who
    // opens the app before their household's brief_time has fired) needs
    // the same elevated client to perform that first insert.
    const serviceRoleClient = createSupabaseServiceRoleClient();
    const result = await generateDailyBrief(serviceRoleClient, household.id, selfPerson.id, today);
    brief = await briefsRepo.getById(supabase, result.briefId);
  }

  const content = brief?.content_json as BriefContent | undefined;

  // D-061: opportunities are detected by a separate cron and stored
  // directly in their own table, not threaded through the AI-generated
  // content_json/brief schema — deliberate simplification so this section
  // never depends on the brief's AI-generation budget or timing.
  const openOpportunities = await listOpenOpportunitiesForHousehold(supabase, household.id);
  const topOpportunities = openOpportunities.slice(0, 2);

  // D-048 (tappability): brief content stores each person by their real
  // full_name (lib/ai/context.ts's labelFor), never a stable id — the brief
  // is plain rendered text, not structured with foreign keys. Resolve a
  // link by exact full_name match against the household's own people, and
  // only when that name is unique in the household; a same-named duplicate
  // (rare, but possible for e.g. two grandparents sharing a first name)
  // falls back to plain text rather than risk linking to the wrong person.
  const householdPeople = content ? await listPeopleForHousehold(supabase, household.id) : [];
  const idByUniqueName = new Map<string, string>();
  const seenNames = new Set<string>();
  for (const p of householdPeople) {
    if (seenNames.has(p.full_name)) {
      idByUniqueName.delete(p.full_name);
    } else {
      seenNames.add(p.full_name);
      idByUniqueName.set(p.full_name, p.id);
    }
  }

  if (!content) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Couldn&apos;t generate today&apos;s brief. Try again shortly.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">{format(today, "EEEE, MMMM d")}</p>
          <h1 className="text-xl font-semibold">{content.headline}</h1>
        </div>
        <RegenerateBriefButton />
      </div>

      {content.today.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="size-4" /> Today
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {content.today.map((item, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{item.time ?? "All day"}</span> — {item.title}
                {item.note && <span className="text-muted-foreground"> ({item.note})</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {content.headsUp.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gift className="size-4" /> Heads up
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {content.headsUp.map((item, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{item.title}</span>
                <p className="text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {content.people.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="size-4" /> People
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {content.people.map((item, i) => {
              const personId = idByUniqueName.get(item.personLabel);
              return (
                <div key={i} className="text-sm">
                  {personId ? (
                    <Link href={`/people/${personId}`} className="font-medium underline-offset-2 hover:underline">
                      {item.personLabel}
                    </Link>
                  ) : (
                    <span className="font-medium">{item.personLabel}</span>
                  )}
                  <span className="text-muted-foreground">: {item.reason}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {topOpportunities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="size-4" /> Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {topOpportunities.map((opp) => (
              <div key={opp.id} className="text-sm">
                <span className="font-medium">{opp.headline}</span>
                <p className="text-muted-foreground">{opp.reasoning}</p>
              </div>
            ))}
            <Link href="/opportunities" className="text-sm underline-offset-2 hover:underline">
              See all opportunities
            </Link>
          </CardContent>
        </Card>
      )}

      {content.suggestion && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="size-4" /> Suggestion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{content.suggestion.title}</p>
            <p className="text-sm text-muted-foreground">{content.suggestion.detail}</p>
          </CardContent>
        </Card>
      )}

      {content.weather && (
        <>
          <Separator />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Cloud className="size-4" />
            {content.weather.summary}
            {content.weather.highF != null && ` · High ${Math.round(content.weather.highF)}°F`}
            {content.weather.lowF != null && ` · Low ${Math.round(content.weather.lowF)}°F`}
          </div>
        </>
      )}
    </div>
  );
}
