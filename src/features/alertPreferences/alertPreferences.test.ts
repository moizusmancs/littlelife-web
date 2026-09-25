import { describe, expect, it } from 'vitest'
import { CHANNELS, LANGUAGES, languageOptions, SEVERITIES } from './alertPreferences'

describe('the option lists', () => {
  it('has the four channels the API has, and marks the three that need a phone number', () => {
    expect(CHANNELS.map((c) => c.key)).toEqual(['push_enabled', 'sms_enabled', 'whatsapp_enabled', 'voice_call_enabled'])
    expect(CHANNELS.filter((c) => c.needsPhone).map((c) => c.key)).toEqual(['sms_enabled', 'whatsapp_enabled', 'voice_call_enabled'])
  })

  it("has the four severities in the backend's own words, lowest to highest", () => {
    expect(SEVERITIES.map((s) => s.value)).toEqual(['general_advisory', 'watch', 'warning', 'critical_emergency'])
  })
})

describe('languageOptions', () => {
  it('is the three known languages when the account is on one of them', () => {
    expect(languageOptions('sd')).toBe(LANGUAGES)
  })

  it("adds the account's own value rather than showing a select that claims to be on something it isn't", () => {
    const options = languageOptions('fr')
    expect(options.map((o) => o.value)).toEqual(['en', 'ur', 'sd', 'fr'])
    expect(options[3].label).toBe('fr')
  })
})
