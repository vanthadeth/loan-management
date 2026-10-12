import { DateField, Dropdown } from '../../ui/Controls'
import { PRESETS, useReportRange, type Per } from './range'

/** From / To pickers plus the Period dropdown that drive every report. */
export function RangeControls({ range }: { range: ReturnType<typeof useReportRange> }) {
  return (
    <div className="no-print">
      <div className="lhr">
        <DateField id="rdf" label="From" value={range.from} onChange={range.setFrom} />
        <DateField id="rdt" label="To" value={range.to} onChange={range.setTo} />
      </div>
      <Dropdown id="rdp" label="Period" value={range.per}
        options={[...PRESETS.map(([value, label]) => ({ value, label })), { value: 'range', label: 'Custom dates' }]}
        onChange={(v) => range.setPer(v as Per)} />
    </div>
  )
}
