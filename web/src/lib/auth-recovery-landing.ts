export {
  EXPIRED_RESET_COPY,
  EXPIRED_RESET_HEADLINE,
  WEB_FORGOT_PASSWORD_PATH,
  WEB_RECOVERY_PATH,
  getWebRecoveryRedirectTo,
  isAuthRecoveryPayload,
  isExpiredRecoveryError,
  parseRecoveryParams,
  postResetDestination,
  rewriteAuthDumpToResetPath,
  shouldRouteToResetPassword,
} from "../../../lib/auth-recovery-landing";
