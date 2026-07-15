'use client'
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'

function TableRoot({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ui-table">{children}</table>
    </div>
  )
}

function Th({ numeric, className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  const cls = [numeric ? 'ui-table__numeric' : '', className].filter(Boolean).join(' ') || undefined
  return (
    <th className={cls} {...rest}>
      {children}
    </th>
  )
}

function Td({ numeric, className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  const cls = [numeric ? 'ui-table__numeric' : '', className].filter(Boolean).join(' ') || undefined
  return (
    <td className={cls} {...rest}>
      {children}
    </td>
  )
}

export const Table = Object.assign(TableRoot, { Th, Td })
