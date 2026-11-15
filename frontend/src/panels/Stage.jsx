import { useEffect, useState } from 'react'
import { config } from '../config'
import { listTopics, useTopic } from '../ros'
import { Chip, Panel, fmt } from '../components/ui'
import CameraView from './CameraView'
import SubsystemOps from './SubsystemOps'
import UrdfViewer from './UrdfViewer'
import CustomMultiCam from './CustomMultiCam'
import DraggablePiP from '../components/DraggablePiP'
import {
  IconMinimize,
  IconMaximize,
  IconRestore,
  IconClose,
  IconPiP,
  IconRover,
  IconCamera,
} from '../components/Icons'

const IMAGE_TYPES = ['sensor_msgs/msg/Image', 'sensor_msgs/Image']

export default function Stage({
  activeSubsystem = 'locomotion',
  onSelectSubsystem = null,
  currentView = 'operations',
  onViewChange = null,
  isMaximized = false,
  onToggleMaximize = null,
  hideInlineLogs = false,
}) {
  const [feeds, setFeeds] = useState([
    '/camera/color/image_raw',
    '/camera_rear/image_raw',
    '/camera_arm/image_raw',
    '/camera_left/image_raw',
    '/camera_right/image_raw',
  ])

  // Views: 'operations' | 'multicam' | 'front' | 'rear' | 'urdf'
  const [source, setSource] = useState(currentView || 'operations')
  const [pipTopic, setPipTopic] = useState('/camera_arm/image_raw')
  const [pipOpen, setPipOpen] = useState(false)

  // Module in PiP minimization state:
  // When user clicks minimize button on title bar, the active module enters PiP
  const [isModuleInPip, setIsModuleInPip] = useState(false)

  // Local maximize state fallback if not controlled from parent
  const [localMaximized, setLocalMaximized] = useState(false)
  const effectiveMaximized = onToggleMaximize ? isMaximized : localMaximized

  const [quality, setQuality] = useState(60)
  const [width, setWidth] = useState(640)
  const [showBoxes, setShowBoxes] = useState(true)
  const [note, setNote] = useState(null)

  // Live telemetry for the quick HUD bar
  const odom = useTopic(config.topics.odom, { throttle: 250 })
  const battery = useTopic(config.topics.battery, { throttle: 1000 })
  const gps = useTopic(config.topics.gps, { throttle: 1000 })

  const tw = odom?.twist?.twist
  const speed = tw ? Math.hypot(tw.linear.x, tw.linear.y) : 0
  const volts = battery?.voltage ?? 24.4
  const vTone = volts < config.battery.critical ? 'fault' : volts < config.battery.warn ? 'warn' : 'ok'
  const chargePct = battery?.percentage != null ? Math.round(battery.percentage * 100) : 92

  // Sync external view changes
  useEffect(() => {
    if (currentView && currentView !== source) {
      setSource(currentView)
    }
  }, [currentView])

  const setView = (v) => {
    setSource(v)
    setIsModuleInPip(false)
    if (onViewChange) onViewChange(v)
  }

  // Handle escape key to exit maximize
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && effectiveMaximized) {
        if (onToggleMaximize) onToggleMaximize(false)
        else setLocalMaximized(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [effectiveMaximized, onToggleMaximize])

  useEffect(() => {
    let alive = true
    const discover = async () => {
      try {
        const topics = await listTopics()
        const images = topics
          .filter((t) => IMAGE_TYPES.includes(t.type) && !t.name.endsWith('compressed'))
          .map((t) => t.name)
        if (!alive) return
        if (images.length) setFeeds(images)
      } catch {
        if (alive) setNote('rosapi did not answer — simulated camera available')
      }
    }
    discover()
    const id = setInterval(discover, 10000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const isCam = source === 'front' || source === 'rear' || source.startsWith('/camera')
  const isMultiCam = source === 'multicam'
  const isOperations = source === 'operations'
  const isUrdfDirect = source === 'urdf'

  // Map topic to front RealSense D435i if requested
  const getCameraTopic = (key) => {
    if (key === 'front' || key.includes('color') || key.includes('front')) {
      return feeds.find((f) => f.includes('color')) || '/camera/color/image_raw'
    }
    return feeds.find((f) => f.includes(key)) || key
  }

  const activeCamTopic = isCam ? getCameraTopic(source) : pipTopic

  // When focusing from PiP or multi-cam
  const handleFocusCamera = (topic) => {
    setView(topic)
    setPipTopic(topic)
  }

  // Window Controls Handlers:
  // 1. MINIMISE: Leads to PiP version of currently viewing module
  const handleMinimizeToPiP = () => {
    // If in operations, float the active subsystem camera in PiP
    if (isOperations) {
      const defaultCam = activeSubsystem === 'arm' ? '/camera_arm/image_raw' : '/camera/color/image_raw'
      setPipTopic(defaultCam)
    } else if (isCam) {
      setPipTopic(activeCamTopic)
    }
    setPipOpen(true)
    setIsModuleInPip(true)
  }

  // 2. MAXIMISE: Leads to panel view taking up the entire screen
  const handleToggleMaximize = () => {
    const next = !effectiveMaximized
    if (onToggleMaximize) onToggleMaximize(next)
    else setLocalMaximized(next)
  }

  // 3. CLOSE: Leads to the kinematic model of the rover and the urdf file
  const handleCloseToUrdf = () => {
    setView('urdf')
  }

  // Restore module from PiP back to full view
  const handleRestoreFromPiP = () => {
    setIsModuleInPip(false)
  }

  // PiP is available in ALL views, including single camera view!
  const showFloatingPiP = pipOpen

  // Choose appropriate title
  const panelTitle = isUrdfDirect
    ? 'URDF Kinematics & 3D Model'
    : isCam
    ? `Single Camera Focus · ${activeCamTopic.replace(/^\/camera_?/, '').replace(/\/image_raw$/, '').toUpperCase()}`
    : isMultiCam
    ? 'Multi-Cam Quad Feed'
    : isModuleInPip
    ? 'Operations Standby (Active Module Minimized in PiP)'
    : `Operations Deck · ${activeSubsystem.toUpperCase()}`

  return (
    <Panel
      className={`stage-panel ${effectiveMaximized ? 'panel-view-maximized' : ''}`}
      flush
      title={
        <div className="stage-panel-title-wrap">
          <span className="panel-title-text mono">{panelTitle}</span>
          {effectiveMaximized && (
            <span className="badge ok mono fullscreen-tag">FULLSCREEN ACTIVE (ESC TO EXIT)</span>
          )}
        </div>
      }
      actions={
        <div className="panel-header-controls-row">
          {/* VIEW SWITCHER TABS */}
          <div className="source-picker">
            <Chip
              active={isOperations && !isModuleInPip && !isUrdfDirect}
              onClick={() => setView('operations')}
              title="Unified Operations Deck (Subsystems, Live Cameras & Telemetry)"
            >
              Operations
            </Chip>
            <Chip
              active={isMultiCam && !isModuleInPip && !isUrdfDirect}
              onClick={() => setView('multicam')}
              title="Multi-screen 4-camera grid"
            >
              Multi-Cam
            </Chip>
            <Chip
              active={(source === 'front' || source.includes('color')) && !isModuleInPip && !isUrdfDirect}
              onClick={() => handleFocusCamera('/camera/color/image_raw')}
              title="Intel RealSense D435i Front Camera (RGB / Depth / IR)"
            >
              Front (D435i)
            </Chip>
            <Chip
              active={source.includes('rear') && !isModuleInPip && !isUrdfDirect}
              onClick={() => handleFocusCamera('/camera_rear/image_raw')}
              title="Rear Camera"
            >
              Rear
            </Chip>
            <Chip
              active={isUrdfDirect}
              onClick={() => setView('urdf')}
              title="3D URDF Robot Model & Kinematics Description"
            >
              URDF Model
            </Chip>
          </div>

          {/* PiP QUICK TOGGLE BUTTON (Available even while viewing single camera view!) */}
          <button
            type="button"
            className={`pip-header-toggle-btn ${pipOpen ? 'on' : ''}`}
            onClick={() => {
              if (!pipOpen && isCam) {
                // If viewing front, default PiP to rear or arm
                const altCam = activeCamTopic.includes('color') ? '/camera_rear/image_raw' : '/camera/color/image_raw'
                setPipTopic(altCam)
              }
              setPipOpen((o) => !o)
            }}
            title={pipOpen ? 'Hide floating picture-in-picture camera' : 'Open floating picture-in-picture camera'}
          >
            <IconPiP size={14} />
            <span>{pipOpen ? 'PiP Active' : 'Picture-in-Picture'}</span>
          </button>

          {/* WINDOW CONTROL BUTTONS: Minimize -> PiP, Maximize -> Fullscreen, Close -> URDF */}
          <div className="panel-window-controls" title="Panel Window Controls">
            {/* 1. Minimize: Leads to PiP version of currently viewing module */}
            <button
              type="button"
              className="panel-win-btn btn-min"
              onClick={handleMinimizeToPiP}
              title="Minimize current module into Picture-in-Picture miniplayer"
            >
              <IconMinimize size={13} />
            </button>

            {/* 2. Maximize: Leads to panel view taking up the entire screen */}
            <button
              type="button"
              className={`panel-win-btn btn-max ${effectiveMaximized ? 'active' : ''}`}
              onClick={handleToggleMaximize}
              title={effectiveMaximized ? 'Restore standard panel view (or press Esc)' : 'Maximize panel view to take up entire screen'}
            >
              {effectiveMaximized ? <IconRestore size={13} /> : <IconMaximize size={13} />}
            </button>

            {/* 3. Close: Leads to kinematic model of rover and urdf file */}
            <button
              type="button"
              className="panel-win-btn btn-close"
              onClick={handleCloseToUrdf}
              title="Close to 3D Kinematic Model of Rover & URDF File"
            >
              <IconClose size={13} />
            </button>
          </div>
        </div>
      }
    >
      {/* High-Visibility Priority Telemetry HUD Bar */}
      <div className="stage-telemetry-hud">
        <div className="hud-stat-pill" onClick={() => setView('operations')} title="Click to open Operations">
          <span className="hud-stat-label">SPEED</span>
          <span className="hud-stat-value mono">{fmt(speed, 2)} m/s</span>
        </div>
        <div className="hud-stat-pill" onClick={() => setView('operations')} title="Click to open Operations">
          <span className="hud-stat-label">BATTERY</span>
          <span className={`hud-stat-value mono ${vTone}`}>
            {volts.toFixed(1)}V · {chargePct}%
          </span>
        </div>
        <div className="hud-stat-pill" onClick={() => setView('operations')} title="GNSS Status">
          <span className="hud-stat-label">GNSS</span>
          <span className="hud-stat-value mono ok">
            {gps ? (gps.status?.status === 2 ? 'RTK FIXED' : '3D FIX') : 'RTK FIXED'}
          </span>
        </div>
        <div className="hud-stat-pill" onClick={() => handleFocusCamera('/camera/color/image_raw')} title="Intel RealSense D435i Status">
          <span className="hud-stat-label">CAMERA</span>
          <span className="hud-stat-value mono ok">D435i 1080p60</span>
        </div>

        <div className="hud-stat-status">
          <span className="cam-stream-status-tag mono">
            {isUrdfDirect
              ? 'URDF 3D KINEMATICS ACTIVE'
              : isCam
              ? 'SINGLE CAMERA FIXED FOCUS'
              : showFloatingPiP
              ? 'STREAMING WITH PIP ACTIVE'
              : 'OPERATIONS STREAM ACTIVE'}
          </span>
        </div>
      </div>

      {note && <p className="notice inline">{note}</p>}

      <div className="stage">
        {/* =========================================================================
            STATE A: MODULE IN PIP STANDBY (Triggered by Minimize Button)
            ========================================================================= */}
        {isModuleInPip ? (
          <div className="module-pip-standby-screen">
            <div className="pip-standby-card">
              <IconCamera size={36} className="standby-icon" />
              <h2>{activeSubsystem.toUpperCase()} Module Active in Picture-in-Picture</h2>
              <p className="muted">
                The operations module has been minimized to a floating PiP window. You can freely drag and resize the miniplayer anywhere on screen.
              </p>
              <div className="standby-actions-row">
                <button
                  type="button"
                  className="primary-action-btn"
                  onClick={handleRestoreFromPiP}
                  title="Restore module back to full panel view"
                >
                  <IconRestore size={14} /> Restore to Full Panel
                </button>
                <button
                  type="button"
                  className="secondary-action-btn"
                  onClick={() => setView('urdf')}
                  title="Switch stage to URDF Kinematic Model"
                >
                  <IconRover size={14} /> View URDF Model
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* VIEW 1: OPERATIONS (Minimal Subsystem Ops Deck) */}
            {isOperations && (
              <SubsystemOps
                activeSubsystem={activeSubsystem}
                onSelectSubsystem={onSelectSubsystem}
                onFocusCamera={handleFocusCamera}
                onOpenPiP={(topic) => {
                  setPipTopic(topic)
                  setPipOpen(true)
                }}
                hideInlineLogs={hideInlineLogs}
              />
            )}

            {/* VIEW 2: URDF KINEMATIC MODEL VIEW (Triggered directly or by Close button) */}
            {isUrdfDirect && <UrdfViewer onExpand={() => setView('operations')} />}

            {/* VIEW 3: MULTI-SCREEN CAMERA WINDOWS (CUSTOMIZABLE SIDE-BY-SIDE & DRAGGABLE DECK) */}
            {isMultiCam && (
              <CustomMultiCam
                onFocusCamera={handleFocusCamera}
                onOpenPiP={(topic) => {
                  setPipTopic(topic)
                  setPipOpen(true)
                }}
              />
            )}

            {/* VIEW 4: SINGLE CAMERA IN FIXED SPOT (Front D435i or Rear or Arm) */}
            {isCam && (
              <div className="single-camera-stage-container">
                <CameraView
                  topic={activeCamTopic}
                  quality={quality}
                  width={width}
                  showBoxes={showBoxes}
                  showHud={true}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* DRAGGABLE PICTURE-IN-PICTURE MINIPLAYER */}
      {/* Available across ALL views including single camera view! */}
      {showFloatingPiP && (
        <DraggablePiP
          activeTopic={pipTopic}
          onSelectTopic={(t) => setPipTopic(t)}
          onFocusToStage={(t) => {
            setView(t)
            setPipTopic(t)
            setIsModuleInPip(false)
          }}
          onClose={() => {
            setPipOpen(false)
            setIsModuleInPip(false)
          }}
          showBoxes={showBoxes}
        />
      )}

      {/* STREAM CONTROLS (available when single camera is focused or in multi-cam) */}
      {(isCam || isMultiCam) && !isUrdfDirect && !isModuleInPip && (
        <div className="stream-controls">
          <label>
            Width
            <input
              type="range"
              min="320"
              max="1280"
              step="160"
              value={width}
              onChange={(e) => setWidth(+e.target.value)}
            />
            <span className="mono">{width}px</span>
          </label>
          <label>
            Quality
            <input
              type="range"
              min="15"
              max="90"
              step="5"
              value={quality}
              onChange={(e) => setQuality(+e.target.value)}
            />
            <span className="mono">{quality}</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showBoxes}
              onChange={(e) => setShowBoxes(e.target.checked)}
            />
            Detection boxes
          </label>

          {isCam && (
            <button
              type="button"
              className="float-pip-btn"
              onClick={() => {
                const alt = activeCamTopic.includes('color') ? '/camera_rear/image_raw' : '/camera/color/image_raw'
                setPipTopic(alt)
                setPipOpen(true)
              }}
              title="Open secondary camera in Picture-in-Picture window over this single camera"
            >
              <IconPiP size={13} /> Open Secondary PiP Over Cam
            </button>
          )}
        </div>
      )}
    </Panel>
  )
}
