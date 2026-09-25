import type { Icon } from '@phosphor-icons/react'
import { BellRingingIcon, ChatTextIcon, PhoneCallIcon, WhatsappLogoIcon } from '@phosphor-icons/react'
import type { AlertPreferences, AlertSeverity } from '@/api/profiling'

export type ChannelKey = 'push_enabled' | 'sms_enabled' | 'whatsapp_enabled' | 'voice_call_enabled'

export interface Channel {
  key: ChannelKey
  label: string
  description: string
  icon: Icon
  /** Sent to a phone number — which the account doesn't have (nothing in the API stores one). */
  needsPhone: boolean
}

/** The four delivery channels the API has, in the mockup's order. */
export const CHANNELS: Channel[] = [
  { key: 'push_enabled', label: 'Push notifications', description: 'Notifications from LittleLife on your devices.', icon: BellRingingIcon, needsPhone: false },
  { key: 'sms_enabled', label: 'SMS', description: 'Text messages to your phone.', icon: ChatTextIcon, needsPhone: true },
  { key: 'whatsapp_enabled', label: 'WhatsApp', description: 'Messages on WhatsApp.', icon: WhatsappLogoIcon, needsPhone: true },
  { key: 'voice_call_enabled', label: 'Voice calls', description: 'An automated phone call.', icon: PhoneCallIcon, needsPhone: true },
]

export interface SeverityOption {
  value: AlertSeverity
  label: string
  description: string
}

/**
 * The four severities, lowest to highest, in the backend's own names (the mockup calls them Safe / Caution / High /
 * Critical; the API's `general_advisory` / `watch` / `warning` / `critical_emergency` are what's stored). The setting is a
 * *minimum*: choosing one lets that severity and everything above it through, so a critical emergency always does.
 */
export const SEVERITIES: SeverityOption[] = [
  { value: 'general_advisory', label: 'General advisory', description: 'Everything: advisories, watches, warnings and critical emergencies. This is the default.' },
  { value: 'watch', label: 'Watch', description: 'Watches, warnings and critical emergencies.' },
  { value: 'warning', label: 'Warning', description: 'Warnings and critical emergencies.' },
  { value: 'critical_emergency', label: 'Critical emergency', description: 'Only critical emergencies.' },
]

export interface LanguageOption {
  value: string
  label: string
}

/** The languages alerts go out in (the mockup: "Urdu, Sindhi or English"); the codes are the ones the accounts in the database hold. */
export const LANGUAGES: LanguageOption[] = [
  { value: 'en', label: 'English' },
  { value: 'ur', label: 'اردو (Urdu)' },
  { value: 'sd', label: 'سنڌي (Sindhi)' },
]

/**
 * The options for the language select. The API stores any non-blank text, so an account whose value isn't one of the
 * three is shown with that value as an extra option rather than a select that claims to be on something it isn't.
 */
export function languageOptions(current: string): LanguageOption[] {
  return LANGUAGES.some((l) => l.value === current) ? LANGUAGES : [...LANGUAGES, { value: current, label: current }]
}

export type SaveStatus = 'idle' | 'saving' | 'saved'

/** The current value of a channel's switch. */
export const channelOn = (prefs: AlertPreferences, key: ChannelKey) => prefs[key]
