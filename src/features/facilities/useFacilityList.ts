import { useMemo } from 'react'
import { countOptions, filterRows, type FacilityFilters, type FacilitySpec } from './facilityModel'

export interface FacilityListView {
  type: string
  status: string
  q: string
  size: number
  page: number
}

/**
 * The rows for one tab, worked out in the browser (the API has no search, no filter and no paging for any of these): filtered and searched, the pill counts, and the page asked for —
 * clamped to the last real page, so a filter that shrinks the list never leaves you on a page that isn't there.
 */
export function useFacilityList<Row extends { id: string; name: string }>(rows: readonly Row[], spec: FacilitySpec<Row>, view: FacilityListView) {
  const { type, status, q, size, page: requested } = view
  const filters = useMemo<FacilityFilters>(() => ({ type, status, q }), [type, status, q])
  const filtered = useMemo(() => filterRows(rows, spec, filters), [rows, spec, filters])
  const counts = useMemo(() => countOptions(rows, spec, filters), [rows, spec, filters])
  const lastPage = Math.max(1, Math.ceil(filtered.length / size))
  const page = Math.min(requested, lastPage)
  const visible = useMemo(() => filtered.slice((page - 1) * size, page * size), [filtered, page, size])
  return { filtered, counts, visible, page, total: rows.length }
}
