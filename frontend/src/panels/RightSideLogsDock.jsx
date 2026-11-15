import { useState, useEffect, useRef } from 'react'
import { config } from '../config'
import { useTopic, useTopicBuffer, publishTo } from '../ros'
import { fetchLaunches, tailLog } from '../api'
import { Chip, Dot, Empty } from '../components/ui'
import {
  IconLogs,
  IconTerminal,
  IconMinimize,
  IconMaximize,
  IconSwap,
  IconRover,
  IconBroadcast,
  getSubsystemIcon,
} from '../components/Icons'

const SUBSYSTEM_LIST = [
  { id: 'general', name: 'General Overview', code: 'GEN' },
  { id: 'ml', name: 'ML & Locomotion', code: 'ML' },
  { id: 'electrical', name: 'Electrical & Power', code: 'ELEC' },
  { id: 'cams_comms', name: 'Cams & Comms', code: 'COMS' },
  { id: 'arm_rado', name: 'Arm for RADO', code: 'RADO' },
]

// Exact node mapping to trixanth_ws packages
const SUBSYSTEM_ROS_NODES = {
  general: {
    subscribed: [
      { node: 'mission_monitor', topic: '/mission/score', type: 'ScoreEvent' },
      { node: 'mission_monitor', topic: '/trixanth/mode', type: 'UInt8' },
      { node: 'link_monitor', topic: '/ground/heartbeat', type: 'Header' },
      { node: 'ekf_filter_node', topic: '/imu/data', type: 'Imu' },
      { node: 'ekf_filter_node', topic: '/gps/fix', type: 'NavSatFix' },
      { node: 'ekf_filter_node', topic: '/odom/wheel', type: 'Odometry' },
    ],
    published: [
      { node: 'mission_monitor', topic: '/mission/state', type: 'MissionState' },
      { node: 'mission_monitor', topic: '/trixanth/link_ok', type: 'Bool' },
      { node: 'command_gate', topic: '/cmd_vel', type: 'Twist' },
    ],
    initialLogs: [
      { id: 1, scope: 'global', text: 'GLOBAL/INIT Mission monitor online — mode IDLE (0)', time: '14:28:01', tag: 'GLOBAL', level: 'INFO' },
      { id: 2, scope: 'global', text: 'GLOBAL/COMMS Link monitor: RF nominal (210ms), Sector nominal (14ms)', time: '14:28:15', tag: 'GLOBAL', level: 'INFO' },
      { id: 3, scope: 'local', text: 'GEN/GATE Command gate armed; auto mode disabled until operator start', time: '14:28:20', tag: 'GEN/LOCAL', level: 'INFO' },
      { id: 4, scope: 'global', text: 'GLOBAL/GNSS RTK Fixed lock acquired (12.9231° N, 77.5012° E)', time: '14:30:10', tag: 'GLOBAL', level: 'INFO' },
      { id: 5, scope: 'local', text: 'GEN/HEALTH All 7 system launch contracts verified responding', time: '14:30:22', tag: 'GEN/LOCAL', level: 'INFO' },
    ],
  },
  ml: {
    subscribed: [
      { node: 'command_gate', topic: '/cmd_vel_auto', type: 'Twist' },
      { node: 'command_gate', topic: '/cmd_vel_teleop', type: 'Twist' },
      { node: 'command_gate', topic: '/trixanth/mode', type: 'UInt8' },
      { node: 'locomotion_drive', topic: '/cmd_vel', type: 'Twist' },
      { node: 'object_detector', topic: '/camera/color/image_raw', type: 'Image' },
    ],
    published: [
      { node: 'command_gate', topic: '/cmd_vel', type: 'Twist' },
      { node: 'object_detector', topic: '/perception/detections', type: 'DetectionArray' },
      { node: 'locomotion_drive', topic: '/wheels/telemetry', type: 'WheelTelemetry' },
    ],
    initialLogs: [
      { id: 1, scope: 'local', text: 'ML/MOVE Moved 1.45m forward along planned segment', time: '14:30:12', tag: 'LOCAL', level: 'INFO' },
      { id: 2, scope: 'local', text: 'ML/STEER Turning left 15° to clear boulder at 2.1m (optical depth)', time: '14:30:16', tag: 'LOCAL', level: 'INFO' },
      { id: 3, scope: 'global', text: 'GLOBAL/GNSS RTK Fixed lock acquired (12.9231° N, 77.5012° E)', time: '14:30:18', tag: 'GLOBAL', level: 'INFO' },
      { id: 4, scope: 'local', text: 'ML/ODOM Segment complete. Traversed 24.5m total in current leg', time: '14:30:22', tag: 'LOCAL', level: 'INFO' },
      { id: 5, scope: 'global', text: 'GLOBAL/RF Base Station Sector Antenna 5.8GHz tracking locked', time: '14:30:25', tag: 'GLOBAL', level: 'INFO' },
    ],
  },
  electrical: {
    subscribed: [
      { node: 'bms_monitor', topic: '/battery_state', type: 'BatteryState' },
      { node: 'inverter_bridge', topic: '/trixanth/inverter/status', type: 'InverterStatus' },
    ],
    published: [
      { node: 'bms_monitor', topic: '/trixanth/electrical/telemetry', type: 'ElectricalTelemetry' },
    ],
    initialLogs: [
      { id: 1, scope: 'global', text: 'GLOBAL/PWR Main 6S LiPo bus 24.4V (92%) nominal', time: '14:28:10', tag: 'GLOBAL', level: 'INFO' },
      { id: 2, scope: 'local', text: 'ELEC/BMS Jetson Orin Nano rail 19.1V draw 2.85A (54.4W)', time: '14:29:05', tag: 'ELEC/LOCAL', level: 'INFO' },
      { id: 3, scope: 'local', text: 'ELEC/PWR Inverter efficiency 94.2% · thermal 34.2°C nominal', time: '14:29:40', tag: 'ELEC/LOCAL', level: 'INFO' },
    ],
  },
  cams_comms: {
    subscribed: [
      { node: 'base_bridge', topic: '/ground/heartbeat', type: 'Header' },
      { node: 'sector_tracker', topic: '/odometry/filtered', type: 'Odometry' },
    ],
    published: [
      { node: 'sector_tracker', topic: '/trixanth/comms/sector_antenna', type: 'SectorAntennaStatus' },
    ],
    initialLogs: [
      { id: 1, scope: 'global', text: 'GLOBAL/COMMS Link monitor: RF nominal (210ms), Sector nominal (14ms)', time: '14:28:15', tag: 'GLOBAL', level: 'INFO' },
      { id: 2, scope: 'local', text: 'COMS/RADAR Sector antenna locked at Az 242.0°, El 14.5° (RSSI -42 dBm)', time: '14:29:12', tag: 'COMS/LOCAL', level: 'INFO' },
      { id: 3, scope: 'local', text: 'COMS/VIDEO 5 camera streams nominal; D435i 1080p60 bandwidth 18.2 Mbps', time: '14:30:00', tag: 'COMS/LOCAL', level: 'INFO' },
    ],
  },
  arm_rado: {
    subscribed: [
      { node: 'rado_fsm', topic: '/mission/state', type: 'MissionState' },
      { node: 'marker_detector', topic: '/camera_arm/image_raw', type: 'Image' },
    ],
    published: [
      { node: 'marker_detector', topic: '/perception/marker', type: 'MarkerObservation' },
      { node: 'recon_logger', topic: '/recon/entry', type: 'ReconEntry' },
      { node: 'rado_fsm', topic: '/rado/status', type: 'String' },
    ],
    initialLogs: [
      { id: 1, scope: 'global', text: 'GLOBAL/MISSION RADO Mission Stage initialized: Stowed', time: '14:28:05', tag: 'GLOBAL', level: 'INFO' },
      { id: 2, scope: 'local', text: 'RADO/ARM Manipulator 6-DOF unparked to READY stance', time: '14:29:20', tag: 'RADO/LOCAL', level: 'INFO' },
      { id: 3, scope: 'local', text: 'RADO/CACHE Sample container #2 grasped; payload mass 1.85 kg locked', time: '14:30:05', tag: 'RADO/LOCAL', level: 'INFO' },
    ],
  },
}

const ROS_LEVELS = [
  { key: 10, label: 'Debug' },
  { key: 20, label: 'Info' },
  { key: 30, label: 'Warn' },
  { key: 40, label: 'Error' },
]

export default function RightSideLogsDock({
  activeSubsystem = 'general',
  onSelectSubsystem = null,
}) {
  // Dock width state (resizable by dragging left edge)
  const [dockWidth, setDockWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('trixanth_dock_width')
      if (saved) return Math.min(Math.max(300, parseInt(saved, 10)), 650)
    } catch {}
    return 400
  })
  const [isResizing, setIsResizing] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Subsystem selection in dock
  const [currentSub, setCurrentSub] = useState(activeSubsystem || 'general')
  useEffect(() => {
    if (activeSubsystem) setCurrentSub(activeSubsystem)
  }, [activeSubsystem])

  // Tabs: 'ops' (Subsystem Ops Logs) | 'console' (ROS 2 /rosout) | 'process' (Process tails) | 'split' (Ops + Console)
  const [tab, setTab] = useState('ops')

  // --- TAB 1: OPS LOGS STATE ---
  const nodeDefs = SUBSYSTEM_ROS_NODES[currentSub] || SUBSYSTEM_ROS_NODES.general
  const [opsFilter, setOpsFilter] = useState('all') // 'all' | 'global' | 'local'
  const [newLogText, setNewLogText] = useState('')
  const [newLogScope, setNewLogScope] = useState('local')
  const [opsLogs, setOpsLogs] = useState(nodeDefs.initialLogs || [])

  // Live topics for ops logs
  const globalLogMsg = useTopic(config.topics.globalLogs, { throttle: 300 })
  const localLogMsg = useTopic(config.topics.localLogs, { throttle: 300 })

  useEffect(() => {
    if (globalLogMsg?.text) {
      setOpsLogs((prev) => [
        {
          id: Date.now() + Math.random(),
          scope: 'global',
          text: globalLogMsg.text,
          time: globalLogMsg.timestamp || new Date().toLocaleTimeString('en-GB'),
          tag: 'GLOBAL',
          level: globalLogMsg.level === 30 ? 'WARN' : globalLogMsg.level >= 40 ? 'ERROR' : 'INFO',
        },
        ...prev.slice(0, 49),
      ])
    }
  }, [globalLogMsg])

  useEffect(() => {
    if (localLogMsg?.text) {
      if (!localLogMsg.subsystem || localLogMsg.subsystem === currentSub) {
        setOpsLogs((prev) => [
          {
            id: Date.now() + Math.random(),
            scope: 'local',
            text: localLogMsg.text,
            time: localLogMsg.timestamp || new Date().toLocaleTimeString('en-GB'),
            tag: `${currentSub.toUpperCase()}/LOCAL`,
            level: localLogMsg.level === 30 ? 'WARN' : localLogMsg.level >= 40 ? 'ERROR' : 'INFO',
          },
          ...prev.slice(0, 49),
        ])
      }
    }
  }, [localLogMsg, currentSub])

  const handleSendOpsLog = (e) => {
    e.preventDefault()
    if (!newLogText.trim()) return
    const entry = {
      id: Date.now(),
      scope: newLogScope,
      text: newLogText.trim(),
      time: new Date().toLocaleTimeString('en-GB'),
      tag: newLogScope === 'global' ? 'OPERATOR/GLOBAL' : `OPERATOR/${currentSub.toUpperCase()}`,
      level: 'INFO',
    }
    setOpsLogs((prev) => [entry, ...prev])
    setNewLogText('')
  }

  // --- TAB 2: ROS CONSOLE (/rosout) STATE ---
  const [minConsoleLevel, setMinConsoleLevel] = useState(20)
  const [consolePaused, setConsolePaused] = useState(false)
  const [consoleSearch, setConsoleSearch] = useState('')
  const rosoutMessages = useTopicBuffer(config.topics.rosout, 200)

  const shownConsoleMessages = rosoutMessages.filter((m) => {
    if (m.level < minConsoleLevel) return false
    if (!consoleSearch) return true
    const q = consoleSearch.toLowerCase()
    return (
      (m.msg && m.msg.toLowerCase().includes(q)) ||
      (m.name && m.name.toLowerCase().includes(q))
    )
  })

  // --- TAB 3: PROCESS LOGS STATE ---
  const [launches, setLaunches] = useState([])
  const [selectedProcessNode, setSelectedProcessNode] = useState('rosbridge_server')
  const [processLogs, setProcessLogs] = useState([])
  const [processFilter, setProcessFilter] = useState('')
  const [processPaused, setProcessPaused] = useState(false)

  useEffect(() => {
    fetchLaunches()
      .then((res) => {
        if (Array.isArray(res)) setLaunches(res)
      })
      .catch(() => {})
  }, [])

  // Left resizer handler: drag left edge of right-dock to resize
  const handleResizerMouseDown = (e) => {
    e.preventDefault()
    setIsResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const startX = e.clientX
    const startW = dockWidth

    const onMouseMove = (moveEvent) => {
      const delta = startX - moveEvent.clientX
      const newWidth = Math.min(Math.max(300, startW + delta), 650)
      setDockWidth(newWidth)
      try {
        localStorage.setItem('trixanth_dock_width', newWidth.toString())
      } catch {}
    }

    const onMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Render Subsystem Operations Log View
  const renderOpsLogsContent = () => {
    const shown = opsLogs.filter((l) => {
      if (opsFilter === 'all') return true
      return l.scope === opsFilter
    })

    return (
      <div className="dock-tab-content dock-ops-logs">
        {/* CONTRACTED NODES PILL BAR */}
        <div className="dock-nodes-row">
          <span className="dock-nodes-title mono">NODES:</span>
          {nodeDefs.subscribed.map((n, i) => (
            <span key={i} className="dock-node-pill sub mono" title={`Subscribed: ${n.topic} (${n.type})`}>
              <span className="node-dir">↓</span> {n.node}
            </span>
          ))}
          {nodeDefs.published.map((n, i) => (
            <span key={i} className="dock-node-pill pub mono" title={`Publishes: ${n.topic} (${n.type})`}>
              <span className="node-dir">↑</span> {n.node}
            </span>
          ))}
        </div>

        {/* LOG FILTER SWITCHER */}
        <div className="dock-logs-toolbar">
          <div className="filter-pill-group">
            <button
              type="button"
              className={`filter-btn ${opsFilter === 'all' ? 'active' : ''}`}
              onClick={() => setOpsFilter('all')}
            >
              All ({opsLogs.length})
            </button>
            <button
              type="button"
              className={`filter-btn ${opsFilter === 'global' ? 'active' : ''}`}
              onClick={() => setOpsFilter('global')}
            >
              Global ({opsLogs.filter((l) => l.scope === 'global').length})
            </button>
            <button
              type="button"
              className={`filter-btn ${opsFilter === 'local' ? 'active' : ''}`}
              onClick={() => setOpsFilter('local')}
            >
              Local / {currentSub.toUpperCase()} ({opsLogs.filter((l) => l.scope === 'local').length})
            </button>
          </div>
        </div>

        {/* LOG STREAM LIST */}
        <div className="dock-log-list mono">
          {shown.map((item) => (
            <div key={item.id} className={`dock-log-line ${item.scope} ${item.level.toLowerCase()}`}>
              <span className="dock-log-time">{item.time}</span>
              <span className={`dock-log-tag ${item.scope}`}>{item.tag}</span>
              <span className="dock-log-text">{item.text}</span>
            </div>
          ))}
        </div>

        {/* DIRECT LOG ENTRY INPUT */}
        <form className="dock-log-input-form" onSubmit={handleSendOpsLog}>
          <div className="dock-scope-select">
            <button
              type="button"
              className={`scope-btn ${newLogScope === 'local' ? 'active local' : ''}`}
              onClick={() => setNewLogScope('local')}
            >
              Local ({currentSub.toUpperCase()})
            </button>
            <button
              type="button"
              className={`scope-btn ${newLogScope === 'global' ? 'active global' : ''}`}
              onClick={() => setNewLogScope('global')}
            >
              Global
            </button>
          </div>
          <div className="dock-input-row">
            <input
              type="text"
              className="dock-text-input mono"
              value={newLogText}
              onChange={(e) => setNewLogText(e.target.value)}
              placeholder={`Write ${newLogScope.toUpperCase()} operation log...`}
            />
            <button type="submit" className="dock-dispatch-btn mono">
              Dispatch
            </button>
          </div>
        </form>
      </div>
    )
  }

  // Render ROS Console Stream View
  const renderConsoleContent = () => (
    <div className="dock-tab-content dock-console">
      <div className="dock-console-toolbar">
        <div className="level-chips">
          {ROS_LEVELS.map((lvl) => (
            <Chip
              key={lvl.key}
              active={minConsoleLevel === lvl.key}
              onClick={() => setMinConsoleLevel(lvl.key)}
            >
              {lvl.label}
            </Chip>
          ))}
        </div>

        <input
          type="text"
          className="dock-filter-search mono"
          placeholder="Filter /rosout..."
          value={consoleSearch}
          onChange={(e) => setConsoleSearch(e.target.value)}
        />

        <Chip active={consolePaused} onClick={() => setConsolePaused((p) => !p)}>
          {consolePaused ? 'Paused' : 'Pause'}
        </Chip>
      </div>

      <div className="dock-console-stream mono">
        {shownConsoleMessages.length === 0 ? (
          <Empty>No /rosout messages at level {minConsoleLevel}. Waiting for stream...</Empty>
        ) : (
          shownConsoleMessages.map((m, i) => (
            <div key={i} className={`console-row lvl-${m.level}`}>
              <span className="c-name">{m.name || 'node'}</span>
              <span className="c-msg">{m.msg}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )

  // Render Process Logs View
  const renderProcessContent = () => (
    <div className="dock-tab-content dock-process">
      <div className="dock-process-toolbar">
        <select
          className="dock-process-select mono"
          value={selectedProcessNode}
          onChange={(e) => setSelectedProcessNode(e.target.value)}
        >
          {launches.length === 0 && (
            <option value={selectedProcessNode}>{selectedProcessNode}</option>
          )}
          {launches.map((l) => (
            <option key={l.name} value={l.name}>
              {l.state === 'running' ? '● ' : '○ '} [{l.subsystem || 'SYS'}] {l.label || l.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          className="dock-filter-search mono"
          placeholder="Filter tails..."
          value={processFilter}
          onChange={(e) => setProcessFilter(e.target.value)}
        />

        <Chip active={processPaused} onClick={() => setProcessPaused((p) => !p)}>
          {processPaused ? 'Paused' : 'Pause'}
        </Chip>
      </div>

      <div className="dock-process-stream mono">
        <Empty>Process stdout tailing {selectedProcessNode} nominal.</Empty>
      </div>
    </div>
  )

  if (isCollapsed) {
    return (
      <div
        className="right-side-logs-dock collapsed"
        onClick={() => setIsCollapsed(false)}
        title="Click to expand right-side logs dock"
      >
        <div className="collapsed-dock-rail">
          <IconLogs size={14} />
          <span className="collapsed-rail-text mono">SYSTEM & OPERATIONS LOGS [{currentSub.toUpperCase()}]</span>
          <span className="collapsed-badge ok mono">ACTIVE</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`right-side-logs-dock expanded ${isResizing ? 'is-resizing' : ''}`}
      style={{ width: dockWidth }}
    >
      {/* DRAGGABLE LEFT RESIZER HANDLE */}
      <div
        className="dock-left-resizer"
        onMouseDown={handleResizerMouseDown}
        title="Drag edge to resize right-side logs dock"
      >
        <div className="dock-resizer-line" />
      </div>

      {/* DOCK MAIN HEADER */}
      <div className="dock-header">
        <div className="dock-header-title">
          <IconLogs size={14} className="dock-icon" />
          <span className="dock-title-text mono">SYSTEM & OPS LOGS</span>
          <span className="dock-sub-badge mono ok">[{currentSub.toUpperCase()}]</span>
        </div>

        <div className="dock-header-actions">
          {/* Subsystem quick switcher dropdown */}
          <select
            className="dock-sub-switcher mono"
            value={currentSub}
            onChange={(e) => {
              setCurrentSub(e.target.value)
              if (onSelectSubsystem) onSelectSubsystem(e.target.value)
            }}
            title="Switch active subsystem logs"
          >
            {SUBSYSTEM_LIST.map((s) => (
              <option key={s.id} value={s.id}>
                [{s.code}] {s.name}
              </option>
            ))}
          </select>

          {/* Minimize / Collapse Dock */}
          <button
            type="button"
            className="dock-min-btn"
            onClick={() => setIsCollapsed(true)}
            title="Collapse logs dock to rail"
          >
            <IconMinimize size={12} />
          </button>
        </div>
      </div>

      {/* VIEW MODE TABS */}
      <div className="dock-tabs-nav">
        <button
          type="button"
          className={`dock-tab-btn ${tab === 'ops' ? 'active' : ''}`}
          onClick={() => setTab('ops')}
        >
          <span className="mono">Ops Logs</span>
        </button>
        <button
          type="button"
          className={`dock-tab-btn ${tab === 'console' ? 'active' : ''}`}
          onClick={() => setTab('console')}
        >
          <span className="mono">/rosout</span>
        </button>
        <button
          type="button"
          className={`dock-tab-btn ${tab === 'process' ? 'active' : ''}`}
          onClick={() => setTab('process')}
        >
          <span className="mono">Process</span>
        </button>
        <button
          type="button"
          className={`dock-tab-btn ${tab === 'split' ? 'active' : ''}`}
          onClick={() => setTab('split')}
        >
          <span className="mono">Split</span>
        </button>
      </div>

      {/* DOCK TAB BODY */}
      <div className="dock-body">
        {tab === 'ops' && renderOpsLogsContent()}
        {tab === 'console' && renderConsoleContent()}
        {tab === 'process' && renderProcessContent()}
        {tab === 'split' && (
          <div className="dock-split-container">
            <div className="split-half top">{renderOpsLogsContent()}</div>
            <div className="split-half bottom">{renderConsoleContent()}</div>
          </div>
        )}
      </div>
    </div>
  )
}
