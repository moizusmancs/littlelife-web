import { Switch } from '@/components/ui/switch'
import type { Channel } from './alertPreferences'

export interface ChannelRowProps {
  channel: Channel
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

/** One delivery channel: what it is, and its switch (named by the channel and described by its line). Purely presentational. */
export function ChannelRow({ channel, checked, onCheckedChange }: ChannelRowProps) {
  const nameId = `channel-${channel.key}-name`
  const descriptionId = `channel-${channel.key}-description`
  return (
    <li className="flex items-center gap-3.5 py-3.5">
      <span className="flex size-10 flex-none items-center justify-center rounded-full bg-primary-50 text-primary-700" aria-hidden="true">
        <channel.icon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p id={nameId} className="font-body text-body-md font-semibold text-ink-900">
          {channel.label}
        </p>
        <p id={descriptionId} className="font-body text-body-sm text-ink-500">
          {channel.description}
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-labelledby={nameId} aria-describedby={descriptionId} />
    </li>
  )
}
