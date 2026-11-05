// A row of subteam buttons ("All", then each subteam in its colour) above the Subteam Board and Timeline.

import { CheckIcon } from '@primer/octicons-react'
import { navigate } from '../lib/router'
import { colorClass } from '../lib/options'
import { useFieldOptions } from '../store/hooks'

interface SubteamPickerProps {
  /** 'one': picking a subteam replaces the pick. 'many': each button turns its subteam on or off. */
  mode: 'one' | 'many'
  /** The subteams shown now (empty = all) */
  shown: string[]
}

export function SubteamPicker({ mode, shown }: SubteamPickerProps) {
  const options = useFieldOptions('subteam')
  const set = (teams: string[]) => navigate({ teams }, { replace: true })

  const toggle = (name: string) => {
    const on = shown.includes(name)
    if (mode === 'one') set(on ? [] : [name])
    else set(on ? shown.filter((n) => n !== name) : [...shown, name])
  }

  return (
    <div
      className="stp"
      role="group"
      aria-label={mode === 'one' ? 'Show one subteam' : 'Show subteams (pick one or more)'}
    >
      <button type="button" className="stp-pill stp-all" aria-pressed={shown.length === 0} onClick={() => set([])}>
        All subteams
      </button>
      {options.map((option) => {
        const on = shown.includes(option.name)
        return (
          <button
            key={option.id}
            type="button"
            className={`stp-pill ${colorClass(option.color)}`}
            aria-pressed={on}
            title={on && mode === 'many' ? `Hide ${option.name}` : `Show ${mode === 'one' ? 'only ' : ''}${option.name}`}
            onClick={() => toggle(option.name)}
          >
            {on && mode === 'many' ? <CheckIcon size={12} className="stp-check" /> : <span className="chip-dot" aria-hidden="true" />}
            {option.name}
          </button>
        )
      })}
    </div>
  )
}
