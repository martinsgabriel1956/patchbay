import { expect, it } from "vitest";
import { timecode } from "./realtime-panel";

it("timecode em HH:MM:SS:cc", () => {
  expect(timecode(0)).toBe("00:00:00:00");
  expect(timecode(252_070)).toBe("00:04:12:07");
  expect(timecode(3_723_450)).toBe("01:02:03:45");
});
