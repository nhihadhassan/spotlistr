import { describe, expect, it } from "vitest";
import { parseLine } from "../parse";
import { matchTrack } from "../match";
import { fakeSearch } from "./catalog";
import cases from "./cases.json";

/**
 * THE PROJECT'S HEALTH METRIC.
 *
 * Top-1 accuracy across the fixture corpus. The PRD sets the gate at 95%.
 * If a change moves this number down, the change is wrong — fix the change,
 * not the threshold.
 *
 * Caveat worth understanding: this runs against `catalog.ts`, a small offline
 * stand-in for Spotify's index, so it validates parse -> query -> rank logic
 * and the decoy-rejection behavior, NOT real-world search recall. A live
 * corpus of ~200 real inputs with verified Spotify URIs is a separate, later
 * task and is the number that actually decides whether the product is good.
 */

const ACCURACY_GATE = 0.95;

type Case = { input: string; expect: string; note?: string };

describe("matching accuracy", () => {
  it(`matches at least ${ACCURACY_GATE * 100}% of the fixture corpus`, async () => {
    const failures: string[] = [];

    for (const testCase of cases as Case[]) {
      const parsed = parseLine(testCase.input);

      if (!parsed) {
        failures.push(`PARSE FAILED  "${testCase.input}"  (${testCase.note})`);
        continue;
      }

      const result = await matchTrack(parsed, fakeSearch);
      const got = result.best?.track.id ?? "(no match)";

      if (got !== testCase.expect) {
        failures.push(
          `WRONG MATCH   "${testCase.input}"\n` +
            `                expected ${testCase.expect}, got ${got} ` +
            `(confidence ${result.confidence.toFixed(2)}) — ${testCase.note}`,
        );
      }
    }

    const total = cases.length;
    const passed = total - failures.length;
    const accuracy = passed / total;

    console.log(
      `\n  Top-1 accuracy: ${(accuracy * 100).toFixed(1)}%  (${passed}/${total})\n`,
    );
    if (failures.length) {
      console.log(failures.map((f) => `  ${f}`).join("\n") + "\n");
    }

    expect(accuracy).toBeGreaterThanOrEqual(ACCURACY_GATE);
  });

  it("never pre-accepts a low-confidence match", async () => {
    // PRD §8: a missing song is an annoyance, a wrong song ruins the playlist.
    const parsed = parseLine("Some Band Nobody Has - A Song That Does Not Exist");
    expect(parsed).not.toBeNull();

    const result = await matchTrack(parsed!, fakeSearch);
    if (result.bucket === "low") {
      expect(result.accepted).toBe(false);
    }
  });

  it("returns alternates so the user can correct us", async () => {
    const parsed = parseLine("Radiohead - Creep");
    const result = await matchTrack(parsed!, fakeSearch);
    expect(result.alternates.length).toBeGreaterThan(0);
    expect(result.alternates.length).toBeLessThanOrEqual(5);
  });
});
