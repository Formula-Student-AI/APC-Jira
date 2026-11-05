// State and actions for the login screen, in both auth modes:
//   trust:      username -> (first time only) full name
//   email_code: username -> emailed 6-digit code -> (first time only) full name
// Signing in succeeds inside claimMember (the auth store switches the app to the board).

import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { AUTH_MODE, emailFor } from '../config'
import { claimMember, errorText, LoginError, sendEmailCode, verifyEmailCode } from '../store/auth'
import { cleanCodeInput, cleanUsernameInput } from './inputs'

export type LoginStep = 'username' | 'code' | 'name'

/** What is running: the step's main button, or "Resend code". */
export type LoginBusy = 'submit' | 'resend' | null

function stepAfterClaim(status: 'ok' | 'needs_name'): LoginStep | undefined {
  return status === 'needs_name' ? 'name' : undefined
}

export function useLoginFlow() {
  const [step, setStep] = useState<LoginStep>('username')
  const [username, setUsernameValue] = useState('')
  const [code, setCodeValue] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState<LoginBusy>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Username whose emailed code was accepted, so a failed claim can be retried without a new code.
  const [verifiedFor, setVerifiedFor] = useState<string | null>(null)
  // The current step's main input: focus goes back there after an error.
  const mainInputRef = useRef<HTMLInputElement>(null)

  /** Run one action: disable the form, then show the next step or the error and refocus the input. */
  async function run(kind: Exclude<LoginBusy, null>, task: () => Promise<LoginStep | undefined>): Promise<void> {
    if (busy) return
    setBusy(kind)
    setError(null)
    setNotice(null)
    let next: LoginStep | undefined
    let failure: string | null = null
    try {
      next = await task()
    } catch (err) {
      failure = errorText(err)
    }
    // Re-enable the inputs before moving focus back into them. (After a successful sign-in the
    // screen has already unmounted and this does nothing.)
    flushSync(() => {
      setBusy(null)
      if (next) setStep(next)
      if (failure) setError(failure)
    })
    mainInputRef.current?.focus()
  }

  function submitUsername(): Promise<void> {
    if (AUTH_MODE === 'email_code') {
      return run('submit', async () => {
        await sendEmailCode(username)
        setCodeValue('')
        setVerifiedFor(null)
        return 'code'
      })
    }
    return run('submit', async () => stepAfterClaim((await claimMember(username)).status))
  }

  function submitCode(): Promise<void> {
    return run('submit', async () => {
      if (verifiedFor !== username) {
        await verifyEmailCode(username, code)
        setVerifiedFor(username)
      }
      return stepAfterClaim((await claimMember(username)).status)
    })
  }

  function submitName(): Promise<void> {
    return run('submit', async () => {
      if (!fullName.trim()) throw new LoginError('Enter your full name.')
      const result = await claimMember(username, fullName)
      if (result.status === 'needs_name') throw new LoginError('Enter your full name.')
      return undefined
    })
  }

  /** The current step's main button (or Enter in its input). */
  function submit(): void {
    if (step === 'username') void submitUsername()
    else if (step === 'code') void submitCode()
    else void submitName()
  }

  /** email_code mode: send a fresh code to the same address. */
  function resendCode(): void {
    void run('resend', async () => {
      await sendEmailCode(username)
      setCodeValue('')
      setVerifiedFor(null)
      setNotice(`We sent a new code to ${emailFor(username)}.`)
      return undefined
    })
  }

  /** Back to the username step, keeping what was typed so a typo is easy to fix. */
  function changeUsername(): void {
    if (busy) return
    flushSync(() => {
      setStep('username')
      setCodeValue('')
      setFullName('')
      setVerifiedFor(null)
      setError(null)
      setNotice(null)
    })
    mainInputRef.current?.focus()
  }

  return {
    mode: AUTH_MODE,
    step,
    username,
    setUsername: (value: string) => setUsernameValue(cleanUsernameInput(value)),
    code,
    setCode: (value: string) => setCodeValue(cleanCodeInput(value)),
    fullName,
    setFullName,
    busy,
    error,
    notice,
    mainInputRef,
    submit,
    resendCode,
    changeUsername,
  }
}
