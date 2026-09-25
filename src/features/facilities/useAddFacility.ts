import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { extractErrorMessage } from '@/api/errors'
import type { PageNotice } from '@/components/ui/notice'
import { OUTSIDE_AREAS_MESSAGE, pointWriter } from '@/features/map/pointForm'
import { usePointPicker } from '@/features/map/usePointPicker'
import { EMPTY_FACILITY_FORM, facilityFormSchema, toEssentialInput, toInfrastructureInput, type AddableKind, type FacilityFormValues } from './facilityForm'
import { useFacilityMutations } from './useFacilityData'

/**
 * "Add infrastructure" / "Add essential location": whether the drawer is open, its form, the point on the map (which follows the typed coordinates and vice versa), whether that point is
 * inside a region, and the save — which **refuses a point outside every region** (the API would take it, but no route could ever list it again). Called once per kind, so each has
 * its own form. Opening resets it. The browser's position is asked for only when "Use my location" is pressed; the regions are fetched only while the drawer is open. On success the
 * notice says which region the new place ended up in.
 */
export function useAddFacility(kind: AddableKind, { onNotice }: { onNotice: (notice: PageNotice) => void }) {
  const mutations = useFacilityMutations()
  const mutation = kind === 'infrastructure' ? mutations.addInfrastructure : mutations.addEssential
  const [isOpen, setIsOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const schema = useMemo(() => facilityFormSchema(kind), [kind])
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    control,
    formState: { errors },
  } = useForm<FacilityFormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_FACILITY_FORM(kind) })

  const [latitude, longitude] = useWatch({ control, name: ['latitude', 'longitude'] })
  const pick = useMemo(() => pointWriter(setValue), [setValue])
  const { position, areas, coverage, coverageForSave, location } = usePointPicker({ latitude, longitude, onPick: pick, enabled: isOpen })

  return {
    kind,
    isOpen,
    open: () => {
      mutation.reset()
      reset(EMPTY_FACILITY_FORM(kind))
      setServerError(null)
      setIsOpen(true)
    },
    close: () => setIsOpen(false),
    /** For the map: the pin follows the settled fields, a click or drag writes them, and `areas` are the regions it shades. */
    position,
    pick,
    areas,
    drawerProps: {
      kind,
      register,
      errors,
      coverage,
      onUseMyLocation: location.locate,
      locationStatus: location.status,
      isSubmitting: mutation.isPending,
      serverError,
      onSubmit: handleSubmit(async (values) => {
        // Judged on what is being submitted, not on the settled display (which lags typing by a moment) — and, before refusing, on a fresh list of regions.
        const now = await coverageForSave(values.latitude, values.longitude)
        if (now.status === 'outside') {
          setError('latitude', { type: 'coverage', message: OUTSIDE_AREAS_MESSAGE }, { shouldFocus: true })
          return
        }
        const where = now.status === 'inside' ? ` It is in ${now.path}.` : ''
        const done = (name: string) => {
          setIsOpen(false)
          onNotice({ tone: 'success', text: `${name} was added.${where}` })
        }
        const fail = (error: unknown) => setServerError(extractErrorMessage(error))
        if (kind === 'infrastructure') mutations.addInfrastructure.mutate(toInfrastructureInput(values), { onSuccess: (item) => done(item.name), onError: fail })
        else mutations.addEssential.mutate(toEssentialInput(values), { onSuccess: (item) => done(item.name), onError: fail })
      }),
    },
  }
}
