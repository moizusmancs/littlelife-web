import {
  SquaresFourIcon,
  RadioactiveIcon,
  WarningIcon,
  MegaphoneIcon,
  KanbanIcon,
  HandHeartIcon,
  ArrowBendUpRightIcon,
  ChartLineUpIcon,
  FileTextIcon,
  ScrollIcon,
  UsersIcon,
  BuildingsIcon,
  MapTrifoldIcon,
  HouseLineIcon,
  PackageIcon,
  UserCircleIcon,
  UserFocusIcon,
  UsersThreeIcon,
  CoinsIcon,
  type Icon,
} from '@phosphor-icons/react'

export interface OpsNavItem {
  label: string
  to: string
  icon: Icon
  /** ngo_admin-only item, hidden from the sidebar entirely for ngo_volunteer
   *  (WEB_DESIGN_PLAN.md §4.2). Admin items never carry this. */
  adminOnly?: boolean
}

export interface OpsNavGroup {
  label: string
  items: OpsNavItem[]
}

/**
 * Sidebar structure ported directly from `supporting-material/UI mockups needed/Ops Sidebar.dc.html`
 * (a real, role-parameterized reference component, not just a mockup) and cross-checked against
 * WEB_DESIGN_PLAN.md §4.2's written group list — routes are this app's real route tree
 * (WEB_DESIGN_PLAN.md §2.3/§2.4), the mockup only specified labels/icons.
 */
export const adminNavGroups: OpsNavGroup[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', to: '/admin/dashboard', icon: SquaresFourIcon }] },
  {
    label: 'Hazard Intelligence',
    items: [{ label: 'Hazard Zones & Predictions', to: '/admin/hazard-zones', icon: RadioactiveIcon }],
  },
  {
    label: 'Community',
    items: [
      { label: 'Incident Reports', to: '/admin/incident-reports', icon: WarningIcon },
      { label: 'Alerts & Broadcasts', to: '/admin/alerts', icon: MegaphoneIcon },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Task Assignments', to: '/admin/tasks', icon: KanbanIcon },
      { label: 'Relief Operations', to: '/admin/relief-operations', icon: HandHeartIcon },
    ],
  },
  {
    label: 'Coordination',
    items: [{ label: 'Escalations & Coordination', to: '/admin/escalations', icon: ArrowBendUpRightIcon }],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Analytics', to: '/admin/analytics', icon: ChartLineUpIcon },
      { label: 'Reports', to: '/admin/reports', icon: FileTextIcon },
      { label: 'Audit Log', to: '/admin/audit-log', icon: ScrollIcon },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users & Accounts', to: '/admin/users', icon: UsersIcon },
      { label: 'NGOs', to: '/admin/ngos', icon: BuildingsIcon },
      { label: 'Regions', to: '/admin/regions', icon: MapTrifoldIcon },
      { label: 'Facilities', to: '/admin/facilities', icon: HouseLineIcon },
      { label: 'Offline Map Packages', to: '/admin/offline-maps', icon: PackageIcon },
    ],
  },
  { label: 'Settings', items: [{ label: 'My Account', to: '/admin/settings/account', icon: UserCircleIcon }] },
]

export const ngoNavGroups: OpsNavGroup[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', to: '/ngo/dashboard', icon: SquaresFourIcon }] },
  {
    label: 'Operations',
    items: [
      { label: 'Incidents', to: '/ngo/incidents', icon: WarningIcon },
      { label: 'Aid Requests', to: '/ngo/aid-requests', icon: HandHeartIcon },
      { label: 'Missing Persons', to: '/ngo/missing-persons', icon: UserFocusIcon },
      { label: 'Tasks', to: '/ngo/tasks', icon: KanbanIcon },
      { label: 'Volunteers', to: '/ngo/volunteers', icon: UsersThreeIcon, adminOnly: true },
      { label: 'Shelters', to: '/ngo/shelters', icon: HouseLineIcon },
      { label: 'Campaigns', to: '/ngo/campaigns', icon: CoinsIcon },
    ],
  },
  {
    label: 'Outreach',
    items: [
      { label: 'Alerts & Community Updates', to: '/ngo/alerts', icon: MegaphoneIcon },
      { label: 'Field Observations', to: '/ngo/field-observations', icon: MapTrifoldIcon },
      { label: 'Feedback', to: '/ngo/feedback', icon: FileTextIcon },
    ],
  },
  { label: 'Coordination', items: [{ label: 'Coordination', to: '/ngo/coordination', icon: ArrowBendUpRightIcon }] },
  { label: 'Insights', items: [{ label: 'Reports', to: '/ngo/reports', icon: ChartLineUpIcon }] },
  {
    label: 'Settings',
    items: [
      { label: 'Organization Settings', to: '/ngo/settings/organization', icon: BuildingsIcon, adminOnly: true },
      { label: 'My Account', to: '/ngo/settings/account', icon: UserCircleIcon },
    ],
  },
]
