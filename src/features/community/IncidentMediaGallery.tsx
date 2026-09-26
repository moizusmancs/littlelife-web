import { useState } from 'react'
import { ArrowSquareOutIcon, ImageBrokenIcon, VideoCameraSlashIcon } from '@phosphor-icons/react'
import type { IncidentMedia } from '@/api/community'
import { Button } from '@/components/ui/button'
import type { MediaState } from './useCommunityFeed'

/**
 * Every photo and video on a report, newest first as the API returns them. A photo opens full size in a new tab; a video plays in place
 * (`preload="metadata"` — only its first frame is fetched until played). Anything that won't load becomes a plain tile with a link to open it
 * directly, so one broken file never takes the gallery down. A skeleton while the list loads, a failure with a retry, and a sentence for none.
 * Presentational apart from remembering which files failed.
 */
export function IncidentMediaGallery({ state, onRetry }: { state: MediaState; onRetry: () => void }) {
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set())
  const fail = (id: string) => setBroken((previous) => new Set(previous).add(id))
  const count = state.status === 'success' ? state.media.length : null

  return (
    <section aria-labelledby="incident-media" className="flex flex-col gap-3 rounded-md border border-surface-border bg-surface-raised p-5 shadow-sm">
      <h2 id="incident-media" className="font-heading text-h3 font-bold text-ink-900">
        Photos and videos{count ? <span className="font-body text-body-md font-normal text-ink-500"> · {count}</span> : null}
      </h2>
      {state.status === 'pending' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading photos and videos">
          {[0, 1].map((i) => (
            <div key={i} className="aspect-video animate-pulse rounded-md bg-surface-sunken" aria-hidden="true" />
          ))}
        </div>
      ) : state.status === 'error' ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-status-critical bg-status-critical-tint px-3.5 py-3 font-body text-body-sm text-ink-900">
          <span className="min-w-0 flex-1">Couldn't load this report's photos and videos.</span>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : state.media.length === 0 ? (
        <p className="font-body text-body-md text-ink-500">No photos or videos are attached to this report.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {state.media.map((item, index) => (
            <li key={item.id}>{broken.has(item.id) ? <BrokenTile item={item} /> : <MediaItem item={item} index={index + 1} onError={() => fail(item.id)} />}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function MediaItem({ item, index, onError }: { item: IncidentMedia; index: number; onError: () => void }) {
  if (item.media_type === 'video') {
    return (
      <video src={item.media_url} controls preload="metadata" onError={onError} aria-label={`Video ${index} from this report`} className="aspect-video w-full rounded-md bg-ink-900 object-contain">
        <a href={item.media_url}>Open the video</a>
      </video>
    )
  }
  return (
    <a href={item.media_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md bg-surface-sunken">
      <img src={item.media_url} alt={`Photo ${index} from this report (opens full size in a new tab)`} loading="lazy" onError={onError} className="aspect-video w-full object-cover" />
    </a>
  )
}

function BrokenTile({ item }: { item: IncidentMedia }) {
  const video = item.media_type === 'video'
  const Icon = video ? VideoCameraSlashIcon : ImageBrokenIcon
  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-md bg-surface-sunken p-3 text-center text-ink-500">
      <Icon size={24} aria-hidden="true" />
      <span className="font-body text-body-sm">{video ? "This video can't be played here." : "This photo can't be shown here."}</span>
      <a href={item.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-body text-body-sm font-semibold text-primary-700 hover:underline">
        Open it directly
        <ArrowSquareOutIcon size={14} aria-hidden="true" />
      </a>
    </div>
  )
}
