import type { HistoryEntry } from "@api/schemas";
import { expect, it } from "vitest";
import { collapse } from "./sidebar";

it("collapse: junta só entradas seguidas com a mesma request e o mesmo resultado", () => {
  const h = (url: string, status?: number) =>
    ({
      at: "",
      request: { method: "GET", url },
      ...(status ? { response: { status } } : { failed: { reason: "error" } }),
    }) as unknown as HistoryEntry;
  const rows = collapse([h("a"), h("a"), h("a", 200), h("a"), h("b"), h("b")]);
  expect(rows.map((r) => r.count)).toEqual([2, 1, 1, 2]);
});
