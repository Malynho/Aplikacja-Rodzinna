import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

interface Pending {
  id: string
  label: string | null
  expires_at: string
}

// The fresh link lives only in JS memory: it survives switching pages in this session
// (the component remounts) but is gone after a refresh. It is never stored anywhere.
let fresh: { familyId: string; link: string } | null = null

export function Invitations({ familyId }: { familyId: string }) {
  const { t, i18n } = useTranslation()
  const [pending, setPending] = useState<Pending[]>([])
  const [link, setLinkState] = useState<string | null>(() =>
    fresh?.familyId === familyId ? fresh.link : null,
  )
  const [label, setLabel] = useState('')
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator.share === 'function'

  function setLink(value: string | null) {
    fresh = value ? { familyId, link: value } : null
    setLinkState(value)
  }

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('invitations')
      .select('id, label, expires_at')
      .eq('family_id', familyId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at')
    setPending(data ?? [])
  }, [familyId])

  useEffect(() => {
    load()
  }, [load])

  async function create() {
    const { data: token } = await supabase.rpc('create_invitation', {
      fid: familyId,
      lbl: label.trim() || null,
    })
    if (token) {
      setLink(`${window.location.origin}/invite#${token}`)
      setLabel('')
      setCopied(false)
      load()
    }
  }

  async function revoke(id: string) {
    await supabase.from('invitations').delete().eq('id', id)
    load()
  }

  async function copy() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function share() {
    if (!link) return
    try {
      await navigator.share({ title: t('app.name'), text: t('admin.invitations.shareText'), url: link })
    } catch {
      // The user closed the share sheet: nothing to do.
    }
  }

  return (
    <section className="section">
      <h2>{t('admin.invitations.title')}</h2>
      <div className="card stack">
        <div className="row">
          <input
            className="input grow"
            placeholder={t('admin.invitations.forWhom')}
            maxLength={60}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button className="primary" onClick={create}>
            {t('admin.invitations.create')}
          </button>
        </div>
        {link && (
          <div className="stack">
            <p className="muted">{t('admin.invitations.linkHint')}</p>
            <div className="row">
              <input className="input grow" readOnly value={link} />
              <button className="link-btn" onClick={copy}>
                {t(copied ? 'admin.invitations.copied' : 'admin.invitations.copy')}
              </button>
              {canShare && (
                <button className="link-btn" onClick={share}>
                  {t('admin.invitations.share')}
                </button>
              )}
              <button className="primary" onClick={() => setLink(null)}>
                {t('admin.invitations.done')}
              </button>
            </div>
          </div>
        )}
        <h3>{t('admin.invitations.pending')}</h3>
        {pending.length === 0 && <p className="muted">{t('admin.invitations.none')}</p>}
        {pending.map((p) => (
          <div className="row" key={p.id}>
            <span className="grow">
              {p.label && <strong>{p.label} · </strong>}
              {t('admin.invitations.expires', {
                date: new Date(p.expires_at).toLocaleDateString(i18n.language),
              })}
            </span>
            <button className="link-btn" onClick={() => revoke(p.id)}>
              {t('admin.invitations.revoke')}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
