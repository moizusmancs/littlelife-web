import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { extractErrorMessage } from '@/api/errors'
import type { PageNotice } from '@/components/ui/notice'
import { OUTSIDE_AREAS_MESSAGE, pointWriter } from '@/features/map/pointForm'
import { usePointPicker } from '@/features/map/usePointPicker'
import { EMPTY_SHELTER_FORM, registerShelterSchema, toRegisterInput, type RegisterShelterFormValues } from './shelterForm'
import { useShelterMutations } from './useShelterMutations'

/**
 * "Register a shelter": whether the drawer is open, its form, the point on the map (which follows the typed coordinates and vice
 * versa), whether that point is inside a region, and the save — which **refuses a point outside every region** (the API would take it, and then no
 * one could ever see the shelter). Opening resets the form. The browser's position is asked for only when "Use my location" is pressed. The regions
 * are fetched only while the drawer is open, and the pin and region note follow the typed coordinates after a short pause so they don't chase every keystroke.
 */
export function useRegisterShelter({ onNotice }: { onNotice: (notice: PageNotice) => void }) {
  const { register: registerMutation } = useShelterMutations()
  const [isOpen, setIsOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    control,
    formState: { errors },
  } = useForm<RegisterShelterFormValues>({ resolver: zodResolver(registerShelterSchema), defaultValues: EMPTY_SHELTER_FORM })

  const [latitude, longitude] = useWatch({ control, name: ['latitude', 'longitude'] })
  /** A pin placed or moved on the map, or a fix from the browser: written into the two fields, the form's source of truth. */
  const pick = useMemo(() => pointWriter(setValue), [setValue])
  const { position, areas, coverage, coverageForSave, location } = usePointPicker({ latitude, longitude, onPick: pick, enabled: isOpen })

  return {
    isOpen,
    open: () => {
      registerMutation.reset()
      reset(EMPTY_SHELTER_FORM)
      setServerError(null)
      setIsOpen(true)
    },
    close: () => setIsOpen(false),
    /** For the map: the pin follows the settled fields, a click or drag writes them, and `areas` are the regions it shades. */
    position,
    pick,
    areas,
    drawerProps: {
      register,
      errors,
      coverage,
      onUseMyLocation: location.locate,
      locationStatus: location.status,
      isSubmitting: registerMutation.isPending,
      serverError,
      onSubmit: handleSubmit(async (values) => {
        // A shelter outside every region is saved but never shown to anyone, so it isn't saved. Judged on what is being submitted, not on the settled display (which lags typing),
        // and on a fresh list of regions (one may have been added since this one was fetched).
        if ((await coverageForSave(values.latitude, values.longitude)).status === 'outside') {
          setError('latitude', { type: 'coverage', message: OUTSIDE_AREAS_MESSAGE }, { shouldFocus: true })
          return
        }
        registerMutation.mutate(toRegisterInput(values), {
          onSuccess: (shelter) => {
            setIsOpen(false)
            onNotice({ tone: 'success', text: `${shelter.name} is registered. It starts open, with nobody in it, and pending certification.` })
          },
          onError: (error) => setServerError(extractErrorMessage(error)),
        })
      }),
    },
  }
}
