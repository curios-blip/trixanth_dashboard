// Client for the launch manager REST/WebSocket API, with a simulated backend
// for demo mode so the launch panel behaves realistically with no rover.

import { config, DEMO } from './config'

// ------------------------------------------------------------- demo backend

const DEMO_LAUNCHES = [
  // Rover Locomotion
  { name: 'locomotion_drive', label: '4-Wheel Diff Drive Controller', subsystem: 'locomotion', group: 'mobility' },
  { name: 'ekf_localization', label: 'EKF Localization & Odometry', subsystem: 'locomotion', group: 'mobility' },
  { name: 'nav2_stack', label: 'Nav2 Autonomous Navigation', subsystem: 'locomotion', group: 'mobility' },

  // Arm Manipulation
  { name: 'arm_driver', label: '6-DOF CAN Joint Actuators', subsystem: 'arm', group: 'manipulation' },
  { name: 'moveit_server', label: 'MoveIt 2 Kinematics & IK', subsystem: 'arm', group: 'manipulation' },
  { name: 'gripper_service', label: 'End-Effector Torque/Aperture', subsystem: 'arm', group: 'manipulation' },

  // ABEx Science
  { name: 'abex_drill', label: 'Subsurface Auger & Drill', subsystem: 'abex', group: 'science' },
  { name: 'abex_spectrometer', label: 'UV-Vis Raman Spectrometer', subsystem: 'abex', group: 'science' },
  { name: 'abex_carousel', label: 'Sample Carousel & Seal', subsystem: 'abex', group: 'science' },

  // RADO Array
  { name: 'rado_tracker', label: 'Antenna Az/El Servo Tracker', subsystem: 'rado', group: 'radio' },
  { name: 'rado_sdr_rx', label: 'Software Defined Radio RX', subsystem: 'rado', group: 'radio' },
  { name: 'rado_comms_mesh', label: 'Long-Range Mesh Relay', subsystem: 'rado', group: 'radio' },

  // Perception (Intel RealSense D435i)
  { name: 'realsense_camera', label: 'Intel RealSense D435i Driver', subsystem: 'perception', group: 'vision' },
  { name: 'yolo_detector', label: 'YOLOv8 Real-Time Vision AI', subsystem: 'perception', group: 'vision' },
  { name: 'depth_octomap', label: 'Real-Time 3D Octomap Grid', subsystem: 'perception', group: 'vision' },

  // Core Infrastructure
  { name: 'rosbridge_server', label: 'ROSbridge WebSocket Server', subsystem: 'core', group: 'core' },
  { name: 'safety_monitor', label: 'Hardware Heartbeat & Soft Stop', subsystem: 'core', group: 'core' },
]

const demoState = new Map(
  DEMO_LAUNCHES.map((l) => [
    l.name,
    { ...l, state: 'stopped', startedAt: null, exit_code: null, log: [], subs: new Set() },
  ])
)

const DEMO_LOG_LINES = [
  '[INFO] [launch]: All log files can be found below ~/.ros/log',
  '[INFO] [launch]: Default logging verbosity is set to INFO',
  '[INFO] [robot_state_publisher-1]: got segment base_link',
  '[INFO] [ekf_filter_node-2]: Filter is initialising with IMU + Odom',
  '[INFO] [controller_server-3]: Creating controller server',
  '[INFO] [planner_server-4]: Configuring SmacPlannerHybrid',
  '[INFO] [realsense_camera]: D435i Color (1080p60) & Depth (720p60) active',
  '[INFO] [lifecycle_manager]: Managed nodes are active',
]

function demoEmit(entry, line) {
  const stamped = `${new Date().toLocaleTimeString('en-GB')} ${line}`
  entry.log.push(stamped)
  if (entry.log.length > 500) entry.log.shift()
  entry.subs.forEach((cb) => cb(stamped))
}

if (DEMO) {
  // Common nodes start up running so dashboard looks live on load
  for (const n of ['locomotion_drive', 'ekf_localization', 'realsense_camera', 'rado_tracker', 'rosbridge_server']) {
    const e = demoState.get(n)
    if (e) {
      e.state = 'running'
      e.startedAt = Date.now() - 1000 * (60 + Math.random() * 400)
      DEMO_LOG_LINES.forEach((l) => demoEmit(e, l))
    }
  }
  setInterval(() => {
    for (const e of demoState.values()) {
      if (e.state === 'running' && Math.random() < 0.25) {
        demoEmit(e, DEMO_LOG_LINES[Math.floor(Math.random() * DEMO_LOG_LINES.length)])
      }
    }
  }, 2500)
}

function demoStatus(e) {
  return {
    name: e.name,
    label: e.label,
    subsystem: e.subsystem,
    group: e.group,
    state: e.state,
    pid: e.state === 'running' ? 4000 + e.name.length * 7 : null,
    uptime_s: e.startedAt && e.state === 'running' ? (Date.now() - e.startedAt) / 1000 : null,
    exit_code: e.exit_code,
  }
}

// ------------------------------------------------------------------ real API

export async function fetchLaunches() {
  if (DEMO) return [...demoState.values()].map(demoStatus)
  const r = await fetch(`${config.launchManagerUrl}/api/launches`)
  if (!r.ok) throw new Error(r.statusText)
  return r.json()
}

export async function actOnLaunch(name, verb) {
  if (DEMO) {
    const e = demoState.get(name)
    if (!e) throw new Error('unknown launch')
    if (verb === 'start') {
      const clash = [...demoState.values()].find(
        (o) => o.name !== name && o.group && o.group === e.group && o.state === 'running'
      )
      if (clash) throw new Error(`'${clash.name}' is running and conflicts with '${name}'.`)
      e.state = 'running'
      e.startedAt = Date.now()
      e.exit_code = null
      e.log = []
      demoEmit(e, `-- starting: ros2 launch trixanth_bringup ${name}.launch.py --`)
      DEMO_LOG_LINES.forEach((l, i) => setTimeout(() => demoEmit(e, l), 200 * (i + 1)))
    } else {
      e.state = 'stopped'
      e.startedAt = null
      demoEmit(e, '-- exited with code 0 --')
    }
    return demoStatus(e)
  }
  const r = await fetch(`${config.launchManagerUrl}/api/launches/${name}/${verb}`, {
    method: 'POST',
  })
  if (!r.ok) throw new Error((await r.json()).detail ?? `could not ${verb} ${name}`)
  return r.json()
}

export async function stopAll() {
  if (DEMO) {
    for (const e of demoState.values()) if (e.state === 'running') await actOnLaunch(e.name, 'stop')
    return
  }
  await fetch(`${config.launchManagerUrl}/api/stop_all`, { method: 'POST' })
}

/** Stream a launch's stdout. Returns an unsubscribe function. */
export function tailLog(name, onLine) {
  if (DEMO) {
    const e = demoState.get(name)
    if (!e) return () => {}
    e.log.forEach(onLine)
    e.subs.add(onLine)
    return () => e.subs.delete(onLine)
  }
  const ws = new WebSocket(`${config.launchManagerWs}/ws/logs/${name}`)
  ws.onmessage = (ev) => onLine(ev.data)
  return () => ws.close()
}
