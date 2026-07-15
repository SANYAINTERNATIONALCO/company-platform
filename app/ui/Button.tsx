'use client'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'success-soft' | 'accent-soft' | 'warning-soft' | 'info-soft'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className,
  ...rest
}: ButtonProps) {
  const cls = ['ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, className].filter(Boolean).join(' ')
  return (
    <button className={cls} {...rest}>
      {icon}
      {children}
    </button>
  )
}
