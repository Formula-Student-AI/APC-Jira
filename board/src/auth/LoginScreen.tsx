// The login screen: university username (plus an emailed code in email_code mode), and the member's
// full name the first time they sign in. No passwords.

import { AlertIcon, PersonAddIcon } from '@primer/octicons-react'
import { useId, useState, type Ref } from 'react'
import { APP_NAME, EMAIL_DOMAIN, emailFor, ORG_NAME, PLAN_LABEL, type AuthMode } from '../config'
import { bootstrapAuth, useAuth } from '../store/auth'
import './login.css'
import { useLoginFlow, type LoginStep } from './useLoginFlow'

export function LoginScreen() {
  const flow = useLoginFlow()
  const { mode, step, busy, error } = flow
  const errorId = useId()
  const disabled = busy !== null
  // The error belongs to the input of the current step.
  const fieldErrorId = error ? errorId : undefined

  return (
    <div className="login-page">
      <main className="login-main">
        <header className="login-header">
          <img
            className="login-logo-img"
            src={`${import.meta.env.BASE_URL}logo-login.png`}
            alt={ORG_NAME}
            width={213}
            height={120}
          />
          <h1 className="login-title">{APP_NAME}</h1>
          <p className="login-subtitle">{PLAN_LABEL}</p>
        </header>

        <StartupProblem />

        <form
          className="login-card"
          noValidate
          aria-busy={disabled}
          onSubmit={(event) => {
            event.preventDefault()
            flow.submit()
          }}
        >
          {step !== 'code' && (
            <UsernameField
              value={flow.username}
              onChange={flow.setUsername}
              readOnly={step === 'name'}
              disabled={disabled}
              inputRef={step === 'username' ? flow.mainInputRef : undefined}
              errorId={step === 'username' ? fieldErrorId : undefined}
            />
          )}

          {step === 'code' && (
            <CodeField
              email={emailFor(flow.username)}
              value={flow.code}
              onChange={flow.setCode}
              disabled={disabled}
              inputRef={flow.mainInputRef}
              errorId={fieldErrorId}
            />
          )}

          {step === 'name' && (
            <NameField
              value={flow.fullName}
              onChange={flow.setFullName}
              disabled={disabled}
              inputRef={flow.mainInputRef}
              errorId={fieldErrorId}
            />
          )}

          {error && (
            <p id={errorId} className="field-error login-error" role="alert">
              <AlertIcon size={16} />
              <span>{error}</span>
            </p>
          )}
          <p className="login-notice" role="status">
            {flow.notice}
          </p>

          <button type="submit" className="btn btn-primary login-submit" disabled={disabled}>
            {busy === 'submit' && <span className="spinner" aria-hidden="true" />}
            {submitLabel(mode, step, busy === 'submit')}
          </button>

          {step === 'code' && (
            <div className="login-alt">
              <button type="button" className="login-link" onClick={flow.resendCode} disabled={disabled}>
                {busy === 'resend' ? 'Sending…' : 'Resend code'}
              </button>
              <span aria-hidden="true">·</span>
              <button type="button" className="login-link" onClick={flow.changeUsername} disabled={disabled}>
                Use a different username
              </button>
            </div>
          )}

          {step === 'name' && (
            <p className="login-alt">
              Not you?
              <button type="button" className="login-link" onClick={flow.changeUsername} disabled={disabled}>
                Use a different username
              </button>
            </p>
          )}
        </form>

        <p className="login-footnote">
          {mode === 'trust'
            ? 'No password needed. Anything you change is recorded under this username.'
            : 'No password needed: we email a one-time code to your university address.'}
        </p>
      </main>
    </div>
  )
}

function submitLabel(mode: AuthMode, step: LoginStep, busy: boolean): string {
  if (step === 'name') return busy ? 'Joining…' : 'Join the board'
  if (step === 'code') return busy ? 'Signing in…' : 'Sign in'
  if (mode === 'email_code') return busy ? 'Sending code…' : 'Email me a code'
  return busy ? 'Signing in…' : 'Continue'
}

/** Start-up problem (e.g. Supabase unreachable), with a retry. */
function StartupProblem() {
  const error = useAuth((s) => s.error)
  const [retrying, setRetrying] = useState(false)
  if (!error) return null

  async function retry() {
    setRetrying(true)
    try {
      await bootstrapAuth()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="login-banner" role="alert">
      <AlertIcon size={16} className="login-banner-icon" />
      <p className="login-banner-text">{error}</p>
      <button type="button" className="btn btn-sm login-banner-button" onClick={() => void retry()} disabled={retrying}>
        {retrying && <span className="spinner" aria-hidden="true" />}
        Try again
      </button>
    </div>
  )
}

interface FieldProps {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  inputRef?: Ref<HTMLInputElement>
  /** Id of the error message, when there is one for this field */
  errorId?: string
}

/** Joins aria-describedby ids, skipping missing ones. */
function ids(...values: (string | undefined)[]): string | undefined {
  const joined = values.filter(Boolean).join(' ')
  return joined || undefined
}

function UsernameField({ value, onChange, disabled, inputRef, errorId, readOnly }: FieldProps & { readOnly: boolean }) {
  const id = useId()
  const suffixId = `${id}-suffix`
  return (
    <div className="login-field">
      <label className="field-label" htmlFor={id}>
        University username
      </label>
      <div className={`login-input-group${readOnly ? ' login-input-group-readonly' : ''}`}>
        <input
          ref={inputRef}
          id={id}
          className="input login-input"
          type="text"
          name="username"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="e.g. xy12345"
          autoFocus={!readOnly}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={64}
          readOnly={readOnly}
          disabled={disabled}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={ids(suffixId, errorId)}
        />
        <span id={suffixId} className="login-suffix">
          @{EMAIL_DOMAIN}
        </span>
      </div>
    </div>
  )
}

function CodeField({ email, value, onChange, disabled, inputRef, errorId }: FieldProps & { email: string }) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <>
      <div id={hintId} className="login-step-text">
        <p>
          Enter the 6-digit code we sent to <strong className="login-email">{email}</strong>
        </p>
        <p className="muted">It can take a minute to arrive. Check your junk folder too.</p>
      </div>
      <div className="login-field">
        <label className="field-label" htmlFor={id}>
          Code
        </label>
        <input
          ref={inputRef}
          id={id}
          className="input login-input login-code"
          type="text"
          name="code"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="000000"
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          enterKeyHint="go"
          maxLength={6}
          disabled={disabled}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={ids(hintId, errorId)}
        />
      </div>
    </>
  )
}

function NameField({ value, onChange, disabled, inputRef, errorId }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <>
      <p id={hintId} className="login-callout">
        <PersonAddIcon size={16} />
        <span>First time here? Add your full name so the team knows who you are.</span>
      </p>
      <div className="login-field">
        <label className="field-label" htmlFor={id}>
          Full name
        </label>
        <input
          ref={inputRef}
          id={id}
          className="input login-input"
          type="text"
          name="name"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="First and last name"
          autoFocus
          autoComplete="name"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={100}
          disabled={disabled}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={ids(hintId, errorId)}
        />
      </div>
    </>
  )
}
