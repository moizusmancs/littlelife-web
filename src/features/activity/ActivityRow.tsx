import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { timeOfDay, type ActivityView } from './activityModel'

export interface ActivityRowProps {
  item: ActivityView
}

/**
 * One thing the account did: an icon for its kind, the sentence (a link when the thing it was about has a screen — see
 * `describeActivity`), any status pills under it, and the time. Purely presentational.
 */
export function ActivityRow({ item }: ActivityRowProps) {
  return (
    <li className="flex items-start gap-3.5 py-3.5">
      <span className="flex size-10 flex-none items-center justify-center rounded-full bg-primary-50 text-primary-700" aria-hidden="true">
        <item.icon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-body text-body-md font-semibold [overflow-wrap:anywhere] text-ink-900">
          {item.link ? (
            <Link to={item.link} className="rounded-sm text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500">
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </p>
        {item.badges.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {item.badges.map((badge) => (
              <Badge key={badge.text} tone={badge.tone}>
                {badge.text}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <time dateTime={item.occurredAt} className="flex-none pt-0.5 font-body text-body-sm text-ink-500">
        {timeOfDay(item.occurredAt)}
      </time>
    </li>
  )
}
