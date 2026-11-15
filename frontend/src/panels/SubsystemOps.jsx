import { useState, useEffect } from 'react'
import { config } from '../config'
import { useTopic, callService, publishTo } from '../ros'
import { Readout, fmt, Chip, Dot } from '../components/ui'
import CameraView from './CameraView'
import './SubsystemOps.extra.css'
import {
  getSubsystemIcon,
  IconRover,
  IconArm,
  IconTelemetry,
  IconBroadcast,
  IconGlobe,
  IconSwap,
  IconPiP,
  IconMaximize,
  IconTerminal,
  IconLogs,
  IconReady,
  IconStow,
  IconLock,
  IconUnlock,
} from '../components/Icons'

const SUBSYSTEM_LIST = [
  { id: 'general', name: 'General Overview', code: 'GEN', lead: 'All Subsystems View & Health', defaultCam: '/camera/color/image_raw' },
  { id: 'ml', name: 'ML & Locomotion', code: 'ML', lead: 'Locomotion Feed, Relative Ops & Dual Logs', defaultCam: '/camera/color/image_raw' },
  { id: 'electrical', name: 'Electrical & Power', code: 'ELEC', lead: 'Component Batteries & Power Draw', defaultCam: '/camera/color/image_raw' },
  { id: 'cams_comms', name: 'Cams & Comms', code: 'COMS', lead: 'Sector Antenna & 5-Camera Feeds', defaultCam: '/camera/color/image_raw' },
  { id: 'arm_rado', name: 'Arm for RADO', code: 'RADO', lead: 'Manipulator & RADO Mission Delivery', defaultCam: '/camera_arm/image_raw' },
]

export default function SubsystemOps({
  activeSubsystem = 'general',
  onSelectSubsystem = null,
  onFocusCamera = null,
  onOpenPiP = null,
  hideInlineLogs = false,
}) {
  const [currentSub, setCurrentSub] = useState(activeSubsystem || 'general')

  // Keep synced if parent changes active subsystem
  useEffect(() => {
    if (activeSubsystem) {
      setCurrentSub(activeSubsystem)
    }
  }, [activeSubsystem])

  const handleSubSwitch = (subId) => {
    setCurrentSub(subId)
    if (onSelectSubsystem) onSelectSubsystem(subId)
  }

  // Live topic subscriptions
  const odom = useTopic(config.topics.odom, { throttle: 200 })
  const battery = useTopic(config.topics.battery, { throttle: 500 })
  const wheels = useTopic(config.topics.wheels, { throttle: 200 })
  const imu = useTopic(config.topics.imu, { throttle: 200 })
  const gps = useTopic(config.topics.gps, { throttle: 1000 })
  const fsm = useTopic(config.topics.fsmState, { throttle: 500 })

  // trixanth_interfaces core topics
  const missionState = useTopic(config.topics.missionState, { throttle: 500 })
  const missionAlert = useTopic(config.topics.missionAlert, { throttle: 1000 })
  const markerObs = useTopic(config.topics.marker, { throttle: 300 })
  const reconEntry = useTopic(config.topics.reconEntry, { throttle: 1000 })
  const radoStatus = useTopic(config.topics.radoStatus, { throttle: 500 })
  const scoreEvent = useTopic(config.topics.scoreEvent, { throttle: 1000 })
  const linkOk = useTopic(config.topics.linkOk, { throttle: 500 })
  const linkAge = useTopic(config.topics.linkAge, { throttle: 500 })
  const autonomyViolations = useTopic(config.topics.autonomyViolations, { throttle: 1000 })

  // Subsystem specific topics from trixanth_interfaces
  const electricalData = useTopic(config.topics.electrical, { throttle: 500 })
  const sectorData = useTopic(config.topics.sectorAntenna, { throttle: 500 })
  const armRadoData = useTopic(config.topics.armRado, { throttle: 300 })
  const mlData = useTopic(config.topics.mlOperations, { throttle: 300 })
  const globalLogMsg = useTopic(config.topics.globalLogs, { throttle: 300 })
  const localLogMsg = useTopic(config.topics.localLogs, { throttle: 300 })

  return (
    <div className="minimal-subsystem-container">
      {/* MINIMAL SUB-NAV PILLS */}
      <div className="minimal-subnav-bar">
        <div className="minimal-pills-row">
          {SUBSYSTEM_LIST.map((sub) => {
            const isActive = currentSub === sub.id
            return (
              <button
                key={sub.id}
                type="button"
                className={`minimal-nav-pill ${isActive ? 'active' : ''}`}
                onClick={() => handleSubSwitch(sub.id)}
                title={sub.lead}
              >
                <span className="pill-icon">{getSubsystemIcon(sub.id, 13)}</span>
                <span className="pill-code mono">[{sub.code}]</span>
                <span className="pill-name">{sub.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* VIEW 1: GENERAL (View of all subsystems) */}
      {currentSub === 'general' && (
        <GeneralView
          odom={odom}
          battery={battery}
          gps={gps}
          fsm={fsm}
          missionState={missionState}
          missionAlert={missionAlert}
          electricalData={electricalData}
          sectorData={sectorData}
          armRadoData={armRadoData}
          mlData={mlData}
          linkOk={linkOk}
          linkAge={linkAge}
          autonomyViolations={autonomyViolations}
          globalLogMsg={globalLogMsg}
          localLogMsg={localLogMsg}
          onSelectSubsystem={handleSubSwitch}
          hideInlineLogs={hideInlineLogs}
        />
      )}

      {/* VIEW 2: ML & LOCOMOTION (Locomotion cam feed, relative ops, moved X meters, turning left/right, dual logs) */}
      {currentSub === 'ml' && (
        <MLView
          odom={odom}
          wheels={wheels}
          imu={imu}
          mlData={mlData}
          missionState={missionState}
          globalLogMsg={globalLogMsg}
          localLogMsg={localLogMsg}
          onFocusCamera={onFocusCamera}
          onOpenPiP={onOpenPiP}
          hideInlineLogs={hideInlineLogs}
        />
      )}

      {/* VIEW 3: ELECTRICAL (Battery level of each component, power draining per component) */}
      {currentSub === 'electrical' && (
        <ElectricalView
          battery={battery}
          electricalData={electricalData}
          globalLogMsg={globalLogMsg}
          localLogMsg={localLogMsg}
          hideInlineLogs={hideInlineLogs}
        />
      )}

      {/* VIEW 4: CAMS & COMMS (Sector antenna working status & 5 camera feeds) */}
      {currentSub === 'cams_comms' && (
        <CamsCommsView
          sectorData={sectorData}
          linkOk={linkOk}
          linkAge={linkAge}
          globalLogMsg={globalLogMsg}
          localLogMsg={localLogMsg}
          onFocusCamera={onFocusCamera}
          onOpenPiP={onOpenPiP}
          hideInlineLogs={hideInlineLogs}
        />
      )}

      {/* VIEW 5: ARM FOR RADO (Arm operations for RADO mission & arm camera feed) */}
      {currentSub === 'arm_rado' && (
        <ArmRadoView
          armRadoData={armRadoData}
          missionState={missionState}
          markerObs={markerObs}
          reconEntry={reconEntry}
          radoStatus={radoStatus}
          scoreEvent={scoreEvent}
          autonomyViolations={autonomyViolations}
          globalLogMsg={globalLogMsg}
          localLogMsg={localLogMsg}
          onFocusCamera={onFocusCamera}
          onOpenPiP={onOpenPiP}
          hideInlineLogs={hideInlineLogs}
        />
      )}
    </div>
  )
}

// =============================================================================
// ROS 2 NODE TOPICS & CONTRACTS — EXACT MAPPING TO trixanth_ws src packages
// Based on: trixanth_interfaces, trixanth_mission, trixanth_perception,
//           trixanth_hardware, trixanth_comms, trixanth_bringup
// =============================================================================
const SUBSYSTEM_ROS_NODES = {
  // GENERAL: global system supervisors + localization. Publishes mission state,
  // mode events, heartbeat health, and global safety.
  general: {
    subscribed: [
      { node: 'mission_monitor', topic: '/mission/score', type: 'trixanth_interfaces/ScoreEvent' },
      { node: 'mission_monitor', topic: '/trixanth/mode', type: 'std_msgs/UInt8' },
      { node: 'link_monitor', topic: '/ground/heartbeat', type: 'std_msgs/Header' },
      { node: 'ekf_filter_node', topic: '/imu/data', type: 'sensor_msgs/Imu' },
      { node: 'ekf_filter_node', topic: '/gps/fix', type: 'sensor_msgs/NavSatFix' },
      { node: 'ekf_filter_node', topic: '/odom/wheel', type: 'nav_msgs/Odometry' },
    ],
    publishing: [
      { node: 'mission_monitor', topic: '/mission/state', type: 'trixanth_interfaces/MissionState' },
      { node: 'mission_monitor', topic: '/mission/alert', type: 'std_msgs/String' },
      { node: 'command_gate', topic: '/trixanth/mode', type: 'std_msgs/UInt8' },
      { node: 'command_gate', topic: '/trixanth/mode_event', type: 'std_msgs/String' },
      { node: 'command_gate', topic: '/trixanth/autonomy_violations', type: 'std_msgs/UInt32' },
      { node: 'link_monitor', topic: '/trixanth/link_ok', type: 'std_msgs/Bool' },
      { node: 'link_monitor', topic: '/trixanth/link_age', type: 'std_msgs/Float32' },
    ],
    initialLogs: [
      { id: 'g1', scope: 'global', text: 'RTK Fixed lock acquired (12.9231° N, 77.5012° E)', time: '14:32:02', tag: 'GLOBAL/GNSS', level: 'INFO' },
      { id: 'g2', scope: 'global', text: 'System supervisor nominal; 5/5 subsystem heartbeats verified', time: '14:32:08', tag: 'GLOBAL/SAFETY', level: 'INFO' },
      { id: 'l1', scope: 'local', text: 'Mission RADO started — elapsed 0s, limit 1500s, points_max 100', time: '14:32:15', tag: 'GEN/MISSION', level: 'INFO' },
      { id: 'g3', scope: 'global', text: 'Battery capacity 92% (24.4V), est. 52 mins nominal runtime', time: '14:32:21', tag: 'GLOBAL/BMS', level: 'INFO' },
      { id: 'l2', scope: 'local', text: 'Command gate AUTONOMOUS mode active; autonomy_violations: 0', time: '14:32:27', tag: 'GEN/CMD_GATE', level: 'INFO' },
    ],
  },

  // ML: Nav2 MPPI controller, YOLOv8n object detector, visual odometry.
  // Subscribes /camera feed and odometry; publishes cmd_vel, DetectionArray,
  // and ML operations telemetry.
  ml: {
    subscribed: [
      { node: 'mppi_controller', topic: '/plan', type: 'nav_msgs/Path' },
      { node: 'mppi_controller', topic: '/odometry/filtered', type: 'nav_msgs/Odometry' },
      { node: 'object_detector', topic: '/camera/color/image_raw', type: 'sensor_msgs/Image' },
      { node: 'object_detector', topic: '/camera/aligned_depth_to_color/image_raw', type: 'sensor_msgs/Image' },
      { node: 'object_detector', topic: '/camera/color/camera_info', type: 'sensor_msgs/CameraInfo' },
      { node: 'recon_logger', topic: '/perception/detections', type: 'trixanth_interfaces/DetectionArray' },
      { node: 'recon_logger', topic: '/mission/state', type: 'trixanth_interfaces/MissionState' },
    ],
    publishing: [
      { node: 'mppi_controller', topic: '/cmd_vel_auto', type: 'geometry_msgs/Twist' },
      { node: 'object_detector', topic: '/perception/detections', type: 'trixanth_interfaces/DetectionArray' },
      { node: 'object_detector', topic: '/perception/annotated', type: 'sensor_msgs/Image' },
      { node: 'recon_logger', topic: '/recon/entry', type: 'trixanth_interfaces/ReconEntry' },
    ],
    initialLogs: [
      { id: 'l1', scope: 'local', text: 'object_detector: YOLOv8n inference nominal — 10Hz, latency 16ms', time: '14:30:12', tag: 'ML/YOLO', level: 'INFO' },
      { id: 'l2', scope: 'local', text: 'MPPI controller: 64 rollouts scored, tracking planned path', time: '14:30:16', tag: 'ML/MPPI', level: 'INFO' },
      { id: 'g1', scope: 'global', text: 'RTK Fixed lock acquired (12.9231° N, 77.5012° E)', time: '14:30:18', tag: 'GLOBAL/GNSS', level: 'INFO' },
      { id: 'l3', scope: 'local', text: 'recon_logger: auto mode active, min_confidence=0.5, dedupe_radius=3m', time: '14:30:22', tag: 'ML/RECON', level: 'INFO' },
      { id: 'g2', scope: 'global', text: 'Base Station Sector Antenna 5.8GHz tracking locked', time: '14:30:25', tag: 'GLOBAL/RF', level: 'INFO' },
    ],
  },

  // ELECTRICAL: base_bridge (Teensy 4.1 serial), sensor_bridge (ESP32).
  // Subscribes /cmd_vel; publishes odom, IMU, battery, kill_switch.
  electrical: {
    subscribed: [
      { node: 'base_bridge', topic: '/cmd_vel', type: 'geometry_msgs/Twist' },
      { node: 'sensor_bridge', topic: 'ESP32_serial', type: 'raw_serial' },
    ],
    publishing: [
      { node: 'base_bridge', topic: '/odom/wheel', type: 'nav_msgs/Odometry' },
      { node: 'base_bridge', topic: '/imu/data', type: 'sensor_msgs/Imu' },
      { node: 'base_bridge', topic: '/trixanth/kill_switch', type: 'std_msgs/Bool' },
      { node: 'base_bridge', topic: '/trixanth/battery', type: 'sensor_msgs/BatteryState' },
    ],
    initialLogs: [
      { id: 'l1', scope: 'local', text: 'base_bridge: Teensy 4.1 serial connected /dev/trixanth_teensy @ 115200', time: '14:31:02', tag: 'ELEC/BRIDGE', level: 'INFO' },
      { id: 'g1', scope: 'global', text: 'Battery 24.4V 92%, wheel inverters nominal', time: '14:31:08', tag: 'GLOBAL/PWR', level: 'INFO' },
      { id: 'l2', scope: 'local', text: 'base_bridge: wheel odometry fusing; tick_period 50Hz', time: '14:31:14', tag: 'ELEC/ODOM', level: 'INFO' },
      { id: 'l3', scope: 'local', text: 'sensor_bridge: ESP32 temperature sensors nominal; Teensy thermal 29.1°C', time: '14:31:22', tag: 'ELEC/SENSOR', level: 'INFO' },
      { id: 'g2', scope: 'global', text: 'Kill-switch OPEN (motors armed)', time: '14:31:30', tag: 'GLOBAL/ESTOP', level: 'INFO' },
    ],
  },

  // CAMS & COMMS: command_gate (SetMode, cmd_vel arbitration), link_monitor,
  // ground_heartbeat, realsense2_camera node, webcam streamers.
  cams_comms: {
    subscribed: [
      { node: 'command_gate', topic: '/cmd_vel_teleop', type: 'geometry_msgs/Twist' },
      { node: 'command_gate', topic: '/cmd_vel_auto', type: 'geometry_msgs/Twist' },
      { node: 'command_gate', topic: '/trixanth/kill_switch', type: 'std_msgs/Bool' },
      { node: 'command_gate', topic: '/trixanth/link_ok', type: 'std_msgs/Bool' },
      { node: 'link_monitor', topic: '/ground/heartbeat', type: 'std_msgs/Header' },
    ],
    publishing: [
      { node: 'command_gate', topic: '/cmd_vel', type: 'geometry_msgs/Twist' },
      { node: 'command_gate', topic: '/trixanth/mode', type: 'std_msgs/UInt8' },
      { node: 'command_gate', topic: '/trixanth/mode_event', type: 'std_msgs/String' },
      { node: 'link_monitor', topic: '/trixanth/link_ok', type: 'std_msgs/Bool' },
      { node: 'link_monitor', topic: '/trixanth/link_age', type: 'std_msgs/Float32' },
      { node: 'realsense2_camera', topic: '/camera/color/image_raw', type: 'sensor_msgs/Image' },
      { node: 'realsense2_camera', topic: '/camera/depth/image_rect_raw', type: 'sensor_msgs/Image' },
      { node: 'realsense2_camera', topic: '/camera/imu', type: 'sensor_msgs/Imu' },
      { node: 'cam_streamers', topic: '/camera_rear/image_raw', type: 'sensor_msgs/Image' },
      { node: 'cam_streamers', topic: '/camera_arm/image_raw', type: 'sensor_msgs/Image' },
      { node: 'cam_streamers', topic: '/camera_left/image_raw', type: 'sensor_msgs/Image' },
      { node: 'cam_streamers', topic: '/camera_right/image_raw', type: 'sensor_msgs/Image' },
    ],
    initialLogs: [
      { id: 'l1', scope: 'local', text: 'command_gate: mode AUTONOMOUS active, autonomy_violations: 0', time: '14:31:40', tag: 'COMS/GATE', level: 'INFO' },
      { id: 'g1', scope: 'global', text: '5.8GHz RF link RSSI: -64 dBm · SNR: 28.2 dB (Excellent)', time: '14:31:44', tag: 'GLOBAL/RF', level: 'INFO' },
      { id: 'l2', scope: 'local', text: 'realsense2_camera: D435i color 1080p60 + depth Z16 streaming nominal', time: '14:31:50', tag: 'CAMS/D435I', level: 'INFO' },
      { id: 'l3', scope: 'local', text: 'cam_streamers: 4x webcams (rear, arm, left, right) 0 frame drops', time: '14:31:55', tag: 'CAMS/WEBCAMS', level: 'INFO' },
      { id: 'g2', scope: 'global', text: 'link_monitor: ground heartbeat age 80ms (< 1000ms timeout)', time: '14:32:01', tag: 'GLOBAL/LINK', level: 'INFO' },
    ],
  },

  // ARM FOR RADO: rado_fsm (delivery state machine), arm_controller (MoveIt 2),
  // marker_detector, recon_logger.
  arm_rado: {
    subscribed: [
      { node: 'rado_fsm', topic: '/perception/marker', type: 'trixanth_interfaces/MarkerObservation' },
      { node: 'rado_fsm', topic: '/arm/status', type: 'std_msgs/String' },
      { node: 'rado_fsm', topic: '/trixanth/mode', type: 'std_msgs/UInt8' },
      { node: 'marker_detector', topic: '/camera/color/image_raw', type: 'sensor_msgs/Image' },
      { node: 'marker_detector', topic: '/camera/aligned_depth_to_color/image_raw', type: 'sensor_msgs/Image' },
      { node: 'arm_controller', topic: '/arm/joint_commands', type: 'trajectory_msgs/JointTrajectory' },
    ],
    publishing: [
      { node: 'rado_fsm', topic: '/cmd_vel_auto', type: 'geometry_msgs/Twist' },
      { node: 'rado_fsm', topic: '/rado/status', type: 'std_msgs/String' },
      { node: 'rado_fsm', topic: '/arm/command', type: 'std_msgs/String' },
      { node: 'marker_detector', topic: '/perception/marker', type: 'trixanth_interfaces/MarkerObservation' },
      { node: 'arm_controller', topic: '/arm/joint_states', type: 'sensor_msgs/JointState' },
      { node: 'recon_logger', topic: '/recon/entry', type: 'trixanth_interfaces/ReconEntry' },
    ],
    initialLogs: [
      { id: 'l1', scope: 'local', text: 'rado_fsm: loaded 2 deliveries from rado_deliveries.yaml', time: '14:32:10', tag: 'RADO/FSM', level: 'INFO' },
      { id: 'l2', scope: 'local', text: 'marker_detector: colour=blue, min_area_px=200, HSV preset active', time: '14:32:16', tag: 'RADO/MARKER', level: 'INFO' },
      { id: 'g1', scope: 'global', text: 'rado_fsm: state APPROACH — visual servo to blue marker at 1.85m', time: '14:32:20', tag: 'GLOBAL/RADO', level: 'INFO' },
      { id: 'l3', scope: 'local', text: 'arm_controller: gripper 68mm aperture, 3.4N force (payload locked)', time: '14:32:25', tag: 'RADO/ARM', level: 'INFO' },
      { id: 'l4', scope: 'local', text: 'recon_logger: 2 entries saved to ~/trixanth_logs/recon/20261112/', time: '14:32:32', tag: 'RADO/RECON', level: 'INFO' },
    ],
  },
}

// =============================================================================
// REUSABLE DUAL LOGS & SUBSCRIBED/PUBLISHING NODES COMPONENT
// Visible across ALL views including Maximised/Fullscreen view
// =============================================================================
function SubsystemDualLogs({
  subsystemId = 'general',
  subsystemCode = 'GEN',
  subsystemName = 'General Overview',
  globalLogMsg,
  localLogMsg,
}) {
  const nodeDefs = SUBSYSTEM_ROS_NODES[subsystemId] || SUBSYSTEM_ROS_NODES.general
  const [logFilter, setLogFilter] = useState('all') // 'all' | 'global' | 'local'
  const [newLogText, setNewLogText] = useState('')
  const [newLogScope, setNewLogScope] = useState('local')
  const [logList, setLogList] = useState(nodeDefs.initialLogs || [])

  // Append incoming global logs
  useEffect(() => {
    if (globalLogMsg?.text) {
      setLogList((prev) => [
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

  // Append incoming local logs
  useEffect(() => {
    if (localLogMsg?.text) {
      if (!localLogMsg.subsystem || localLogMsg.subsystem === subsystemId) {
        setLogList((prev) => [
          {
            id: Date.now() + Math.random(),
            scope: 'local',
            text: localLogMsg.text,
            time: localLogMsg.timestamp || new Date().toLocaleTimeString('en-GB'),
            tag: `${subsystemCode}/LOCAL`,
            level: localLogMsg.level === 30 ? 'WARN' : localLogMsg.level >= 40 ? 'ERROR' : 'INFO',
          },
          ...prev.slice(0, 49),
        ])
      }
    }
  }, [localLogMsg, subsystemId, subsystemCode])

  const handleSendLog = (e) => {
    e.preventDefault()
    if (!newLogText.trim()) return
    const entry = {
      id: Date.now(),
      scope: newLogScope,
      text: newLogText.trim(),
      time: new Date().toLocaleTimeString('en-GB'),
      tag: newLogScope === 'global' ? 'OPERATOR/GLOBAL' : `OPERATOR/${subsystemCode}`,
      level: 'INFO',
    }
    setLogList((prev) => [entry, ...prev])
    setNewLogText('')
  }

  const shownLogs = logList.filter((item) => {
    if (logFilter === 'all') return true
    return item.scope === logFilter
  })

  return (
    <div className="subsystem-dual-logs-card">
      <div className="logs-head">
        <div className="logs-title-wrap">
          <IconLogs size={14} />
          <span className="card-title">OPERATIONS & NODE LOGS</span>
          <span className="sub-tag-code mono">[{subsystemCode}]</span>
          <span className="mono muted-hint">SUBSCRIBED & PUBLISHING NODES</span>
        </div>

        {/* Filter chips */}
        <div className="log-filter-tabs">
          <button
            type="button"
            className={`log-chip ${logFilter === 'all' ? 'active' : ''}`}
            onClick={() => setLogFilter('all')}
          >
            All ({logList.length})
          </button>
          <button
            type="button"
            className={`log-chip ${logFilter === 'global' ? 'active' : ''}`}
            onClick={() => setLogFilter('global')}
          >
            Global ({logList.filter((l) => l.scope === 'global').length})
          </button>
          <button
            type="button"
            className={`log-chip ${logFilter === 'local' ? 'active' : ''}`}
            onClick={() => setLogFilter('local')}
          >
            Local / {subsystemCode} ({logList.filter((l) => l.scope === 'local').length})
          </button>
        </div>
      </div>

      {/* Subsystem ROS 2 Node Subscriptions & Publications Ribbon */}
      <div className="subsystem-nodes-ribbon mono">
        <div className="nodes-ribbon-col">
          <span className="ribbon-lbl sub">SUBSCRIBED:</span>
          <div className="ribbon-tags-wrap">
            {nodeDefs.subscribed.map((s, idx) => (
              <span key={idx} className="node-pill sub" title={`Node: /${s.node} | Type: ${s.type}`}>
                <span className="node-name">/{s.node}</span>
                <span className="node-topic">{s.topic}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="nodes-ribbon-col">
          <span className="ribbon-lbl pub">PUBLISHING:</span>
          <div className="ribbon-tags-wrap">
            {nodeDefs.publishing.map((p, idx) => (
              <span key={idx} className="node-pill pub" title={`Node: /${p.node} | Type: ${p.type}`}>
                <span className="node-name">/{p.node}</span>
                <span className="node-topic">{p.topic}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Log Stream Box */}
      <div className="log-stream-box mono">
        {shownLogs.map((l) => (
          <div key={l.id} className={`log-entry-row ${l.scope}`}>
            <span className="log-time">{l.time}</span>
            <span className={`log-scope-pill ${l.scope}`}>
              {l.scope === 'global' ? 'GLOBAL' : `LOCAL [${subsystemCode}]`}
            </span>
            <span className={`log-level-pill ${l.level ? l.level.toLowerCase() : 'info'}`}>
              {l.level || 'INFO'}
            </span>
            <span className="log-tag">{l.tag}</span>
            <span className="log-text">{l.text}</span>
          </div>
        ))}
      </div>

      {/* Dispatch form */}
      <form className="log-dispatch-form" onSubmit={handleSendLog}>
        <div className="scope-toggle-group">
          <button
            type="button"
            className={`scope-btn ${newLogScope === 'local' ? 'active local' : ''}`}
            onClick={() => setNewLogScope('local')}
            title={`Send log strictly to ${subsystemName} subsystem`}
          >
            Local ({subsystemCode})
          </button>
          <button
            type="button"
            className={`scope-btn ${newLogScope === 'global' ? 'active global' : ''}`}
            onClick={() => setNewLogScope('global')}
            title="Broadcast log globally across all subsystems"
          >
            Global
          </button>
        </div>
        <input
          type="text"
          className="log-input mono"
          placeholder={`Write ${newLogScope.toUpperCase()} ${subsystemCode} log... (e.g. node health verified, waypoint reached)`}
          value={newLogText}
          onChange={(e) => setNewLogText(e.target.value)}
        />
        <button type="submit" className="log-submit-btn">
          Dispatch
        </button>
      </form>
    </div>
  )
}

// =============================================================================
// 1. GENERAL SUBSYSTEM VIEW (OVERVIEW OF ALL SUBSYSTEMS)
// =============================================================================
function GeneralView({
  odom,
  battery,
  gps,
  fsm,
  missionState,
  missionAlert,
  electricalData,
  sectorData,
  armRadoData,
  mlData,
  linkOk,
  linkAge,
  autonomyViolations,
  globalLogMsg,
  localLogMsg,
  onSelectSubsystem,
  hideInlineLogs = false,
}) {
  const tw = odom?.twist?.twist
  const speed = tw ? Math.hypot(tw.linear.x, tw.linear.y) : 0.42
  const volts = battery?.voltage ?? 24.6
  const charge = battery?.percentage != null ? Math.round(battery.percentage * 100) : 84
  const totalPower = electricalData?.total_power_watts ?? 452.6
  const isSectorWorking = sectorData?.is_working !== false

  // MissionState from trixanth_interfaces/msg/MissionState
  const MODE_NAMES = ['IDLE', 'MANUAL', 'AUTONOMOUS', 'ESTOP']
  const modeIdx = missionState?.mode ?? 2
  const modeName = MODE_NAMES[modeIdx] ?? 'UNKNOWN'
  const modeClass = modeIdx === 3 ? 'fault' : modeIdx === 2 ? 'ok' : modeIdx === 1 ? 'warn' : ''
  const missionName = (missionState?.mission ?? 'rado').toUpperCase()
  const missionStage = missionState?.stage ?? 'Stage 2: Delivery Approach'
  const elapsedSec = missionState?.elapsed_s ?? 342
  const limitSec = missionState?.limit_s ?? 1500
  const missionPoints = missionState?.points ?? 65.0
  const missionPointsMax = missionState?.points_max ?? 100.0
  const bonusUnlocked = missionState?.bonus_unlocked ?? false
  const alertText = missionState?.alert ?? missionAlert?.data ?? ''
  const isLinkOk = linkOk?.data !== false
  const linkAgeSec = linkAge?.data ?? 0.08
  const violations = autonomyViolations?.data ?? 0

  const fmtTime = (sec) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="general-overview-deck">
      {/* Alert Banner — MissionState.alert or /mission/alert */}
      {alertText && (
        <div className="mission-alert-banner mono">
          ALERT: {alertText}
        </div>
      )}

      {/* Top High-Density Metric Strip */}
      <div className="minimal-metric-strip">
        <div className="metric-pill">
          <span className="metric-lbl">MISSION</span>
          <span className={`metric-val mono ${modeClass}`}>{missionName} · {modeName}</span>
        </div>
        <div className="metric-pill">
          <span className="metric-lbl">TIMER</span>
          <span className={`metric-val mono ${elapsedSec > limitSec * 0.85 ? 'warn' : 'ok'}`}>
            {fmtTime(elapsedSec)} / {fmtTime(limitSec)}
          </span>
        </div>
        <div className="metric-pill">
          <span className="metric-lbl">POINTS</span>
          <span className={`metric-val mono ${bonusUnlocked ? 'ok' : ''}`}>
            {missionPoints.toFixed(0)} / {missionPointsMax.toFixed(0)}{bonusUnlocked ? ' BONUS' : ''}
          </span>
        </div>
        <div className="metric-pill">
          <span className="metric-lbl">STAGE</span>
          <span className="metric-val mono ok">{missionStage}</span>
        </div>
        <div className="metric-pill">
          <span className="metric-lbl">SPEED</span>
          <span className="metric-val mono">{fmt(speed, 2)} m/s</span>
        </div>
        <div className="metric-pill">
          <span className="metric-lbl">BATTERY</span>
          <span className="metric-val mono ok">{volts.toFixed(1)}V · {charge}%</span>
        </div>
        <div className="metric-pill">
          <span className="metric-lbl">POWER DRAIN</span>
          <span className="metric-val mono">{totalPower} W</span>
        </div>
        <div className="metric-pill">
          <span className="metric-lbl">LINK</span>
          <span className={`metric-val mono ${isLinkOk ? 'ok' : 'fault'}`}>
            {isLinkOk ? `OK ${linkAgeSec.toFixed(2)}s` : 'DOWN'}
          </span>
        </div>
        {violations > 0 && (
          <div className="metric-pill">
            <span className="metric-lbl">VIOLATIONS</span>
            <span className="metric-val mono fault">{violations} AUTO</span>
          </div>
        )}
        <div className="metric-pill">
          <span className="metric-lbl">SECTOR ANTENNA</span>
          <span className={`metric-val mono ${isSectorWorking ? 'ok' : 'fault'}`}>
            {isSectorWorking ? `WORKING (${sectorData?.azimuth_deg ?? 142.5}°)` : 'OFFLINE'}
          </span>
        </div>
        <div className="metric-pill">
          <span className="metric-lbl">RTK GNSS</span>
          <span className="metric-val mono ok">
            {gps ? `${gps.latitude.toFixed(4)}°, ${gps.longitude.toFixed(4)}°` : '12.9231° N, 77.5012° E'}
          </span>
        </div>
      </div>

      {/* Interactive Command Deck for trixanth_interfaces (Mode & Mission Control) */}
      <div className="mission-controls-strip">
        <div className="cmd-group">
          <span className="cmd-group-label mono">DRIVE MODE (/set_mode):</span>
          {config.MODE_NAMES.map((name, idx) => (
            <button
              key={name}
              type="button"
              className={`mode-btn mono ${modeIdx === idx ? 'active ' + (idx === 3 ? 'fault' : idx === 2 ? 'ok' : 'warn') : ''}`}
              onClick={() => callService(config.services.setMode, { mode: idx })}
              title={`Switch mode to ${name}`}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="cmd-group">
          <span className="cmd-group-label mono">MISSION (/mission/start):</span>
          {['rado', 'abex', 'idmo'].map((m) => (
            <button
              key={m}
              type="button"
              className={`mission-btn mono ${missionName.toLowerCase() === m && missionState?.running ? 'active' : ''}`}
              onClick={() => callService(config.services.startMission, { mission: m, points_max: 100 })}
            >
              {m.toUpperCase()}
            </button>
          ))}
          <button
            type="button"
            className="mission-btn stop mono"
            onClick={() => callService(config.services.stopMission, {})}
            title="Stop mission timer"
          >
            STOP
          </button>
          <button
            type="button"
            className="mission-btn penalty mono"
            onClick={() => callService(config.services.commsPenalty, {})}
            title="Toggle 50% comms penalty"
          >
            PENALTY
          </button>
        </div>

        <div className="cmd-group">
          <span className="cmd-group-label mono">SCORE (/mission/score):</span>
          <button
            type="button"
            className="score-quick-btn mono"
            onClick={() => publishTo(config.topics.scoreEvent.name, { task: 'Recon Target', points: 10 })}
          >
            +10 Recon
          </button>
          <button
            type="button"
            className="score-quick-btn mono"
            onClick={() => publishTo(config.topics.scoreEvent.name, { task: 'Delivery Complete', points: 25 })}
          >
            +25 Delivery
          </button>
          <button
            type="button"
            className="score-quick-btn mono"
            onClick={() => publishTo(config.topics.scoreEvent.name, { task: 'Sample Picked', points: 15 })}
          >
            +15 Sample
          </button>
        </div>
      </div>

      {/* 4 Interactive Subsystem Cards */}
      <div className="general-cards-grid">
        {/* CARD 1: ML & Locomotion */}
        <div
          className="general-sub-card"
          onClick={() => onSelectSubsystem('ml')}
          title="Click to view ML & Locomotion Deck"
        >
          <div className="card-head">
            <div className="card-title-wrap">
              <IconRover size={15} />
              <span className="card-title">ML & LOCOMOTION</span>
              <span className="sub-badge mono">LOCO</span>
            </div>
            <span className="live-status-tag ok">ACTIVE</span>
          </div>
          <div className="card-body">
            <div className="card-stat-row">
              <span className="c-lbl">Action</span>
              <span className="c-val mono ok">{mlData?.current_action ?? 'TURNING LEFT 15°'}</span>
            </div>
            <div className="card-stat-row">
              <span className="c-lbl">Distance Traversed</span>
              <span className="c-val mono">{mlData?.total_traversed_m ?? 144.6} m</span>
            </div>
            <div className="card-stat-row">
              <span className="c-lbl">Segment Move</span>
              <span className="c-val mono ok">+{mlData?.distance_moved_m ?? 1.85} m</span>
            </div>
            <div className="card-stat-row">
              <span className="c-lbl">Primary Feed</span>
              <span className="c-val mono">Front RealSense D435i</span>
            </div>
          </div>
          <div className="card-footer mono">Open ML Locomotion &amp; Dual Logs</div>
        </div>

        {/* CARD 2: Electrical & Power */}
        <div
          className="general-sub-card"
          onClick={() => onSelectSubsystem('electrical')}
          title="Click to view Electrical Power Deck"
        >
          <div className="card-head">
            <div className="card-title-wrap">
              <IconTelemetry size={15} />
              <span className="card-title">ELECTRICAL &amp; POWER</span>
              <span className="sub-badge mono">BMS</span>
            </div>
            <span className="live-status-tag ok">BALANCED</span>
          </div>
          <div className="card-body">
            <div className="card-stat-row">
              <span className="c-lbl">Pack Battery</span>
              <span className="c-val mono ok">{volts.toFixed(1)} V · {charge}%</span>
            </div>
            <div className="card-stat-row">
              <span className="c-lbl">Total Consumption</span>
              <span className="c-val mono">{totalPower} W</span>
            </div>
            <div className="card-stat-row">
              <span className="c-lbl">Current Load</span>
              <span className="c-val mono">{electricalData?.total_current ?? '-18.4'} A</span>
            </div>
            <div className="card-stat-row">
              <span className="c-lbl">Est. Runtime</span>
              <span className="c-val mono">{electricalData?.runtime_remaining_min ?? 48} mins</span>
            </div>
          </div>
          <div className="card-footer mono">Open Component Power Breakdown →</div>
        </div>

        {/* CARD 3: Cams & Comms */}
        <div
          className="general-sub-card"
          onClick={() => onSelectSubsystem('cams_comms')}
          title="Click to view Cams & Comms Deck"
        >
          <div className="card-head">
            <div className="card-title-wrap">
              <IconBroadcast size={15} />
              <span className="card-title">CAMS & COMMS</span>
              <span className="sub-badge mono">5.8 GHz</span>
            </div>
            <span className={`live-status-tag ${isSectorWorking ? 'ok' : 'fault'}`}>
              {isSectorWorking ? 'ANTENNA NOMINAL' : 'FAULT'}
            </span>
          </div>
          <div className="card-body">
            <div className="card-stat-row">
              <span className="c-lbl">Sector Antenna</span>
              <span className={`c-val mono ${isSectorWorking ? 'ok' : 'fault'}`}>
                {isSectorWorking ? 'WORKING' : 'NOT WORKING'}
              </span>
            </div>
            <div className="card-stat-row">
              <span className="c-lbl">Antenna Azimuth</span>
              <span className="c-val mono">{sectorData?.azimuth_deg ?? 142.5}° (El {sectorData?.elevation_deg ?? 18.0}°)</span>
            </div>
            <div className="card-stat-row">
              <span className="c-lbl">RF Signal (RSSI / SNR)</span>
              <span className="c-val mono">{sectorData?.rssi_dbm ?? -64} dBm · {sectorData?.snr_db ?? 28.2} dB</span>
            </div>
            <div className="card-stat-row">
              <span className="c-lbl">Active Cameras</span>
              <span className="c-val mono ok">5 / 5 Feeds Online</span>
            </div>
          </div>
          <div className="card-footer mono">Open Sector Antenna & 5-Cam Grid →</div>
        </div>

        {/* CARD 4: Arm for RADO */}
        <div
          className="general-sub-card"
          onClick={() => onSelectSubsystem('arm_rado')}
          title="Click to view Arm for RADO Mission Deck"
        >
          <div className="card-head">
            <div className="card-title-wrap">
              <IconArm size={15} />
              <span className="card-title">ARM FOR RADO</span>
              <span className="sub-badge mono">6-DOF</span>
            </div>
            <span className="live-status-tag ok">HOLDING</span>
          </div>
          <div className="card-body">
            <div className="card-stat-row">
              <span className="c-lbl">Mission Stage</span>
              <span className="c-val mono ok">{armRadoData?.rado_stage ?? 'Stage 2: Delivery'}</span>
            </div>
            <div className="card-stat-row">
              <span className="c-lbl">Cache Payload</span>
              <span className="c-val mono">{armRadoData?.object_in_cache ?? 'Sample Container #2'}</span>
            </div>
            <div className="card-stat-row">
              <span className="c-lbl">Payload Mass</span>
              <span className="c-val mono">{armRadoData?.payload_weight_kg ?? 1.85} kg (Max 5kg)</span>
            </div>
            <div className="card-stat-row">
              <span className="c-lbl">Gripper Aperture / Force</span>
              <span className="c-val mono">{armRadoData?.gripper_aperture ?? 68} mm · {armRadoData?.gripper_force ?? 3.4} N</span>
            </div>
          </div>
          <div className="card-footer mono">Open Arm & RADO Delivery Deck →</div>
        </div>
      </div>

      {/* DUAL LOGS: GLOBAL & LOCAL FOR GENERAL SUBSYSTEM */}
      {!hideInlineLogs && (
        <SubsystemDualLogs
          subsystemId="general"
          subsystemCode="GEN"
          subsystemName="General Overview"
          globalLogMsg={globalLogMsg}
          localLogMsg={localLogMsg}
        />
      )}
    </div>
  )
}// =============================================================================
// 2. ML & LOCOMOTION VIEW
// - Locomotion camera feed (reduced, compact size)
// - Relative operations: distance moved X meters, turning left/right, wheel speeds
// - Dual Logs: Global (sent to all systems) and Local (just ML subsystem)
// =============================================================================
function MLView({
  odom,
  wheels,
  imu,
  mlData,
  missionState,
  globalLogMsg,
  localLogMsg,
  onFocusCamera,
  onOpenPiP,
  hideInlineLogs = false,
}) {
  const [activeCam, setActiveCam] = useState('/camera/color/image_raw')

  const tw = odom?.twist?.twist
  const speed = tw ? Math.hypot(tw.linear.x, tw.linear.y) : mlData?.linear_speed ?? 0.42
  const yawRate = tw?.angular?.z ?? mlData?.angular_rate ?? 0.22
  const deltaDist = mlData?.distance_moved_m ?? 1.85
  const totalDist = mlData?.total_traversed_m ?? 144.6
  const turnAction = mlData?.current_action ?? (yawRate > 0.08 ? 'TURNING LEFT 15°' : yawRate < -0.08 ? 'TURNING RIGHT 18°' : 'STRAIGHT FORWARD')
  // MissionState: show mode and mission stage as context in ML view
  const MODE_NAMES = ['IDLE', 'MANUAL', 'AUTONOMOUS', 'ESTOP']
  const modeIdx = missionState?.mode ?? 2
  const modeName = MODE_NAMES[modeIdx] ?? 'UNKNOWN'

  return (
    <div className="ml-ops-layout">
      {/* LEFT COLUMN: Locomotion Camera Feed (Compact & Proportioned) */}
      <div className="ml-camera-column">
        <div className="column-header">
          <span className="col-title mono">LOCOMOTION CAMERA FEED</span>
          <div className="cam-selector-mini-chips">
            <button
              type="button"
              className={`mini-chip ${activeCam.includes('color') ? 'active' : ''}`}
              onClick={() => setActiveCam('/camera/color/image_raw')}
              title="Front RealSense D435i"
            >
              Front (D435i)
            </button>
            <button
              type="button"
              className={`mini-chip ${activeCam.includes('rear') ? 'active' : ''}`}
              onClick={() => setActiveCam('/camera_rear/image_raw')}
              title="Rear Back Webcam"
            >
              Rear
            </button>
            <button
              type="button"
              className={`mini-chip ${activeCam.includes('left') ? 'active' : ''}`}
              onClick={() => setActiveCam('/camera_left/image_raw')}
              title="Left Side Webcam"
            >
              Left
            </button>
            <button
              type="button"
              className={`mini-chip ${activeCam.includes('right') ? 'active' : ''}`}
              onClick={() => setActiveCam('/camera_right/image_raw')}
              title="Right Side Webcam"
            >
              Right
            </button>
          </div>
        </div>

        {/* Expanded Proportional Camera Feed Container */}
        <div className="compact-cam-container">
          <CameraView
            topic={activeCam}
            quality={60}
            width={680}
            showBoxes={true}
            showHud={true}
            onFocus={onFocusCamera}
          />
        </div>

        {/* Quick PiP action */}
        <div className="cam-quick-actions">
          <button
            type="button"
            className="mini-action-btn"
            onClick={() => onOpenPiP && onOpenPiP(activeCam)}
            title="Float camera into draggable Picture-in-Picture window"
          >
            <IconPiP size={12} /> Float in PiP
          </button>
          <span className="mono muted-hint">FOV 87° × 58° · 1080p60 · AI YOLOv8</span>
        </div>

        {/* 4-Wheel Speed & Traction Mini Deck */}
        <div className="wheels-traction-box">
          <div className="wheels-box-head mono">4-WHEEL IN-HUB POWERTRAIN & SLIP MONITOR</div>
          <div className="wheels-4-grid mono">
            <div className="wheel-cell">
              <span className="w-name">FL</span>
              <span className="w-val ok">{fmt(wheels?.fl?.speed ?? speed, 2)} m/s</span>
              <span className="w-slip">Slip 1.8%</span>
            </div>
            <div className="wheel-cell">
              <span className="w-name">FR</span>
              <span className="w-val ok">{fmt(wheels?.fr?.speed ?? speed, 2)} m/s</span>
              <span className="w-slip">Slip 1.6%</span>
            </div>
            <div className="wheel-cell">
              <span className="w-name">RL</span>
              <span className="w-val ok">{fmt(wheels?.rl?.speed ?? speed, 2)} m/s</span>
              <span className="w-slip">Slip 1.2%</span>
            </div>
            <div className="wheel-cell">
              <span className="w-name">RR</span>
              <span className="w-val ok">{fmt(wheels?.rr?.speed ?? speed, 2)} m/s</span>
              <span className="w-slip">Slip 1.4%</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Relative Operations & Dual Logs */}
      <div className="ml-ops-column">
        {/* RELATIVE OPERATIONS PANEL */}
        <div className="relative-ops-card">
          <div className="card-head">
            <div className="card-title-wrap">
              <IconRover size={14} />
              <span className="card-title">RELATIVE LOCOMOTION OPERATIONS</span>
            </div>
            <span className="badge ok mono">{turnAction}</span>
          </div>

          <div className="ops-metrics-grid">
            <div className="ops-stat-item highlight">
              <span className="ops-lbl">DELTA DISTANCE</span>
              <span className="ops-val mono ok">+{deltaDist} m</span>
              <span className="ops-sub">Moved along segment</span>
            </div>
            <div className="ops-stat-item">
              <span className="ops-lbl">STEERING ACTION</span>
              <span className="ops-val mono warn">{turnAction}</span>
              <span className="ops-sub">Yaw Rate: {(yawRate * (180 / Math.PI)).toFixed(1)}°/s</span>
            </div>
            <div className="ops-stat-item">
              <span className="ops-lbl">TOTAL TRAVERSED</span>
              <span className="ops-val mono">{totalDist} m</span>
              <span className="ops-sub">Odom Ground Truth</span>
            </div>
            <div className="ops-stat-item">
              <span className="ops-lbl">LINEAR SPEED</span>
              <span className="ops-val mono">{fmt(speed, 2)} m/s</span>
              <span className="ops-sub">Limit: 0.60 m/s</span>
            </div>
          </div>
        </div>

        {/* DUAL LOGS: GLOBAL & LOCAL FOR ML LOCOMOTION */}
        {!hideInlineLogs && (
          <SubsystemDualLogs
            subsystemId="ml"
            subsystemCode="ML"
            subsystemName="ML & Locomotion"
            globalLogMsg={globalLogMsg}
            localLogMsg={localLogMsg}
          />
        )}
      </div>
    </div>
  )
}

// =============================================================================
// 3. ELECTRICAL SUBSYSTEM VIEW
// - Battery level of each component
// - Power draining per component (Watts, Amps, Volts, Status, Temp)
// - Main 6S Battery pack metrics & individual cell balance
// =============================================================================
function ElectricalView({ battery, electricalData, globalLogMsg, localLogMsg, hideInlineLogs = false }) {
  const volts = battery?.voltage ?? electricalData?.total_voltage ?? 24.6
  const charge = battery?.percentage != null ? Math.round(battery.percentage * 100) : electricalData?.battery_percentage ?? 84
  const totalPower = electricalData?.total_power_watts ?? 452.6
  const totalCurrent = electricalData?.total_current ?? -18.4
  const runtime = electricalData?.runtime_remaining_min ?? 48

  const cells = electricalData?.cells ?? [4.102, 4.092, 4.105, 4.089, 4.115, 4.094]
  const components = electricalData?.components ?? [
    { id: 'drive_motors', name: 'Drive Motors (4x In-Hub BLDC)', voltage: 24.2, current: 8.4, power_w: 203.3, status: 'ACTIVE', temp_c: 34.0 },
    { id: 'arm_actuators', name: 'Manipulator Arm (6-DOF + Gripper)', voltage: 24.0, current: 3.2, power_w: 76.8, status: 'HOLDING', temp_c: 31.5 },
    { id: 'jetson_orin', name: 'NVIDIA Jetson Orin AGX Core', voltage: 19.1, current: 2.9, power_w: 55.4, status: 'AI LOAD 44%', temp_c: 48.2 },
    { id: 'cameras', name: 'Vision (D435i + 4 Webcams)', voltage: 12.0, current: 1.8, power_w: 21.6, status: 'STREAMING 5/5', temp_c: 35.8 },
    { id: 'sector_rf', name: 'Sector Antenna & RF Transceiver', voltage: 12.0, current: 1.5, power_w: 18.0, status: 'TX 25W', temp_c: 38.6 },
    { id: 'logic_mcu', name: 'Logic & Microcontrollers (Teensy)', voltage: 5.0, current: 0.8, power_w: 4.0, status: 'NOMINAL', temp_c: 29.1 },
  ]

  return (
    <div className="electrical-deck">
      {/* Main Pack Summary Bar */}
      <div className="bms-summary-grid">
        <div className="bms-stat-card">
          <span className="bms-lbl">STATE OF CHARGE</span>
          <span className="bms-val mono ok">{charge}%</span>
          <div className="bms-progress-track">
            <div className="bms-progress-fill ok" style={{ width: `${charge}%` }} />
          </div>
        </div>
        <div className="bms-stat-card">
          <span className="bms-lbl">PACK VOLTAGE</span>
          <span className="bms-val mono ok">{volts.toFixed(2)} V</span>
          <span className="bms-sub">6S Li-ion (Nominal 22.2V)</span>
        </div>
        <div className="bms-stat-card">
          <span className="bms-lbl">TOTAL CURRENT</span>
          <span className="bms-val mono warn">{totalCurrent} A</span>
          <span className="bms-sub">Discharge Rate: 1.1C</span>
        </div>
        <div className="bms-stat-card">
          <span className="bms-lbl">TOTAL POWER DRAW</span>
          <span className="bms-val mono">{totalPower} W</span>
          <span className="bms-sub">Peak allowable: 900W</span>
        </div>
        <div className="bms-stat-card">
          <span className="bms-lbl">ESTIMATED RUNTIME</span>
          <span className="bms-val mono ok">{runtime} mins</span>
          <span className="bms-sub">At current draw</span>
        </div>
      </div>

      {/* COMPONENT BATTERY & POWER DRAIN TABLE */}
      <div className="component-power-section">
        <div className="section-head">
          <div className="section-title-wrap">
            <IconTelemetry size={14} />
            <span className="section-heading mono">COMPONENT BATTERY LEVEL & POWER DRAIN</span>
          </div>
          <span className="mono muted-hint">Real-time telemetry from /trixanth/electrical/telemetry</span>
        </div>

        <div className="table-responsive-wrap">
          <table className="electrical-table mono">
            <thead>
              <tr>
                <th>Component / Subsystem</th>
                <th>Bus Voltage</th>
                <th>Current Drain</th>
                <th>Power Drain (W)</th>
                <th>Consumption Share</th>
                <th>Status</th>
                <th>Temp</th>
              </tr>
            </thead>
            <tbody>
              {components.map((comp) => {
                const sharePct = totalPower > 0 ? Math.round((comp.power_w / totalPower) * 100) : 0
                return (
                  <tr key={comp.id}>
                    <td className="comp-name-td">
                      <span className="comp-dot" />
                      <span>{comp.name}</span>
                    </td>
                    <td>{comp.voltage.toFixed(1)} V</td>
                    <td>{comp.current.toFixed(2)} A</td>
                    <td className="power-val-td">{comp.power_w.toFixed(1)} W</td>
                    <td className="share-td">
                      <div className="share-bar-wrap">
                        <div className="share-bar-fill" style={{ width: `${Math.min(100, sharePct * 1.8)}%` }} />
                        <span className="share-pct">{sharePct}%</span>
                      </div>
                    </td>
                    <td>
                      <span className="comp-status-badge">{comp.status}</span>
                    </td>
                    <td>{comp.temp_c}°C</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6S CELL VOLTAGE MONITOR */}
      <div className="cells-balance-card">
        <div className="card-head">
          <span className="card-title mono">6S LI-ION INDIVIDUAL CELL VOLTAGES & BALANCE</span>
          <span className="badge ok mono">DELTA: 26 mV · NOMINAL</span>
        </div>
        <div className="cells-grid mono">
          {cells.map((v, i) => (
            <div key={i} className="cell-card">
              <span className="cell-lbl">CELL {i + 1}</span>
              <span className="cell-v ok">{v.toFixed(3)} V</span>
              <div className="cell-bar-track">
                <div className="cell-bar-fill" style={{ width: `${((v - 3.2) / (4.2 - 3.2)) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* DUAL LOGS: GLOBAL & LOCAL FOR ELECTRICAL SUBSYSTEM */}
      {!hideInlineLogs && (
        <SubsystemDualLogs
          subsystemId="electrical"
          subsystemCode="ELEC"
          subsystemName="Electrical & Power"
          globalLogMsg={globalLogMsg}
          localLogMsg={localLogMsg}
        />
      )}
    </div>
  )
}

// =============================================================================
// 4. CAMS & COMMS SUBSYSTEM VIEW
// - Sector Antenna working status, Azimuth, Elevation, RF Quality
// - 5 Camera streams with Hero + Quad Companion, Matrix & Dual Drive layouts
// - Subsystem Dual Logs & Subscribed/Publishing Nodes
// =============================================================================
function CamsCommsView({ sectorData, globalLogMsg, localLogMsg, onFocusCamera, onOpenPiP, hideInlineLogs = false }) {
  const [antennaAzimuth, setAntennaAzimuth] = useState(sectorData?.azimuth_deg ?? 142.5)
  const isWorking = sectorData?.is_working !== false
  const rssi = sectorData?.rssi_dbm ?? -64
  const snr = sectorData?.snr_db ?? 28.2
  const loss = sectorData?.packet_loss_pct ?? 0.15
  const bw = sectorData?.bandwidth_mbps ?? 14.6
  const elevation = sectorData?.elevation_deg ?? 18.0

  // Camera Layout State: 'hero_quad' | 'matrix' | 'dual_drive'
  const [layoutMode, setLayoutMode] = useState('hero_quad')
  // Active Hero Camera (default: Front RealSense D435i)
  const [heroCamTopic, setHeroCamTopic] = useState('/camera/color/image_raw')

  const nudgeAntenna = (delta) => {
    setAntennaAzimuth((prev) => +((prev + delta + 360) % 360).toFixed(1))
  }

  const CAMERAS_5 = config.cameras
  const heroCamMeta = CAMERAS_5.find((c) => c.topic === heroCamTopic) || CAMERAS_5[0]
  const companionCams = CAMERAS_5.filter((c) => c.topic !== heroCamTopic)

  const swapToHero = (topic) => {
    setHeroCamTopic(topic)
  }

  return (
    <div className="cams-comms-deck">
      {/* SECTOR ANTENNA STATUS CARD */}
      <div className="sector-antenna-card">
        <div className="card-head">
          <div className="card-title-wrap">
            <IconBroadcast size={15} />
            <span className="card-title">BASE STATION SECTOR ANTENNA</span>
            <span className="sub-badge mono">5.8 GHz</span>
          </div>

          {/* Working / Not Working Status Badge */}
          <div className="antenna-working-badge-wrap">
            <span className={`antenna-working-pill ${isWorking ? 'working' : 'fault'}`}>
              <Dot state={isWorking ? 'running' : 'crashed'} />
              <span className="mono">SECTOR ANTENNA: {isWorking ? 'WORKING' : 'NOT WORKING'}</span>
            </span>
          </div>
        </div>

        <div className="sector-metrics-grid">
          <div className="sec-stat-box">
            <span className="sec-lbl">AZIMUTH ANGLE</span>
            <span className="sec-val mono ok">{antennaAzimuth}°</span>
            <span className="sec-sub">Steered Bearing to Rover</span>
          </div>
          <div className="sec-stat-box">
            <span className="sec-lbl">ELEVATION ANGLE</span>
            <span className="sec-val mono">{elevation}°</span>
            <span className="sec-sub">Mast Height: 3.0m (IRC Max)</span>
          </div>
          <div className="sec-stat-box">
            <span className="sec-lbl">SIGNAL STRENGTH (RSSI)</span>
            <span className="sec-val mono ok">{rssi} dBm</span>
            <span className="sec-sub">SNR: {snr} dB (Excellent)</span>
          </div>
          <div className="sec-stat-box">
            <span className="sec-lbl">THROUGHPUT / LOSS</span>
            <span className="sec-val mono">{bw} Mbps</span>
            <span className="sec-sub">Packet Loss: {loss}% · Ping: 14ms</span>
          </div>
        </div>

        {/* Steering Controls */}
        <div className="antenna-controls-strip">
          <span className="mono ctrl-lbl">AZIMUTH NUDGE:</span>
          <button type="button" className="nudge-btn" onClick={() => nudgeAntenna(-5)}>
            -5° West
          </button>
          <button type="button" className="nudge-btn" onClick={() => nudgeAntenna(-1)}>
            -1°
          </button>
          <button type="button" className="nudge-btn active" onClick={() => setAntennaAzimuth(142.5)}>
            Auto Lock Beacon
          </button>
          <button type="button" className="nudge-btn" onClick={() => nudgeAntenna(+1)}>
            +1°
          </button>
          <button type="button" className="nudge-btn" onClick={() => nudgeAntenna(+5)}>
            +5° East
          </button>
        </div>
      </div>

      {/* 5-CAMERA COMMAND LAYOUT */}
      <div className="cams-command-section">
        <div className="section-head">
          <div className="section-title-wrap">
            <IconMaximize size={14} />
            <span className="section-heading mono">5 ROVER CAMERA STREAMS (REALSENSE D435i + 4 WEBCAMS)</span>
          </div>

          {/* Layout switcher buttons */}
          <div className="cams-layout-switch-bar">
            <button
              type="button"
              className={`layout-switch-btn ${layoutMode === 'hero_quad' ? 'active' : ''}`}
              onClick={() => setLayoutMode('hero_quad')}
              title="Prominent Hero Stream + 4 Companion Feeds Quad"
            >
              Hero + Quad Companion
            </button>
            <button
              type="button"
              className={`layout-switch-btn ${layoutMode === 'matrix' ? 'active' : ''}`}
              onClick={() => setLayoutMode('matrix')}
              title="Equal Size 5-Camera Grid"
            >
              5-Camera Equal Matrix
            </button>
            <button
              type="button"
              className={`layout-switch-btn ${layoutMode === 'dual_drive' ? 'active' : ''}`}
              onClick={() => setLayoutMode('dual_drive')}
              title="Dual Drive (Front D435i + Rear Webcam side-by-side)"
            >
              Dual Drive Split
            </button>
          </div>
        </div>

        {/* LAYOUT 1: HERO + QUAD COMPANION FEEDS */}
        {layoutMode === 'hero_quad' && (
          <div className="cams-hero-quad-split">
            {/* HERO STREAM COLUMN */}
            <div className="cams-hero-column">
              <div className="hero-stream-header">
                <div className="hero-title-meta">
                  <span className="hero-badge-live">HERO STAGE FEED</span>
                  <span className="hero-label mono">{heroCamMeta.label}</span>
                  <span className="hero-res mono">{heroCamMeta.res}</span>
                </div>
                {/* Camera quick-switch chips */}
                <div className="cam-selector-mini-chips">
                  {CAMERAS_5.map((cam) => (
                    <button
                      key={cam.id}
                      type="button"
                      className={`mini-chip ${heroCamTopic === cam.topic ? 'active' : ''}`}
                      onClick={() => setHeroCamTopic(cam.topic)}
                      title={`Switch Hero to ${cam.label}`}
                    >
                      {cam.shortLabel || cam.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hero-viewport-card">
                <CameraView
                  topic={heroCamTopic}
                  quality={60}
                  width={680}
                  showBoxes={heroCamTopic.includes('color') || heroCamTopic.includes('front')}
                  showHud={true}
                  onFocus={onFocusCamera}
                />
              </div>

              <div className="hero-actions-bar">
                <button
                  type="button"
                  className="mini-action-btn"
                  onClick={() => onOpenPiP && onOpenPiP(heroCamTopic)}
                  title="Float current Hero camera in draggable Picture-in-Picture window"
                >
                  <IconPiP size={12} /> Float in PiP
                </button>
                <button
                  type="button"
                  className="mini-action-btn"
                  onClick={() => onFocusCamera && onFocusCamera(heroCamTopic)}
                  title="Focus in Stage View"
                >
                  Focus Full Stage
                </button>
                <span className="mono muted-hint">
                  {heroCamMeta.fov} FOV · RTSP 1080p · Zero Latency H.264
                </span>
              </div>
            </div>

            {/* QUAD COMPANION FEEDS COLUMN */}
            <div className="cams-quad-column">
              <div className="quad-column-head mono">COMPANION FEEDS (1-CLICK SWAP TO HERO)</div>
              <div className="companion-quad-grid">
                {companionCams.map((cam) => (
                  <div key={cam.id} className="companion-cam-card">
                    <div className="companion-head">
                      <span className="companion-title mono">{cam.label}</span>
                      <span className="companion-res mono">{cam.res}</span>
                    </div>

                    <div className="companion-viewport">
                      <CameraView
                        topic={cam.topic}
                        quality={45}
                        width={340}
                        showBoxes={false}
                        showHud={false}
                      />
                    </div>

                    <div className="companion-card-actions">
                      <button
                        type="button"
                        className="companion-btn swap"
                        onClick={() => swapToHero(cam.topic)}
                        title={`Promote ${cam.label} to large Hero spot`}
                      >
                        <IconSwap size={11} /> Swap to Main
                      </button>
                      <button
                        type="button"
                        className="companion-btn pip"
                        onClick={() => onOpenPiP && onOpenPiP(cam.topic)}
                        title={`Open ${cam.label} in PiP`}
                      >
                        <IconPiP size={11} /> PiP
                      </button>
                      <button
                        type="button"
                        className="companion-btn focus"
                        onClick={() => onFocusCamera && onFocusCamera(cam.topic)}
                        title="Focus in Stage"
                      >
                        Focus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* LAYOUT 2: EQUAL 5-CAMERA MATRIX */}
        {layoutMode === 'matrix' && (
          <div className="cameras-5-matrix">
            {CAMERAS_5.map((cam) => (
              <div key={cam.id} className="camera-grid-card">
                <div className="cam-card-top">
                  <span className="cam-badge-name mono">{cam.label}</span>
                  <span className="cam-res mono">{cam.res}</span>
                </div>

                <div className="cam-viewport-box">
                  <CameraView
                    topic={cam.topic}
                    quality={45}
                    width={340}
                    showBoxes={cam.id === 'front'}
                    showHud={false}
                  />
                </div>

                <div className="cam-card-actions">
                  <button
                    type="button"
                    className="cam-act-btn"
                    onClick={() => {
                      setHeroCamTopic(cam.topic)
                      setLayoutMode('hero_quad')
                    }}
                    title="Promote to Hero Stage"
                  >
                    <IconSwap size={11} /> Hero
                  </button>
                  <button
                    type="button"
                    className="cam-act-btn"
                    onClick={() => onFocusCamera && onFocusCamera(cam.topic)}
                    title="Expand to Full Stage Focus"
                  >
                    Focus
                  </button>
                  <button
                    type="button"
                    className="cam-act-btn pip"
                    onClick={() => onOpenPiP && onOpenPiP(cam.topic)}
                    title="Open this camera in draggable Picture-in-Picture window"
                  >
                    <IconPiP size={12} /> PiP
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LAYOUT 3: DUAL DRIVE SPLIT (FRONT & REAR TOP, 3 CAMS BOTTOM) */}
        {layoutMode === 'dual_drive' && (
          <div className="cams-dual-drive-deck">
            <div className="dual-drive-top-row">
              <div className="drive-cam-cell">
                <div className="drive-cam-header mono">FRONT INTEL REALSENSE D435i (FORWARD TRAVERSE)</div>
                <div className="drive-viewport">
                  <CameraView
                    topic="/camera/color/image_raw"
                    quality={55}
                    width={520}
                    showBoxes={true}
                    showHud={true}
                    onFocus={onFocusCamera}
                  />
                </div>
              </div>
              <div className="drive-cam-cell">
                <div className="drive-cam-header mono">REAR BACK WEBCAM (REVERSE & HITCH COUPLING)</div>
                <div className="drive-viewport">
                  <CameraView
                    topic="/camera_rear/image_raw"
                    quality={55}
                    width={520}
                    showBoxes={false}
                    showHud={true}
                    onFocus={onFocusCamera}
                  />
                </div>
              </div>
            </div>

            <div className="dual-drive-bottom-row">
              {['/camera_arm/image_raw', '/camera_left/image_raw', '/camera_right/image_raw'].map((top) => {
                const c = CAMERAS_5.find((m) => m.topic === top) || { label: top, res: '720p30' }
                return (
                  <div key={top} className="sub-cam-cell">
                    <div className="sub-cam-header mono">{c.label}</div>
                    <div className="sub-viewport">
                      <CameraView topic={top} quality={45} width={320} showBoxes={false} showHud={false} />
                    </div>
                    <div className="sub-cam-actions">
                      <button type="button" className="mini-action-btn" onClick={() => onOpenPiP && onOpenPiP(top)}>
                        <IconPiP size={11} /> PiP
                      </button>
                      <button type="button" className="mini-action-btn" onClick={() => onFocusCamera && onFocusCamera(top)}>
                        Focus
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* DUAL LOGS: GLOBAL & LOCAL FOR CAMS & COMMS */}
      {!hideInlineLogs && (
        <SubsystemDualLogs
          subsystemId="cams_comms"
          subsystemCode="COMS"
          subsystemName="Cams & Comms"
          globalLogMsg={globalLogMsg}
          localLogMsg={localLogMsg}
        />
      )}
    </div>
  )
}

// =============================================================================
// 5. ARM FOR RADO SUBSYSTEM VIEW
// Fully integrated with:
//  - trixanth_interfaces/msg/MissionState  (mode, mission, stage, elapsed_s, limit_s, points)
//  - trixanth_interfaces/msg/MarkerObservation  (colour, visible, bearing_rad, range_m)
//  - trixanth_interfaces/msg/ReconEntry  (id, label, confidence, lat, lon, altitude, h_acc, image_path)
//  - trixanth_interfaces/msg/ScoreEvent  (task, points)
//  - rado_fsm /rado/status (std_msgs/String — FSM state text)
//  - std_msgs/UInt32 /trixanth/autonomy_violations
// =============================================================================
function ArmRadoView({
  armRadoData,
  missionState,
  markerObs,
  reconEntry,
  radoStatus,
  scoreEvent,
  autonomyViolations,
  globalLogMsg,
  localLogMsg,
  onFocusCamera,
  onOpenPiP,
  hideInlineLogs = false,
}) {
  const [aperture, setAperture] = useState(armRadoData?.gripper_aperture ?? 68)
  const [reconLog, setReconLog] = useState([])

  // Accumulate ReconEntry messages (trixanth_interfaces/msg/ReconEntry)
  useEffect(() => {
    if (reconEntry?.id != null) {
      setReconLog((prev) => {
        // Skip duplicate IDs
        if (prev.some((e) => e.id === reconEntry.id)) return prev
        return [reconEntry, ...prev].slice(0, 10)
      })
    }
  }, [reconEntry])

  const joints = armRadoData?.joint_positions ?? [-12.4, 32.0, -45.2, 14.8, -5.0, 0.0]
  const jointNames = armRadoData?.joint_names ?? ['Base Yaw', 'Shoulder Pitch', 'Elbow Pitch', 'Wrist Pitch', 'Wrist Roll', 'Gripper Rot']
  const jointTorques = armRadoData?.joint_torques ?? [1.2, 3.4, 2.8, 0.9, 0.6, 0.3]
  const payloadMass = armRadoData?.payload_weight_kg ?? 1.85
  const objectName = armRadoData?.object_in_cache ?? 'Sample Container #2'
  const radoStage = armRadoData?.rado_stage ?? missionState?.stage ?? 'Stage 2: Autonomous Delivery'

  // MissionState fields
  const MODE_NAMES = ['IDLE', 'MANUAL', 'AUTONOMOUS', 'ESTOP']
  const modeIdx = missionState?.mode ?? 2
  const modeName = MODE_NAMES[modeIdx] ?? 'UNKNOWN'
  const modeClass = modeIdx === 3 ? 'fault' : modeIdx === 2 ? 'ok' : 'warn'
  const elapsedSec = missionState?.elapsed_s ?? 342
  const limitSec = missionState?.limit_s ?? 1500
  const missionPoints = missionState?.points ?? 65.0
  const bonusUnlocked = missionState?.bonus_unlocked ?? false
  const fmtTime = (sec) => {
    const m = Math.floor(sec / 60); const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // MarkerObservation fields
  const markerVisible = markerObs?.visible ?? true
  const markerColour = markerObs?.colour ?? 'blue'
  const markerRange = markerObs?.range_m ?? 1.85
  const markerBearing = markerObs?.bearing_rad ?? -0.15
  const markerBearingDeg = +(markerBearing * 180 / Math.PI).toFixed(1)

  // RADO FSM status text from /rado/status
  const radoFsmText = radoStatus?.data ?? armRadoData?.rado_stage ?? 'IDLE'

  // Autonomy violations
  const violations = autonomyViolations?.data ?? 0

  return (
    <div className="arm-rado-deck">
      {/* Mission State Banner */}
      <div className="rado-mission-banner mono">
        <span className={`rado-mode-tag ${modeClass}`}>MODE: {modeName}</span>
        <span className="rado-timer-tag">TIMER: {fmtTime(elapsedSec)} / {fmtTime(limitSec)}</span>
        <span className="rado-pts-tag">POINTS: {missionPoints.toFixed(0)}{bonusUnlocked ? ' + BONUS' : ''}</span>
        <span className="rado-fsm-tag">{radoFsmText}</span>
        {violations > 0 && <span className="rado-viol-tag fault">VIOLATIONS: {violations}</span>}
      </div>

      {/* TOP ROW: Arm Camera Feed & RADO Mission Status */}
      <div className="arm-top-grid">
        {/* Arm Camera View */}
        <div className="arm-cam-card">
          <div className="card-head">
            <span className="card-title mono">MANIPULATOR ARM CAMERA FEED</span>
            <button
              type="button"
              className="mini-chip"
              onClick={() => onOpenPiP && onOpenPiP('/camera_arm/image_raw')}
              title="Open Arm Camera in Draggable PiP"
            >
              <IconPiP size={12} /> Float in PiP
            </button>
          </div>
          <div className="compact-cam-container">
            <CameraView
              topic="/camera_arm/image_raw"
              quality={60}
              width={680}
              showBoxes={false}
              showHud={true}
              onFocus={onFocusCamera}
            />
          </div>
        </div>

        {/* RADO Mission Telemetry Card (trixanth_interfaces aligned) */}
        <div className="rado-mission-card">
          <div className="card-head">
            <div className="card-title-wrap">
              <IconArm size={14} />
              <span className="card-title">RADO MISSION TELEMETRY</span>
            </div>
            <span className="badge ok mono">IRC 2027 RULE 3.3</span>
          </div>

          <div className="rado-stats-list">
            <div className="rado-stat-row">
              <span className="r-lbl">FSM State (rado_fsm)</span>
              <span className="r-val mono ok">{radoFsmText}</span>
            </div>
            <div className="rado-stat-row">
              <span className="r-lbl">Mission Stage</span>
              <span className="r-val mono ok">{radoStage}</span>
            </div>
            <div className="rado-stat-row">
              <span className="r-lbl">Delivery Mode</span>
              <span className={`r-val mono ${modeClass}`}>{modeName} {modeIdx === 2 ? '(100% Points)' : '(50% Points)'}</span>
            </div>
            <div className="rado-stat-row">
              <span className="r-lbl">Cached Object</span>
              <span className="r-val mono">{objectName}</span>
            </div>
            <div className="rado-stat-row">
              <span className="r-lbl">Payload Weight</span>
              <span className="r-val mono ok">{payloadMass} kg (Limit: 5.0 kg)</span>
            </div>
            <div className="rado-stat-row">
              <span className="r-lbl">Target GPS</span>
              <span className="r-val mono">{armRadoData?.target_gps ? `${armRadoData.target_gps.lat.toFixed(5)}° N, ${armRadoData.target_gps.lon.toFixed(5)}° E` : '12.92345° N, 77.50155° E'}</span>
            </div>

            {/* MarkerObservation (trixanth_interfaces/msg/MarkerObservation) */}
            <div className="rado-stat-row">
              <span className="r-lbl">Marker Detector</span>
              <span className={`r-val mono ${markerVisible ? 'ok' : 'fault'}`}>
                {markerColour.toUpperCase()} · {markerVisible ? `VISIBLE ${markerRange.toFixed(2)}m at ${markerBearingDeg}°` : 'NOT VISIBLE'}
              </span>
            </div>

            {/* RADO Actions (trixanth_ws FSM & recon_logger services) */}
            <div className="rado-action-btns-row">
              <button
                type="button"
                className="rado-act-btn start mono"
                onClick={() => callService(config.services.radoStartDelivery, {})}
                title="Engage Autonomous Delivery (/rado/start_delivery)"
              >
                START DELIVERY
              </button>
              <button
                type="button"
                className="rado-act-btn abort mono"
                onClick={() => callService(config.services.radoAbort, {})}
                title="Abort Delivery and return to Manual (/rado/abort)"
              >
                ABORT
              </button>
              <button
                type="button"
                className="rado-act-btn capture mono"
                onClick={() => callService(config.services.reconCapture, { label: 'sample_container' })}
                title="Capture Recon Photo + GPS coordinates (rule 3.3.1)"
              >
                CAPTURE RECON
              </button>
            </div>
          </div>

          {/* ReconEntry Log (trixanth_interfaces/msg/ReconEntry) */}
          {reconLog.length > 0 && (
            <div className="recon-log-section">
              <div className="recon-log-header mono">RECON LOG (rule 3.3.1)</div>
              <div className="recon-log-list mono">
                {reconLog.map((e) => (
                  <div key={e.id} className="recon-log-row">
                    <span className="recon-id">#{e.id}</span>
                    <span className="recon-label">{e.label}</span>
                    <span className="recon-conf">{(e.confidence * 100).toFixed(0)}%</span>
                    <span className="recon-gps">{e.latitude?.toFixed(5)}° N, {e.longitude?.toFixed(5)}° E</span>
                    <span className="recon-acc">±{e.horizontal_accuracy_m?.toFixed(2)}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM ROW: 6-DOF Joint Angles & Gripper Controls */}
      <div className="arm-joints-controls-card">
        <div className="card-head">
          <span className="card-title mono">6-DOF MANIPULATOR JOINTS &amp; END-EFFECTOR GRIPPER</span>
          <div className="preset-buttons-row">
            <button type="button" className="preset-btn">
              <IconStow size={12} /> STOW
            </button>
            <button type="button" className="preset-btn active">
              <IconReady size={12} /> READY
            </button>
            <button type="button" className="preset-btn">
              GROUND PICKUP
            </button>
            <button type="button" className="preset-btn">
              CACHE DEPLOY
            </button>
          </div>
        </div>

        <div className="joints-grid-row">
          {joints.map((val, idx) => (
            <div key={idx} className="joint-card mono">
              <div className="j-top">
                <span className="j-num">J{idx + 1}</span>
                <span className="j-name">{jointNames[idx]}</span>
              </div>
              <div className="j-val">{val}°</div>
              <div className="j-torque">{jointTorques[idx]} Nm</div>
            </div>
          ))}

          {/* Gripper Card */}
          <div className="joint-card mono gripper-card">
            <div className="j-top">
              <span className="j-num">GRP</span>
              <span className="j-name">Gripper Aperture</span>
            </div>
            <div className="j-val ok">{aperture} mm</div>
            <input
              type="range"
              min="0"
              max="100"
              value={aperture}
              onChange={(e) => setAperture(+e.target.value)}
              className="gripper-slider"
            />
            <div className="j-torque">Grip Force: {armRadoData?.gripper_force ?? 3.4} N (Locked)</div>
          </div>
        </div>
      </div>

      {/* DUAL LOGS: GLOBAL & LOCAL FOR ARM FOR RADO */}
      {!hideInlineLogs && (
        <SubsystemDualLogs
          subsystemId="arm_rado"
          subsystemCode="RADO"
          subsystemName="Arm for RADO"
          globalLogMsg={globalLogMsg}
          localLogMsg={localLogMsg}
        />
      )}
    </div>
  )
}
