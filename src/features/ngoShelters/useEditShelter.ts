import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { extractErrorMessage } from '@/api/errors'
import type { Shelter } from '@/api/facilities'
import type { PageNotice } from '@/components/ui/notice'
import { shelterChanges, type EditShelterFormValues } from './shelterForm'
import { isShelterGone, useShelterMutations } from './useShelterMutations'

const valuesOf = (shelter: Shelter): EditShelterFormValues => ({ status: shelter.status, certification: shelter.certification_status })

/**
 * "Edit shelter": which shelter is open in the drawer, its two-field form, and the save. Only what changed is sent (an empty patch is
 * a `400`, and Save is disabled until something differs). A `404` closes the drawer and says the shelter is gone; any other refusal
 * stays in the drawer. Shared by the list and the detail page.
 */
export function useEditShelter({ onNotice }: { onNotice: (notice: PageNotice) => void }) {
  const { update } = useShelterMutations()
  const [target, setTarget] = useState<Shelter | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, reset, control } = useForm<EditShelterFormValues>({ defaultValues: { status: 'open', certification: 'pending' } })
  const values = useWatch({ control }) as EditShelterFormValues
  const changes = target ? shelterChanges(target, values) : {}
  const changed = Object.keys(changes).length > 0

  return {
    target,
    open: (shelter: Shelter) => {
      update.reset()
      reset(valuesOf(shelter))
      setServerError(null)
      setTarget(shelter)
    },
    close: () => setTarget(null),
    drawerProps: {
      register,
      changed,
      isSubmitting: update.isPending,
      serverError,
      onSubmit: handleSubmit((form) => {
        if (!target) return
        const patch = shelterChanges(target, form)
        if (Object.keys(patch).length === 0) return
        update.mutate(
          { id: target.id, changes: patch },
          {
            onSuccess: (updated) => {
              setTarget(null)
              onNotice({ tone: 'success', text: `${updated.name} was updated.` })
            },
            onError: (error) => {
              if (isShelterGone(error)) {
                setTarget(null)
                onNotice({ tone: 'caution', text: `${target.name} no longer exists, so nothing was saved. The list has been refreshed.` })
              } else {
                setServerError(extractErrorMessage(error))
              }
            },
          },
        )
      }),
    },
  }
}
