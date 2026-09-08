'use client'
import { useEffect, useState } from 'react'
export function WikiTime({ value }: { value: string }) {
  const [label, setLabel] = useState(
    value ? value.slice(0, 16).replace('T', ' ') + ' UTC' : 'Not recorded',
  )
  useEffect(() => {
    if (value)
      setLabel(
        new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value)),
      )
  }, [value])
  return value ? (
    <time dateTime={value} title={new Date(value).toUTCString()}>
      {label}
    </time>
  ) : (
    <span>Not recorded</span>
  )
}
