import type { Role } from '@/store/auth'

/** Human labels for the backend's `account_role` enum, as shown next to a person's name. */
export const ROLE_LABEL: Record<Role, string> = {
  user: 'Citizen',
  ngo_admin: 'NGO admin',
  ngo_volunteer: 'NGO volunteer',
  admin: 'Admin',
  super_admin: 'Super admin',
}
