import { describe, expect, it } from "vitest";
import { categoryLabel, timeAgo } from "@/utils/format";
import { splitIso, toIso } from "@/utils/datetime";
import { validateImage } from "@/utils/image";
import { distanceInMeters, formatDistance } from "@/utils/distance";

const file = (type: string, size: number, name = "a") => new File([new Uint8Array(size)], name, { type });

describe("validateImage", () => {
  it("accepts jpg, png and webp under 5 MB", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp"]) expect(validateImage(file(t, 1000))).toBeNull();
  });
  it("rejects unsupported types, oversized and empty files with readable messages", () => {
    expect(validateImage(file("text/plain", 10))).toMatch(/Unsupported file type/);
    expect(validateImage(file("image/gif", 10))).toMatch(/Unsupported file type/);
    expect(validateImage(file("image/png", 5 * 1024 * 1024 + 1))).toMatch(/5 MB/);
    expect(validateImage(file("image/png", 0))).toMatch(/empty/);
  });
});

describe("date helpers", () => {
  it("round-trips a local date and time", () => {
    const iso = toIso("2026-03-04", "09:30");
    expect(splitIso(iso)).toEqual({ date: "2026-03-04", time: "09:30" });
  });
  it("never produces a future timestamp (regression: reporting before noon with no time)", () => {
    const today = splitIso(new Date().toISOString()).date;
    expect(new Date(toIso(today)).getTime()).toBeLessThanOrEqual(Date.now());
  });
  it("defaults the time to midday for past dates and handles empty input", () => {
    expect(splitIso(toIso("2020-03-04")).time).toBe("12:00");
    expect(splitIso(null)).toEqual({ date: "", time: "" });
  });
});

describe("format helpers", () => {
  it("labels categories and falls back to Other", () => {
    expect(categoryLabel("wallet_cards")).toBe("Wallet & cards");
    expect(categoryLabel("nonsense")).toBe("Other");
  });
  it("describes elapsed time", () => {
    expect(timeAgo(new Date().toISOString())).toBe("just now");
    expect(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5 min ago");
    expect(timeAgo(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe("3 h ago");
  });
});

describe("distance helpers", () => {
  it("measures a live position against a destination and formats the result", () => {
    const destination = { latitude: 12.6614291, longitude: 77.4508298 };
    const fartherAway = { latitude: 12.6624291, longitude: 77.4508298 };
    const closer = { latitude: 12.6619291, longitude: 77.4508298 };
    expect(distanceInMeters(closer, destination)).toBeLessThan(distanceInMeters(fartherAway, destination));
    expect(formatDistance(420)).toBe("420 m");
    expect(formatDistance(1_250)).toBe("1.3 km");
  });
});
