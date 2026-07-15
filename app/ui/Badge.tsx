'use client'
import type { ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'info' | 'tertiary'

interface BadgeProps {
  tone?: Tone
  size?: 'sm' | 'md'
  children: ReactNode
}

export function Badge({ tone = 'neutral', size = 'md', children }: BadgeProps) {
  return <span className={`ui-badge ui-badge--${tone} ui-badge--${size}`}>{children}</span>
}
