import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { extractErrorMessage } from '@/api/errors'
import { getShelter, shelterQueryKey, type Shelter } from '@/api/facilities'
import { ShelterCapacityCard } from '@/features/shelters/ShelterCapacityCard'
import { ShelterDetailState } from '@/features/shelters/ShelterDetailState'
import { ShelterFactsCard } from '@/features/shelters/ShelterFactsCard'
import { ShelterHeader } from '@/features/shelters/ShelterHeader'
import { ShelterLocation } from '@/features/shelters/ShelterLocation'

const noop = () => undefined

/**
 * Container for /app/map/shelters/:id. One public read, `GET /shelters/{id}`: the page, "not found" (a `404`, or a `400` for an id
 * that isn't a UUID) or a load error with retry. Once there is a shelter, `ShelterDetail` shows it.
 */
export function ShelterDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: shelterQueryKey(id), queryFn: () => getShelter(id) })

  if (query.isPending) return <ShelterDetailState kind="loading" onRetry={noop} />
  if (query.isError) {
    const code = isAxiosError(query.error) ? query.error.response?.status : undefined
    if (code === 404 || code === 400) return <ShelterDetailState kind="not-found" onRetry={noop} />
    return <ShelterDetailState kind="error" message={extractErrorMessage(query.error)} onRetry={() => void query.refetch()} />
  }
  return <ShelterDetail shelter={query.data} />
}

/** A loaded shelter: its header, capacity, details and — reusing the map's canvas — where it is, with any flood zones around it. */
function ShelterDetail({ shelter }: { shelter: Shelter }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-24 md:pb-0">
      <ShelterHeader shelter={shelter} />

      <div className="grid gap-5 lg:grid-cols-3 lg:grid-rows-[auto_1fr] lg:items-start">
        <div className="lg:col-start-3 lg:row-start-1">
          <ShelterCapacityCard shelter={shelter} />
        </div>
        <div className="lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <ShelterLocation shelter={shelter} />
        </div>
        <div className="lg:col-start-3 lg:row-start-2">
          <ShelterFactsCard shelter={shelter} />
        </div>
      </div>
    </div>
  )
}
