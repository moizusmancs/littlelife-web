import { useSearchParams } from 'react-router-dom'
import { LocalResourcesTab } from './LocalResourcesTab'
import { ResourceTabs } from '@/features/resources/ResourceTabs'
import { TabPlaceholder } from '@/features/resources/LocalResourceList'
import { tabFromParam, type ResourcesTab } from '@/features/resources/localResources'

/**
 * /app/resources — the hub's tab shell. The tab lives in the URL (`?tab=local|aid|campaigns|missing`, Local when absent or unknown) so
 * a link, a reload and Back all land on the same tab. Only **Local resources** is built (Phase 3); Aid requests, Campaigns and Missing
 * persons are Phase 6's screens and show their placeholder until then.
 */
export function ResourcesPage() {
  const [params, setParams] = useSearchParams()
  const tab = tabFromParam(params.get('tab'))
  const choose = (next: ResourcesTab) => setParams(next === 'local' ? {} : { tab: next }, { replace: true })

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="font-heading text-h1 font-bold text-ink-900">Resources</h1>
        <p className="mt-1 font-body text-body-md text-ink-500">Where to find shelter, medicine, food and cash — and whether it is open right now.</p>
      </div>

      <ResourceTabs active={tab} onChange={choose} />

      <div role="tabpanel" id="resources-panel" aria-labelledby={`resources-tab-${tab}`} tabIndex={-1}>
        {tab === 'local' && <LocalResourcesTab />}
        {tab === 'aid' && <TabPlaceholder title="Aid requests" phase="Phase 6" />}
        {tab === 'campaigns' && <TabPlaceholder title="Donation campaigns" phase="Phase 6" />}
        {tab === 'missing' && <TabPlaceholder title="Missing persons" phase="Phase 6" />}
      </div>
    </div>
  )
}
