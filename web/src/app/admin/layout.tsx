import { requireAdmin } from "@/lib/admin";
import { AdminNav } from "@/components/admin-nav";
import { privateMeta } from "@/lib/seo";

export const metadata = privateMeta("Admin | NORMA", "NORMA internal admin console.");

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="min-h-screen">
      <AdminNav />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
