import { describe, expect, it } from "vitest";
import {
  applyAwayEvents,
  awayReportSchema,
  comeBack,
  formatAwayDuration,
  IDLE_TRACKER,
  integrityLevel,
  leave,
  MAX_EVENTS_PER_CALL,
  MIN_AWAY_MS,
  MIN_REPORT_INTERVAL_MS,
  parsePersisted,
  shouldThrottle,
  type StoredAwayEvent,
} from "@/lib/integrity";

describe("away tracker", () => {
  it("returns an episode with the elapsed time", () => {
    const t = leave(IDLE_TRACKER, 1_000, "blur");
    const r = comeBack(t, 6_000);
    expect(r.episode).toEqual({ via: "blur", durationMs: 5_000 });
    expect(r.state.open).toBeNull();
  });

  it("merges blur + hidden into one episode and prefers 'hidden'", () => {
    let t = leave(IDLE_TRACKER, 1_000, "blur");
    t = leave(t, 1_005, "hidden");
    t = leave(t, 1_010, "blur"); // must not restart the clock or downgrade
    expect(t.open).toEqual({ startMs: 1_000, via: "hidden" });
    expect(comeBack(t, 4_000).episode).toEqual({ via: "hidden", durationMs: 3_000 });
  });

  it("drops blips shorter than MIN_AWAY_MS", () => {
    const t = leave(IDLE_TRACKER, 1_000, "blur");
    expect(comeBack(t, 1_000 + MIN_AWAY_MS - 1).episode).toBeNull();
    expect(comeBack(t, 1_000 + MIN_AWAY_MS).episode).not.toBeNull();
  });

  it("ignores a return with no open episode and survives a backwards clock", () => {
    expect(comeBack(IDLE_TRACKER, 5_000).episode).toBeNull();
    expect(comeBack(leave(IDLE_TRACKER, 9_000, "hidden"), 1_000).episode).toBeNull();
  });
});

describe("parsePersisted", () => {
  it("round-trips valid data", () => {
    const raw = JSON.stringify({ pending: [{ via: "hidden", durationMs: 4_000 }], open: { startMs: 10, via: "blur" } });
    expect(parsePersisted(raw)).toEqual({ pending: [{ via: "hidden", durationMs: 4_000 }], open: { startMs: 10, via: "blur" } });
  });
  it("returns empty for null, junk and wrong shapes", () => {
    const empty = { pending: [], open: null };
    expect(parsePersisted(null)).toEqual(empty);
    expect(parsePersisted("not json")).toEqual(empty);
    expect(parsePersisted(JSON.stringify({ pending: "x", open: 5 }))).toEqual(empty);
  });
  it("filters malformed episodes", () => {
    const raw = JSON.stringify({
      pending: [{ via: "x", durationMs: 5000 }, { via: "blur", durationMs: -1 }, { via: "blur", durationMs: "5" }, { via: "blur", durationMs: 2500.7 }],
      open: { startMs: "now", via: "blur" },
    });
    expect(parsePersisted(raw)).toEqual({ pending: [{ via: "blur", durationMs: 2500 }], open: null });
  });
});

describe("applyAwayEvents", () => {
  const ctx = { nowMs: 1_000_000, startedAtMs: 0 };
  const ev = (durationMs: number): StoredAwayEvent => ({ type: "AWAY", via: "hidden", durationMs, reportedAtMs: 1 });

  it("appends accepted episodes with the server timestamp", () => {
    const r = applyAwayEvents([ev(2_000)], [{ via: "blur", durationMs: 5_000 }], ctx);
    expect(r.events).toHaveLength(2);
    expect(r.events[1]).toEqual({ type: "AWAY", via: "blur", durationMs: 5_000, reportedAtMs: 1_000_000 });
    expect(r.addedCount).toBe(1);
    expect(r.addedMs).toBe(5_000);
    expect(r.truncated).toBe(false);
  });

  it("drops blips and clamps durations to the attempt's age", () => {
    const r = applyAwayEvents([], [{ via: "blur", durationMs: 10 }, { via: "hidden", durationMs: 9_999_999 }], ctx);
    expect(r.addedCount).toBe(1);
    expect(r.events[0].durationMs).toBe(1_000_000);
  });

  it("caps the detailed log but still counts everything", () => {
    const existing = [ev(2_000), ev(2_000)];
    const r = applyAwayEvents(existing, [{ via: "blur", durationMs: 3_000 }, { via: "blur", durationMs: 4_000 }], { ...ctx, maxEvents: 3 });
    expect(r.events).toHaveLength(3);
    expect(r.addedCount).toBe(2);
    expect(r.addedMs).toBe(7_000);
    expect(r.truncated).toBe(true);
  });

  it("does not mutate the input", () => {
    const existing = [ev(2_000)];
    applyAwayEvents(existing, [{ via: "blur", durationMs: 3_000 }], ctx);
    expect(existing).toHaveLength(1);
  });
});

describe("shouldThrottle", () => {
  it("allows the first report and spaced reports, blocks rapid ones", () => {
    expect(shouldThrottle(null, 5_000)).toBe(false);
    expect(shouldThrottle(undefined, 5_000)).toBe(false);
    expect(shouldThrottle(5_000, 5_000 + MIN_REPORT_INTERVAL_MS - 1)).toBe(true);
    expect(shouldThrottle(5_000, 5_000 + MIN_REPORT_INTERVAL_MS)).toBe(false);
  });
});

describe("awayReportSchema", () => {
  it("accepts a valid batch", () => {
    expect(awayReportSchema.safeParse({ events: [{ via: "hidden", durationMs: 3_000 }] }).success).toBe(true);
  });
  it("rejects empty, oversized, unknown via, negative or fractional durations", () => {
    expect(awayReportSchema.safeParse({ events: [] }).success).toBe(false);
    const many = Array.from({ length: MAX_EVENTS_PER_CALL + 1 }, () => ({ via: "blur", durationMs: 2_000 }));
    expect(awayReportSchema.safeParse({ events: many }).success).toBe(false);
    expect(awayReportSchema.safeParse({ events: [{ via: "focus", durationMs: 2_000 }] }).success).toBe(false);
    expect(awayReportSchema.safeParse({ events: [{ via: "blur", durationMs: -5 }] }).success).toBe(false);
    expect(awayReportSchema.safeParse({ events: [{ via: "blur", durationMs: 1.5 }] }).success).toBe(false);
  });
});

describe("integrityLevel / formatAwayDuration", () => {
  it("classifies by count and total time", () => {
    expect(integrityLevel(0, 0)).toBe("NONE");
    expect(integrityLevel(1, 5_000)).toBe("NOTICE");
    expect(integrityLevel(2, 119_000)).toBe("NOTICE");
    expect(integrityLevel(3, 5_000)).toBe("HIGH");
    expect(integrityLevel(1, 120_000)).toBe("HIGH");
  });
  it("formats Thai durations", () => {
    expect(formatAwayDuration(45_000)).toBe("45 วินาที");
    expect(formatAwayDuration(125_000)).toBe("2 นาที 5 วินาที");
    expect(formatAwayDuration(120_000)).toBe("2 นาที");
    expect(formatAwayDuration(3_780_000)).toBe("1 ชม. 3 นาที");
    expect(formatAwayDuration(-5)).toBe("0 วินาที");
  });
});
