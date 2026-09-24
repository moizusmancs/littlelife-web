import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { REGIONS_QUERY_KEY, createRegion, updateRegion, type Region, type RegionLevel, type UpdateRegionInput } from '@/api/geo'
import { extractErrorMessage } from '@/api/errors'
import { RegionFormDrawer } from './RegionFormDrawer'
import { parseBoundary, polygonFromGeometry, summarizePolygon } from './geojson'
import { regionChanges, regionFormSchema, type RegionFormValues } from './regionForm'
import { childrenOf, parentOptions, pathLabel } from './regionTree'

export type RegionEditorTarget =
  | { mode: 'create'; preset?: { level: RegionLevel; parentRegionId: string } }
  | { mode: 'edit'; region: Region }

export interface RegionEditorProps {
  target: RegionEditorTarget
  regions: Region[]
  onClose: () => void
  onSaved: (region: Region, kind: 'created' | 'updated') => void
}

const MAX_FILE_BYTES = 8 * 1024 * 1024

const readAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })

type Save = { kind: 'created'; input: Parameters<typeof createRegion>[0] } | { kind: 'updated'; id: string; patch: UpdateRegionInput; sendsBoundary: boolean }

/**
 * The container behind the create/edit drawer: it owns the form, reads the boundary text as it
 * changes, and saves. Mounted only while the drawer is open, so each opening starts from fresh
 * values. Two things it does that the API won't: the parent choices are limited to one level up
 * (and never the region itself or anything below it, which would make a cycle), and a region with
 * sub-regions can't change level, since that would orphan their hierarchy. On success the saved
 * region is written straight into the list cache — so the page can navigate to a region that the
 * refetch hasn't returned yet — and the list is invalidated for the server's version.
 */
export function RegionEditor({ target, regions, onClose, onSaved }: RegionEditorProps) {
  const queryClient = useQueryClient()
  const original = target.mode === 'edit' ? target.region : null
  const preset = target.mode === 'create' ? target.preset : undefined
  const boundaryRequired = original === null
  const parentOptional = original !== null && !original.parent_region_id

  const schema = useMemo(() => regionFormSchema({ boundaryRequired, parentOptional }), [boundaryRequired, parentOptional])
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<RegionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: original?.name ?? '',
      level: original?.level ?? preset?.level ?? 'province',
      parentRegionId: original ? (original.parent_region_id ?? '') : (preset?.parentRegionId ?? ''),
      boundaryText: '',
    },
  })

  const level = useWatch({ control, name: 'level' })
  const boundaryText = useWatch({ control, name: 'boundaryText' })
  const deferredText = useDeferredValue(boundaryText)
  const boundary = useMemo(() => (deferredText.trim() === '' ? null : parseBoundary(deferredText)), [deferredText])

  // A parent chosen for one level is wrong for another, so changing the level clears it.
  const previousLevel = useRef(level)
  useEffect(() => {
    if (previousLevel.current === level) return
    previousLevel.current = level
    setValue('parentRegionId', '')
  }, [level, setValue])

  const parentChoices = useMemo(
    () =>
      parentOptions(regions, level, original?.id)
        .map((region) => ({ id: region.id, label: pathLabel(regions, region.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })),
    [regions, level, original?.id],
  )
  const hasChildren = original !== null && childrenOf(regions, original.id).length > 0
  const storedPolygon = original ? polygonFromGeometry(original.boundary) : null

  const [formError, setFormError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (save: Save) => ({
      kind: save.kind,
      region: save.kind === 'created' ? await createRegion(save.input) : await updateRegion(save.id, save.patch),
    }),
    onSuccess: ({ kind, region }) => {
      queryClient.setQueryData<Region[]>(REGIONS_QUERY_KEY, (previous) => [...(previous ?? []).filter((item) => item.id !== region.id), region])
      void queryClient.invalidateQueries({ queryKey: REGIONS_QUERY_KEY })
      onSaved(region, kind)
    },
    onError: (error, save) => {
      const sentBoundary = save.kind === 'created' || save.sendsBoundary
      setServerError(
        isAxiosError(error) && error.response?.status === 500 && sentBoundary
          ? "The server couldn't store that boundary. It gives this generic error for shapes its database refuses, so check the polygon and try again."
          : extractErrorMessage(error),
      )
    },
  })

  const onFile = (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setError('boundaryText', { type: 'file', message: 'That file is over 8 MB, which is far more than a boundary needs. Simplify it and try again.' })
      return
    }
    readAsText(file).then(
      (text) => setValue('boundaryText', text, { shouldDirty: true, shouldValidate: true }),
      () => setError('boundaryText', { type: 'file', message: "That file couldn't be read." }),
    )
  }

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    setServerError(null)
    const parsed = values.boundaryText.trim() === '' ? null : parseBoundary(values.boundaryText)
    const polygon = parsed?.ok ? parsed.polygon : null

    if (original) {
      const patch = regionChanges(original, values, polygon)
      if (Object.keys(patch).length === 0) {
        setFormError('Nothing has changed yet.')
        return
      }
      mutation.mutate({ kind: 'updated', id: original.id, patch, sendsBoundary: patch.boundary !== undefined })
      return
    }
    if (!polygon) return
    mutation.mutate({
      kind: 'created',
      input: {
        name: values.name.trim(),
        level: values.level,
        parentRegionId: values.level === 'province' ? undefined : values.parentRegionId || undefined,
        boundary: polygon,
      },
    })
  })

  return (
    <RegionFormDrawer
      mode={target.mode}
      regionName={original?.name}
      onClose={onClose}
      register={register}
      errors={errors}
      level={level}
      levelLockedReason={hasChildren ? `${original?.name} has sub-regions, so its level can't change.` : null}
      parentChoices={parentChoices}
      allowNoParent={parentOptional}
      boundary={boundary}
      currentBoundary={storedPolygon ? summarizePolygon(storedPolygon) : null}
      onFile={onFile}
      onSubmit={(event) => void onSubmit(event)}
      isSubmitting={mutation.isPending}
      serverError={serverError ?? formError}
    />
  )
}
