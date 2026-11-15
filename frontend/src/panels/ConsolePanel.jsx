import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { Chip, Empty, Panel, Dot } from '../components/ui'
import { useTopicBuffer } from '../ros'
import { fetchLaunches, tailLog } from '../api'
import { IconTerminal, IconLogs } from '../components/Icons'

const LEVELS = [
  { key: 10, label: 'Debug' },
  { key: 20, label: 'Info' },
  { key: 30, label: 'Warn' },
  { key: 40, label: 'Error' },
]
const NAME = { 10: 'debug', 20: 'info', 30: 'warn', 40: 'error', 50: 'fatal' }

// Subsystem-specific subscribed node mapping
const SUBSYSTEM_NODES = {
  general: [
    'mission_fsm_core',
    'trixanth_safety',
    'safety_monitor',
    'robot_state_publisher',
    'rosbridge_server',
    'diagnostics_agg',
  ],
  ml: [
    'ml_locomotion',
    'locomotion_drive',
    'diff_drive',
    'controller_server',
    'smac_planner',
    'ekf_filter_node',
    'nav2_controller',
    'realsense_camera',
    'yolo_detector',
    'wheels',
  ],
  electrical: [
    'bms_monitor',
    'battery_state',
    'inverter_bridge',
    'power_distribution',
    'current_monitor',
  ],
  cams_comms: [
    'sector_antenna_tracker',
    'rf_transceiver',
    'comms_mesh',
    'realsense_camera',
    'webcam_streamer',
  ],
  arm_rado: [
    'arm_driver',
    'moveit_server',
    'gripper_service',
    'trajectory_controller',
    'arm_joints',
    'rado_cache_manager',
  ],
  // Legacy aliases
  locomotion: ['locomotion_drive', 'diff_drive', 'controller_server', 'smac_planner', 'ekf_filter_node', 'wheels'],
  arm: ['arm_driver', 'moveit_server', 'gripper_service', 'trajectory_controller'],
  abex: ['abex_drill', 'abex_spectrometer'],
  rado: ['rado_tracker', 'rf_transceiver'],
  perception: ['realsense_camera', 'yolo_detector'],
  core: ['rosbridge_server', 'safety_monitor'],
}

// Global nodes received across all subsystems
const GLOBAL_NODES = [
  'mission_fsm_core',
  'trixanth_safety',
  'safety_monitor',
  'robot_state_publisher',
  'lifecycle_manager',
  'diagnostics_agg',
  'launch',
]

// Default primary process node for each subsystem
const SUBSYSTEM_PRIMARY_NODE = {
  general: 'rosbridge_server',
  ml: 'locomotion_drive',
  electrical: 'bms_monitor',
  cams_comms: 'rf_transceiver',
  arm_rado: 'arm_driver',
  locomotion: 'locomotion_drive',
  arm: 'arm_driver',
  abex: 'abex_drill',
  rado: 'rado_tracker',
  perception: 'realsense_camera',
  core: 'rosbridge_server',
}

export default function ConsolePanel({ activeSubsystem = 'general' }) {
  // Console state
  const [minLevel, setMinLevel] = useState(20)
  const [consolePaused, setConsolePaused] = useState(false)
  const [consoleFilter, setConsoleFilter] = useState('')
  const [logScope, setLogScope] = useState('all') // 'all' | 'global' | 'local'

  // Node Logs state
  const [launches, setLaunches] = useState([])
  const [selectedNode, setSelectedNode] = useState('arm_driver')
  const [nodeLogs, setNodeLogs] = useState([])
  const [logsPaused, setLogsPaused] = useState(false)
  const [logsFilter, setLogsFilter] = useState('')

  // Splitter ratio between console and logs (percentage for left pane)
  const [splitPercent, setSplitPercent] = useState(50)
  const [isSplitting, setIsSplitting] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const splitContainerRef = useRef(null)

  const consoleLines = useTopicBuffer(config.topics.rosout, 400, { throttle: 100, paused: consolePaused })
  const consoleBox = useRef(null)
  const consolePinned = useRef(true)

  const logsBox = useRef(null)
  const logsPinned = useRef(true)

  // Fetch available launch nodes on mount and poll
  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const data = await fetchLaunches()
        if (!alive) return
        setLaunches(data)
      } catch {}
    }
    poll()
    const id = setInterval(poll, 2500)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  // Auto-switch selected log node when subsystem changes if user hasn't explicitly changed it
  useEffect(() => {
    if (activeSubsystem && SUBSYSTEM_PRIMARY_NODE[activeSubsystem]) {
      setSelectedNode(SUBSYSTEM_PRIMARY_NODE[activeSubsystem])
    }
  }, [activeSubsystem])

  // Tail log for selected process
  useEffect(() => {
    if (!selectedNode) return
    setNodeLogs([])
    const cancel = tailLog(selectedNode, (line) => {
      if (!logsPaused) {
        setNodeLogs((prev) => [...prev.slice(-399), line])
      }
    })
    return () => {
      if (cancel) cancel()
    }
  }, [selectedNode, logsPaused])

  const subNodes = SUBSYSTEM_NODES[activeSubsystem] || []

  const isRelevantNode = (nodeName, msg = '') => {
    if (logScope === 'all') return true
    const lowerName = (nodeName || '').toLowerCase()
    const lowerMsg = (msg || '').toLowerCase()
    const isGlobal = GLOBAL_NODES.some((gn) => lowerName.includes(gn.toLowerCase())) || lowerMsg.includes('[global]') || lowerName.includes('global')
    const isLocal = subNodes.some((sn) => lowerName.includes(sn.toLowerCase())) || lowerMsg.includes('[local')

    if (logScope === 'global') return isGlobal
    if (logScope === 'local') return isLocal && !isGlobal
    return true
  }

  const shownConsole = consoleLines.filter((l) => {
    if ((l.level ?? 20) < minLevel) return false
    if (!isRelevantNode(l.name, l.msg)) return false
    if (consoleFilter === '') return true
    return `${l.name} ${l.msg}`.toLowerCase().includes(consoleFilter.toLowerCase())
  })

  const shownLogs = nodeLogs.filter((line) => {
    if (logsFilter === '') return true
    return line.toLowerCase().includes(logsFilter.toLowerCase())
  })

  useEffect(() => {
    if (consolePinned.current && consoleBox.current) {
      consoleBox.current.scrollTop = consoleBox.current.scrollHeight
    }
  }, [shownConsole.length])

  useEffect(() => {
    if (logsPinned.current && logsBox.current) {
      logsBox.current.scrollTop = logsBox.current.scrollHeight
    }
  }, [shownLogs.length])

  // Divider drag handler between Console and Logs
  const handleSplitterMouseDown = (e) => {
    e.preventDefault()
    setIsSplitting(true)
    const container = splitContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()

    const onMouseMove = (moveEvent) => {
      const offsetX = moveEvent.clientX - rect.left
      const pct = Math.min(Math.max(20, (offsetX / rect.width) * 100), 80)
      setSplitPercent(pct)
    }

    const onMouseUp = () => {
      setIsSplitting(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const activeLaunchInfo = launches.find((l) => l.name === selectedNode)

  return (
    <Panel
      title="Console & Process Logs"
      className={`console-panel dual-console-logs-panel ${isCollapsed ? 'is-panel-collapsed' : ''}`}
      actions={
        <div className="dual-dock-global-actions">
          <span className="mono dock-status-tag">
            LOGS BESIDE CONSOLE
          </span>
          {!isCollapsed && (
            <Chip active={splitPercent === 50} onClick={() => setSplitPercent(50)}>
              50 / 50
            </Chip>
          )}
          <button
            type="button"
            className="ghost mini mono"
            onClick={() => setIsCollapsed((c) => !c)}
            title={isCollapsed ? 'Expand console & process logs' : 'Collapse console to maximize operations view'}
          >
            {isCollapsed ? 'Expand Logs' : 'Collapse'}
          </button>
        </div>
      }
    >
      {!isCollapsed && (
        <div
          className={`dual-console-logs-container ${isSplitting ? 'resizing-split' : ''}`}
          ref={splitContainerRef}
        >
        {/* PANE 1: ROS CONSOLE (/rosout) */}
        <div
          className="dock-subpane console-subpane"
          style={{ width: `calc(${splitPercent}% - 4px)` }}
        >
          <div className="subpane-header">
            <div className="subpane-title">
              <IconTerminal size={14} className="subpane-icon" />
              <span className="subpane-heading mono">CONSOLE (/rosout)</span>
              <span className="subpane-count mono">{shownConsole.length} lines</span>
            </div>

            <div className="console-tools">
              <input
                className="filter"
                placeholder="filter console..."
                value={consoleFilter}
                onChange={(e) => setConsoleFilter(e.target.value)}
              />

              <button
                type="button"
                className={`subsystem-console-filter-chip ${logScope === 'all' ? 'active' : ''}`}
                onClick={() => setLogScope('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`subsystem-console-filter-chip ${logScope === 'global' ? 'active' : ''}`}
                onClick={() => setLogScope('global')}
                title="Show only Global logs broadcast to all subsystems"
              >
                Global
              </button>
              <button
                type="button"
                className={`subsystem-console-filter-chip ${logScope === 'local' ? 'active' : ''}`}
                onClick={() => setLogScope('local')}
                title={`Show only Local logs for ${activeSubsystem.toUpperCase()}`}
              >
                Local [{activeSubsystem.toUpperCase()}]
              </button>

              {LEVELS.map((l) => (
                <Chip key={l.key} active={minLevel === l.key} onClick={() => setMinLevel(l.key)}>
                  {l.label}
                </Chip>
              ))}

              <Chip active={consolePaused} onClick={() => setConsolePaused((p) => !p)}>
                {consolePaused ? 'Paused' : 'Pause'}
              </Chip>
            </div>
          </div>

          <div
            className="console dual-console-box"
            ref={consoleBox}
            onScroll={(e) => {
              const el = e.currentTarget
              consolePinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            }}
          >
            {shownConsole.length === 0 ? (
              <Empty>
                No console output for {activeSubsystem.toUpperCase()} nodes + global nodes at level {NAME[minLevel]}.
              </Empty>
            ) : (
              shownConsole.map((l, i) => (
                <div key={i} className={`line ${NAME[l.level] ?? 'info'}`}>
                  <span className="t">{new Date(l._rx).toLocaleTimeString('en-GB')}</span>
                  <span className="lv">{(NAME[l.level] ?? 'info').slice(0, 4)}</span>
                  <span className="src">{l.name}</span>
                  <span className="msg">{l.msg}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* DRAGGABLE DIVIDER BETWEEN CONSOLE AND LOGS */}
        <div
          className="dock-splitter-handle"
          onMouseDown={handleSplitterMouseDown}
          title="Drag left/right to resize Console and Process Logs"
        >
          <div className="splitter-grip-dots" />
        </div>

        {/* PANE 2: PROCESS / NODE LOGS (VISIBLE AT ALL TIMES BESIDE CONSOLE) */}
        <div
          className="dock-subpane logs-subpane"
          style={{ width: `calc(${100 - splitPercent}% - 4px)` }}
        >
          <div className="subpane-header">
            <div className="subpane-title">
              <IconLogs size={14} className="subpane-icon" />
              <span className="subpane-heading mono">PROCESS LOGS</span>

              {/* Node selector dropdown */}
              <div className="log-node-select-wrap">
                <select
                  className="log-node-select mono"
                  value={selectedNode}
                  onChange={(e) => setSelectedNode(e.target.value)}
                  title="Select launch process to inspect logs"
                >
                  {launches.length === 0 && (
                    <option value={selectedNode}>{selectedNode}</option>
                  )}
                  {launches.map((l) => (
                    <option key={l.name} value={l.name}>
                      {l.state === 'running' ? '● ' : '○ '}
                      [{l.subsystem ? l.subsystem.toUpperCase() : 'CORE'}] {l.label || l.name}
                    </option>
                  ))}
                </select>
              </div>

              {activeLaunchInfo && (
                <span className={`node-live-status-badge ${activeLaunchInfo.state}`}>
                  <Dot state={activeLaunchInfo.state} />
                  <span className="mono">{activeLaunchInfo.state}</span>
                </span>
              )}
            </div>

            <div className="logs-tools">
              <input
                className="filter"
                placeholder="filter logs..."
                value={logsFilter}
                onChange={(e) => setLogsFilter(e.target.value)}
              />

              <Chip active={logsPaused} onClick={() => setLogsPaused((p) => !p)}>
                {logsPaused ? 'Paused' : 'Pause'}
              </Chip>

              <button
                type="button"
                className="ghost mini"
                onClick={() => setNodeLogs([])}
                title="Clear current log buffer"
              >
                Clear
              </button>
            </div>
          </div>

          <div
            className="log dual-logs-box mono"
            ref={logsBox}
            onScroll={(e) => {
              const el = e.currentTarget
              logsPinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            }}
          >
            {shownLogs.length === 0 ? (
              <Empty>
                No process logs available for {selectedNode}. Node may be idle or starting up.
              </Empty>
            ) : (
              shownLogs.map((l, i) => (
                <div key={i} className="process-log-line">
                  <span className="log-line-idx">{i + 1}</span>
                  <span className="log-line-text">{l}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      )}
    </Panel>
  )
}
