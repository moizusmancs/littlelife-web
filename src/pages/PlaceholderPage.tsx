/** Temporary stand-in for every route until its real phase in FRONTEND_IMPLEMENTATION_PLAN.md
 *  builds the actual screen. Exists so the full route tree (WEB_DESIGN_PLAN.md §2) is navigable
 *  from Phase 0 onward, instead of being wired up route-by-route later. */
export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-surface-border p-12 text-center">
      <h1 className="font-heading text-h1 font-bold text-ink-900">{title}</h1>
      <p className="font-body text-body-md text-ink-500">Not built yet — ships in {phase}.</p>
    </div>
  )
}
