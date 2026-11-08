"use client";

// "Add from a photo": pick or take a photo of an invitation -> the AI reads it
// -> the person reviews every detail, confirms who the names on it are, and
// answers follow-up questions (gift reminder, RSVP reminder) -> only then is
// anything added. See lib/invites/* for the pure logic this renders.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { matchNamesToPeople, type MatchablePerson } from "@/lib/invites/match-names";
import {
  buildEventDescription,
  buildGiftNotes,
  buildInviteFollowUps,
  occasionNoun,
} from "@/lib/invites/follow-ups";
import type { InviteExtraction } from "@/lib/invites/extraction";
import { downscaleToJpeg } from "@/lib/client/image";
import { SNAP_INVITE_STORAGE_KEY } from "@/components/capture/snap-button";
import { createEventFromInviteAction, type InviteEventResult } from "./actions";

type Stage = "pick" | "reading" | "review" | "done";

interface InvitePerson extends MatchablePerson {
  isSelf: boolean;
}

const EVENT_TYPES = [
  ["family", "Family"],
  ["personal", "Personal"],
  ["kid_activity", "Kids' activity"],
  ["work", "Work"],
  ["travel", "Travel"],
] as const;

const FAMILY_CATEGORIES = new Set(["wedding", "anniversary", "baby_shower", "bridal_shower", "graduation", "birthday", "holiday"]);

const NOT_A_PERSON = "__none__";

export function InviteFlow({ people }: { people: InvitePerson[] }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("pick");
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteExtraction | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<InviteEventResult | null>(null);

  // Editable event fields
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number][0]>("family");

  // Name links: printed name -> person id | NOT_A_PERSON
  const [nameLinks, setNameLinks] = useState<Record<string, string>>({});
  // Follow-ups
  const [wantGift, setWantGift] = useState<boolean | null>(null);
  const [wantRsvp, setWantRsvp] = useState<boolean | null>(null);
  const [giftTarget, setGiftTarget] = useState<string>("new");
  const [giftNewName, setGiftNewName] = useState("");
  const [giftDescription, setGiftDescription] = useState("");

  const nameMatches = useMemo(
    () => (invite ? matchNamesToPeople(invite.invitedNames, people) : []),
    [invite, people]
  );
  const followUps = useMemo(() => (invite ? buildInviteFollowUps(invite) : []), [invite]);
  const giftFollowUp = followUps.find((f) => f.id === "gift");
  const rsvpFollowUp = followUps.find((f) => f.id === "rsvp");
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const otherPeople = people.filter((p) => !p.isSelf);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStage("reading");
    let base64: string;
    try {
      base64 = await downscaleToJpeg(file);
    } catch {
      setError("Couldn't open that photo. Try a JPEG or PNG, or take a new picture.");
      setStage("pick");
      return;
    }
    try {
      const res = await fetch("/api/invites/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Data: base64, mediaType: "image/jpeg" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== "ok") {
        setError(data.message ?? "Couldn't read that invitation — try again.");
        setStage("pick");
        return;
      }
      begin(data.invite as InviteExtraction);
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
      setStage("pick");
    }
  }

  function begin(next: InviteExtraction) {
    setInvite(next);
    setTitle(next.title);
    setDate(next.date ?? "");
    setStartTime(next.startTime ?? "");
    setEndTime(next.endTime ?? "");
    setAllDay(!next.startTime);
    setLocation(next.location ?? "");
    setDescription(buildEventDescription(next) ?? "");
    setEventType(FAMILY_CATEGORIES.has(next.category) ? "family" : "personal");

    const links: Record<string, string> = {};
    for (const m of matchNamesToPeople(next.invitedNames, people)) {
      links[m.name] = m.status === "confident" ? m.candidates[0].personId : NOT_A_PERSON;
    }
    setNameLinks(links);

    // Who the gift is for: a household person who matches the honoree if there is one.
    const honoreeMatches = matchNamesToPeople([...next.honoreeNames, ...next.hostNames], people.filter((p) => !p.isSelf));
    const strong = honoreeMatches.find((m) => m.status === "confident");
    setGiftTarget(strong ? strong.candidates[0].personId : "new");
    const honorees = next.honoreeNames.length > 0 ? next.honoreeNames : next.hostNames;
    setGiftNewName(honorees.join(" & "));
    const noun = occasionNoun(next.category);
    setGiftDescription(noun ? `${noun[0].toUpperCase()}${noun.slice(1)} gift${honorees.length ? ` for ${honorees.join(" & ")}` : ""}` : "Gift");
    setWantGift(null);
    setWantRsvp(null);
    setStage("review");
  }

  // The always-visible camera button already read the photo: pick up its result.
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SNAP_INVITE_STORAGE_KEY);
      if (!stored) return;
      sessionStorage.removeItem(SNAP_INVITE_STORAGE_KEY);
      begin(JSON.parse(stored) as InviteExtraction);
    } catch {
      // Unreadable or blocked storage: fall back to the normal photo picker.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirm() {
    if (!invite) return;
    setError(null);
    if (!title.trim()) return setError("Give the event a title.");
    if (!date) return setError("Choose a date.");
    if (!allDay && !startTime) return setError("Choose a start time, or mark it all day.");
    if (giftFollowUp && wantGift === null) return setError("Answer the gift question first (Yes or No).");
    if (rsvpFollowUp && wantRsvp === null) return setError("Answer the RSVP question first (Yes or No).");
    if (wantGift && giftTarget === "new" && !giftNewName.trim()) return setError("Say who the gift is for.");

    const attendeePersonIds = Object.values(nameLinks).filter((id) => id && id !== NOT_A_PERSON);

    setSaving(true);
    const res = await createEventFromInviteAction({
      title: title.trim(),
      date,
      startTime: allDay ? null : startTime || null,
      endTime: allDay ? null : endTime || null,
      allDay,
      location: location.trim() || null,
      description: description.trim() || null,
      eventType,
      attendeePersonIds,
      rsvp: wantRsvp && invite.rsvpBy ? { date: invite.rsvpBy, title: `RSVP: ${title.trim()}` } : null,
      gift: wantGift
        ? {
            personId: giftTarget !== "new" ? giftTarget : null,
            newPersonName: giftTarget === "new" ? giftNewName.trim() || null : null,
            description: giftDescription.trim() || "Gift",
            notes: buildGiftNotes({ ...invite, title: title.trim(), date }),
            productUrl: invite.registryUrl,
          }
        : null,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResult(res);
    setStage("done");
  }

  function reset() {
    setStage("pick");
    setInvite(null);
    setResult(null);
    setError(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
  }

  if (stage === "pick" || stage === "reading") {
    const busy = stage === "reading";
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Take a picture of an invitation, or choose one from your photos. I&apos;ll read it and set up the
          event — nothing is added until you&apos;ve checked it.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => cameraRef.current?.click()}>
            <Camera className="size-4" /> Take a photo
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => libraryRef.current?.click()}>
            <ImageIcon className="size-4" /> Choose a photo
          </Button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Take a photo of an invitation"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Choose a photo of an invitation"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        {busy && <p className="text-sm text-muted-foreground">Reading the invitation…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (stage === "done" && result) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Added &ldquo;{title}&rdquo; to your calendar.</p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {result.addedRsvpReminder && <li>RSVP reminder added.</li>}
            {result.addedGiftFor && <li>Gift idea saved for {result.addedGiftFor}, with the registry details.</li>}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/calendar">Back to calendar</Link>
          </Button>
          <Button variant="outline" onClick={reset}>
            Add another invitation
          </Button>
        </div>
      </div>
    );
  }

  if (!invite) return null;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Here&apos;s what I read. Fix anything that&apos;s off, then confirm at the bottom.
        {invite.yearInferred && " The invitation didn't print a year, so I assumed the next one — please check the date."}
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-title">Title</Label>
          <Input id="invite-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-date">Date</Label>
            <Input id="invite-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-start">Starts</Label>
            <Input id="invite-start" type="time" value={startTime} disabled={allDay} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-end">Ends (optional)</Label>
            <Input id="invite-end" type="time" value={endTime} disabled={allDay} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day (no time printed)
        </label>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-location">Where</Label>
          <Input id="invite-location" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-type">Type</Label>
          <select
            id="invite-type"
            value={eventType}
            onChange={(e) => setEventType(e.target.value as typeof eventType)}
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs sm:w-64"
          >
            {EVENT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-notes">Details saved with the event</Label>
          <Textarea id="invite-notes" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      {nameMatches.length > 0 && (
        <section className="flex flex-col gap-3 rounded-md border p-3" aria-label="Who is invited">
          <div>
            <h2 className="text-sm font-medium">Who is this invitation for?</h2>
            <p className="text-xs text-muted-foreground">
              These names are printed on it. Tell me who they are in your People so the event shows up for them.
            </p>
          </div>
          {nameMatches.map((m) => {
            const linked = nameLinks[m.name] ?? NOT_A_PERSON;
            const top = m.candidates[0];
            const topPerson = top ? peopleById.get(top.personId) : null;
            return (
              <div key={m.name} className="flex flex-col gap-1">
                <label htmlFor={`name-${m.name}`} className="text-sm">
                  {top
                    ? `Is “${m.name}” ${top.label}${top.relationship ? ` (${top.relationship})` : ""}${topPerson?.isSelf ? " — you" : ""}?`
                    : `“${m.name}” isn't anyone in your People yet.`}
                </label>
                <select
                  id={`name-${m.name}`}
                  value={linked}
                  onChange={(e) => setNameLinks((prev) => ({ ...prev, [m.name]: e.target.value }))}
                  className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs sm:w-72"
                >
                  <option value={NOT_A_PERSON}>Not one of my people</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {(p.nickname || p.full_name) + (p.isSelf ? " (me)" : "")}
                      {m.candidates.some((c) => c.personId === p.id) ? " — suggested" : ""}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </section>
      )}

      {(giftFollowUp || rsvpFollowUp) && (
        <section className="flex flex-col gap-4 rounded-md border p-3" aria-label="Questions">
          {giftFollowUp && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{giftFollowUp.question}</p>
              {giftFollowUp.detail && <p className="text-xs text-muted-foreground">{giftFollowUp.detail}</p>}
              <YesNo value={wantGift} onChange={setWantGift} />
              {wantGift && (
                <div className="flex flex-col gap-3 rounded-sm bg-muted/40 p-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="gift-target">Who is the gift for?</Label>
                    <select
                      id="gift-target"
                      value={giftTarget}
                      onChange={(e) => setGiftTarget(e.target.value)}
                      className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs sm:w-72"
                    >
                      <option value="new">Someone new (add them as a friend)</option>
                      {otherPeople.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nickname || p.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {giftTarget === "new" && (
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="gift-new-name">Their name</Label>
                      <Input id="gift-new-name" value={giftNewName} onChange={(e) => setGiftNewName(e.target.value)} />
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="gift-description">Gift</Label>
                    <Input id="gift-description" value={giftDescription} onChange={(e) => setGiftDescription(e.target.value)} />
                  </div>
                  <p className="whitespace-pre-line text-xs text-muted-foreground">{buildGiftNotes({ ...invite, title, date })}</p>
                </div>
              )}
            </div>
          )}
          {rsvpFollowUp && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{rsvpFollowUp.question}</p>
              {rsvpFollowUp.detail && <p className="text-xs text-muted-foreground">{rsvpFollowUp.detail}</p>}
              <YesNo value={wantRsvp} onChange={setWantRsvp} />
            </div>
          )}
        </section>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={confirm} disabled={saving}>
          {saving ? "Adding…" : "Add to calendar"}
        </Button>
        <Button type="button" variant="outline" onClick={reset} disabled={saving}>
          Start over
        </Button>
      </div>
    </div>
  );
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-2" role="group">
      <Button type="button" size="sm" variant={value === true ? "default" : "outline"} aria-pressed={value === true} onClick={() => onChange(true)}>
        Yes
      </Button>
      <Button type="button" size="sm" variant={value === false ? "default" : "outline"} aria-pressed={value === false} onClick={() => onChange(false)}>
        No
      </Button>
    </div>
  );
}
