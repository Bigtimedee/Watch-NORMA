// Route-level loading UI for server-rendered portal and admin pages
// (used by loading.tsx files). Shown while the page's data is fetched.
export function PageLoading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-slate-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-orange-500" aria-hidden="true" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
