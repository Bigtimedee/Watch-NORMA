import * as StoreReview from "expo-store-review";
import { recordAppOpen, maybeRequestReview } from "../review-prompt";

// In-memory AsyncStorage for this test suite
const store: Record<string, string> = {};
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem:    jest.fn(async (k: string) => store[k] ?? null),
  setItem:    jest.fn(async (k: string, v: string) => { store[k] = v; }),
  removeItem: jest.fn(async (k: string) => { delete store[k]; }),
  clear:      jest.fn(async () => { for (const k in store) delete store[k]; }),
}));

jest.mock("expo-store-review");

const mockIsAvailable = StoreReview.isAvailableAsync as jest.Mock;
const mockHasAction   = StoreReview.hasAction        as jest.Mock;
const mockRequest     = StoreReview.requestReview     as jest.Mock;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

function dayStr(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

beforeEach(() => {
  // Clear in-memory store
  for (const k in store) delete store[k];
  jest.clearAllMocks();
  mockIsAvailable.mockResolvedValue(true);
  mockHasAction.mockResolvedValue(true);
  mockRequest.mockResolvedValue(undefined);
});

describe("recordAppOpen", () => {
  it("records today once per day", async () => {
    await recordAppOpen();
    await recordAppOpen(); // idempotent same day
    const days: string[] = JSON.parse(store["norma.reviewActiveDays"] ?? "[]");
    expect(days.length).toBe(1);
    expect(days[0]).toBe(dayStr());
  });

  it("accumulates separate days", async () => {
    store["norma.reviewActiveDays"] = JSON.stringify([dayStr(-2), dayStr(-1)]);
    await recordAppOpen();
    const days: string[] = JSON.parse(store["norma.reviewActiveDays"]);
    expect(days.length).toBe(3);
  });
});

describe("maybeRequestReview gating", () => {
  function seedActiveDays(n: number) {
    const days = Array.from({ length: n }, (_, i) => dayStr(-i));
    store["norma.reviewActiveDays"] = JSON.stringify(days);
  }

  it("does not prompt when StoreReview unavailable", async () => {
    mockIsAvailable.mockResolvedValue(false);
    seedActiveDays(5);
    await maybeRequestReview("test");
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("does not prompt when hasAction is false", async () => {
    mockHasAction.mockResolvedValue(false);
    seedActiveDays(5);
    await maybeRequestReview("test");
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("does not prompt with fewer than 3 active days", async () => {
    seedActiveDays(2);
    await maybeRequestReview("test");
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("prompts when all conditions met with exactly 3 active days", async () => {
    seedActiveDays(3);
    await maybeRequestReview("test");
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("does not prompt within 120 days of last prompt", async () => {
    seedActiveDays(5);
    store["norma.reviewLastPrompted"] = daysAgo(50);
    await maybeRequestReview("test");
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("prompts again after 120 days have elapsed", async () => {
    seedActiveDays(5);
    store["norma.reviewLastPrompted"] = daysAgo(121);
    await maybeRequestReview("test");
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("persists last-prompted timestamp after prompting", async () => {
    seedActiveDays(5);
    await maybeRequestReview("test");
    expect(store["norma.reviewLastPrompted"]).toBeDefined();
    const stored = new Date(store["norma.reviewLastPrompted"]).getTime();
    expect(Date.now() - stored).toBeLessThan(5000);
  });
});
