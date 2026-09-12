// M-03: "The same person is 'Cal' on one screen and 'Callan Smith' on the
// next." The `nickname || full_name` fallback was already correct and
// consistent everywhere it appeared, but was independently re-derived
// inline at 30+ call sites -- so it was only a matter of time before a new
// one (the calendar new-event attendee picker, the household chores/dietary
// pickers) got added with a bare `person.full_name` instead. One shared
// helper, so every picker/list/label in the app resolves a person's name
// the same way without each call site having to remember the pattern.
export interface PersonNameLike {
  full_name: string;
  nickname: string | null;
}

export function personDisplayName(person: PersonNameLike): string {
  return person.nickname || person.full_name;
}
