import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Toast {
  message: string
  onUndo: () => void
}

const VISIBLE_MS = 8000

// Shows one message with an undo button for about 8 seconds.
export function useUndo() {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current)
    setToast(null)
  }, [])

  const show = useCallback((message: string, onUndo: () => void) => {
    window.clearTimeout(timer.current)
    setToast({ message, onUndo })
    timer.current = window.setTimeout(() => setToast(null), VISIBLE_MS)
  }, [])

  return { toast, show, dismiss }
}

export function UndoToast({ toast, dismiss }: { toast: Toast | null; dismiss: () => void }) {
  const { t } = useTranslation()
  if (!toast) return null
  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      <button
        className="toast-btn"
        onClick={() => {
          toast.onUndo()
          dismiss()
        }}
      >
        {t('kitchen.shopping.undo')}
      </button>
    </div>
  )
}
