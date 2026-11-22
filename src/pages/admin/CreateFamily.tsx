import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useFamily } from '../../family/FamilyProvider'

// First user only (enforced by RLS): creates the family and becomes its admin via a DB trigger.
export function CreateFamily() {
  const { t } = useTranslation()
  const { reload } = useFamily()
  const [name, setName] = useState('')
  const [error, setError] = useState<'needInvite' | 'error' | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('families').insert({ name: name.trim() })
    if (!error) return reload()
    // 42501 = RLS rejection: a family already exists, so this user must be invited.
    setError(error.code === '42501' ? 'needInvite' : 'error')
  }

  return (
    <>
      <h1>{t('admin.createFamily.title')}</h1>
      <form className="card stack" onSubmit={submit}>
        <input
          className="input"
          placeholder={t('admin.createFamily.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button className="primary" type="submit">
          {t('admin.createFamily.submit')}
        </button>
        {error && <p className="error">{t(`admin.createFamily.${error}`)}</p>}
      </form>
    </>
  )
}
