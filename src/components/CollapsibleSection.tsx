import { useState, type ReactNode } from 'react'

// Remembers which sections are expanded for the current browser session only.
export function useOpenSections(storageKey: string) {
  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]')
      return new Set<string>(Array.isArray(parsed) ? parsed : [])
    } catch {
      return new Set()
    }
  })

  function toggle(id: string) {
    const next = new Set(open)
    if (!next.delete(id)) next.add(id)
    setOpen(next)
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...next]))
    } catch {
      // storage unavailable: the state just is not remembered
    }
  }

  return { open, toggle }
}

interface Props {
  icon: string
  title: string
  count: number
  extra?: ReactNode // right-aligned note in the header
  expanded: boolean
  locked?: boolean // forced open (search / filter): the header does not toggle
  onToggle: () => void
  children: ReactNode
}

// Section with a collapsible header: icon, title, count (shared by products and recipes).
export function CollapsibleSection({ icon, title, count, extra, expanded, locked, onToggle, children }: Props) {
  return (
    <section className="section">
      <h3>
        <button className="category-head" aria-expanded={expanded} onClick={() => !locked && onToggle()}>
          <span className="chevron" aria-hidden="true">
            ›
          </span>
          <span>{icon}</span>
          <span>{title}</span>
          <span className="muted">{count}</span>
          {extra}
        </button>
      </h3>
      {expanded && children}
    </section>
  )
}
