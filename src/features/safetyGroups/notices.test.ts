import { describe, expect, it } from 'vitest'
import { connected, declined, incoming, ME, outgoing } from './fixtures'
import { actionNotice, requestSentNotice } from './notices'

describe('actionNotice', () => {
  it('confirms an accept and a decline with the person by name', () => {
    expect(actionNotice('accept', incoming(), ME)).toBe("You're now connected to Amna Khan.")
    expect(actionNotice('decline', incoming(), ME)).toBe('You declined the request from Amna Khan.')
  })

  it('words a removal by what was removed', () => {
    expect(actionNotice('remove', connected(), ME)).toBe('Amna Khan was removed from your safety groups.')
    expect(actionNotice('remove', outgoing(), ME)).toBe('Your request to Member 8D0D395C was cancelled.')
    expect(actionNotice('remove', declined(), ME)).toBe('The request with Member 8D0D395C was removed.')
  })

  it('names someone you invited by the email you typed once it is on the row', () => {
    expect(actionNotice('remove', { ...outgoing(), recipient_email: 'amna@example.com' }, ME)).toBe('Your request to amna@example.com was cancelled.')
  })
})

describe('requestSentNotice', () => {
  it('says who it went to and what happens next', () => {
    expect(requestSentNotice('amna@example.com')).toBe("Request sent to amna@example.com. You'll be connected once they accept it.")
    expect(requestSentNotice('Member 8D0D395C')).toBe("Request sent to Member 8D0D395C. You'll be connected once they accept it.")
  })
})
