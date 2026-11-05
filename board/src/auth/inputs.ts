// Clean up what is typed into the login inputs, keystroke by keystroke.

/** Lowercase, drop spaces and anything from "@" on (the domain is shown as a fixed suffix). */
export function cleanUsernameInput(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').replace(/@.*$/, '')
}

/** Digits only, at most 6. */
export function cleanCodeInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}
