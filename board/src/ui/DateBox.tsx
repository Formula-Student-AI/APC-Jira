import { useLayoutEffect, useRef, type ComponentProps, type RefObject } from 'react'

type DateBoxProps = Omit<ComponentProps<'input'>, 'type' | 'value' | 'defaultValue' | 'ref'> & {
  /** The date to show ('' = none): written into the box only when it differs from what the box holds */
  value: string
  boxRef?: RefObject<HTMLInputElement | null>
}

/**
 * A date box (<input type="date">) that is never rewritten while someone types in it. A controlled
 * input won't do: React keeps its value *attribute* in step too, and when that changes while a date
 * is half-typed, Firefox forgets the typed parts as the box loses focus. So the box is uncontrolled,
 * and after every render (as React does for a controlled input) `value` is written into it if it
 * differs from what the box holds.
 */
export function DateBox({ value, boxRef, ...props }: DateBoxProps) {
  const own = useRef<HTMLInputElement>(null)
  const ref = boxRef ?? own
  useLayoutEffect(() => {
    const box = ref.current
    if (box && box.value !== value) box.value = value
  })
  return <input {...props} ref={ref} type="date" />
}
