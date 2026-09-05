/**
 * In-memory flag so AuthGate does not bounce a PASSWORD_RECOVERY session
 * from `/(auth)/reset-password` to the games tab before the user sets a
 * new password.
 */

type Listener = (pending: boolean) => void;

let passwordRecoveryPending = false;
const listeners = new Set<Listener>();

export function isPasswordRecoveryPending(): boolean {
  return passwordRecoveryPending;
}

export function setPasswordRecoveryPending(pending: boolean): void {
  passwordRecoveryPending = pending;
  listeners.forEach((listener) => listener(pending));
}

export function subscribePasswordRecovery(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
