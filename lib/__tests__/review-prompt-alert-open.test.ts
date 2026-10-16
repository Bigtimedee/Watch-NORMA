import * as StoreReview from "expo-store-review";
import { maybeRequestReviewAfterAlertOpen, MIN_ALERT_OPENS } from "../review-prompt";

const store: Record<string, string> = {};
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (k: string) => store[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
}));
jest.mock("expo-store-review");

const mockRequest = StoreReview.requestReview as jest.Mock;

beforeEach(() => {
  for (const k in store) delete store[k];
  jest.clearAllMocks();
  (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (StoreReview.hasAction as jest.Mock).mockResolvedValue(true);
  mockRequest.mockResolvedValue(undefined);
});

it("waits for the minimum number of alert opens", async () => {
  for (let i = 1; i < MIN_ALERT_OPENS; i++) {
    expect(await maybeRequestReviewAfterAlertOpen()).toBe(false);
  }
  expect(await maybeRequestReviewAfterAlertOpen()).toBe(true);
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

it("prompts at most once per 30 days", async () => {
  store["norma.reviewAlertOpens"] = "10";
  store["norma.reviewLastPrompted"] = new Date(Date.now() - 29 * 864e5).toISOString();
  expect(await maybeRequestReviewAfterAlertOpen()).toBe(false);
  store["norma.reviewLastPrompted"] = new Date(Date.now() - 31 * 864e5).toISOString();
  expect(await maybeRequestReviewAfterAlertOpen()).toBe(true);
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

it("does not prompt when StoreReview is unavailable", async () => {
  store["norma.reviewAlertOpens"] = "10";
  (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(false);
  expect(await maybeRequestReviewAfterAlertOpen()).toBe(false);
  expect(mockRequest).not.toHaveBeenCalled();
});
