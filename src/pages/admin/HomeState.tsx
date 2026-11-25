import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFamily } from '../../family/FamilyProvider'
import { supabase } from '../../lib/supabase'

const GERMAN_STATES = [
  'DE-BB', 'DE-BE', 'DE-BW', 'DE-BY', 'DE-HB', 'DE-HE', 'DE-HH', 'DE-MV',
  'DE-NI', 'DE-NW', 'DE-RP', 'DE-SH', 'DE-SL', 'DE-SN', 'DE-ST', 'DE-TH',
]

// Home state of the family: decides which German holidays are highlighted. Admins only (RLS).
export function HomeState({ familyId, current }: { familyId: string; current: string }) {
  const { t, i18n } = useTranslation()
  const { reload } = useFamily()
  const [error, setError] = useState(false)

  async function change(state: string) {
    const { error: err } = await supabase.from('families').update({ home_state: state }).eq('id', familyId)
    setError(!!err)
    if (!err) await reload()
  }

  return (
    <section className="section">
      <h2>{t('admin.region.title')}</h2>
      <div className="card stack">
        <label className="field">
          {t('admin.region.label')}
          <select className="input" value={current} onChange={(e) => change(e.target.value)}>
            {GERMAN_STATES.map((s) => ({ code: s, name: t(`admin.region.states.${s}`) }))
              .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
              .map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        {error && <p className="error">{t('admin.region.error')}</p>}
      </div>
    </section>
  )
}
