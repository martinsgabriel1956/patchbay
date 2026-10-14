import { expect, it } from "vitest";
import { lastError, timecode } from "./realtime-panel";

it("timecode em HH:MM:SS:cc", () => {
  expect(timecode(0)).toBe("00:00:00:00");
  expect(timecode(252_070)).toBe("00:04:12:07");
  expect(timecode(3_723_450)).toBe("01:02:03:45");
});

it("lastError: só a tentativa mais recente conta", () => {
  const e = (kind: "open" | "close" | "error", data = "") =>
    ({ id: 0, at: "", dir: "event", kind, data }) as const;
  expect(lastError([e("open", "Conectando"), e("error", "ECONNREFUSED"), e("close")])).toBe(
    "ECONNREFUSED",
  );
  // Reconectou depois do erro: a falha antiga não aparece mais.
  expect(lastError([e("error", "x"), e("close"), e("open", "Conectando"), e("close")])).toBe(
    undefined,
  );
  expect(lastError([])).toBe(undefined);
});
