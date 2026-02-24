import { requireAdmin } from "@/lib/admin";
import { UserActions } from "./user-actions";

export default async function AdminUsersPage() {
  const { supabase } = await requireAdmin();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, push_token, notifications_enabled, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <h1 className="text-2xl font-bold text-white">Mobile Users</h1>
      <p className="mt-1 text-sm text-slate-400">
        Manage mobile app users
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                Push Token
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                Notifications
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                Joined
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {(profiles ?? []).map((p: any) => (
              <tr key={p.id} className="hover:bg-slate-900/50">
                <td className="px-6 py-4 text-white">
                  {p.display_name || "—"}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={
                      p.push_token
                        ? "text-green-400 text-sm"
                        : "text-slate-500 text-sm"
                    }
                  >
                    {p.push_token ? "Registered" : "None"}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={
                      p.notifications_enabled
                        ? "text-green-400 text-sm"
                        : "text-slate-500 text-sm"
                    }
                  >
                    {p.notifications_enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <UserActions userId={p.id} />
                </td>
              </tr>
            ))}
            {(!profiles || profiles.length === 0) && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-8 text-center text-slate-500"
                >
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
