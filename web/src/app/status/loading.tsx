import { PageLoading } from "@/components/page-loading";

export default function Loading() {
  return (
    <div style={{ background: "#0f172a", minHeight: "100vh" }}>
      <PageLoading label="Checking system status..." />
    </div>
  );
}
