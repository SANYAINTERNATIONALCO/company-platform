'use client'
import type { CSSProperties, ReactNode } from 'react'

interface CardProps {
  flat?: boolean
  children: ReactNode
  style?: CSSProperties
}

function CardRoot({ flat = false, children, style }: CardProps) {
  return <div className={`ui-card${flat ? ' ui-card--flat' : ''}`} style={style}>{children}</div>
}

function CardHeader({
  title,
  count,
  action,
}: {
  title: string
  count?: number | string
  action?: ReactNode
}) {
  return (
    <div className="ui-card__header">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <h2 className="ui-card__title">{title}</h2>
        {count !== undefined && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>({count})</span>
        )}
      </div>
      {action}
    </div>
  )
}

function CardBody({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="ui-card__body" style={style}>{children}</div>
}

function CardFooter({ children }: { children: ReactNode }) {
  return <div className="ui-card__footer">{children}</div>
}

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
})
