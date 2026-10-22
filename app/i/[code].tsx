import { Redirect } from "expo-router";

// Universal link https://getnorma.app/i/CODE. The root layout already stored the
// code (captureReferralFromUrl); just hand off to the normal entry route.
export default function InviteLink() {
  return <Redirect href="/" />;
}
