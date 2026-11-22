import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PantryItem, PantryValues } from './products'

interface Props {
  emoji: string
  name: string
  item?: PantryItem
  onSave: (values: PantryValues) => void
  onUsed: (amount: number) => void
  onClose: () => void
}

const toInt = (value: string) => Math.max(0, Math.floor(Number(value)) || 0)

// Ist / Soll / Min of one product as number fields, plus a quick "used" action.
export function PantryEditor({ emoji, name, item, onSave, onUsed, onClose }: Props) {
  const { t } = useTranslation()
  const [ist, setIst] = useState(String(item?.ist ?? 0))
  const [soll, setSoll] = useState(String(item?.soll ?? 0))
  const [min, setMin] = useState(String(item?.min_qty ?? 0))
  const [used, setUsed] = useState('1')

  const field = (label: string, value: string, set: (v: string) => void) => (
    <label className="field grow">
      {label}
      <input
        className="input"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  )

  return (
    <div className="card stack">
      <h3>
        <span className="list-emoji">{emoji}</span>
        {name}
      </h3>
      <div className="row">
        {field(t('kitchen.pantry.ist'), ist, setIst)}
        {field(t('kitchen.pantry.soll'), soll, setSoll)}
        {field(t('kitchen.pantry.min'), min, setMin)}
      </div>
      <div className="row">
        <button
          className="primary"
          onClick={() => onSave({ ist: toInt(ist), soll: toInt(soll), min_qty: toInt(min) })}
        >
          {t('kitchen.custom.save')}
        </button>
        <button className="link-btn" onClick={onClose}>
          {t('kitchen.custom.cancel')}
        </button>
      </div>
      <div className="row">
        {field(t('kitchen.pantry.usedAmount'), used, setUsed)}
        <button className="primary" disabled={toInt(used) === 0} onClick={() => onUsed(toInt(used))}>
          {t('kitchen.pantry.usedButton')}
        </button>
      </div>
    </div>
  )
}
