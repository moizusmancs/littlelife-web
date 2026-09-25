import { describe, expect, it } from 'vitest'
import { currentProfileNavItem, PROFILE_NAV_ITEMS } from './profileNav'

describe('currentProfileNavItem', () => {
  it('names the item for each of its own routes', () => {
    for (const item of PROFILE_NAV_ITEMS) expect(currentProfileNavItem(item.to)?.label).toBe(item.label)
  })

  it('names Safety Groups for a connection page under it, as NavLink highlights it', () => {
    expect(currentProfileNavItem('/app/safety-groups/3d4e5f6a')?.label).toBe('Safety Groups')
  })

  it('keeps Overview to `/app/profile` exactly, so it is not "current" for every profile page', () => {
    expect(currentProfileNavItem('/app/profile')?.label).toBe('Overview')
    expect(currentProfileNavItem('/app/profile/edit')?.label).toBe('Edit Profile')
  })

  it('is undefined for a path outside the sub-nav', () => {
    expect(currentProfileNavItem('/app/home')).toBeUndefined()
    expect(currentProfileNavItem('/app/profile/unknown')).toBeUndefined()
  })
})
