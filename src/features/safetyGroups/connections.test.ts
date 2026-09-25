import { describe, expect, it } from 'vitest'
import { AMNA, BILAL, connected, declined, incoming, link, ME, outgoing } from './fixtures'
import {
  groupConnections,
  incomingCount,
  MEMBER_ID_PATTERN,
  otherParty,
  partyLabel,
  personLabel,
  removeTargetOf,
  sentByMe,
  shortId,
  standingOf,
} from './connections'

describe('standingOf', () => {
  it('reads direction from the two account ids — the backend never labels it', () => {
    expect(standingOf(outgoing(), ME)).toBe('outgoing')
    expect(standingOf(incoming(), ME)).toBe('incoming')
  })

  it('treats accepted as connected and declined as declined whichever side sent it', () => {
    expect(standingOf(connected(), ME)).toBe('connected')
    expect(standingOf(link(AMNA, ME, 'accepted'), ME)).toBe('connected')
    expect(standingOf(declined(), ME)).toBe('declined')
  })

  it('is the same connection seen from the other side: their outgoing is your incoming', () => {
    expect(standingOf(outgoing(), AMNA)).toBe('incoming')
  })
})

describe('otherParty / sentByMe', () => {
  it('picks the account that is not you, with the name and email the server sent for it', () => {
    expect(otherParty(incoming(), ME)).toEqual({ accountId: AMNA, name: 'Amna Khan', email: 'amna@example.com' })
    expect(otherParty(connected(), ME)).toEqual({ accountId: AMNA, name: 'Amna Khan', email: 'amna@example.com' })
    expect(sentByMe(outgoing(), ME)).toBe(true)
    expect(sentByMe(incoming(), ME)).toBe(false)
  })

  it('has nothing to show for someone you asked who has not accepted — the server keeps their details from you', () => {
    expect(otherParty(outgoing(), ME)).toEqual({ accountId: AMNA, name: '', email: '' })
    expect(otherParty(declined(), ME)).toEqual({ accountId: AMNA, name: '', email: '' })
  })
})

describe('partyLabel / personLabel', () => {
  it('prefers the name, then the email, then "Member" and the start of the account id', () => {
    expect(partyLabel({ accountId: AMNA, name: 'Amna Khan', email: 'amna@example.com' })).toBe('Amna Khan')
    expect(partyLabel({ accountId: AMNA, name: '', email: 'amna@example.com' })).toBe('amna@example.com')
    expect(partyLabel({ accountId: AMNA, name: '', email: '' })).toBe('Member 8D0D395C')
  })

  it('treats a whitespace-only name as no name', () => {
    expect(partyLabel({ accountId: AMNA, name: '   ', email: 'amna@example.com' })).toBe('amna@example.com')
  })

  it('reads a connection from your side: a request you sent shows the fallback, the rest show the person', () => {
    expect(personLabel(incoming(), ME)).toBe('Amna Khan')
    expect(personLabel(connected(), ME)).toBe('Amna Khan')
    expect(personLabel(outgoing(), ME)).toBe('Member 8D0D395C')
    expect(personLabel(declined(), ME)).toBe('Member 8D0D395C')
  })

  it('shortens the account id to its first eight characters, uppercased', () => {
    expect(shortId(ME)).toBe('3165DFBC')
  })
})

describe('groupConnections', () => {
  it('sorts each connection into its section and keeps the server order inside each', () => {
    const list = [
      incoming({ id: 'in-1' }),
      connected({ id: 'ok-1' }),
      link(ME, BILAL, 'pending', { id: 'out-1' }),
      declined({ id: 'no-1' }),
      incoming({ id: 'in-2' }),
    ]

    const groups = groupConnections(list, ME)

    expect(groups.incoming.map((c) => c.id)).toEqual(['in-1', 'in-2'])
    expect(groups.connected.map((c) => c.id)).toEqual(['ok-1'])
    expect(groups.outgoing.map((c) => c.id)).toEqual(['out-1'])
    expect(groups.declined.map((c) => c.id)).toEqual(['no-1'])
  })

  it('returns four empty sections for an empty list', () => {
    expect(groupConnections([], ME)).toEqual({ incoming: [], connected: [], outgoing: [], declined: [] })
  })
})

describe('incomingCount', () => {
  it('counts only pending requests sent to you — not ones you sent, nor answered ones', () => {
    expect(incomingCount([incoming(), incoming({ id: 'x' }), outgoing(), connected(), declined()], ME)).toBe(2)
    expect(incomingCount([], ME)).toBe(0)
  })
})

describe('removeTargetOf', () => {
  it('describes what is being removed, with who it is with', () => {
    expect(removeTargetOf(connected(), ME)).toEqual({ standing: 'connected', label: 'Amna Khan' })
    expect(removeTargetOf(outgoing(), ME)).toEqual({ standing: 'outgoing', label: 'Member 8D0D395C' })
    expect(removeTargetOf(declined(), ME)).toEqual({ standing: 'declined', label: 'Member 8D0D395C' })
  })

  it('is null for a request waiting on you — that one is accepted or declined, not removed', () => {
    expect(removeTargetOf(incoming(), ME)).toBeNull()
  })
})

describe('MEMBER_ID_PATTERN', () => {
  it('accepts a UUID in either case and rejects anything else', () => {
    expect(MEMBER_ID_PATTERN.test(ME)).toBe(true)
    expect(MEMBER_ID_PATTERN.test(ME.toUpperCase())).toBe(true)
    expect(MEMBER_ID_PATTERN.test('3165dfbc')).toBe(false)
    expect(MEMBER_ID_PATTERN.test(`${ME}x`)).toBe(false)
    expect(MEMBER_ID_PATTERN.test('')).toBe(false)
  })
})
