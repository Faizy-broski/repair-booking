/**
 * Tenant-group navigation loading state.
 *
 * Next.js renders this file IMMEDIATELY when the user clicks a sidebar Link,
 * before the server has even started processing the request. Without this file
 * the router has no Suspense fallback, so the page appears frozen during the
 * middleware round-trip (~200-400 ms) and users click twice thinking nothing
 * happened. This single file eliminates that behaviour.
 *
 * The sidebar and topbar (layout.tsx) remain visible — only the <main> slot
 * (children) is replaced with this skeleton while the RSC payload loads.
 */
export default function TenantLoading() {
  return (
    <div className="space-y-6 animate-pulse">

      {/* Page header */}
      <div className="space-y-2">
        <div className="h-6 w-48 rounded-lg bg-surface-container" />
        <div className="h-4 w-32 rounded-md bg-surface-container" />
      </div>

      {/* Stats row — matches the 7-card grid on dashboard; collapses gracefully on other pages */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-28 sm:h-32 rounded-xl bg-surface-container" />
        ))}
      </div>

      {/* Main content area — two-column on wide screens (list + detail / chart + feed) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl bg-surface-container h-72" />
        <div className="rounded-xl bg-surface-container h-72" />
      </div>

      {/* Table-style rows (repairs list, customers, inventory, etc.) */}
      <div className="rounded-xl bg-surface-container overflow-hidden">
        <div className="h-12 bg-surface-container-high" />
        <div className="divide-y divide-outline-variant">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4">
              <div className="h-8 w-8 rounded-lg bg-surface-container-high shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 rounded bg-surface-container-high" />
                <div className="h-2.5 w-1/2 rounded bg-surface-container-high" />
              </div>
              <div className="h-6 w-20 rounded-full bg-surface-container-high shrink-0" />
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
