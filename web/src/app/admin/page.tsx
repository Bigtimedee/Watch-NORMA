import { privateMeta } from "@/lib/seo";
import { redirect } from "next/navigation";

export default function AdminPage() {
  redirect("/admin/dashboard");
}

export const metadata = privateMeta("Admin Home | NORMA Admin", "NORMA admin home.");
