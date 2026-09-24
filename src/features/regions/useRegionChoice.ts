import { useQuery } from '@tanstack/react-query'
import { REGIONS_QUERY_KEY, getRegions, type Region } from '@/api/geo'
import { extractErrorMessage } from '@/api/errors'
import { useRegionPicker } from './useRegionPicker'

const NO_REGIONS: Region[] = []
const NOTHING_UNAVAILABLE: ReadonlyMap<string, string> = new Map()

export type RegionChoiceState = 'loading' | 'error' | 'empty' | 'ready'

/**
 * Everything a screen needs to let someone choose one region: the full region list (fetched only
 * while `open`, since it carries every boundary — it shares the Admin Regions cache entry), the
 * picker's own state, and which of the four things to show. Used by the operational-regions dialog,
 * the home-region dialog and the onboarding step. `unavailable` maps a region id to why it can't be
 * chosen.
 */
export function useRegionChoice(open: boolean, unavailable: ReadonlyMap<string, string> = NOTHING_UNAVAILABLE) {
  const all = useQuery({ queryKey: REGIONS_QUERY_KEY, queryFn: () => getRegions(), enabled: open })
  const { pickerProps, selected, reset } = useRegionPicker(all.data ?? NO_REGIONS, unavailable)
  const state: RegionChoiceState = all.isError ? 'error' : all.isPending ? 'loading' : all.data.length === 0 ? 'empty' : 'ready'

  return {
    state,
    error: all.isError ? extractErrorMessage(all.error) : null,
    retry: () => void all.refetch(),
    pickerProps,
    selected,
    reset,
  }
}
