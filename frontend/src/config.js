// Everything site-specific lives here. Defaults assume the dashboard is served
// from the Jetson; override with frontend/.env.local if you serve it elsewhere.

const host = import.meta.env.VITE_ROVER_HOST || window.location.hostname

// Demo mode runs the whole UI against simulated data — no rover, no rosbridge.
// Toggle it from the header; it persists and reloads.
const params = new URLSearchParams(window.location.search)
if (params.has('demo')) {
  localStorage.setItem('trixanth.demo', params.get('demo') === '0' ? '0' : '1')
}
export const DEMO =
  localStorage.getItem('trixanth.demo') === '1' || import.meta.env.VITE_DEMO === '1'

export function setDemo(on) {
  localStorage.setItem('trixanth.demo', on ? '1' : '0')
  window.location.href = window.location.pathname
}

export const config = {
  roverName: 'Trixanth',

  rosbridgeUrl: `ws://${host}:9090`,
  videoServerUrl: `http://${host}:8080`,
  launchManagerUrl: `http://${host}:8000`,
  launchManagerWs: `ws://${host}:8000`,

  // --- topics -------------------------------------------------------------
  // Confirm every one of these against trixanth_msgs before the field trial.
  topics: {
    odom: { name: '/odometry/filtered', type: 'nav_msgs/msg/Odometry' },
    map: { name: '/map', type: 'nav_msgs/msg/OccupancyGrid' },
    globalPlan: { name: '/plan', type: 'nav_msgs/msg/Path' },
    goalPose: { name: '/goal_pose', type: 'geometry_msgs/msg/PoseStamped' },
    cmdVel: { name: '/cmd_vel', type: 'geometry_msgs/msg/Twist' },
    battery: { name: '/battery_state', type: 'sensor_msgs/msg/BatteryState' },
    imu: { name: '/imu/data', type: 'sensor_msgs/msg/Imu' },
    gps: { name: '/gps/fix', type: 'sensor_msgs/msg/NavSatFix' },
    diagnostics: { name: '/diagnostics_agg', type: 'diagnostic_msgs/msg/DiagnosticArray' },
    rosout: { name: '/rosout', type: 'rcl_interfaces/msg/Log' },
    fsmState: { name: '/mission_fsm/state', type: 'std_msgs/msg/String' },
    legs: { name: '/waypoint_manager/legs', type: 'std_msgs/msg/String' }, // JSON payload
    detections: { name: '/yolo/detections', type: 'vision_msgs/msg/Detection2DArray' },
    wheels: { name: '/wheels/telemetry', type: 'trixanth_msgs/msg/WheelTelemetry' },
    // Intel RealSense D435i (realsense-ros / librealsense2 2.58.3 on ROS 2 Jazzy)
    realsenseColor: { name: '/camera/color/image_raw', type: 'sensor_msgs/msg/Image' },
    realsenseDepth: { name: '/camera/depth/image_rect_raw', type: 'sensor_msgs/msg/Image' },
    realsenseInfra1: { name: '/camera/infra1/image_rect_raw', type: 'sensor_msgs/msg/Image' },
    realsenseImu: { name: '/camera/imu', type: 'sensor_msgs/msg/Imu' },
    // trixanth_interfaces (https://github.com/ShubhkarmanSingh7/trixanth_ws/tree/main/src/trixanth_interfaces)
    missionState: { name: '/mission/state', type: 'trixanth_interfaces/msg/MissionState' },
    missionAlert: { name: '/mission/alert', type: 'std_msgs/msg/String' },
    scoreEvent: { name: '/mission/score', type: 'trixanth_interfaces/msg/ScoreEvent' },
    detections: { name: '/perception/detections', type: 'trixanth_interfaces/msg/DetectionArray' },
    marker: { name: '/perception/marker', type: 'trixanth_interfaces/msg/MarkerObservation' },
    reconEntry: { name: '/recon/entry', type: 'trixanth_interfaces/msg/ReconEntry' },
    modeEvent: { name: '/trixanth/mode_event', type: 'std_msgs/msg/String' },
    autonomyViolations: { name: '/trixanth/autonomy_violations', type: 'std_msgs/msg/UInt32' },
    linkOk: { name: '/trixanth/link_ok', type: 'std_msgs/msg/Bool' },
    linkAge: { name: '/trixanth/link_age', type: 'std_msgs/msg/Float32' },
    killSwitch: { name: '/trixanth/kill_switch', type: 'std_msgs/msg/Bool' },
    radoStatus: { name: '/rado/status', type: 'std_msgs/msg/String' },
    cmdVelAuto: { name: '/cmd_vel_auto', type: 'geometry_msgs/msg/Twist' },
    cmdVelTeleop: { name: '/cmd_vel_teleop', type: 'geometry_msgs/msg/Twist' },

    electrical: { name: '/trixanth/electrical/telemetry', type: 'trixanth_interfaces/msg/ElectricalTelemetry' },
    sectorAntenna: { name: '/trixanth/comms/sector_antenna', type: 'trixanth_interfaces/msg/SectorAntennaStatus' },
    armRado: { name: '/trixanth/arm/rado_state', type: 'trixanth_interfaces/msg/ArmRadoState' },
    mlOperations: { name: '/trixanth/ml/operations', type: 'trixanth_interfaces/msg/MLOperations' },
    globalLogs: { name: '/trixanth/logs/global', type: 'trixanth_interfaces/msg/LogMessage' },
    localLogs: { name: '/trixanth/logs/local', type: 'trixanth_interfaces/msg/LogMessage' },

    // Core rover telemetry
    armJoints: { name: '/arm/joint_states', type: 'sensor_msgs/msg/JointState' },
    armCmd: { name: '/arm/joint_commands', type: 'trajectory_msgs/msg/JointTrajectory' },
    globalInputs: { name: '/global/inputs', type: 'std_msgs/msg/String' },
  },

  // 4 Ground Station Links (3 Comms/Telemetry Links + 1 Camera Link)
  links: [
    { id: 'rf', name: '900MHz RF Telemetry', shortName: 'RF Link', port: 900, ping: '210ms', nominal: true },
    { id: 'sector', name: '5.8GHz Sector Antenna', shortName: 'Sector Ant', port: 5800, ping: '14ms', nominal: true },
    { id: 'safety', name: 'Safety Heartbeat / E-Stop', shortName: 'Safety Link', port: 8000, ping: '5ms', nominal: true },
    { id: 'camera', name: 'Video Server / 5-Cam Streams', shortName: 'Cam Link', port: 8080, ping: '60fps', nominal: true },
  ],

  // 5 Subsystems as specified:
  // 1. General (view of all subsystems)
  // 2. ML (locomotion camera feed, relative operations & operations logs: moved X meters, turning left/right, global & local logs)
  // 3. Electrical (battery level of each component, power draining per component)
  // 4. Cams and Comms (sector antenna working status & RF links)
  // 5. Arm for RADO (arm operations for RADO mission & arm camera feed)
  subsystems: [
    { id: 'general', name: 'General Overview', code: 'GEN', lead: 'All Subsystems View & Health' },
    { id: 'ml', name: 'ML & Locomotion', code: 'ML', lead: 'Locomotion Feed, Relative Ops & Dual Logs' },
    { id: 'electrical', name: 'Electrical & Power', code: 'ELEC', lead: 'Component Batteries & Power Draw' },
    { id: 'cams_comms', name: 'Cams & Comms', code: 'COMS', lead: 'Sector Antenna & 5-Camera Feeds' },
    { id: 'arm_rado', name: 'Arm for RADO', code: 'RADO', lead: 'Manipulator & RADO Mission Delivery' },
  ],

  // trixanth_interfaces Mode Constants
  MODES: {
    IDLE: 0,
    MANUAL: 1,
    AUTONOMOUS: 2,
    ESTOP: 3,
  },
  MODE_NAMES: ['IDLE', 'MANUAL', 'AUTONOMOUS', 'ESTOP'],

  services: {
    softStop: { name: '/trixanth_safety/soft_stop', type: 'std_srvs/srv/SetBool' },
    clearCostmaps: {
      name: '/global_costmap/clear_entirely_global_costmap',
      type: 'nav2_msgs/srv/ClearEntireCostmap',
    },
    resetOdom: { name: '/reset_odom', type: 'std_srvs/srv/Empty' },
    calibrateImu: { name: '/calibrate_imu', type: 'std_srvs/srv/Trigger' },
    steerSectorAntenna: { name: '/trixanth/comms/steer_antenna', type: 'trixanth_interfaces/srv/SteerAntenna' },

    // trixanth_interfaces services
    setMode: { name: '/set_mode', type: 'trixanth_interfaces/srv/SetMode' },
    startMission: { name: '/mission/start', type: 'trixanth_interfaces/srv/StartMission' },
    stopMission: { name: '/mission/stop', type: 'std_srvs/srv/Trigger' },
    commsPenalty: { name: '/mission/comms_penalty', type: 'std_srvs/srv/Trigger' },
    reconCapture: { name: '/recon/capture', type: 'std_srvs/srv/Trigger' },
    radoStartDelivery: { name: '/rado/start_delivery', type: 'std_srvs/srv/Trigger' },
    radoAbort: { name: '/rado/abort', type: 'std_srvs/srv/Trigger' },
    radoList: { name: '/rado/list', type: 'std_srvs/srv/Trigger' },
  },

  // Intel RealSense D435i Metadata
  realsense: {
    model: 'Intel RealSense D435i',
    sdk: 'librealsense2 v2.58.3',
    rosDistro: 'ROS 2 Jazzy Jalisco',
    wrapper: 'realsense-ros v4.56.1',
    repo: 'https://github.com/realsenseai/realsense-ros',
    fov: '87° × 58°',
    depthRange: '0.1m – 10m',
  },

  // 5 Cameras: 1 RealSense D435i (Depth & RGB in front) + 4 Webcams (Back, Manipulator, Left Side, Right Side)
  cameras: [
    {
      id: 'front',
      name: 'front',
      topic: '/camera/color/image_raw',
      fallbackTopic: '/camera_front/image_raw',
      depthTopic: '/camera/depth/image_rect_raw',
      infraTopic: '/camera/infra1/image_rect_raw',
      label: 'Front RealSense D435i',
      shortLabel: 'Front (D435i)',
      model: 'Intel RealSense D435i',
      sdk: 'librealsense2 2.58.3',
      fov: '87° × 58°',
      res: '1080p60',
      type: 'depth_rgb',
    },
    {
      id: 'rear',
      name: 'rear',
      topic: '/camera_rear/image_raw',
      label: 'Rear Back Webcam',
      shortLabel: 'Rear Cam',
      fov: '130°',
      res: '720p60',
      type: 'webcam',
    },
    {
      id: 'arm',
      name: 'arm',
      topic: '/camera_arm/image_raw',
      label: 'Manipulator Arm Webcam',
      shortLabel: 'Arm Cam',
      fov: '90°',
      res: '720p30',
      type: 'webcam',
    },
    {
      id: 'left',
      name: 'left',
      topic: '/camera_left/image_raw',
      label: 'Rover Left Side Webcam',
      shortLabel: 'Left Cam',
      fov: '110°',
      res: '720p30',
      type: 'webcam',
    },
    {
      id: 'right',
      name: 'right',
      topic: '/camera_right/image_raw',
      label: 'Rover Right Side Webcam',
      shortLabel: 'Right Cam',
      fov: '110°',
      res: '720p30',
      type: 'webcam',
    },
  ],

  // Detection boxes arrive in source-image pixels
  detectionSourceSize: { width: 640, height: 480 },

  // Teleop limits. Keep these conservative; the rover is heavy.
  teleop: { maxLinear: 0.6, maxAngular: 0.9, rateHz: 10 },

  // Battery thresholds for the header warning (volts, 6S Li-ion nominal 22.2).
  battery: { warn: 21.0, critical: 19.8 },
}

