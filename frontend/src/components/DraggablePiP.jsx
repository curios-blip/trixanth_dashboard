import { useState, useRef, useEffect } from 'react'
import CameraView from '../panels/CameraView'
import { IconSwap, IconMaximize, IconClose, IconRestore } from './Icons'

const MIN_WIDTH = 200
const MAX_WIDTH = 520
const DEFAULT_WIDTH = 360

const PIP_CAMERAS = [
  { topic: '/camera/color/image_raw', label: 'Front RealSense D435i', short: 'Front' },
  { topic: '/camera_rear/image_raw', label: 'Rear Back Webcam', short: 'Rear' },
  { topic: '/camera_arm/image_raw', label: 'Manipulator Arm Webcam', short: 'Arm' },
  { topic: '/camera_left/image_raw', label: 'Rover Left Side Webcam', short: 'Left' },
  { topic: '/camera_right/image_raw', label: 'Rover Right Side Webcam', short: 'Right' },
]

export default function DraggablePiP({
  activeTopic = '/camera/color/image_raw',
  onSelectTopic,
  onFocusToStage,
  onClose,
  showBoxes = true,
}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isDockedMin, setIsDockedMin] = useState(false)

  const height = Math.round(width * 0.6)

  const [pos, setPos] = useState(() => ({
    x: Math.max(20, window.innerWidth - 390),
    y: Math.max(60, window.innerHeight - 290),
  }))

  const isDragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const pipRef = useRef(null)

  useEffect(() => {
    const handleResize = () => {
      setPos((p) => {
        const maxX = Math.max(10, window.innerWidth - (isDockedMin ? 240 : width) - 15)
        const maxY = Math.max(10, window.innerHeight - (isDockedMin ? 44 : height) - 50)
        return {
          x: Math.min(Math.max(10, p.x), maxX),
          y: Math.min(Math.max(10, p.y), maxY),
        }
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [width, height, isDockedMin])

  const handlePointerDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    isDragging.current = true
    dragOffset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    }
  }

  const handlePointerMove = (e) => {
    if (!isDragging.current) return
    const currentW = isDockedMin ? 240 : width
    const currentH = isDockedMin ? 44 : height
    const maxX = Math.max(10, window.innerWidth - currentW - 15)
    const maxY = Math.max(10, window.innerHeight - currentH - 50)
    const newX = Math.min(Math.max(10, e.clientX - dragOffset.current.x), maxX)
    const newY = Math.min(Math.max(10, e.clientY - dragOffset.current.y), maxY)
    setPos({ x: newX, y: newY })
  }

  const handlePointerUp = (e) => {
    if (isDragging.current) {
      isDragging.current = false
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
    }
  }

  // Expansion logic: If expanded too much (> MAX_WIDTH), opens in its own panel!
  const expandSize = (e) => {
    e.stopPropagation()
    if (isDockedMin) {
      setIsDockedMin(false)
      setWidth(DEFAULT_WIDTH)
      return
    }
    const nextW = width + 80
    if (nextW > MAX_WIDTH) {
      // Expanded too much -> opens it up in its own panel!
      if (onFocusToStage) onFocusToStage(activeTopic)
    } else {
      setWidth(nextW)
    }
  }

  // Minimization logic: If minimized too little (< MIN_WIDTH), minimizes into dock pill!
  const minimizeSize = (e) => {
    e.stopPropagation()
    const nextW = width - 80
    if (nextW < MIN_WIDTH) {
      // Minimized too little -> minimizes into minimal floating dock pill
      setIsDockedMin(true)
    } else {
      setWidth(nextW)
    }
  }

  const currentCamIdx = PIP_CAMERAS.findIndex(
    (c) => c.topic === activeTopic || activeTopic.includes(c.short.toLowerCase())
  )
  const safeIdx = currentCamIdx >= 0 ? currentCamIdx : 0
  const currentCam = PIP_CAMERAS[safeIdx]
  const nextCam = PIP_CAMERAS[(safeIdx + 1) % PIP_CAMERAS.length]

  const cycleCamera = (e) => {
    e.stopPropagation()
    if (onSelectTopic) onSelectTopic(nextCam.topic)
  }

  const camName = currentCam.label.toUpperCase()

  // If minimized into compact dock pill
  if (isDockedMin) {
    return (
      <div
        ref={pipRef}
        className="draggable-pip docked-pill"
        style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="pip-grip">:::</div>
        <span className="pip-live-dot" />
        <span className="pill-label mono">{currentCam.short.toUpperCase()} STREAM</span>
        <button
          type="button"
          className="pill-restore-btn"
          onClick={() => {
            setIsDockedMin(false)
            setWidth(DEFAULT_WIDTH)
          }}
          title="Restore camera window"
        >
          <IconRestore size={12} /> Restore
        </button>
        <button
          type="button"
          className="pill-close-btn"
          onClick={onClose}
          title="Close floating camera"
        >
          <IconClose size={12} />
        </button>
      </div>
    )
  }

  return (
    <div
      ref={pipRef}
      className="draggable-pip"
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: `${width}px`,
      }}
    >
      <div
        className="pip-header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="pip-title">
          <span className="pip-grip" title="Drag to move">:::</span>
          <span className="pip-live-dot" />
          <span className="pip-cam-label mono">{currentCam.short.toUpperCase()}</span>
        </div>

        <div className="pip-actions">
          {/* Cycle through all cameras: Front -> Rear -> Arm -> Science -> Front */}
          <button
            type="button"
            className="pip-btn"
            onClick={cycleCamera}
            title={`Switch to ${nextCam.label} (${nextCam.topic})`}
          >
            <IconSwap size={12} /> {nextCam.short}
          </button>

          {/* Minimization button */}
          <button
            type="button"
            className="pip-btn"
            onClick={minimizeSize}
            title={width <= MIN_WIDTH ? 'Dock into minimal icon (cannot minimize further)' : 'Reduce size'}
          >
            -
          </button>

          {/* Expansion button */}
          <button
            type="button"
            className="pip-btn"
            onClick={expandSize}
            title={width >= MAX_WIDTH - 40 ? 'Expand into its own full panel' : 'Increase size'}
          >
            +
          </button>

          <button
            type="button"
            className="pip-btn pip-focus-btn"
            onClick={(e) => {
              e.stopPropagation()
              if (onFocusToStage) onFocusToStage(activeTopic)
            }}
            title="Open up in its own panel"
          >
            <IconMaximize size={12} /> Open Panel
          </button>

          <button
            type="button"
            className="pip-btn pip-close-btn"
            onClick={(e) => {
              e.stopPropagation()
              if (onClose) onClose()
            }}
            title="Close PiP"
          >
            <IconClose size={12} />
          </button>
        </div>
      </div>

      <div className="pip-body" style={{ height: `${height}px` }}>
        <CameraView
          topic={activeTopic}
          quality={50}
          width={width}
          showBoxes={showBoxes}
          showHud={false}
        />
        <div className="pip-overlay-info mono">
          <span>● {width}px</span>
          <span className="pip-hint-text">
            {width >= MAX_WIDTH - 40 ? 'Click + to open in own panel' : width <= MIN_WIDTH ? 'Click − to dock' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
