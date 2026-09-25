import { TabBar } from '@/components/ui/tab-bar'
import { RESOURCE_TABS, type ResourcesTab } from './localResources'

export interface ResourceTabsProps {
  active: ResourcesTab
  onChange: (tab: ResourcesTab) => void
}

/** The hub's tabs (Local resources, Aid requests, Campaigns, Missing persons) — the shared `TabBar` with this page's names. Purely presentational; the page keeps the chosen tab in the URL. */
export function ResourceTabs({ active, onChange }: ResourceTabsProps) {
  return <TabBar tabs={RESOURCE_TABS} active={active} onChange={onChange} label="Resources" idPrefix="resources-tab" panelId="resources-panel" />
}
