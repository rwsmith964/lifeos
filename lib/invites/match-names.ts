// Invitations are addressed to particular people. This links each name printed
// on one to someone already in the household's People list so the app can ask
// "is this your friend Sam Rivera?" instead of silently guessing. Pure: the
// reviewer always confirms, nothing here decides anything alone.
export interface MatchablePerson {
  id: string;
  full_name: string;
  nickname: string | null;
  relationship_type?: string;
  relationship_label?: string | null;
}

export interface NameCandidate {
  personId: string;
  label: string;
  /** How they relate to you ("Girlfriend", "friend"), shown to disambiguate. */
  relationship: string | null;
  score: number;
}

export interface NameMatch {
  /** The name exactly as printed on the invitation. */
  name: string;
  candidates: NameCandidate[];
  /** confident: one clear match worth pre-selecting; possible: ask; none: not in People. */
  status: "confident" | "possible" | "none";
}

const TITLES = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "prof", "the"]);
const GROUP_WORDS = ["family", "household", "guest", "plus one", "+1", "and guest", "kids", "children"];

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(raw: string): string[] {
  return normalize(raw)
    .split(" ")
    .filter((t) => t && !TITLES.has(t));
}

function isGroupName(raw: string): boolean {
  const n = normalize(raw);
  return GROUP_WORDS.some((w) => n === w || n.endsWith(` ${w}`) || n.startsWith(`${w} `));
}

function relationshipText(p: MatchablePerson): string | null {
  if (p.relationship_label) return p.relationship_label;
  if (p.relationship_type && p.relationship_type !== "self") return p.relationship_type.replace(/_/g, " ");
  return null;
}

function scorePerson(nameTokens: string[], person: MatchablePerson): number {
  if (nameTokens.length === 0) return 0;
  const full = tokens(person.full_name);
  const nick = person.nickname ? tokens(person.nickname) : [];
  const printed = nameTokens.join(" ");

  if (printed === full.join(" ")) return 1;
  if (nick.length > 0 && printed === nick.join(" ")) return 0.95;

  const first = full[0];
  const last = full.length > 1 ? full[full.length - 1] : null;

  if (nameTokens.length >= 2) {
    const printedFirst = nameTokens[0];
    const printedLast = nameTokens[nameTokens.length - 1];
    // "Jon Smith" printed vs "Jonathan Smith" on file (or the reverse): same last name, one first name a prefix of the other.
    if (last && printedLast === last && first && (first.startsWith(printedFirst) || printedFirst.startsWith(first))) return 0.85;
    // Printed with a nickname: "Mike Chen" vs nickname "Mike".
    if (last && printedLast === last && nick.includes(printedFirst)) return 0.9;
    return 0;
  }

  // A single printed word: a first name or a nickname.
  const only = nameTokens[0];
  if (nick.includes(only)) return 0.8;
  if (first === only) return 0.7;
  return 0;
}

export function matchNamesToPeople(names: string[], people: MatchablePerson[]): NameMatch[] {
  const seen = new Set<string>();
  const matches: NameMatch[] = [];

  for (const name of names) {
    const key = normalize(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    if (isGroupName(name)) {
      matches.push({ name, candidates: [], status: "none" });
      continue;
    }

    const nameTokens = tokens(name);
    const candidates = people
      .map((p) => ({
        personId: p.id,
        label: p.nickname || p.full_name,
        relationship: relationshipText(p),
        score: scorePerson(nameTokens, p),
      }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    let status: NameMatch["status"] = "none";
    if (candidates.length > 0) {
      const [top, second] = candidates;
      const clear = top.score >= 0.85 && (!second || top.score - second.score >= 0.15);
      status = clear ? "confident" : "possible";
    }
    matches.push({ name, candidates, status });
  }

  return matches;
}
