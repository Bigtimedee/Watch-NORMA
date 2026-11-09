export interface StoredRouteMeta {
  id: string;
  player: "strymtv";
  feedId: string;
  label: string;
  enabled: boolean;
  createdAt: string;
  attestedAt: string;
  userConfirmedAt: string | null;
  quarantined: boolean;
  schemaVersion: 1;
}

export interface AccountIndex {
  schemaVersion: 1;
  accountId: string;
  optIn: boolean;
  attestedAt: string | null;
  reinstallLock: boolean;
  routes: StoredRouteMeta[];
}

export interface LoadedAccount {
  optIn: boolean;
  attestedAt: string | null;
  reinstallLock: boolean;
  routes: StoredRouteMeta[];
  unavailableReason: "unsupported_schema" | "corrupt" | "storage_unavailable" | null;
  hasDeletableData: boolean;
}

export const ACCOUNT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAccountId(value: string): boolean {
  return ACCOUNT_ID_RE.test(value);
}
