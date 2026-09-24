import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { MY_REGIONS_QUERY_KEY, REGIONS_QUERY_KEY, assignRegion, getMyRegions, getRegions, removeRegion, type Region } from '@/api/geo'
import { extractErrorMessage } from '@/api/errors'
import type { PageNotice } from '@/components/ui/notice'
import { useRegionPicker } from '@/features/regions/useRegionPicker'
import type { AddRegionDialogProps } from './AddRegionDialog'
import type { OperationalRegionsCardProps } from './OperationalRegionsCard'
import type { RemoveRegionDialogProps } from './RemoveRegionDialog'

const NO_REGIONS: Region[] = []
const byName = (a: Region, b: Region) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

/**
 * Everything Organization Settings needs for the operational-regions card: the organisation's own
 * coverage, the add flow (the full region list is only fetched when the picker is opened — it carries
 * every boundary — and shares the admin screen's cache entry) and the remove flow, each with its
 * confirmation. Spread `card`, `addDialog` and `removeDialog` into the three presentational parts;
 * outcomes go to `onNotice`.
 *
 * The API's answers are used rather than guessed at: a successful add or remove is written into the
 * cached list straight away and the list is refetched for the server's version; an add that finds the
 * region already assigned (`409`, someone else on the team beat this tab to it) or a remove that finds
 * it already gone (`404`) shows the server's words in the dialog and refreshes the list.
 */
export function useOperationalRegions({ onNotice }: { onNotice: (notice: PageNotice) => void }) {
  const queryClient = useQueryClient()
  const mine = useQuery({ queryKey: MY_REGIONS_QUERY_KEY, queryFn: getMyRegions })

  const [addOpen, setAddOpen] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const all = useQuery({ queryKey: REGIONS_QUERY_KEY, queryFn: () => getRegions(), enabled: addOpen })
  const unavailable = useMemo(() => new Map((mine.data ?? []).map((region) => [region.id, 'Already added'])), [mine.data])
  const { pickerProps, selected, reset } = useRegionPicker(all.data ?? NO_REGIONS, unavailable)

  const [removeTarget, setRemoveTarget] = useState<Region | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const refreshMine = () => void queryClient.invalidateQueries({ queryKey: MY_REGIONS_QUERY_KEY })

  const assign = useMutation({
    mutationFn: (region: Region) => assignRegion(region.id),
    onSuccess: (region) => {
      queryClient.setQueryData<Region[]>(MY_REGIONS_QUERY_KEY, (previous) => [...(previous ?? []).filter((item) => item.id !== region.id), region].sort(byName))
      refreshMine()
      setAddOpen(false)
      onNotice({ tone: 'success', text: `${region.name} was added to your regions.` })
    },
    onError: (error) => {
      setAddError(extractErrorMessage(error))
      if (isAxiosError(error) && error.response?.status === 409) refreshMine()
    },
  })

  const remove = useMutation({
    mutationFn: (region: Region) => removeRegion(region.id),
    onSuccess: (_result, region) => {
      queryClient.setQueryData<Region[]>(MY_REGIONS_QUERY_KEY, (previous) => (previous ?? []).filter((item) => item.id !== region.id))
      refreshMine()
      setRemoveTarget(null)
      onNotice({ tone: 'success', text: `${region.name} was removed from your regions.` })
    },
    onError: (error) => {
      setRemoveError(extractErrorMessage(error))
      if (isAxiosError(error) && error.response?.status === 404) refreshMine()
    },
  })

  const card: OperationalRegionsCardProps = {
    regions: mine.data,
    error: mine.isError ? extractErrorMessage(mine.error) : null,
    onRetry: () => void mine.refetch(),
    onAdd: () => {
      reset()
      setAddError(null)
      setAddOpen(true)
    },
    onRemove: (region) => {
      setRemoveError(null)
      setRemoveTarget(region)
    },
  }

  const addDialog: AddRegionDialogProps = {
    open: addOpen,
    onOpenChange: setAddOpen,
    state: all.isError ? 'error' : all.isPending ? 'loading' : all.data.length === 0 ? 'empty' : 'ready',
    error: all.isError ? extractErrorMessage(all.error) : null,
    onRetry: () => void all.refetch(),
    picker: pickerProps,
    hasSelection: selected !== null,
    onConfirm: () => {
      if (selected) assign.mutate(selected)
    },
    isSubmitting: assign.isPending,
    serverError: addError,
  }

  const removeDialog: RemoveRegionDialogProps = {
    target: removeTarget,
    onClose: () => setRemoveTarget(null),
    onConfirm: () => {
      if (removeTarget) remove.mutate(removeTarget)
    },
    isSubmitting: remove.isPending,
    serverError: removeError,
  }

  return { card, addDialog, removeDialog }
}
