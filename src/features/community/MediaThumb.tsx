import { useState } from 'react'
import { ImageBrokenIcon, VideoCameraIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { mediaPreview } from './feedModel'
import type { MediaState } from './useCommunityFeed'

const frame = 'relative flex-none overflow-hidden rounded-md bg-surface-sunken h-40 w-full sm:h-24 sm:w-[150px]'

/**
 * A report card's picture: the newest photo (or, failing that, a video tile — nothing is downloaded or played in a list), with "+N" when
 * there is more. A skeleton while the media list loads; nothing at all for a report with none or whose media list couldn't be read (the
 * card is still useful without it); a plain tile if the image itself won't load. Presentational apart from remembering that one failure.
 */
export function MediaThumb({ state }: { state: MediaState }) {
  const [broken, setBroken] = useState(false)

  if (state.status === 'pending') return <div className={cn(frame, 'animate-pulse')} aria-hidden="true" />
  if (state.status === 'error') return null
  const { preview, count } = mediaPreview(state.media)
  if (!preview) return null
  const more = count > 1 ? <span className="absolute right-1.5 bottom-1.5 rounded-full bg-ink-900/75 px-2 py-0.5 font-body text-[11px] font-semibold text-white">+{count - 1}</span> : null

  if (preview.media_type === 'video' || broken) {
    const Icon = preview.media_type === 'video' ? VideoCameraIcon : ImageBrokenIcon
    const text = preview.media_type === 'video' ? 'Video' : "Photo couldn't be shown"
    return (
      // A tile with nothing to look at stays short on a phone instead of taking the photo's full height.
      <div className={cn(frame, 'flex h-20 flex-col items-center justify-center gap-1 text-ink-500 sm:h-24')}>
        <Icon size={22} aria-hidden="true" />
        <span className="px-2 text-center font-body text-body-sm">{text}</span>
        {more}
      </div>
    )
  }

  return (
    <div className={frame}>
      <img src={preview.media_url} alt="Photo attached to this report" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      {more}
    </div>
  )
}
