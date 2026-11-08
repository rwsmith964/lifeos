import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A "use server" file may only export async functions (types/interfaces are
// erased and fine). Anything else -- a re-exported repository, a constant --
// makes Next throw `A "use server" file can only export async functions` the
// moment ANY server action from that page is invoked, and the page just shows
// "Something went wrong". `next build` and `tsc` both pass with the bad
// export in place, so nothing caught one that sat in the person-page actions
// for weeks and broke the profile's buttons. This is the check that would
// have.
const ROOTS = ["app", "lib"];
const ALLOWED_EXPORT = /^export\s+(async\s+function\s|interface\s|type\s)/;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : listSourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('"use server" files', () => {
  it("export only async functions (and erased types)", () => {
    const offenders: string[] = [];

    for (const file of ROOTS.flatMap(listSourceFiles)) {
      const source = readFileSync(file, "utf8");
      const firstStatement = source.split(/\r?\n/).find((line) => /^\s*["']use (server|client)["']/.test(line));
      if (!firstStatement || !/use server/.test(firstStatement)) continue;

      source.split(/\r?\n/).forEach((line, index) => {
        if (/^export\s/.test(line) && !ALLOWED_EXPORT.test(line)) {
          offenders.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(offenders, `Non-async-function exports in "use server" files:\n${offenders.join("\n")}`).toEqual([]);
  });
});
