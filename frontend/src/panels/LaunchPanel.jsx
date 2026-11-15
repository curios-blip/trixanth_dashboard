import { useEffect, useState } from 'react'
import { actOnLaunch, fetchLaunches, stopAll } from '../api'
import { Dot, Panel, duration, Chip } from '../components/ui'
import { getSubsystemIcon, IconTeleop, IconSwap } from '../components/Icons'

const SUBSYSTEM_DEFS = [
  {
    id: 'general',
    label: 'General Overview',
    code: 'GEN',
    components: 'Full System Health, Mission FSM, RTK',
  },
  {
    id: 'ml',
    label: 'ML & Locomotion',
    code: 'ML',
    components: 'Nav2, MPPI Controller, YOLOv8 D435i',
  },
  {
    id: 'electrical',
    label: 'Electrical & Power',
    code: 'ELEC',
    components: 'BMS, 4x Hub Inverters, Power Rails',
  },
  {
    id: 'cams_comms',
    label: 'Cams & Comms',
    code: 'COMS',
    components: '5.8GHz Sector Antenna, 5 Cams Grid',
  },
  {
    id: 'arm_rado',
    label: 'Arm for RADO',
    code: 'RADO',
    components: '6-DOF MoveIt 2, Gripper, Cache Delivery',
  },
]

export default function LaunchPanel({
  activeSubsystem = 'general',
  onSelectSubsystem = null,
  isMinimized: controlledMinimized = false,
  onToggleMinimize = null,
}) {
  const [launches, setLaunches] = useState([])
  const [selectedLaunch, setSelectedLaunch] = useState(null)
  const [localMinimized, setLocalMinimized] = useState(controlledMinimized)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [expandedNodes, setExpandedNodes] = useState(false)

  const isMin = onToggleMinimize ? controlledMinimized : localMinimized
  const setMin = (val) => {
    setLocalMinimized(val)
    if (onToggleMinimize) onToggleMinimize(val)
  }

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const data = await fetchLaunches()
        if (!alive) return
        setLaunches(data)
        setError(null)
        setSelectedLaunch((s) => s ?? data[0]?.name ?? null)
      } catch {
        if (alive) setError('Launch manager offline on port 8000.')
      }
    }
    poll()
    const id = setInterval(poll, 1200)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const act = async (name, verb) => {
    setBusy(name)
    try {
      await actOnLaunch(name, verb)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const handleSubSelect = (subId) => {
    if (onSelectSubsystem) onSelectSubsystem(subId)
  }

  const currentSubDef =
    SUBSYSTEM_DEFS.find((s) => s.id === activeSubsystem) || SUBSYSTEM_DEFS[0]

  const runningCount = launches.filter((l) => l.state === 'running').length
  const anyRunning = runningCount > 0

  return (
    <Panel
      title={
        isMin ? null : (
          <div className="launch-panel-header-minimal">
            <span className="launch-head-title mono">SUBSYSTEMS</span>
            <span className={`launch-active-badge mono ${anyRunning ? 'running' : 'idle'}`}>
              {runningCount}/{launches.length || 7} RUNNING
            </span>
          </div>
        )
      }
      className={isMin ? 'launch-panel minimal-sidebar collapsed' : 'launch-panel minimal-sidebar'}
      actions={
        <div className="launch-header-actions-minimal">
          <button
            type="button"
            className="ghost mini collapse-toggle-btn"
            onClick={() => setMin(!isMin)}
            title={isMin ? 'Expand sidebar to show labels & launches' : 'Compress sidebar to icon rail'}
          >
            {isMin ? '»' : '«'}
          </button>
        </div>
      }
    >
      {!isMin && error && <p className="notice mini">{error}</p>}
      {isMin && error && (
        <div className="min-offline-indicator" title={error}>
          <span className="min-offline-dot" />
        </div>
      )}

      {/* 5 MINIMAL SUBSYSTEM CARDS */}
      <div className="minimal-sub-cards-stack">
        {SUBSYSTEM_DEFS.map((sub) => {
          const isActive = activeSubsystem === sub.id
          return (
            <button
              key={sub.id}
              type="button"
              className={`min-sidebar-sub-item ${isActive ? 'active' : ''}`}
              onClick={() => handleSubSelect(sub.id)}
              title={`${sub.label} - ${sub.components}`}
            >
              <div className="sub-item-icon">{getSubsystemIcon(sub.id, 15)}</div>
              {!isMin && (
                <div className="sub-item-text">
                  <span className="sub-item-label">{sub.label}</span>
                  <span className="sub-item-code mono">[{sub.code}]</span>
                </div>
              )}
              {!isMin && isActive && (
                <span className="active-dot-indicator" />
              )}
            </button>
          )
        })}
      </div>

      {/* COLLAPSIBLE LAUNCH NODES LIST */}
      {!isMin && (
        <div className="minimal-launches-section">
          <div className="launches-section-header">
            <span className="section-title mono">PROCESS LAUNCHES</span>
            <div className="launches-ctrl-btns">
              <button
                type="button"
                className="mini-text-btn"
                onClick={() => setExpandedNodes((p) => !p)}
              >
                {expandedNodes ? 'Hide' : 'Show All'}
              </button>
              <button
                type="button"
                className="mini-text-btn warn"
                disabled={!anyRunning}
                onClick={() => stopAll()}
              >
                Stop All
              </button>
            </div>
          </div>

          <div className="minimal-nodes-list">
            {(expandedNodes ? launches : launches.slice(0, 4)).map((l) => {
              const running = l.state === 'running'
              return (
                <div
                  key={l.name}
                  className={`min-node-row ${running ? 'running' : 'stopped'}`}
                >
                  <div className="min-node-meta">
                    <Dot state={l.state} />
                    <span className="min-node-name mono">{l.label || l.name}</span>
                  </div>
                  <button
                    type="button"
                    className={`min-node-btn ${running ? 'stop' : 'start'}`}
                    disabled={busy === l.name}
                    onClick={() => act(l.name, running ? 'stop' : 'start')}
                    title={`Click to ${running ? 'Stop' : 'Start'} ${l.label}`}
                  >
                    {running ? 'Stop' : 'Start'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Panel>
  )
}
