import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AMNA, connected, declined, incoming, link, ME, outgoing } from './fixtures'
import { readInviteHints, rememberInvite, withInviteHints } from './inviteHints'

describe('invite hints', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('remembers the email typed for a connection, per account', () => {
    rememberInvite(ME, 'c-out', 'amna@example.com')

    expect(readInviteHints(ME)).toEqual({ 'c-out': 'amna@example.com' })
    expect(readInviteHints(AMNA)).toEqual({}) // another account on this browser sees nothing
  })

  it('puts the typed email back on a request you sent that the server gave no recipient for', () => {
    rememberInvite(ME, 'c-out', 'amna@example.com')

    const [row] = withInviteHints([outgoing()], ME)

    expect(row.recipient_email).toBe('amna@example.com')
    expect(row.recipient_name).toBe('')
  })

  it('does the same for a declined request — the server still shows the requester nothing', () => {
    rememberInvite(ME, 'c-no', 'amna@example.com')
    expect(withInviteHints([declined()], ME)[0].recipient_email).toBe('amna@example.com')
  })

  it("never overrides what the server did send: an accepted connection keeps the real name and email", () => {
    rememberInvite(ME, 'c-ok', 'old-typo@example.com')

    const [row] = withInviteHints([connected()], ME)

    expect(row.recipient_email).toBe('amna@example.com')
    expect(row.recipient_name).toBe('Amna Khan')
  })

  it('leaves requests sent to you, and ones with no hint, exactly as they came', () => {
    rememberInvite(ME, 'c-in', 'whoever@example.com')
    const list = [incoming(), outgoing({ id: 'no-hint' })]

    expect(withInviteHints(list, ME)).toEqual(list)
  })

  it('ignores a hint for a connection that is not yours to have sent', () => {
    rememberInvite(ME, 'x', 'a@example.com')
    const theirs = link(AMNA, ME, 'pending', { id: 'x' })
    expect(withInviteHints([theirs], ME)[0]).toEqual(theirs)
  })

  it('keeps only the newest hundred', () => {
    for (let i = 0; i < 105; i++) rememberInvite(ME, `c-${i}`, `p${i}@example.com`)

    const hints = readInviteHints(ME)
    expect(Object.keys(hints)).toHaveLength(100)
    expect(hints['c-0']).toBeUndefined()
    expect(hints['c-104']).toBe('p104@example.com')
  })

  it('reads garbage in storage as no hints', () => {
    localStorage.setItem(`ll:safety-invites:${ME}`, '{not json')
    expect(readInviteHints(ME)).toEqual({})
    localStorage.setItem(`ll:safety-invites:${ME}`, '[1,2]')
    expect(readInviteHints(ME)).toEqual({})
  })

  it('carries on without hints when storage is blocked, rather than throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => rememberInvite(ME, 'c-out', 'amna@example.com')).not.toThrow()
    expect(withInviteHints([outgoing()], ME)[0].recipient_email).toBe('')
  })
})
