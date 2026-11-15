import { useState, useRef, useEffect } from 'react'
import { useTopic } from '../ros'
import { config } from '../config'
import { Readout, fmt, Chip } from '../components/ui'

const SAMPLE_URDF_XML = `<?xml version="1.0"?>
<!-- =================================================================================== -->
<!-- |    Trixanth Mars Rover URDF Description                                        | -->
<!-- |    Package: trixanth_description (ROS 2 Jazzy Jalisco)                          | -->
<!-- |    Sensor Suite: Intel RealSense D435i, 9-DOF IMU, RTK-GNSS, 6-DOF Manipulator | -->
<!-- =================================================================================== -->
<robot name="trixanth" xmlns:xacro="http://www.ros.org/wiki/xacro">

  <!-- ROOT LINK -->
  <link name="base_footprint"/>

  <joint name="base_footprint_joint" type="fixed">
    <parent link="base_footprint"/>
    <child link="base_link"/>
    <origin xyz="0 0 0.180" rpy="0 0 0"/>
  </joint>

  <!-- CHASSIS LINK -->
  <link name="base_link">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <box size="0.750 0.480 0.220"/>
      </geometry>
      <material name="carbon_dark">
        <color rgba="0.12 0.15 0.18 1.0"/>
      </material>
    </visual>
    <collision>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <box size="0.750 0.480 0.220"/>
      </geometry>
    </collision>
    <inertial>
      <mass value="32.5"/>
      <origin xyz="0.02 0 -0.03" rpy="0 0 0"/>
      <inertia ixx="0.68" ixy="0.001" ixz="0.012" iyy="1.45" iyz="0.002" izz="1.82"/>
    </inertial>
  </link>

  <!-- ROCKER-BOGIE DIFFERENTIAL SUSPENSION -->
  <link name="rocker_bogie_left">
    <visual>
      <geometry><box size="0.620 0.040 0.060"/></geometry>
      <material name="anodized_aluminum"><color rgba="0.35 0.40 0.48 1.0"/></material>
    </visual>
  </link>
  <joint name="rocker_left_joint" type="revolute">
    <parent link="base_link"/>
    <child link="rocker_bogie_left"/>
    <origin xyz="0 0.260 0.020" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-0.35" upper="0.35" effort="80.0" velocity="1.5"/>
  </joint>

  <!-- WHEEL FL (Front Left) -->
  <link name="wheel_fl_link">
    <visual>
      <origin xyz="0 0 0" rpy="1.5708 0 0"/>
      <geometry><cylinder radius="0.140" length="0.110"/></geometry>
      <material name="tire_rubber"><color rgba="0.05 0.05 0.06 1.0"/></material>
    </visual>
  </link>
  <joint name="wheel_fl_joint" type="continuous">
    <parent link="rocker_bogie_left"/>
    <child link="wheel_fl_link"/>
    <origin xyz="0.280 0.070 -0.140" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
  </joint>

  <!-- WHEEL RL (Rear Left) -->
  <link name="wheel_rl_link">
    <visual>
      <origin xyz="0 0 0" rpy="1.5708 0 0"/>
      <geometry><cylinder radius="0.140" length="0.110"/></geometry>
      <material name="tire_rubber"><color rgba="0.05 0.05 0.06 1.0"/></material>
    </visual>
  </link>
  <joint name="wheel_rl_joint" type="continuous">
    <parent link="rocker_bogie_left"/>
    <child link="wheel_rl_link"/>
    <origin xyz="-0.280 0.070 -0.140" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
  </joint>

  <!-- WHEEL FR (Front Right) -->
  <link name="wheel_fr_link">
    <visual>
      <origin xyz="0 0 0" rpy="1.5708 0 0"/>
      <geometry><cylinder radius="0.140" length="0.110"/></geometry>
      <material name="tire_rubber"><color rgba="0.05 0.05 0.06 1.0"/></material>
    </visual>
  </link>
  <joint name="wheel_fr_joint" type="continuous">
    <parent link="base_link"/>
    <child link="wheel_fr_link"/>
    <origin xyz="0.280 -0.330 -0.120" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
  </joint>

  <!-- WHEEL RR (Rear Right) -->
  <link name="wheel_rr_link">
    <visual>
      <origin xyz="0 0 0" rpy="1.5708 0 0"/>
      <geometry><cylinder radius="0.140" length="0.110"/></geometry>
      <material name="tire_rubber"><color rgba="0.05 0.05 0.06 1.0"/></material>
    </visual>
  </link>
  <joint name="wheel_rr_joint" type="continuous">
    <parent link="base_link"/>
    <child link="wheel_rr_link"/>
    <origin xyz="-0.280 -0.330 -0.120" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
  </joint>

  <!-- SENSOR MAST & INTEL REALSENSE D435i -->
  <link name="sensor_mast_link">
    <visual>
      <geometry><cylinder radius="0.025" length="0.450"/></geometry>
      <material name="mast_grey"><color rgba="0.25 0.28 0.35 1.0"/></material>
    </visual>
  </link>
  <joint name="sensor_mast_joint" type="fixed">
    <parent link="base_link"/>
    <child link="sensor_mast_link"/>
    <origin xyz="0.220 0 0.335" rpy="0 0 0"/>
  </joint>

  <!-- INTEL REALSENSE D435i CAMERA LINK -->
  <link name="camera_link">
    <visual>
      <geometry><box size="0.025 0.090 0.025"/></geometry>
      <material name="realsense_silver"><color rgba="0.75 0.75 0.78 1.0"/></material>
    </visual>
  </link>
  <joint name="camera_joint" type="fixed">
    <parent link="sensor_mast_link"/>
    <child link="camera_link"/>
    <origin xyz="0.040 0 0.225" rpy="0 0.1745 0"/>
  </joint>

  <!-- 6-DOF ARM MANIPULATOR (Base to Gripper) -->
  <link name="arm_base_link"/>
  <joint name="arm_mount_joint" type="fixed">
    <parent link="base_link"/>
    <child link="arm_base_link"/>
    <origin xyz="0.320 0 0.110" rpy="0 0 0"/>
  </joint>

  <link name="arm_link1_base_yaw"/>
  <joint name="arm_joint1" type="revolute">
    <parent link="arm_base_link"/>
    <child link="arm_link1_base_yaw"/>
    <origin xyz="0 0 0.080" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.1415" upper="3.1415" effort="45.0" velocity="2.0"/>
  </joint>

  <link name="arm_link2_shoulder"/>
  <joint name="arm_joint2" type="revolute">
    <parent link="arm_link1_base_yaw"/>
    <child link="arm_link2_shoulder"/>
    <origin xyz="0 0 0.120" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-1.85" upper="1.85" effort="60.0" velocity="1.5"/>
  </joint>

  <link name="arm_link3_elbow"/>
  <joint name="arm_joint3" type="revolute">
    <parent link="arm_link2_shoulder"/>
    <child link="arm_link3_elbow"/>
    <origin xyz="0.340 0 0" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-2.40" upper="2.40" effort="40.0" velocity="2.0"/>
  </joint>

  <!-- END EFFECTOR GRIPPER -->
  <link name="gripper_tool_frame"/>
  <joint name="gripper_fixed_joint" type="fixed">
    <parent link="arm_link3_elbow"/>
    <child link="gripper_tool_frame"/>
    <origin xyz="0.280 0 0" rpy="0 0 0"/>
  </joint>

</robot>`

export default function UrdfViewer({ onExpand = null }) {
  const [tab, setTab] = useState('3d') // '3d' | 'xml'
  const [copied, setCopied] = useState(false)
  const [wireframe, setWireframe] = useState(false)

  const odom = useTopic(config.topics.odom, { throttle: 100 })
  const arm = useTopic(config.topics.armJoints, { throttle: 100 })

  const tw = odom?.twist?.twist
  const speed = tw ? Math.hypot(tw.linear.x, tw.linear.y) : 0
  const yawRate = tw?.angular?.z ?? 0

  const canvasRef = useRef(null)

  const copyUrdf = () => {
    navigator.clipboard.writeText(SAMPLE_URDF_XML)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // Animated 3D Kinematics Renderer
  useEffect(() => {
    if (tab !== '3d') return
    let raf
    let angle = 0.5
    let wheelRot = 0

    const draw = () => {
      const el = canvasRef.current
      if (!el) return
      const rect = el.parentElement?.getBoundingClientRect() || { width: 600, height: 380 }
      const dpr = window.devicePixelRatio || 1
      if (el.width !== rect.width * dpr || el.height !== rect.height * dpr) {
        el.width = rect.width * dpr
        el.height = rect.height * dpr
      }
      const ctx = el.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const { width: w, height: h } = rect

      ctx.fillStyle = '#0c0f14'
      ctx.fillRect(0, 0, w, h)

      // Perspective Grid Floor
      const cx = w / 2
      const cy = h / 2 + 50
      ctx.strokeStyle = '#18202c'
      ctx.lineWidth = 1
      for (let x = -250; x <= 250; x += 30) {
        ctx.beginPath()
        ctx.moveTo(cx + x * 0.4, cy - 90)
        ctx.lineTo(cx + x * 1.5, cy + 110)
        ctx.stroke()
      }
      for (let y = -90; y <= 110; y += 25) {
        const span = (y + 110) * 1.4 + 40
        ctx.beginPath()
        ctx.moveTo(cx - span, cy + y)
        ctx.lineTo(cx + span, cy + y)
        ctx.stroke()
      }

      // Coordinate axes
      ctx.lineWidth = 2
      // X axis (Red)
      ctx.strokeStyle = '#e5544b'
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 40, cy + 15); ctx.stroke()
      // Y axis (Green)
      ctx.strokeStyle = '#4fd6a0'
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 35, cy + 15); ctx.stroke()
      // Z axis (Blue)
      ctx.strokeStyle = '#5aa9ff'
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 45); ctx.stroke()

      wheelRot += speed * 0.15

      // ROVER CHASSIS BOX
      const bw = 140, bh = 44, bd = 80
      const boxY = cy - 25

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.beginPath()
      ctx.ellipse(cx, cy + 30, 100, 35, 0, 0, Math.PI * 2)
      ctx.fill()

      if (wireframe) {
        ctx.strokeStyle = '#4fd6a0'
        ctx.lineWidth = 1.5
        ctx.strokeRect(cx - bw / 2, boxY - bh / 2, bw, bh)
      } else {
        // Top Face
        ctx.fillStyle = '#202834'
        ctx.beginPath()
        ctx.moveTo(cx - bw / 2, boxY - bh / 2)
        ctx.lineTo(cx + bw / 2, boxY - bh / 2)
        ctx.lineTo(cx + bw / 2 + 20, boxY - bh / 2 - 25)
        ctx.lineTo(cx - bw / 2 + 20, boxY - bh / 2 - 25)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#323d4e'; ctx.stroke()

        // Front Face
        ctx.fillStyle = '#181e27'
        ctx.fillRect(cx - bw / 2, boxY - bh / 2, bw, bh)
        ctx.strokeStyle = '#2d3747'; ctx.strokeRect(cx - bw / 2, boxY - bh / 2, bw, bh)

        // Side Face
        ctx.fillStyle = '#131820'
        ctx.beginPath()
        ctx.moveTo(cx + bw / 2, boxY - bh / 2)
        ctx.lineTo(cx + bw / 2 + 20, boxY - bh / 2 - 25)
        ctx.lineTo(cx + bw / 2 + 20, boxY + bh / 2 - 25)
        ctx.lineTo(cx + bw / 2, boxY + bh / 2)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#283241'; ctx.stroke()
      }

      // 4 WHEELS (FL, FR, RL, RR)
      const wheels = [
        { x: cx - bw / 2 - 12, y: boxY + bh / 2 + 10, label: 'RL' },
        { x: cx - bw / 2 + 35, y: boxY + bh / 2 + 24, label: 'FL' },
        { x: cx + bw / 2 - 25, y: boxY + bh / 2 + 24, label: 'FR' },
        { x: cx + bw / 2 + 22, y: boxY + bh / 2 + 10, label: 'RR' },
      ]

      wheels.forEach((wObj, idx) => {
        ctx.fillStyle = '#0a0d12'
        ctx.strokeStyle = idx % 2 === 0 ? '#5aa9ff' : '#4fd6a0'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.ellipse(wObj.x, wObj.y, 16, 26, 0.1, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        // Tread line
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'
        ctx.lineWidth = 1
        const treadY = Math.sin(wheelRot + idx) * 10
        ctx.beginPath()
        ctx.moveTo(wObj.x - 8, wObj.y + treadY)
        ctx.lineTo(wObj.x + 8, wObj.y + treadY)
        ctx.stroke()
      })

      // SENSOR MAST & D435i CAMERA
      const mastX = cx + 18, mastY = boxY - bh / 2 - 20
      ctx.strokeStyle = '#7f8a9c'
      ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(mastX, boxY - bh / 2); ctx.lineTo(mastX, mastY - 35); ctx.stroke()

      // RealSense D435i Camera Head
      ctx.fillStyle = '#5aa9ff'
      ctx.fillRect(mastX - 12, mastY - 45, 28, 10)
      ctx.fillStyle = '#00ffff'
      ctx.beginPath(); ctx.arc(mastX - 5, mastY - 40, 2.5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(mastX + 7, mastY - 40, 2.5, 0, Math.PI * 2); ctx.fill()

      // 6-DOF ARM MANIPULATOR
      const armBaseX = cx - 35, armBaseY = boxY - bh / 2
      const j1 = arm?.position?.[0] ?? 0.2
      const j2 = arm?.position?.[1] ?? -0.45
      const j3 = arm?.position?.[2] ?? 0.88

      // Link 1 (Shoulder)
      const l1_x = armBaseX + Math.sin(j1) * 15
      const l1_y = armBaseY - 30
      ctx.strokeStyle = '#e8b84b'
      ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(armBaseX, armBaseY); ctx.lineTo(l1_x, l1_y); ctx.stroke()

      // Link 2 (Elbow)
      const l2_x = l1_x + Math.cos(j2) * 35
      const l2_y = l1_y + Math.sin(j2) * 35
      ctx.strokeStyle = '#e8b84b'
      ctx.lineWidth = 3.5
      ctx.beginPath(); ctx.moveTo(l1_x, l1_y); ctx.lineTo(l2_x, l2_y); ctx.stroke()

      // Link 3 (Wrist & Gripper)
      const l3_x = l2_x + Math.cos(j3) * 28
      const l3_y = l2_y + Math.sin(j3) * 28
      ctx.strokeStyle = '#4fd6a0'
      ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(l2_x, l2_y); ctx.lineTo(l3_x, l3_y); ctx.stroke()
      ctx.fillStyle = '#4fd6a0'
      ctx.beginPath(); ctx.arc(l3_x, l3_y, 4, 0, Math.PI * 2); ctx.fill()

      // Text Labels
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = '10px ui-monospace, monospace'
      ctx.fillText('base_link [32.5 kg]', cx - 45, boxY + bh / 2 + 42)
      ctx.fillText('d435i_camera_link', mastX + 20, mastY - 40)
      ctx.fillText('gripper_tool_frame', l3_x + 8, l3_y - 4)

      angle += 0.01
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [tab, wireframe, speed, arm])

  return (
    <div className="dedicated-section-container urdf-viewer-container">
      <div className="section-head-bar">
        <div className="section-title-wrap">
          <h2>URDF Kinematics & 3D Robot Description</h2>
          <span className="mono badge ok">trixanth_description (Jazzy)</span>
        </div>
        <div className="section-actions">
          <div className="chip-row">
            <Chip active={tab === '3d'} onClick={() => setTab('3d')}>
              3D Kinematics Model
            </Chip>
            <Chip active={tab === 'xml'} onClick={() => setTab('xml')}>
              URDF XML Inspector
            </Chip>
          </div>
          {onExpand && (
            <button
              type="button"
              className="ops-btn"
              onClick={onExpand}
              title="Expand back to full Operations deck"
            >
              Expand to Operations
            </button>
          )}
        </div>
      </div>

      {tab === '3d' && (
        <div className="urdf-3d-deck">
          <div className="urdf-canvas-wrap">
            <canvas ref={canvasRef} className="urdf-canvas" />
            <div className="urdf-canvas-overlay">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={wireframe}
                  onChange={(e) => setWireframe(e.target.checked)}
                />
                Wireframe Mesh
              </label>
              <span className="mono overlay-tag">
                Kinematics: 4 Wheels Continuous · 6-DOF Revolute Arm · Fixed D435i
              </span>
            </div>
          </div>

          <div className="urdf-stats-grid">
            <div className="tel-card">
              <div className="tel-card-head">
                <h3>Robot Links (14 Active Links)</h3>
                <span className="mono badge ok">TF TREE NOMINAL</span>
              </div>
              <div className="tel-metrics-list">
                <div className="metric-row"><span className="label">Chassis Base</span><span className="val mono ok">base_link (0.75×0.48×0.22m)</span></div>
                <div className="metric-row"><span className="label">Suspension</span><span className="val mono">rocker_bogie_left, rocker_bogie_right</span></div>
                <div className="metric-row"><span className="label">Wheels</span><span className="val mono ok">wheel_fl, wheel_fr, wheel_rl, wheel_rr</span></div>
                <div className="metric-row"><span className="label">Sensors</span><span className="val mono ok">camera_link (RealSense D435i), imu_link</span></div>
                <div className="metric-row"><span className="label">Manipulator</span><span className="val mono">arm_base, arm_link1..3, gripper_tool</span></div>
              </div>
            </div>

            <div className="tel-card">
              <div className="tel-card-head">
                <h3>Inertia & Physical Attributes</h3>
                <span className="mono badge ok">32.5 kg Mass</span>
              </div>
              <div className="tel-card-stats">
                <Readout label="Total Mass" value="32.5" unit="kg" />
                <Readout label="Wheel Base" value="0.56" unit="m" />
                <Readout label="Track Width" value="0.65" unit="m" />
                <Readout label="Ground Clear" value="0.18" unit="m" tone="ok" />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'xml' && (
        <div className="urdf-xml-deck">
          <div className="urdf-xml-toolbar">
            <span className="urdf-file-path mono">
              src/trixanth_description/urdf/trixanth.urdf.xacro
            </span>
            <div className="xml-tools-right">
              {copied && <span className="calib-feedback mono">Copied XML to Clipboard!</span>}
              <button type="button" className="ops-btn" onClick={copyUrdf}>
                Copy URDF XML
              </button>
            </div>
          </div>
          <pre className="urdf-xml-content mono">
            <code>{SAMPLE_URDF_XML}</code>
          </pre>
        </div>
      )}
    </div>
  )
}
