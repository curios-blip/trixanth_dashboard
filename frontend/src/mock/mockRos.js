// Simulated ROS backend. Drives every topic the dashboard subscribes to so the
// UI can be built, reviewed and demoed with no rover and no rosbridge.
// Never active unless demo mode is explicitly on — see config.js.

import { config } from '../config'

const T = config.topics

const subs = new Map() // topic name -> Set<callback>
const latched = new Map() // topic name -> last message (replayed to new subscribers)

function publish(name, msg) {
  latched.set(name, msg)
  const set = subs.get(name)
  if (set) set.forEach((cb) => cb(msg))
}

export function subscribe(name, cb) {
  if (!subs.has(name)) subs.set(name, new Set())
  subs.get(name).add(cb)
  if (latched.has(name)) queueMicrotask(() => cb(latched.get(name)))
  return () => subs.get(name)?.delete(cb)
}

// ---------------------------------------------------------------- world state

const RES = 0.15
const W = 260
const H = 260
const ORIGIN = { x: -19.5, y: -19.5 }

const state = {
  t: 0,
  x: -12,
  y: -8,
  yaw: 0.4,
  pitch: 0.02,
  roll: -0.01,
  v: 0,
  w: 0,
  distanceTraveled: 142.8,
  voltage: 24.6,
  charge: 0.93,
  softStopped: false,
  fsm: 'IDLE',
  fsmSince: Date.now(),
  goal: null,
  legIndex: 0,
  teleop: { linear: 0, angular: 0, until: 0 },
  // trixanth_interfaces state
  mode: 2, // 0=IDLE, 1=MANUAL, 2=AUTONOMOUS, 3=ESTOP
  mission: 'rado',
  missionStage: 'Stage 2: Delivery Approach',
  missionRunning: true,
  missionElapsed: 342.5,
  missionPoints: 65.0,
  missionPointsMax: 100.0,
  commsPenalty: false,
  missionAlert: '',
  autonomyViolations: 0,
  radoStatusText: '[APPROACH] visual servo to blue marker',
  reconEntries: [
    {
      id: 1,
      label: 'sample_container',
      confidence: 0.94,
      latitude: 12.92345,
      longitude: 77.50155,
      altitude: 915.2,
      horizontal_accuracy_m: 0.18,
      image_path: '/trixanth_logs/recon/20261112/001_container.jpg',
    },
    {
      id: 2,
      label: 'tool_wrench',
      confidence: 0.88,
      latitude: 12.92358,
      longitude: 77.50172,
      altitude: 915.0,
      horizontal_accuracy_m: 0.22,
      image_path: '/trixanth_logs/recon/20261112/002_wrench.jpg',
    },
  ],
}

export const legs = [
  { id: 1, label: 'GNSS leg 1', kind: 'gnss', x: -4, y: -10 },
  { id: 2, label: 'GNSS leg 2', kind: 'gnss', x: 6, y: -2 },
  { id: 3, label: 'AR tag leg 3', kind: 'aruco', x: 11, y: 7 },
  { id: 4, label: 'AR tag leg 4', kind: 'aruco', x: 2, y: 13 },
  { id: 5, label: 'Object leg 5', kind: 'object', x: -9, y: 9 },
]

// A terrain grid with scattered rock clusters, roughly Sproscape-ish.
const grid = new Int8Array(W * H).fill(0)
;(function seedObstacles() {
  let seed = 20270317
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < 46; i++) {
    const cx = Math.floor(rand() * W)
    const cy = Math.floor(rand() * H)
    const r = 2 + Math.floor(rand() * 7)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        const px = cx + dx
        const py = cy + dy
        if (px < 0 || py < 0 || px >= W || py >= H) continue
        grid[py * W + px] = 100
      }
    }
  }
  // unknown band along the far edge, as if not yet mapped
  for (let y = H - 34; y < H; y++) {
    for (let x = 0; x < W; x++) if (grid[y * W + x] === 0) grid[y * W + x] = -1
  }
})()

function mapMsg() {
  return {
    header: { frame_id: 'map' },
    info: {
      resolution: RES,
      width: W,
      height: H,
      origin: { position: { x: ORIGIN.x, y: ORIGIN.y, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    },
    data: Array.from(grid),
  }
}

const quat = (yaw) => ({ x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) })

const quatRPY = (roll, pitch, yaw) => {
  const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5)
  const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5)
  const cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5)
  return {
    w: cr * cp * cy + sr * sp * sy,
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
  }
}


function currentTarget() {
  if (state.goal) return state.goal
  return legs[Math.min(state.legIndex, legs.length - 1)]
}

function planTo(target) {
  // Not a real planner — a bowed polyline, enough to exercise the map renderer.
  const n = 26
  const poses = []
  const dx = target.x - state.x
  const dy = target.y - state.y
  const bow = 0.18 * Math.hypot(dx, dy)
  for (let i = 0; i <= n; i++) {
    const s = i / n
    const px = state.x + dx * s - dy * bow * Math.sin(Math.PI * s) * 0.12
    const py = state.y + dy * s + dx * bow * Math.sin(Math.PI * s) * 0.12
    poses.push({ pose: { position: { x: px, y: py, z: 0 }, orientation: quat(0) } })
  }
  return { header: { frame_id: 'map' }, poses }
}

const FSM_CYCLE = ['IDLE', 'NAV_TO_LEG', 'SEARCH', 'APPROACH', 'ARRIVED']

function setFsm(next) {
  if (next === state.fsm) return
  state.fsm = next
  state.fsmSince = Date.now()
  publish(T.fsmState.name, { data: next })
  log('INFO', 'mission_fsm_core', `state -> ${next}`)
}

// ------------------------------------------------------------------- rosout

const LOG_SOURCES = [
  ['INFO', 'nav2_controller', 'MPPI critic scores within bounds'],
  ['INFO', 'smac_planner', 'Plan found in 41 ms, 312 nodes expanded'],
  ['INFO', 'yolo_detector', 'inference 18.4 ms (n=2)'],
  ['WARN', 'ekf_filter_node', 'GPS covariance high, down-weighting fix'],
  ['INFO', 'aruco_pose', 'tag 4 at range 3.1 m, reprojection error 0.7 px'],
  ['WARN', 'controller_server', 'Control loop missed desired rate of 20 Hz'],
  ['INFO', 'slam_toolbox', 'Loop closure accepted, 148 nodes in graph'],
  ['ERROR', 'micro_ros_agent', 'Teensy heartbeat late by 240 ms'],
]

function log(level, name, msg) {
  publish(T.rosout.name, {
    stamp: { sec: Math.floor(Date.now() / 1000) },
    level: { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40, FATAL: 50 }[level] ?? 20,
    name,
    msg,
  })
}

// --------------------------------------------------------------------- loop

let started = false

export function start() {
  if (started) return
  started = true

  publish(T.map.name, mapMsg())
  publish(T.fsmState.name, { data: state.fsm })
  publish(T.legs.name, { data: JSON.stringify({ legs, active: state.legIndex }) })

  // 20 Hz physics + odom
  setInterval(() => {
    const dt = 0.05
    state.t += dt

    const teleopActive = Date.now() < state.teleop.until
    let vCmd = 0
    let wCmd = 0

    if (state.softStopped) {
      vCmd = 0
      wCmd = 0
    } else if (teleopActive) {
      vCmd = state.teleop.linear
      wCmd = state.teleop.angular
    } else if (state.fsm === 'NAV_TO_LEG' || state.fsm === 'APPROACH') {
      const tgt = currentTarget()
      const bearing = Math.atan2(tgt.y - state.y, tgt.x - state.x)
      let err = bearing - state.yaw
      while (err > Math.PI) err -= 2 * Math.PI
      while (err < -Math.PI) err += 2 * Math.PI
      wCmd = Math.max(-0.7, Math.min(0.7, 1.4 * err))
      vCmd = Math.max(0, 0.55 - Math.abs(err))
    } else if (state.fsm === 'SEARCH') {
      wCmd = 0.45
    }

    state.v += (vCmd - state.v) * 0.25
    state.w += (wCmd - state.w) * 0.3
    state.yaw += state.w * dt
    state.x += state.v * Math.cos(state.yaw) * dt
    state.y += state.v * Math.sin(state.yaw) * dt
    state.distanceTraveled += Math.abs(state.v) * dt
    state.pitch = Math.sin(state.t * 2.1) * 0.035 + (state.v * 0.02)
    state.roll = Math.cos(state.t * 1.6) * 0.025 + (state.w * 0.04)

    // Wheel speeds & currents
    const trackWidth = 0.65
    const vL = state.v - state.w * (trackWidth / 2)
    const vR = state.v + state.w * (trackWidth / 2)
    const fl_v = vL + (Math.random() - 0.5) * 0.015
    const rl_v = vL + (Math.random() - 0.5) * 0.015
    const fr_v = vR + (Math.random() - 0.5) * 0.015
    const rr_v = vR + (Math.random() - 0.5) * 0.015

    const baseCurr = 0.8 + Math.abs(state.v) * 2.2
    const wheels = {
      fl: { speed: fl_v, current: +(baseCurr + (fl_v > 0 ? 0.3 : 0)).toFixed(2), temp: +(32 + Math.abs(fl_v) * 8).toFixed(1), slip: Math.abs(fl_v - state.v) > 0.15 },
      fr: { speed: fr_v, current: +(baseCurr + (fr_v > 0 ? 0.3 : 0)).toFixed(2), temp: +(33 + Math.abs(fr_v) * 8).toFixed(1), slip: Math.abs(fr_v - state.v) > 0.15 },
      rl: { speed: rl_v, current: +(baseCurr).toFixed(2), temp: +(31 + Math.abs(rl_v) * 7).toFixed(1), slip: Math.abs(rl_v - state.v) > 0.15 },
      rr: { speed: rr_v, current: +(baseCurr).toFixed(2), temp: +(31 + Math.abs(rr_v) * 7).toFixed(1), slip: Math.abs(rr_v - state.v) > 0.15 },
      distance: +state.distanceTraveled.toFixed(2),
    }
    publish(T.wheels.name, wheels)

    publish(T.odom.name, {
      header: { frame_id: 'odom', stamp: { sec: Math.floor(Date.now() / 1000) } },
      pose: {
        pose: { position: { x: state.x, y: state.y, z: 0 }, orientation: quatRPY(state.roll, state.pitch, state.yaw) },
      },
      twist: {
        twist: { linear: { x: state.v, y: 0, z: 0 }, angular: { x: 0, y: 0, z: state.w } },
      },
    })

    publish(T.imu.name, {
      orientation: quatRPY(state.roll, state.pitch, state.yaw),
      pitch: state.pitch,
      roll: state.roll,
      yaw: state.yaw,
      angular_velocity: { x: (Math.random() - 0.5) * 0.01, y: (Math.random() - 0.5) * 0.01, z: state.w + (Math.random() - 0.5) * 0.02 },
      linear_acceleration: {
        x: (Math.random() - 0.5) * 0.4 + state.pitch * 9.8,
        y: (Math.random() - 0.5) * 0.4 - state.roll * 9.8,
        z: 9.79 + (Math.random() - 0.5) * 0.15,
      },
    })
  }, 50)

  // mission progression
  setInterval(() => {
    const tgt = currentTarget()
    const d = Math.hypot(tgt.x - state.x, tgt.y - state.y)
    if (state.fsm === 'NAV_TO_LEG' && d < 4) setFsm(tgt.kind === 'gnss' ? 'ARRIVED' : 'SEARCH')
    else if (state.fsm === 'SEARCH' && state.t % 7 < 0.6) setFsm('APPROACH')
    else if (state.fsm === 'APPROACH' && d < 1.2) setFsm('ARRIVED')
    else if (state.fsm === 'ARRIVED') {
      setTimeout(() => {
        if (state.goal) state.goal = null
        else state.legIndex = Math.min(state.legIndex + 1, legs.length - 1)
        publish(T.legs.name, { data: JSON.stringify({ legs, active: state.legIndex }) })
        setFsm('NAV_TO_LEG')
      }, 3000)
      setFsm('HOLD')
    }
    publish(T.globalPlan.name, planTo(currentTarget()))
  }, 1000)

  // battery
  setInterval(() => {
    state.charge = Math.max(0, state.charge - 0.00035 - Math.abs(state.v) * 0.0004)
    state.voltage = 19.2 + state.charge * 5.6
    const cellBase = state.voltage / 6
    const cell_voltages = [
      +(cellBase + 0.012).toFixed(3),
      +(cellBase - 0.008).toFixed(3),
      +(cellBase + 0.005).toFixed(3),
      +(cellBase - 0.011).toFixed(3),
      +(cellBase + 0.015).toFixed(3),
      +(cellBase - 0.006).toFixed(3),
    ]
    publish(T.battery.name, {
      voltage: state.voltage,
      current: -(3.1 + Math.abs(state.v) * 6),
      percentage: state.charge,
      temperature: 31 + Math.abs(state.v) * 4,
      power_supply_status: 2,
      cell_voltages,
    })
  }, 1000)


  // GPS
  setInterval(() => {
    publish(T.gps.name, {
      status: { status: 2, service: 1 },
      latitude: 12.9231 + state.y * 9e-6,
      longitude: 77.5012 + state.x * 9e-6,
      altitude: 912 + Math.sin(state.t / 20) * 2,
      position_covariance: [0.6, 0, 0, 0, 0.6, 0, 0, 0, 1.4],
    })
  }, 1000)

  // diagnostics
  setInterval(() => {
    const late = Math.random() < 0.15
    publish(T.diagnostics.name, {
      status: [
        { name: 'hardware: teensy_bridge', level: late ? 1 : 0, message: late ? 'heartbeat late' : 'nominal',
          values: [{ key: 'rate_hz', value: (late ? 42 : 50).toFixed(1) }, { key: 'dropped', value: '3' }] },
        { name: 'localization: ekf_filter_node', level: 0, message: 'fusing imu+gps+odom',
          values: [{ key: 'gps_cov', value: '0.62' }, { key: 'update_hz', value: '30.0' }] },
        { name: 'perception: yolo_detector', level: 0, message: 'inference nominal',
          values: [{ key: 'latency_ms', value: (16 + Math.random() * 6).toFixed(1) }] },
        { name: 'navigation: controller_server', level: Math.random() < 0.08 ? 1 : 0,
          message: 'MPPI running', values: [{ key: 'loop_hz', value: (19 + Math.random()).toFixed(1) }] },
        { name: 'power: battery_monitor', level: state.voltage < config.battery.warn ? 1 : 0,
          message: state.voltage < config.battery.warn ? 'below warning threshold' : 'nominal',
          values: [{ key: 'volts', value: state.voltage.toFixed(2) }] },
      ],
    })
  }, 1500)

  // detections (trixanth_interfaces/msg/DetectionArray with Detection[])
  setInterval(() => {
    const n = Math.random() < 0.2 ? 1 : 1 + Math.floor(Math.random() * 2)
    const dets = []
    const classes = ['sample_container', 'tool_wrench', 'rock_obstacle', 'delivery_cache']
    for (let i = 0; i < n; i++) {
      const cx = 140 + ((state.t * 34 + i * 240) % 380)
      const cy = 210 + Math.sin(state.t / 2 + i) * 44
      const w = 96 + i * 26
      const h = 84 + i * 18
      const label = classes[i % classes.length]
      const conf = +(0.72 + Math.random() * 0.24).toFixed(2)
      const depthZ = +(1.2 + (i + 1) * 0.6 + Math.sin(state.t * 0.2) * 0.2).toFixed(2)

      dets.push({
        label,
        confidence: conf,
        x: Math.round(cx - w / 2),
        y: Math.round(cy - h / 2),
        w: Math.round(w),
        h: Math.round(h),
        position: { x: +((cx - 320) / 400).toFixed(2), y: +((cy - 240) / 400).toFixed(2), z: depthZ },
        // Backwards compatibility for vision_msgs/Detection2D
        bbox: { center: { position: { x: cx, y: cy } }, size_x: w, size_y: h },
        results: [{ hypothesis: { class_id: label, score: conf } }],
      })
    }
    publish(T.detections.name, {
      header: { stamp: { sec: Math.floor(state.t), nanosec: 0 }, frame_id: 'camera_color_optical_frame' },
      detections: dets,
    })
  }, 200)

  // trixanth_interfaces: MissionState (2 Hz)
  setInterval(() => {
    if (state.missionRunning) {
      state.missionElapsed = +(state.missionElapsed + 0.5).toFixed(1)
    }
    const limitSec = state.commsPenalty ? 750 : 1500 // 12:30 or 25:00
    publish(T.missionState.name, {
      header: { stamp: { sec: Math.floor(state.t), nanosec: 0 }, frame_id: '' },
      mode: state.mode,
      mission: state.mission,
      stage: state.missionStage,
      running: state.missionRunning,
      elapsed_s: state.missionElapsed,
      limit_s: limitSec,
      points: state.missionPoints,
      points_max: state.missionPointsMax,
      bonus_unlocked: state.missionPoints >= 50.0,
      alert: state.missionAlert,
    })

    // MarkerObservation (perception/marker)
    const markerBearing = +(-0.15 + Math.sin(state.t * 0.2) * 0.08).toFixed(3)
    const markerRange = +(1.85 - Math.min(1.1, state.distanceTraveled % 5 * 0.2)).toFixed(2)
    publish(T.marker.name, {
      header: { stamp: { sec: Math.floor(state.t), nanosec: 0 }, frame_id: 'camera_color_optical_frame' },
      colour: 'blue',
      visible: true,
      bearing_rad: markerBearing,
      area_ratio: 0.048,
      range_m: markerRange,
    })

    // RADO FSM status string
    publish(T.radoStatus.name, { data: state.radoStatusText })

    // Comms & Command Gate topics
    publish(T.linkOk.name, { data: true })
    publish(T.linkAge.name, { data: 0.08 })
    publish(T.killSwitch.name, { data: false })
    publish(T.autonomyViolations.name, { data: state.autonomyViolations })
  }, 500)

  // Subsystem 1: Arm Manipulation Joint States & Feedback
  setInterval(() => {
    const j1 = Math.sin(state.t * 0.4) * 0.3
    const j2 = -0.45 + Math.cos(state.t * 0.3) * 0.15
    const j3 = 0.88 + Math.sin(state.t * 0.25) * 0.1
    const j4 = 0.04 + Math.cos(state.t * 0.5) * 0.08
    const j5 = 0.32 + Math.sin(state.t * 0.35) * 0.12
    const j6 = -0.15 + Math.sin(state.t * 0.6) * 0.2
    publish(T.armJoints.name, {
      name: ['base_yaw', 'shoulder_pitch', 'elbow_pitch', 'wrist_pitch', 'wrist_roll', 'gripper_rot'],
      position: [j1, j2, j3, j4, j5, j6],
      velocity: [0.02, -0.01, 0.01, 0.03, -0.02, 0.04],
      effort: [1.2, 3.4, 2.8, 0.9, 0.7, 0.4],
      gripper: {
        aperture: 68,
        torque: 1.4,
        holding: true,
      },
      cartesian: {
        x: 0.48,
        y: 0.12,
        z: 0.35,
        roll: 2.4,
        pitch: -12.1,
        yaw: 15.6,
      },
    })
  }, 200)

  // 1. Electrical Telemetry (Battery level of each component, power draining per component)
  setInterval(() => {
    const motorPwr = 180 + Math.abs(state.v) * 95 + (Math.random() - 0.5) * 8
    const armPwr = 72 + Math.sin(state.t * 0.3) * 12
    const jetsonPwr = 54 + (Math.random() - 0.5) * 4
    const camPwr = 21.6
    const rfPwr = 18.2
    const logicPwr = 4.2
    const totalPwr = +(motorPwr + armPwr + jetsonPwr + camPwr + rfPwr + logicPwr).toFixed(1)
    const totalCurr = +(-(totalPwr / state.voltage)).toFixed(2)

    publish(T.electrical.name, {
      battery_percentage: +(state.charge * 100).toFixed(1),
      total_voltage: +state.voltage.toFixed(2),
      total_current: totalCurr,
      total_power_watts: totalPwr,
      runtime_remaining_min: Math.round((state.charge * 18.0 * 24.0) / (totalPwr / 60)),
      cells: [
        +(state.voltage / 6 + 0.012).toFixed(3),
        +(state.voltage / 6 - 0.008).toFixed(3),
        +(state.voltage / 6 + 0.005).toFixed(3),
        +(state.voltage / 6 - 0.011).toFixed(3),
        +(state.voltage / 6 + 0.015).toFixed(3),
        +(state.voltage / 6 - 0.006).toFixed(3),
      ],
      components: [
        { id: 'drive_motors', name: 'Drive Motors (4x In-Hub BLDC)', voltage: +state.voltage.toFixed(1), current: +(motorPwr / state.voltage).toFixed(2), power_w: +motorPwr.toFixed(1), status: Math.abs(state.v) > 0.05 ? 'DRIVING' : 'IDLE', temp_c: +(33 + Math.abs(state.v) * 6).toFixed(1) },
        { id: 'arm_actuators', name: 'Manipulator Arm (6-DOF + Gripper)', voltage: 24.0, current: +(armPwr / 24.0).toFixed(2), power_w: +armPwr.toFixed(1), status: 'HOLDING', temp_c: 31.5 },
        { id: 'jetson_orin', name: 'NVIDIA Jetson Orin AGX Core', voltage: 19.1, current: +(jetsonPwr / 19.1).toFixed(2), power_w: +jetsonPwr.toFixed(1), status: 'AI INFERENCE (44%)', temp_c: 48.2 },
        { id: 'cameras', name: 'Vision (D435i + 4 Webcams)', voltage: 12.0, current: +(camPwr / 12.0).toFixed(2), power_w: +camPwr.toFixed(1), status: 'STREAMING 5/5', temp_c: 35.8 },
        { id: 'sector_rf', name: 'Sector Antenna & RF Transceiver', voltage: 12.0, current: +(rfPwr / 12.0).toFixed(2), power_w: +rfPwr.toFixed(1), status: 'TX ACTIVE 25W', temp_c: 38.6 },
        { id: 'logic_mcu', name: 'Logic & Microcontrollers (Teensy)', voltage: 5.0, current: +(logicPwr / 5.0).toFixed(2), power_w: +logicPwr.toFixed(1), status: 'NOMINAL', temp_c: 29.1 },
      ],
    })
  }, 600)

  // 2. Cams and Comms: Sector Antenna Status (is working, azimuth, elevation, RF quality)
  setInterval(() => {
    const az = (142.5 + Math.sin(state.t * 0.08) * 3.5) % 360
    const el = Math.max(5, Math.min(85, 18.0 + Math.cos(state.t * 0.05) * 2))
    publish(T.sectorAntenna.name, {
      is_working: true,
      mode: 'AUTO_BEACON_LOCK',
      azimuth_deg: +az.toFixed(1),
      elevation_deg: +el.toFixed(1),
      rssi_dbm: Math.round(-64 + Math.sin(state.t * 0.3) * 3),
      snr_db: +(28.2 + Math.sin(state.t * 0.2) * 1.5).toFixed(1),
      packet_loss_pct: +(0.15 + (Math.sin(state.t * 0.1) * 0.08)).toFixed(2),
      bandwidth_mbps: +(14.6 + Math.sin(state.t * 0.15) * 1.2).toFixed(1),
      frequency_ghz: 5.8,
      ping_ms: 14,
      tracking_quality: 'EXCELLENT',
    })
  }, 500)

  // 3. Arm for RADO (Arm operations & RADO mission telemetry)
  setInterval(() => {
    const j1 = Math.sin(state.t * 0.3) * 15
    const j2 = 32.0 + Math.cos(state.t * 0.25) * 8
    const j3 = -45.2 + Math.sin(state.t * 0.2) * 6
    const j4 = 14.8 + Math.cos(state.t * 0.4) * 4
    const j5 = -5.0 + Math.sin(state.t * 0.3) * 5
    const j6 = 0.0
    publish(T.armRado.name, {
      joint_positions: [+j1.toFixed(1), +j2.toFixed(1), +j3.toFixed(1), +j4.toFixed(1), +j5.toFixed(1), +j6.toFixed(1)],
      joint_names: ['Base Yaw', 'Shoulder Pitch', 'Elbow Pitch', 'Wrist Pitch', 'Wrist Roll', 'Gripper Rot'],
      joint_torques: [1.2, 3.4, 2.8, 0.9, 0.6, 0.3],
      gripper_aperture: 68.0,
      gripper_force: 3.4,
      holding_cache: true,
      object_in_cache: 'Sample Container #2',
      payload_weight_kg: 1.85,
      max_payload_kg: 5.0,
      rado_stage: 'Stage 2: Autonomous Delivery (15m)',
      rado_time_remaining: '09:42',
      target_gps: { lat: 12.92345, lon: 77.50155 },
      delivery_mode: 'AUTONOMOUS',
      cartesian: { x: 0.48, y: 0.12, z: 0.35, roll: 2.4, pitch: -12.1, yaw: 15.6 },
    })
  }, 300)

  // 4. ML Locomotion Operations (Relative operations, distance moved, turning left/right)
  setInterval(() => {
    const heading = ((state.yaw * 180 / Math.PI) % 360 + 360) % 360
    const turnAction = state.w > 0.08
      ? `TURNING LEFT ${Math.round(state.w * 35)}°`
      : state.w < -0.08
      ? `TURNING RIGHT ${Math.round(Math.abs(state.w) * 35)}°`
      : Math.abs(state.v) > 0.05
      ? 'STRAIGHT FORWARD'
      : 'IDLE AT WAYPOINT'

    const deltaMeters = +(Math.abs(state.v) * 0.35 + 0.1).toFixed(2)

    publish(T.mlOperations.name, {
      distance_moved_m: deltaMeters,
      total_traversed_m: +state.distanceTraveled.toFixed(1),
      current_action: turnAction,
      linear_speed: +state.v.toFixed(2),
      angular_rate: +state.w.toFixed(2),
      heading_deg: +heading.toFixed(1),
      mode: 'AUTONOMOUS_OBSTACLE_AVOIDANCE',
      planner: 'SmacPlannerHybrid + MPPI',
      active_camera: '/camera/color/image_raw',
      recent_ops: [
        `Moved ${deltaMeters}m forward along planned path`,
        turnAction,
        `Traversed ${(+state.distanceTraveled.toFixed(1))}m total`,
        'Visual odometry tracking 384 keypoints',
      ],
    })
  }, 400)

  // 5. Dual Logs (Global: broadcast to all systems; Local: dedicated to active subsystem)
  const GLOBAL_LOG_SAMPLES = [
    'RTK Fixed lock acquired (lat 12.9231, lon 77.5012)',
    'Global safety monitor nominal; E-stop armed & ready',
    'Mission Phase transitioned: NAV_TO_LEG -> ARRIVED',
    'Battery capacity 84% (24.6V), estimated 48 mins remaining',
    'Base Station sector antenna tracking link verified',
  ]

  const ML_LOCAL_LOG_SAMPLES = [
    'Moved 1.45m along navigation trajectory',
    'Turning left 15° to clear boulder at 2.1m',
    'Traversed 24.5m total in current waypoint leg',
    'Wheel slip FL 1.8%, FR 1.6% (within nominal limit)',
    'MPPI candidate trajectories scored: 64 rollouts evaluated',
  ]

  setInterval(() => {
    const gMsg = GLOBAL_LOG_SAMPLES[Math.floor(Math.random() * GLOBAL_LOG_SAMPLES.length)]
    publish(T.globalLogs.name, {
      scope: 'global',
      source: 'SYSTEM_CORE',
      text: gMsg,
      timestamp: new Date().toLocaleTimeString('en-GB'),
      level: 20,
    })

    const lMsg = ML_LOCAL_LOG_SAMPLES[Math.floor(Math.random() * ML_LOCAL_LOG_SAMPLES.length)]
    publish(T.localLogs.name, {
      scope: 'local',
      subsystem: 'ml',
      source: 'ML_LOCOMOTION',
      text: lMsg,
      timestamp: new Date().toLocaleTimeString('en-GB'),
      level: 20,
    })
  }, 1600)

  // rosout chatter
  setInterval(() => {
    const [level, name, msg] = LOG_SOURCES[Math.floor(Math.random() * LOG_SOURCES.length)]
    log(level, name, msg)
  }, 1400)
}

// ----------------------------------------------------------- outgoing traffic

export function publishTo(name, msg) {
  if (name === T.cmdVel.name || name === T.cmdVelTeleop?.name) {
    if (state.mode === 2) {
      // Rule 3.3.2: Dropped teleop in AUTONOMOUS, count violation
      state.autonomyViolations += 1
      publish(T.autonomyViolations.name, { data: state.autonomyViolations })
      log('WARN', 'command_gate', `Teleop dropped in AUTONOMOUS: violation #${state.autonomyViolations}`)
      return
    }
    state.teleop = {
      linear: msg.linear?.x ?? 0,
      angular: msg.angular?.z ?? 0,
      until: Date.now() + 400,
    }
  }
  if (name === T.scoreEvent?.name) {
    state.missionPoints = +(state.missionPoints + (msg.points || 0)).toFixed(1)
    log('INFO', 'mission_monitor', `+${msg.points} points awarded for [${msg.task}] (Total: ${state.missionPoints})`)
  }
  if (name === T.goalPose.name) {
    state.goal = { x: msg.pose.position.x, y: msg.pose.position.y, kind: 'manual', label: 'Manual goal' }
    setFsm('NAV_TO_LEG')
    log('INFO', 'bt_navigator', `Begin navigating to (${state.goal.x.toFixed(1)}, ${state.goal.y.toFixed(1)})`)
  }
}

export function callService(name, req) {
  // trixanth_interfaces/srv/SetMode
  if (name === config.services.setMode?.name) {
    state.mode = req.mode ?? 1
    const modeName = config.MODE_NAMES[state.mode] || 'UNKNOWN'
    const ev = `ENTER ${modeName} ${new Date().toLocaleTimeString('en-GB')}`
    publish(T.modeEvent.name, { data: ev })
    log('INFO', 'command_gate', `SetMode: transitioned to ${modeName}`)
    return Promise.resolve({ success: true, message: `Mode set to ${modeName}` })
  }

  // trixanth_interfaces/srv/StartMission
  if (name === config.services.startMission?.name) {
    state.mission = req.mission || 'rado'
    state.missionPointsMax = req.points_max || 100
    state.missionRunning = true
    state.missionElapsed = 0
    state.missionAlert = `Mission ${state.mission.toUpperCase()} started`
    log('INFO', 'mission_monitor', `Mission ${state.mission.toUpperCase()} started`)
    return Promise.resolve({ success: true, message: 'started' })
  }

  // trixanth_mission /mission/stop
  if (name === config.services.stopMission?.name) {
    state.missionRunning = false
    state.missionAlert = `Mission stopped at ${state.missionElapsed.toFixed(0)}s with ${state.missionPoints.toFixed(0)} pts`
    log('INFO', 'mission_monitor', state.missionAlert)
    return Promise.resolve({ success: true, message: 'stopped' })
  }

  // trixanth_mission /mission/comms_penalty
  if (name === config.services.commsPenalty?.name) {
    state.commsPenalty = !state.commsPenalty
    state.missionAlert = state.commsPenalty ? 'COMMS PENALTY: max mission time halved to 12:30' : 'Comms penalty cleared'
    log('WARN', 'mission_monitor', state.missionAlert)
    return Promise.resolve({ success: true, message: 'applied' })
  }

  // trixanth_mission /recon/capture (ReconEntry)
  if (name === config.services.reconCapture?.name) {
    const nextId = (state.reconEntries?.length || 0) + 1
    const newEntry = {
      id: nextId,
      label: req?.label || 'manual_recon_target',
      confidence: 1.0,
      latitude: +(12.9231 + state.y * 9e-6).toFixed(6),
      longitude: +(77.5012 + state.x * 9e-6).toFixed(6),
      altitude: +(912 + Math.sin(state.t / 20) * 2).toFixed(1),
      horizontal_accuracy_m: 0.15,
      image_path: `/trixanth_logs/recon/20261112/entry_${String(nextId).padStart(3, '0')}.jpg`,
    }
    state.reconEntries = [newEntry, ...(state.reconEntries || [])]
    publish(T.reconEntry.name, newEntry)
    log('INFO', 'recon_logger', `Recon captured #${newEntry.id}: ${newEntry.label} at (${newEntry.latitude}, ${newEntry.longitude})`)
    return Promise.resolve({ success: true, message: `Recon captured #${newEntry.id}` })
  }

  // trixanth_mission /rado/start_delivery
  if (name === config.services.radoStartDelivery?.name) {
    state.mode = 2 // AUTONOMOUS
    state.radoStatusText = '[APPROACH] visual servo to marker'
    publish(T.radoStatus.name, { data: state.radoStatusText })
    log('INFO', 'rado_fsm', 'RADO autonomous delivery sequence engaged')
    return Promise.resolve({ success: true, message: 'delivery started' })
  }

  // trixanth_mission /rado/abort
  if (name === config.services.radoAbort?.name) {
    state.mode = 1 // MANUAL
    state.radoStatusText = '[ABORTED] mode returned to manual'
    publish(T.radoStatus.name, { data: state.radoStatusText })
    log('WARN', 'rado_fsm', 'RADO autonomous delivery aborted: manual control restored')
    return Promise.resolve({ success: true, message: 'aborted' })
  }

  if (name === config.services.softStop.name) {
    state.softStopped = !!req.data
    log('WARN', 'trixanth_safety', state.softStopped ? 'soft stop engaged' : 'soft stop released')
    return Promise.resolve({ success: true, message: 'ok' })
  }
  if (name === config.services.clearCostmaps.name) {
    log('INFO', 'global_costmap', 'costmap cleared')
    return Promise.resolve({})
  }
  if (name === config.services.resetOdom.name) {
    state.x = 0
    state.y = 0
    state.yaw = 0
    state.distanceTraveled = 0
    log('INFO', 'ekf_filter_node', 'Odometry origin reset to (0.00, 0.00, 0.0°)')
    return Promise.resolve({ success: true })
  }
  if (name === config.services.calibrateImu.name) {
    log('INFO', 'imu_filter', 'IMU attitude and gyro biases zeroed on level ground')
    return Promise.resolve({ success: true })
  }
  return Promise.resolve({})
}

export function listTopics() {
  return Promise.resolve([
    { name: '/camera/color/image_raw', type: 'sensor_msgs/msg/Image' },
    { name: '/camera/depth/image_rect_raw', type: 'sensor_msgs/msg/Image' },
    { name: '/camera_rear/image_raw', type: 'sensor_msgs/msg/Image' },
    { name: '/camera_arm/image_raw', type: 'sensor_msgs/msg/Image' },
    { name: '/camera_left/image_raw', type: 'sensor_msgs/msg/Image' },
    { name: '/camera_right/image_raw', type: 'sensor_msgs/msg/Image' },
  ])
}



export function snapshot() {
  return { ...state }
}
