import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthProvider'
import { UndoToast, useUndo } from '../../components/UndoToast'
import { useFamily } from '../../family/FamilyProvider'
import { useMembers } from '../../hooks/useMembers'
import { useModuleAccess } from '../../hooks/useModuleAccess'
import { useTodos } from '../../hooks/useTodos'
import { addDays, toDay } from '../../lib/date'
import { TodoForm } from './TodoForm'
import { compareTodos, inView, VIEWS, type Todo, type TodoValues, type View } from './todos'

export function TodoPage() {
  const { family, loading } = useFamily()
  const { user } = useAuth()
  const access = useModuleAccess('todo')
  if (loading) return null
  // No family or no "todo" permission: back to the home page.
  if (!family || !user || access === 'none') return <Navigate to="/" replace />
  return <TodoBody familyId={family.id} userId={user.id} canWrite={access === 'write'} />
}

// To-do list: views Today / Week / All / Done, quick add, edit in place, tick with undo.
function TodoBody({ familyId, userId, canWrite }: { familyId: string; userId: string; canWrite: boolean }) {
  const { t, i18n } = useTranslation()
  const members = useMembers(familyId)
  const todos = useTodos(familyId, userId)
  const undo = useUndo()
  const [view, setView] = useState<View>('today')
  const [editing, setEditing] = useState<string | null>(null)
  const [quick, setQuick] = useState('')
  const [quickPrivate, setQuickPrivate] = useState(false)

  const now = new Date()
  const today = toDay(now)
  const tomorrow = toDay(addDays(now, 1))
  const list = todos.todos.filter((x) => inView(x, view, now)).sort(compareTodos)
  const count = (v: View) => todos.todos.filter((x) => inView(x, v, now)).length
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'numeric' })
  const nameOf = (id: string | null) => (id ? members.find((m) => m.user_id === id)?.name || '?' : '')

  async function addQuick() {
    const title = quick.trim()
    if (!title) return
    const ok = await todos.add({
      title,
      details: null,
      due_date: view === 'today' ? today : null, // added on "Today" = due today
      priority: 0,
      assignee_user_id: quickPrivate ? userId : null,
      visibility: quickPrivate ? 'private' : 'family',
    })
    if (ok) setQuick('')
  }

  async function save(todo: Todo, values: TodoValues) {
    const ok = await todos.update(todo.id, values)
    if (ok) setEditing(null)
    return ok
  }

  function tick(todo: Todo, done: boolean) {
    todos.setDone(todo.id, done)
    if (done) undo.show(t('todo.doneToast', { title: todo.title }), () => todos.setDone(todo.id, false))
  }

  function remove(todo: Todo) {
    todos.setDeleted(todo.id, true)
    setEditing(null)
    undo.show(t('todo.removed', { title: todo.title }), () => todos.setDeleted(todo.id, false))
  }

  function dueText(todo: Todo) {
    if (!todo.due_date) return null
    if (todo.due_date === today) return t('todo.today')
    if (todo.due_date === tomorrow) return t('todo.tomorrow')
    return dayFormat.format(new Date(`${todo.due_date}T12:00:00`))
  }

  return (
    <div className="todo-page">
      <h1>{t('nav.todo')}</h1>
      <div className="segmented view-switch" role="group">
        {VIEWS.map((v) => (
          <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
            {t(`todo.views.${v}`)}
            {v !== 'done' && count(v) > 0 ? ` (${count(v)})` : ''}
          </button>
        ))}
      </div>
      {todos.error && (
        <p className="error">
          {t('todo.error')} {todos.error}
        </p>
      )}

      {canWrite && (
        <div className="row toolbar">
          <input
            className="input grow"
            placeholder={t('todo.quickAdd')}
            maxLength={200}
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addQuick()}
          />
          <button
            className="chip"
            aria-pressed={quickPrivate}
            aria-label={t('todo.form.visibilityOptions.private')}
            title={t('todo.form.visibilityOptions.private')}
            onClick={() => setQuickPrivate(!quickPrivate)}
          >
            🔒
          </button>
          <button className="primary" disabled={quick.trim() === ''} onClick={addQuick}>
            {t('todo.add')}
          </button>
        </div>
      )}

      {!todos.loaded ? null : list.length === 0 ? (
        <p className="muted">{t(`todo.empty.${view}`)}</p>
      ) : (
        <div className="list">
          {list.map((todo) =>
            editing === todo.id ? (
              <TodoForm
                key={todo.id}
                todo={todo}
                userId={userId}
                members={members}
                defaultDue={null}
                onSave={(values) => save(todo, values)}
                onDelete={() => remove(todo)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div key={todo.id} className={`list-row card todo-row${todo.done_at ? ' done' : ''}`}>
                <input
                  type="checkbox"
                  className="check"
                  checked={todo.done_at !== null}
                  disabled={!canWrite}
                  aria-label={todo.title}
                  onChange={(e) => tick(todo, e.target.checked)}
                />
                <button className="todo-main grow" disabled={!canWrite} onClick={() => setEditing(todo.id)}>
                  <span className="todo-title">
                    {todo.priority > 0 && <span className={`prio prio-${todo.priority}`} aria-hidden="true" />}
                    {todo.title}
                  </span>
                  <span className="todo-meta muted">
                    {todo.due_date && (
                      <span className={!todo.done_at && todo.due_date < today ? 'overdue' : undefined}>{dueText(todo)}</span>
                    )}
                    {todo.visibility === 'private' && <span title={t('todo.form.visibilityOptions.private')}>🔒</span>}
                    {todo.assignee_user_id && (
                      <span
                        className="author"
                        style={{
                          background: `var(--person-${(Math.max(members.findIndex((m) => m.user_id === todo.assignee_user_id), 0) % 3) + 1}-bg)`,
                          color: `var(--person-${(Math.max(members.findIndex((m) => m.user_id === todo.assignee_user_id), 0) % 3) + 1}-text)`,
                        }}
                      >
                        {nameOf(todo.assignee_user_id)}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            ),
          )}
        </div>
      )}
      <UndoToast toast={undo.toast} dismiss={undo.dismiss} />
    </div>
  )
}
