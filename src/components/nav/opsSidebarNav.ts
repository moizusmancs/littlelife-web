import {
  SquaresFour,
  Radioactive,
  Warning,
  Megaphone,
  Kanban,
  HandHeart,
  ArrowBendUpRight,
  ChartLineUp,
  FileText,
  Scroll,
  Users,
  Buildings,
  MapTrifold,
  HouseLine,
  Package,
  UserCircle,
  UserFocus,
  UsersThree,
  Coins,
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
  { label: 'Overview', items: [{ label: 'Dashboard', to: '/admin/dashboard', icon: SquaresFour }] },
  {
    label: 'Hazard Intelligence',
    items: [{ label: 'Hazard Zones & Predictions', to: '/admin/hazard-zones', icon: Radioactive }],
  },
  {
    label: 'Community',
    items: [
      { label: 'Incident Reports', to: '/admin/incident-reports', icon: Warning },
      { label: 'Alerts & Broadcasts', to: '/admin/alerts', icon: Megaphone },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Task Assignments', to: '/admin/tasks', icon: Kanban },
      { label: 'Relief Operations', to: '/admin/relief-operations', icon: HandHeart },
    ],
  },
  {
    label: 'Coordination',
    items: [{ label: 'Escalations & Coordination', to: '/admin/escalations', icon: ArrowBendUpRight }],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Analytics', to: '/admin/analytics', icon: ChartLineUp },
      { label: 'Reports', to: '/admin/reports', icon: FileText },
      { label: 'Audit Log', to: '/admin/audit-log', icon: Scroll },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users & Accounts', to: '/admin/users', icon: Users },
      { label: 'NGOs', to: '/admin/ngos', icon: Buildings },
      { label: 'Regions', to: '/admin/regions', icon: MapTrifold },
      { label: 'Facilities', to: '/admin/facilities', icon: HouseLine },
      { label: 'Offline Map Packages', to: '/admin/offline-maps', icon: Package },
    ],
  },
  { label: 'Settings', items: [{ label: 'My Account', to: '/admin/settings/account', icon: UserCircle }] },
]

export const ngoNavGroups: OpsNavGroup[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', to: '/ngo/dashboard', icon: SquaresFour }] },
  {
    label: 'Operations',
    items: [
      { label: 'Incidents', to: '/ngo/incidents', icon: Warning },
      { label: 'Aid Requests', to: '/ngo/aid-requests', icon: HandHeart },
      { label: 'Missing Persons', to: '/ngo/missing-persons', icon: UserFocus },
      { label: 'Tasks', to: '/ngo/tasks', icon: Kanban },
      { label: 'Volunteers', to: '/ngo/volunteers', icon: UsersThree },
      { label: 'Shelters', to: '/ngo/shelters', icon: HouseLine },
      { label: 'Campaigns', to: '/ngo/campaigns', icon: Coins },
    ],
  },
  {
    label: 'Outreach',
    items: [
      { label: 'Alerts & Community Updates', to: '/ngo/alerts', icon: Megaphone },
      { label: 'Field Observations', to: '/ngo/field-observations', icon: MapTrifold },
      { label: 'Feedback', to: '/ngo/feedback', icon: FileText },
    ],
  },
  { label: 'Coordination', items: [{ label: 'Coordination', to: '/ngo/coordination', icon: ArrowBendUpRight }] },
  { label: 'Insights', items: [{ label: 'Reports', to: '/ngo/reports', icon: ChartLineUp }] },
  {
    label: 'Settings',
    items: [
      { label: 'Organization Settings', to: '/ngo/settings/organization', icon: Buildings, adminOnly: true },
      { label: 'My Account', to: '/ngo/settings/account', icon: UserCircle },
    ],
  },
]
