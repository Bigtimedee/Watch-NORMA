import {
  isPasswordRecoveryPending,
  setPasswordRecoveryPending,
  subscribePasswordRecovery,
} from "../auth-recovery-state";

describe("password recovery pending flag", () => {
  afterEach(() => {
    setPasswordRecoveryPending(false);
  });

  it("starts false and notifies subscribers", () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribePasswordRecovery((value) => seen.push(value));

    expect(isPasswordRecoveryPending()).toBe(false);
    setPasswordRecoveryPending(true);
    expect(isPasswordRecoveryPending()).toBe(true);
    setPasswordRecoveryPending(false);
    expect(seen).toEqual([true, false]);

    unsubscribe();
  });
});
