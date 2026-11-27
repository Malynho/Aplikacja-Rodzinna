import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { KitchenData } from '../../hooks/useKitchen'
import { photoToBase64Jpeg } from '../../lib/image'
import type { ImportedRecipe } from './recipeTypes'

interface Props {
  shop: KitchenData
  source: 'photo' | 'text'
  onResult: (recipe: ImportedRecipe, left: number) => void
  onCancel: () => void
}

const MAX_IMAGES = 6
const MIN_TEXT = 20
const MAX_TEXT = 20000

// Step 1 of the recipe import: photos / screenshots or pasted text go to the Edge Function, which only reads them
// (nothing is stored). The result is shown on the confirmation screen; nothing is saved here.
export function RecipeImport({ shop, source, onResult, onCancel }: Props) {
  const { t } = useTranslation()
  const fileInput = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ code: string; limit?: number } | null>(null)

  const ready = source === 'photo' ? files.length > 0 : text.trim().length >= MIN_TEXT

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const picked = [...(e.target.files ?? [])]
    e.target.value = '' // lets the same file be picked again
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_IMAGES))
  }

  async function read() {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await shop.importRecipe(
        source === 'photo'
          ? { kind: 'images', images: await Promise.all(files.map((f) => photoToBase64Jpeg(f))) }
          : { kind: 'text', text: text.trim() },
      )
      if ('error' in result) setError({ code: result.error, limit: result.limit })
      else onResult(result.recipe, result.left)
    } catch {
      setError({ code: 'image' }) // a photo could not be read
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card stack recipe-import">
      <h2>{t(source === 'photo' ? 'kitchen.recipes.import.photoTitle' : 'kitchen.recipes.import.textTitle')}</h2>
      <p className="muted">{t('kitchen.recipes.import.privacy')}</p>

      {source === 'photo' ? (
        <>
          <p className="muted">{t('kitchen.recipes.import.photoHint', { max: MAX_IMAGES })}</p>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={pick} />
          <div className="row toolbar">
            <button className="primary" disabled={busy || files.length >= MAX_IMAGES} onClick={() => fileInput.current?.click()}>
              {t('kitchen.recipes.import.pick')}
            </button>
            <span className="muted">{t('kitchen.recipes.import.picked', { count: files.length })}</span>
          </div>
          {files.map((f, i) => (
            <div key={`${f.name}${i}`} className="row">
              <span className="grow">{f.name}</span>
              <button aria-label={t('kitchen.shopping.remove')} disabled={busy} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
        </>
      ) : (
        <label className="field">
          {t('kitchen.recipes.import.textHint')}
          <textarea
            className="input"
            rows={10}
            maxLength={MAX_TEXT}
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
      )}

      {error && (
        <p className="error">{t(`kitchen.recipes.import.errors.${error.code}`, { limit: error.limit ?? 5 })}</p>
      )}
      <div className="row">
        <button className="primary" disabled={!ready || busy} onClick={read}>
          {t(busy ? 'kitchen.recipes.import.reading' : 'kitchen.recipes.import.read')}
        </button>
        <button className="link-btn" disabled={busy} onClick={onCancel}>
          {t('kitchen.custom.cancel')}
        </button>
      </div>
    </div>
  )
}
