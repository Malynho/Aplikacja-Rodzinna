import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

// Modules that carry a per-member permission (Verwaltung itself is admin-only).
const MODULES = ['kitchen', 'todo', 'notes', 'calendar'] as const
const LEVELS = ['none', 'read', 'write'] as const
type Level = (typeof LEVELS)[number]

interface Member {
  user_id: string
  role: 'admin' | 'member'
  name: string
}

export function MembersTable({ familyId }: { familyId: string }) {
  const { t } = useTranslation()
  const [members, setMembers] = useState<Member[]>([])
  const [access, setAccess] = useState<Record<string, Level>>({}) // key: "<userId>:<module>"
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    const { data: rows } = await supabase
      .from('family_members')
      .select('user_id, role')
      .eq('family_id', familyId)
    const ids = (rows ?? []).map((r) => r.user_id)
    const [{ data: profiles }, { data: perms }] = await Promise.all([
      supabase.from('profiles').select('id, display_name').in('id', ids),
      supabase.from('module_permissions').select('user_id, module, access').eq('family_id', familyId),
    ])
    const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]))
    setMembers(
      (rows ?? [])
        .map((r) => ({ user_id: r.user_id, role: r.role, name: names.get(r.user_id) ?? '—' }))
        .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'admin' ? -1 : 1)),
    )
    setAccess(Object.fromEntries((perms ?? []).map((p) => [`${p.user_id}:${p.module}`, p.access])))
  }, [familyId])

  useEffect(() => {
    load()
  }, [load])

  async function setLevel(userId: string, mod: string, level: Level) {
    setAccess((a) => ({ ...a, [`${userId}:${mod}`]: level }))
    const { error } = await supabase
      .from('module_permissions')
      .upsert(
        { family_id: familyId, user_id: userId, module: mod, access: level },
        { onConflict: 'family_id,user_id,module' },
      )
    setError(!!error)
    if (error) load() // restore the real state
  }

  async function remove(m: Member) {
    if (!window.confirm(t('admin.members.confirmRemove', { name: m.name }))) return
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('family_id', familyId)
      .eq('user_id', m.user_id)
    setError(!!error)
    load()
  }

  return (
    <section className="section">
      <h2>{t('admin.members.title')}</h2>
      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('admin.members.person')}</th>
              <th>{t('admin.members.role')}</th>
              {MODULES.map((mod) => (
                <th key={mod}>{t(`nav.${mod}`)}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td>{m.name}</td>
                <td>{t(`admin.role.${m.role}`)}</td>
                {m.role === 'admin' ? (
                  <td className="muted" colSpan={MODULES.length}>
                    {t('admin.members.fullAccess')}
                  </td>
                ) : (
                  MODULES.map((mod) => (
                    <td key={mod}>
                      <select
                        className="input"
                        value={access[`${m.user_id}:${mod}`] ?? 'none'}
                        onChange={(e) => setLevel(m.user_id, mod, e.target.value as Level)}
                      >
                        {LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {t(`admin.access.${l}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))
                )}
                <td>
                  {m.role === 'member' && (
                    <button className="link-btn" onClick={() => remove(m)}>
                      {t('admin.members.remove')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <p className="error">{t('admin.saveError')}</p>}
      </div>
    </section>
  )
}
