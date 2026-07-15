'use client'
import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  size?: 'sm' | 'md'
}

export function Input({ label, error, size = 'md', id, className, ...rest }: InputProps) {
  const generatedId = useId()
  const inputId = id || (label ? generatedId : undefined)
  const cls = ['ui-input', `ui-input--${size}`, error ? 'ui-input--error' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <div>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            display: 'block',
            marginBottom: 'var(--space-1)',
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {label}
        </label>
      )}
      <input id={inputId} className={cls} {...rest} />
      {error && (
        <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-2xs)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
