import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Member } from '../../hooks/useMembers'
import { PRIORITIES, type Todo, type TodoValues, type Visibility } from './todos'

interface Props {
  todo?: Todo // undefined = a new to-do
  userId: string
  members: Member[]
  defaultDue: string | null // a new to-do starts with this due date
  onSave: (values: TodoValues) => Promise<boolean>
  onDelete?: () => void
  onCancel: () => void
}

// Edit one to-do: title, details, due date, priority, who is responsible, who sees it.
export function TodoForm({ todo, userId, members, defaultDue, onSave, onDelete, onCancel }: Props) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(todo?.title ?? '')
  const [details, setDetails] = useState(todo?.details ?? '')
  const [due, setDue] = useState(todo ? (todo.due_date ?? '') : (defaultDue ?? ''))
  const [priority, setPriority] = useState(todo?.priority ?? 0)
  const [assignee, setAssignee] = useState(todo?.assignee_user_id ?? '')
  const [visibility, setVisibility] = useState<Visibility>(todo?.visibility ?? 'family')
  const [busy, setBusy] = useState(false)
  // only the owner decides who sees a to-do (the database enforces it too)
  const canChangeVisibility = !todo || todo.owner_user_id === userId
  // a private to-do can only be assigned to its owner
  const assignable = visibility === 'private' ? members.filter((m) => m.user_id === userId) : members

  function chooseVisibility(next: Visibility) {
    setVisibility(next)
    if (next === 'private' && assignee !== userId) setAssignee('')
  }

  async function save() {
    if (title.trim() === '' || busy) return
    if (todo && visibility !== todo.visibility && !window.confirm(t(`todo.confirmVisibility.${visibility}`))) return
    setBusy(true)
    const ok = await onSave({
      title: title.trim(),
      details: details.trim() || null,
      due_date: due || null,
      priority,
      assignee_user_id: assignee || null,
      visibility,
    })
    if (!ok) setBusy(false) // on success the parent closes the form
  }

  return (
    <div className="card stack todo-form">
      <label className="field">
        {t('todo.form.title')}
        <input className="input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        {t('todo.form.details')}
        <textarea className="input" rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <label className="field">
        {t('todo.form.due')}
        <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      <div className="stack">
        <span className="muted">{t('todo.form.priority')}</span>
        <div className="segmented" role="group">
          {PRIORITIES.map((p) => (
            <button key={p} className={priority === p ? 'active' : ''} onClick={() => setPriority(p)}>
              {t(`todo.form.priorities.${p}`)}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        {t('todo.form.assignee')}
        <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">{t('todo.form.nobody')}</option>
          {assignable.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.name || '?'}
            </option>
          ))}
        </select>
      </label>
      <div className="stack">
        <span className="muted">{t('todo.form.visibility')}</span>
        <div className="segmented" role="group">
          {(['family', 'private'] as const).map((v) => (
            <button
              key={v}
              className={visibility === v ? 'active' : ''}
              disabled={!canChangeVisibility}
              onClick={() => chooseVisibility(v)}
            >
              {t(`todo.form.visibilityOptions.${v}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <button className="primary" disabled={title.trim() === '' || busy} onClick={save}>
          {t('kitchen.custom.save')}
        </button>
        <button className="link-btn" onClick={onCancel}>
          {t('kitchen.custom.cancel')}
        </button>
        {onDelete && (
          <button className="link-btn" onClick={onDelete}>
            {t('kitchen.shopping.remove')}
          </button>
        )}
      </div>
    </div>
  )
}
