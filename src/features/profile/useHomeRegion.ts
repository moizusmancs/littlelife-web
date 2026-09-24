import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PROFILE_QUERY_KEY, getProfile, updateProfile } from '@/api/profiling'
import { extractErrorMessage } from '@/api/errors'
import type { RegionPickerDialogProps } from '@/features/regions/RegionPickerDialog'
import { useRegionChoice } from '@/features/regions/useRegionChoice'
import type { HomeRegionCardProps } from './HomeRegionCard'
import { homeRegionLabel } from './homeRegion'

/**
 * The home-region card's state on Edit Profile: the profile it reads (the same `PROFILE_QUERY_KEY`
 * entry the sidebar and the name form use, so the sidebar's header updates the moment this saves),
 * the choose dialog, and the change/remove mutations. Spread `card` into `HomeRegionCard` and `dialog`
 * into a `RegionPickerDialog`.
 *
 * Both writes go through `PATCH /profile`: a region id sets or changes it (any level is accepted),
 * `""` clears it. The response is the re-read profile — already carrying the new region's name,
 * level and path — so it is written straight into the cache, with no region list needed to display
 * it. The current region stays listed in the picker but can't be picked again.
 */
export function useHomeRegion() {
  const queryClient = useQueryClient()
  const profile = useQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: () => getProfile() })
  const current = profile.data

  const [open, setOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [clearError, setClearError] = useState<string | null>(null)

  const homeRegionId = current?.home_region_id
  const unavailable = useMemo(
    () => (homeRegionId ? new Map([[homeRegionId, 'Current home region']]) : new Map<string, string>()),
    [homeRegionId],
  )
  const choice = useRegionChoice(open, unavailable)

  const save = useMutation({
    mutationFn: (regionId: string) => updateProfile({ homeRegionId: regionId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, updated)
      setOpen(false)
    },
    onError: (error) => setSaveError(extractErrorMessage(error)),
  })

  const clear = useMutation({
    mutationFn: () => updateProfile({ homeRegionId: '' }),
    onSuccess: (updated) => {
      setClearError(null)
      queryClient.setQueryData(PROFILE_QUERY_KEY, updated)
    },
    onError: (error) => setClearError(extractErrorMessage(error)),
  })

  const card: HomeRegionCardProps = {
    isLoaded: !profile.isPending,
    label: current ? homeRegionLabel(current) : null,
    level: current?.home_region_level ?? null,
    path: current?.home_region_path ?? null,
    onChoose: () => {
      choice.reset()
      setSaveError(null)
      setOpen(true)
    },
    onClear: () => {
      setClearError(null)
      clear.mutate()
    },
    isClearing: clear.isPending,
    error: clearError,
  }

  const dialog: RegionPickerDialogProps = {
    open,
    onOpenChange: setOpen,
    title: current?.home_region_id ? 'Change your home region' : 'Choose your home region',
    description: 'Pick the province, district or tehsil you live in. Use the arrow beside a region to see what\'s inside it.',
    confirmLabel: 'Save home region',
    state: choice.state,
    error: choice.error,
    onRetry: choice.retry,
    picker: choice.pickerProps,
    hasSelection: choice.selected !== null,
    onConfirm: () => {
      if (choice.selected) save.mutate(choice.selected.id)
    },
    isSubmitting: save.isPending,
    serverError: saveError,
  }

  return { card, dialog }
}
