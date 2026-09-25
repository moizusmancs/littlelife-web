import { useState } from 'react'
import { isAxiosError } from 'axios'
import { extractErrorMessage } from '@/api/errors'
import type { Infrastructure, InfrastructureStatus } from '@/api/facilities'
import type { PageNotice } from '@/components/ui/notice'
import { INFRA_STATUS_LABEL } from './facilityModel'
import { useFacilityMutations } from './useFacilityData'

/**
 * The "Update status" dialog's state: which item, the chosen status, the save and how it ended. The choice starts on the current status (so saving without changing it is
 * a deliberate "confirm", not an accident), a `404` closes the dialog with a notice that the item is gone (its list has been refreshed), and any other refusal stays in the dialog.
 */
export function useInfrastructureStatus({ onNotice }: { onNotice: (notice: PageNotice) => void }) {
  const { setInfrastructureStatus } = useFacilityMutations()
  const [target, setTarget] = useState<Infrastructure | null>(null)
  const [status, setStatus] = useState<InfrastructureStatus>('safe')
  const [error, setError] = useState<string | null>(null)

  return {
    target,
    status,
    setStatus,
    error,
    isSaving: setInfrastructureStatus.isPending,
    open: (item: Infrastructure) => {
      setInfrastructureStatus.reset()
      setError(null)
      setStatus(item.status)
      setTarget(item)
    },
    close: () => setTarget(null),
    save: () => {
      if (!target) return
      const item = target
      setInfrastructureStatus.mutate(
        { id: item.id, status },
        {
          onSuccess: (updated) => {
            setTarget(null)
            onNotice({
              tone: 'success',
              text: updated.status === item.status ? `${updated.name} was confirmed as ${INFRA_STATUS_LABEL[updated.status].toLowerCase()}.` : `${updated.name} is now ${INFRA_STATUS_LABEL[updated.status].toLowerCase()}.`,
            })
          },
          onError: (failure) => {
            if (isAxiosError(failure) && failure.response?.status === 404) {
              setTarget(null)
              onNotice({ tone: 'caution', text: `${item.name} no longer exists, so its status wasn't changed. The list has been refreshed.` })
            } else {
              setError(extractErrorMessage(failure))
            }
          },
        },
      )
    },
  }
}
