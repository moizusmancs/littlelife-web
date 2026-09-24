import type { ProfileResponse } from '@/api/profiling'

const SEPARATOR = ' › '

/**
 * A profile's home region as a short line — "Sukkur City, Sukkur" for a tehsil (its own name, then
 * its parent), just "Sindh" for a province — built from the profile response alone, so no region list
 * has to be loaded to show it. The API sends `home_region_path` for exactly this ("Sindh › Sukkur ›
 * Sukkur City": split it and take the last two parts, last first). `null` while no home region is set,
 * which the API signals by leaving all four keys out.
 */
export function homeRegionLabel(profile: Pick<ProfileResponse, 'home_region_name' | 'home_region_path'>): string | null {
  const parts = (profile.home_region_path ?? '').split(SEPARATOR).filter(Boolean)
  if (parts.length > 0) return parts.slice(-2).reverse().join(', ')
  return profile.home_region_name ?? null
}
