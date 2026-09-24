import { Badge } from '@/components/ui/badge'
import type { Role } from '@/store/auth'
import { ROLE_LABEL } from './roleLabels'

const TONE: Record<Role, 'info' | 'trust' | 'caution'> = {
  user: 'info',
  ngo_volunteer: 'trust',
  ngo_admin: 'trust',
  admin: 'caution',
  super_admin: 'caution',
}

/** An account's role as a pill; platform admins get the attention-drawing tone on purpose. */
export function AccountRoleBadge({ role }: { role: Role }) {
  return <Badge tone={TONE[role]}>{ROLE_LABEL[role]}</Badge>
}
