import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { actOnLaunch } from '../api'
import { Chip, Dot, Empty, Panel, duration } from '../components/ui'
import { useTopic } from '../ros'

const MISSIONS = [
  { key: 'mission_rado', label: 'RADO' },
  { key: 'mission_abex', label: 'ABEx' },
  { key: 'mission_idmo', label: 'IDMO' },
]

export default function MissionPanel() {
  const fsm = useTopic(config.topics.fsmState, { throttle: 200 })
  const legsMsg = useTopic(config.topics.legs, { throttle: 1000 })
  const [history, setHistory] = useState([])
  const [starting, setStarting] = useState(null)
  const [error, setError] = useState(null)
  const lastState = useRef(null)
  const since = useRef(Date.now())
  const [, tick] = useState(0)

  const state = fsm?.data ?? null

  useEffect(() => {
    if (state && state !== lastState.current) {
      const now = Date.now()
      setHistory((h) => [{ state, at: now }, ...h].slice(0, 12))
      lastState.current = state
      since.current = now
    }
  }, [state])

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const { legs, active } = parseLegs(legsMsg)

  const startMission = async (key) => {
    setStarting(key)
    setError(null)
    try {
      await actOnLaunch(key, 'start')
    } catch (e) {
      setError(e.message)
    } finally {
      setStarting(null)
    }
  }

  return (
    <Panel title="Mission">
      <div className="fsm">
        <div>
          <span className="fsm-label">State</span>
          <strong className="mono">{state ?? 'no data'}</strong>
        </div>
        <span className="fsm-since mono">
          {state ? duration((Date.now() - since.current) / 1000) : ''}
        </span>
      </div>

      <div className="mission-picker">
        {MISSIONS.map((m) => (
          <Chip key={m.key} disabled={starting === m.key} onClick={() => startMission(m.key)}>
            Start {m.label}
          </Chip>
        ))}
      </div>
      {error && <p className="notice">{error}</p>}

      <h3 className="sub">Legs</h3>
      {legs.length === 0 ? (
        <Empty>No leg list published.</Empty>
      ) : (
        <ol className="legs">
          {legs.map((leg, i) => (
            <li key={leg.id ?? i} className={i === active ? 'leg current' : i < active ? 'leg done' : 'leg'}>
              <Dot state={i < active ? 'stopped' : i === active ? 'running' : ''} />
              <span>{leg.label ?? `Leg ${i + 1}`}</span>
              <span className="leg-kind mono">{leg.kind ?? ''}</span>
            </li>
          ))}
        </ol>
      )}

      <h3 className="sub">Transitions</h3>
      {history.length === 0 ? (
        <Empty>Nothing yet.</Empty>
      ) : (
        <ul className="transitions mono">
          {history.map((h, i) => (
            <li key={i}>
              <span className="t-time">{new Date(h.at).toLocaleTimeString('en-GB')}</span>
              {h.state}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function parseLegs(msg) {
  if (!msg?.data) return { legs: [], active: 0 }
  try {
    const p = JSON.parse(msg.data)
    return { legs: p.legs ?? [], active: p.active ?? 0 }
  } catch {
    return { legs: [], active: 0 }
  }
}
