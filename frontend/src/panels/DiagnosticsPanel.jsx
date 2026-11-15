import { useState } from 'react'
import { config } from '../config'
import { Empty, Panel } from '../components/ui'
import { useTopic } from '../ros'

const LEVEL = { 0: 'ok', 1: 'warn', 2: 'fault', 3: 'stale' }

export default function DiagnosticsPanel() {
  const msg = useTopic(config.topics.diagnostics, { throttle: 1000 })
  const [open, setOpen] = useState(() => new Set())
  const [onlyProblems, setOnlyProblems] = useState(false)

  const all = msg?.status ?? []
  const problems = all.filter((s) => s.level > 0)
  const shown = onlyProblems ? problems : all

  const toggle = (name) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  return (
    <Panel
      title="Diagnostics"
      actions={
        <label className="checkbox">
          <input type="checkbox" checked={onlyProblems}
                 onChange={(e) => setOnlyProblems(e.target.checked)} />
          Problems only
        </label>
      }
    >
      {all.length === 0 ? (
        <Empty>
          Nothing publishing to {config.topics.diagnostics.name} yet.
        </Empty>
      ) : (
        <ul className="diag-list">
          {shown.map((s) => {
            const cls = LEVEL[s.level] ?? 'stale'
            const isOpen = open.has(s.name)
            return (
              <li key={s.name} className={`diag ${cls}`}>
                <button className="diag-head" onClick={() => toggle(s.name)}>
                  <span className={`bar ${cls}`} aria-hidden />
                  <span className="diag-name">{s.name}</span>
                  <span className="diag-msg">{s.message}</span>
                </button>
                {isOpen && s.values?.length > 0 && (
                  <dl className="kv mono">
                    {s.values.map((v) => (
                      <div key={v.key}>
                        <dt>{v.key}</dt>
                        <dd>{v.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            )
          })}
          {shown.length === 0 && <Empty>All {all.length} items nominal.</Empty>}
        </ul>
      )}
    </Panel>
  )
}
