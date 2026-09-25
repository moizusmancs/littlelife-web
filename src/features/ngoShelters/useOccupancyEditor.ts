import { useState } from 'react'
import { extractErrorMessage } from '@/api/errors'
import type { Shelter } from '@/api/facilities'
import type { PageNotice } from '@/components/ui/notice'
import { checkOccupancy, occupancyButtonId, type OccupancyDraft } from './shelterModel'
import { isShelterGone, useShelterMutations } from './useShelterMutations'

/** The editor is unmounting: put the keyboard back on the button that opened it, once that button is on screen again. */
const returnFocus = (shelterId: string) => requestAnimationFrame(() => document.getElementById(occupancyButtonId(shelterId))?.focus())

interface Draft {
  shelterId: string
  text: string
  error: string | null
}

/**
 * The "Update occupancy" editor's state, for whichever screen hosts it (the list opens one per row, one at a time; the detail page has
 * one). Holds what is typed and the server's last refusal, runs the save, and reports the outcome as a notice. A `404` (the shelter is
 * gone) closes the editor and says so; any other refusal stays in the editor so it can be corrected.
 */
export function useOccupancyEditor({ onNotice }: { onNotice: (notice: PageNotice) => void }) {
  const { occupancy } = useShelterMutations()
  const [draft, setDraft] = useState<Draft | null>(null)

  const view: OccupancyDraft | null = draft && { ...draft, isSaving: occupancy.isPending }

  return {
    draft: view,
    /** Opens the shelter's editor with its current number — or closes it if it is already the one open. */
    toggle: (shelter: Pick<Shelter, 'id' | 'capacity_current'>) => {
      occupancy.reset()
      setDraft((current) => (current?.shelterId === shelter.id ? null : { shelterId: shelter.id, text: String(shelter.capacity_current), error: null }))
    },
    setText: (text: string) => setDraft((current) => current && { ...current, text, error: null }),
    cancel: () => {
      if (draft) returnFocus(draft.shelterId)
      setDraft(null)
    },
    save: (shelter: Pick<Shelter, 'id' | 'name' | 'capacity_current' | 'capacity_total'>) => {
      if (!draft) return
      const check = checkOccupancy(draft.text, shelter)
      // The editor keeps Save disabled for these; this is the same rule, so a stray Enter can't send them.
      if (!check.ok || !check.changed) return
      occupancy.mutate(
        { id: shelter.id, value: check.value },
        {
          onSuccess: (updated) => {
            setDraft(null)
            returnFocus(updated.id)
            onNotice({ tone: 'success', text: `Occupancy at ${updated.name} is now ${updated.capacity_current.toLocaleString('en-US')} / ${updated.capacity_total.toLocaleString('en-US')}.` })
          },
          onError: (error) => {
            if (isShelterGone(error)) {
              setDraft(null)
              onNotice({ tone: 'caution', text: `${shelter.name} no longer exists, so its occupancy wasn't saved. The list has been refreshed.` })
            } else {
              setDraft((current) => current && { ...current, error: extractErrorMessage(error) })
            }
          },
        },
      )
    },
  }
}
