/**
 * Regression tests for the Games-tab outage (builds 23-25, 2026-08-20).
 *
 * The offset helper used to diff two locale-formatted strings:
 *
 *   new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }))
 *
 * V8 (Node, Jest, web) parses "8/20/2026, 9:04:21 PM"; Hermes, which actually
 * runs the shipped app, returns NaN. The offset became "+NaN:00", the ISO
 * string built from it was an Invalid Date, `.toISOString()` threw RangeError,
 * every games query rejected, and the screen showed "No games scheduled today"
 * for every sport.
 *
 * These tests run under V8, so they cannot execute Hermes. They instead pin the
 * property that made the bug engine-dependent: the implementation must never
 * hand a non-ISO-8601 string to the date parser, and must never emit a
 * non-finite offset. `parseNonIso` below simulates a strict (Hermes-like)
 * parser to prove the helper does not depend on lenient parsing.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { easternUtcOffset } from "../useGames";

const OFFSET_RE = /^[+-]\d{2}:\d{2}$/;

describe("useGames source: no locale-string date parsing", () => {
  // The behavioural tests below run under V8 and mock `Date.parse`, but the
  // original bug used the `new Date(str)` CONSTRUCTOR, which V8 does not route
  // through `Date.parse` — so no runtime mock in this environment can catch a
  // reintroduction. This source-level guard can, and is the check that would
  // actually have failed on the code that shipped in builds 23-25.
  const source = readFileSync(join(__dirname, "..", "useGames.ts"), "utf8");

  it("never feeds toLocaleString output into a Date parser, directly or via a variable", () => {
    // The shipped bug assigned toLocaleString output to `nyStr`/`utcStr` first
    // and parsed the variable on a later line, so a same-line regex misses it.
    // Collect the tainted identifiers, then look for them inside a Date parser.
    const tainted = new Set<string>();
    for (const m of source.matchAll(
      /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;]*toLocale(?:Date|Time)?String\s*\(/g
    )) {
      tainted.add(m[1]);
    }

    const offenders: string[] = [];
    source.split("\n").forEach((raw, i) => {
      const line = raw.trim();
      for (const m of line.matchAll(/(?:new Date|Date\.parse)\s*\(\s*([^)]*)/g)) {
        const arg = m[1];
        if (/toLocale(Date|Time)?String/.test(arg)) {
          offenders.push(`${i + 1}: ${line}`);
          continue;
        }
        for (const name of tainted) {
          if (new RegExp(`\\b${name}\\b`).test(arg)) offenders.push(`${i + 1}: ${line}`);
        }
      }
    });

    expect(offenders).toEqual([]);
  });

  it("does not construct an offset by string arithmetic on a diff", () => {
    // "+NaN:00" was produced by padding an unchecked Math.round result.
    expect(source).not.toMatch(/\$\{sign\}\$\{String\(absHrs\)/);
  });
});

describe("easternUtcOffset", () => {
  it("returns a well-formed offset", () => {
    expect(easternUtcOffset()).toMatch(OFFSET_RE);
  });

  it("never contains NaN — the exact shape that broke builds 23-25", () => {
    const offset = easternUtcOffset();
    expect(offset).not.toContain("NaN");
    expect(offset).not.toBe("+NaN:00");
  });

  it("resolves EDT (-04:00) in summer and EST (-05:00) in winter", () => {
    expect(easternUtcOffset(new Date("2026-08-20T18:00:00Z"))).toBe("-04:00");
    expect(easternUtcOffset(new Date("2026-01-15T18:00:00Z"))).toBe("-05:00");
  });

  it("produces an offset that yields a VALID date when used to build a day boundary", () => {
    // This is the assertion that maps directly to the outage: the previous
    // implementation made this throw RangeError on device.
    const offset = easternUtcOffset(new Date("2026-08-20T18:00:00Z"));
    const start = new Date(`2026-08-20T00:00:00${offset}`);
    const end = new Date(`2026-08-20T23:59:59${offset}`);

    expect(Number.isNaN(start.getTime())).toBe(false);
    expect(Number.isNaN(end.getTime())).toBe(false);
    expect(() => start.toISOString()).not.toThrow();
    expect(start.toISOString()).toBe("2026-08-20T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-21T03:59:59.000Z");
  });

  it("survives an engine that only parses ISO-8601 (Hermes-like)", () => {
    // Simulate a strict parser: anything that is not ISO-8601 becomes NaN,
    // which is what Hermes does with toLocaleString output.
    const realDateParse = Date.parse;
    const isoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
    const parseNonIso = jest
      .spyOn(Date, "parse")
      .mockImplementation((value: string) =>
        isoLike.test(value) ? realDateParse(value) : NaN
      );

    try {
      const offset = easternUtcOffset(new Date("2026-08-20T18:00:00Z"));
      expect(offset).toMatch(OFFSET_RE);
      expect(offset).toBe("-04:00");
      // Every string handed to the parser must have been ISO-8601.
      for (const call of parseNonIso.mock.calls) {
        expect(String(call[0])).toMatch(isoLike);
      }
    } finally {
      parseNonIso.mockRestore();
    }
  });

  it("falls back to a valid offset rather than emitting NaN if parsing fails entirely", () => {
    const parseAlwaysNaN = jest.spyOn(Date, "parse").mockReturnValue(NaN);
    try {
      const offset = easternUtcOffset();
      expect(offset).toMatch(OFFSET_RE);
      expect(offset).not.toContain("NaN");
      expect(() => new Date(`2026-08-20T00:00:00${offset}`).toISOString()).not.toThrow();
    } finally {
      parseAlwaysNaN.mockRestore();
    }
  });
});
