import { useTranslation } from 'react-i18next'
import { PACK_UNITS, type Pack, type PackUnit } from './products'

interface Props {
  size: string
  unit: string // '' = none
  onSize: (value: string) => void
  onUnit: (value: string) => void
  disabled?: boolean
}

// Size and unit are stored together or not at all; anything incomplete or invalid means "no package size".
export function parsePack(size: string, unit: string): Pack {
  const value = Number(size)
  return value > 0 && PACK_UNITS.includes(unit as PackUnit)
    ? { pack_size: value, pack_unit: unit as PackUnit }
    : { pack_size: null, pack_unit: null }
}

// Optional package size ("1" + "kg"), shared by the product form and the pantry editor.
export function PackField({ size, unit, onSize, onUnit, disabled }: Props) {
  const { t } = useTranslation()
  return (
    <label className="field">
      {t('kitchen.custom.pack')}
      <span className="row">
        <input
          className="input grow"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={size}
          disabled={disabled}
          onChange={(e) => onSize(e.target.value)}
        />
        <select className="input" value={unit} disabled={disabled} onChange={(e) => onUnit(e.target.value)}>
          <option value="">—</option>
          {PACK_UNITS.map((u) => (
            <option key={u} value={u}>
              {t(`kitchen.units.${u}`)}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}
