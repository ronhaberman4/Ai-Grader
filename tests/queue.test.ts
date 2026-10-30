import { describe, expect, it } from "vitest";
import { createQueue } from "@/lib/queue";

describe("batch queue", () => {
  it("respects concurrency and continues after failures", async () => {
    let active = 0;
    let peak = 0;
    const done: string[] = [];
    const q = createQueue(async (id) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      if (id === "b") throw new Error("boom");
      done.push(id);
    }, 2);
    for (const id of ["a", "b", "c", "d", "e"]) q.enqueue(id);
    expect(q.enqueue("a")).toBe(false); // no duplicates
    await q.idle();
    expect(peak).toBe(2);
    expect(done.sort()).toEqual(["a", "c", "d", "e"]);
  });
});
