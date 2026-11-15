import { useState } from 'react'
import { config, DEMO, setDemo } from '../config'
import { callService, useRosStatus, useTopic } from '../ros'
import { Dot, fmt } from '../components/ui'

export default function HeaderBar({
  stopped,
  setStopped,
  drivingActive = false,
}) {
  const status = useRosStatus()
  const battery = useTopic(config.topics.battery, { throttle: 2000 })
  const fsm = useTopic(config.topics.fsmState, { throttle: 500 })

  // trixanth_interfaces/msg/MissionState — /mission/state (2Hz from mission_monitor)
  const missionState = useTopic(config.topics.missionState, { throttle: 500 })
  // /trixanth/link_ok and /trixanth/link_age from link_monitor
  const linkOk = useTopic(config.topics.linkOk, { throttle: 500 })
  const linkAge = useTopic(config.topics.linkAge, { throttle: 500 })

  // 4 Ground Station Links (3 Comms/Telemetry + 1 Camera Link)
  // Working = Green (#4fd6a0), Down = Red (#e5544b)
  const [linkStates, setLinkStates] = useState({
    rf: true,
    rosbridge: true,
    safety: true,
    camera: true,
  })

  const toggleLink = (id) => {
    setLinkStates((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const volts = battery?.voltage
  const vClass =
    volts == null ? '' : volts < config.battery.critical ? 'fault'
      : volts < config.battery.warn ? 'warn' : 'ok'

  const linkState = DEMO ? 'demo' : status === 'connected' ? 'running' : 'crashed'
  const canStop = DEMO || status === 'connected'

  // MissionState fields
  const MODE_NAMES = ['IDLE', 'MANUAL', 'AUTONOMOUS', 'ESTOP']
  const modeIdx = missionState?.mode ?? null
  const modeName = modeIdx != null ? MODE_NAMES[modeIdx] : null
  const modeClass = modeIdx === 3 ? 'fault' : modeIdx === 2 ? 'ok' : modeIdx === 1 ? 'warn' : ''
  const missionName = missionState?.mission?.toUpperCase() ?? null
  const elapsedSec = missionState?.elapsed_s ?? 0
  const limitSec = missionState?.limit_s ?? 1500
  const fmtTime = (sec) => {
    const m = Math.floor(sec / 60); const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  const isLinkOk = linkOk?.data !== false
  const linkAgeSec = linkAge?.data

  const toggleStop = async () => {
    const next = !stopped
    try {
      await callService(config.services.softStop, { data: next })
      setStopped(next)
    } catch {
      setStopped('failed')
    }
  }

  // Determine effective status for each link
  const getLinkStatus = (id) => {
    if (DEMO) return linkStates[id]
    if (id === 'rosbridge') return status === 'connected' && linkStates.rosbridge
    if (id === 'safety') return status === 'connected' && stopped !== 'failed' && linkStates.safety
    return linkStates[id]
  }

  return (
    <header>
      <div className="brand-zone">
        <div className="brand">
          <span className="mark" aria-hidden />
          <h1>{config.roverName}</h1>
        </div>

        {/* 4 Comms & Camera Links: Green if Working, Red if Not Working */}
        <div className="top-links-bar" title="Ground Station Telemetry & Camera Links">
          {config.links.map((link) => {
            const isWorking = getLinkStatus(link.id)
            return (
              <button
                key={link.id}
                type="button"
                className={`top-link-pill ${isWorking ? 'working' : 'down'}`}
                onClick={() => toggleLink(link.id)}
                title={`${link.name}: ${isWorking ? 'WORKING (ONLINE)' : 'NOT WORKING (DOWN)'} · Port ${link.port} · Ping ${link.ping} · Click to simulate failover`}
              >
                <span className={`link-dot ${isWorking ? 'working' : 'down'}`} />
                <span className="link-title">{link.shortName}</span>
                <span className="link-metric mono">
                  {isWorking ? (link.id === 'camera' ? '60fps' : link.ping) : 'DOWN'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="hud">
        <span className="hud-item">
          <Dot state={linkState} />
          {DEMO ? 'simulated data' : `rosbridge ${status}`}
        </span>

        {/* MissionState: mode, mission name, timer */}
        {modeName && (
          <span className={`hud-item mono ${modeClass}`}>
            {missionName ? `${missionName} ` : ''}{modeName}
          </span>
        )}
        {missionState?.running && (
          <span className={`hud-item mono ${elapsedSec > limitSec * 0.85 ? 'warn' : 'ok'}`}>
            {fmtTime(elapsedSec)} / {fmtTime(limitSec)}
          </span>
        )}

        {/* link_monitor: /trixanth/link_ok */}
        {linkAgeSec != null && (
          <span className={`hud-item mono ${isLinkOk ? 'ok' : 'fault'}`}>
            LINK {isLinkOk ? `${linkAgeSec.toFixed(2)}s` : 'DOWN'}
          </span>
        )}

        <span className="hud-item mono">{fsm?.data ?? '—'}</span>
        <span className={`hud-item mono ${vClass}`}>
          {volts != null ? `${fmt(volts, 1)} V` : '— V'}
          {battery?.percentage != null && ` · ${Math.round(battery.percentage * 100)}%`}
        </span>
        {drivingActive && (
          <span className="hud-item mono drive-active-badge">
            TELEOP DRIVE ACTIVE
          </span>
        )}
      </div>

      <div className="header-right">
        <label className="checkbox demo-toggle">
          <input type="checkbox" checked={DEMO} onChange={(e) => setDemo(e.target.checked)} />
          Demo
        </label>
        {stopped === 'failed' && (
          <span className="notice inline">Command did not reach the rover.</span>
        )}
        <button
          className={stopped === true ? 'softstop released' : 'softstop'}
          disabled={!canStop}
          onClick={toggleStop}
        >
          {stopped === true ? 'Release soft stop' : 'Soft stop'}
        </button>
      </div>
    </header>
  )
}
