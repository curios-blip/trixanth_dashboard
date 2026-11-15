import { useState, useRef, useEffect } from 'react'
import CameraView from '../panels/CameraView'
import { IconSwap, IconClose, IconMaximize, IconMinimize, IconCamera } from './Icons'

const CAMERA_FEEDS = [
  { topic: '/camera/color/image_raw', label: 'Front RealSense D435i (Color)', short: 'Front RGB' },
  { topic: '/camera/depth/image_rect_raw', label: 'Front RealSense D435i (Depth)', short: 'Front Depth' },
  { topic: '/camera/infra1/image_rect_raw', label: 'Front RealSense D435i (Infrared)', short: 'Front IR' },
  { topic: '/camera_rear/image_raw', label: 'Rear Back Webcam', short: 'Rear' },
  { topic: '/camera_arm/image_raw', label: 'Manipulator Arm Webcam', short: 'Arm' },
  { topic: '/camera_left/image_raw', label: 'Rover Left Side Webcam', short: 'Left' },
  { topic: '/camera_right/image_raw', label: 'Rover Right Side Webcam', short: 'Right' },
]

export default function DraggableFloatingCam({
  id,
  initialTopic = '/camera_arm/image_raw',
  initialPos = { x: 120, y: 120 },
  initialWidth = 380,
  onClose,
  onFocus,
}) {
  const [topic, setTopic] = useState(initialTopic)
  const [pos, setPos] = useState(initialPos)
  const [width, setWidth] = useState(initialWidth)
  const [isMinimized, setIsMinimized] = useState(false)
  const [showBoxes, setShowBoxes] = useState(true)

  const isDragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const isResizing = useRef(false)
  const resizeStart = useRef({ x: 0, width: initialWidth })

  const height = Math.round(width * 0.62)

  // Drag handler for title bar
  const handlePointerDown = (e) => {
    if (e.target.closest('button') || e.target.closest('select')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    isDragging.current = true
    dragOffset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    }
  }

  const handlePointerMove = (e) => {
    if (isDragging.current) {
      const maxX = Math.max(10, window.innerWidth - (isMinimized ? 220 : width) - 10)
      const maxY = Math.max(10, window.innerHeight - (isMinimized ? 40 : height) - 20)
      const nextX = Math.min(Math.max(10, e.clientX - dragOffset.current.x), maxX)
      const nextY = Math.min(Math.max(10, e.clientY - dragOffset.current.y), maxY)
      setPos({ x: nextX, y: nextY })
    } else if (isResizing.current) {
      const deltaX = e.clientX - resizeStart.current.x
      const nextW = Math.min(Math.max(240, resizeStart.current.width + deltaX), 720)
      setWidth(nextW)
    }
  }

  const handlePointerUp = (e) => {
    if (isDragging.current) {
      isDragging.current = false
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
    }
    if (isResizing.current) {
      isResizing.current = false
    }
  }

  // Corner resize handler
  const handleResizePointerDown = (e) => {
    e.stopPropagation()
    e.preventDefault()
    isResizing.current = true
    resizeStart.current = {
      x: e.clientX,
      width,
    }
  }

  const currentFeed = CAMERA_FEEDS.find((f) => f.topic === topic) || { label: topic, short: 'CAM' }

  return (
    <div
      className={`draggable-floating-cam-window ${isMinimized ? 'is-minimized' : ''}`}
      style={{
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
        width: isMinimized ? 220 : width,
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* WINDOW TITLE / DRAG BAR */}
      <div
        className="floating-cam-header"
        onPointerDown={handlePointerDown}
        title="Click and drag to move camera window anywhere"
      >
        <div className="floating-cam-title">
          <IconCamera size={13} />
          <select
            className="floating-cam-select mono"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            title="Switch camera feed"
          >
            {CAMERA_FEEDS.map((f) => (
              <option key={f.topic} value={f.topic}>
                {f.short} · {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="floating-cam-actions">
          {onFocus && (
            <button
              type="button"
              className="win-tool-btn"
              onClick={(e) => {
                e.stopPropagation()
                onFocus(topic)
              }}
              title="Zoom into main panel"
            >
              <IconMaximize size={11} />
            </button>
          )}

          <button
            type="button"
            className="win-tool-btn"
            onClick={(e) => {
              e.stopPropagation()
              setIsMinimized((m) => !m)
            }}
            title={isMinimized ? 'Expand window' : 'Minimize window'}
          >
            <IconMinimize size={11} />
          </button>

          <button
            type="button"
            className="win-tool-btn close-btn"
            onClick={(e) => {
              e.stopPropagation()
              if (onClose) onClose(id)
            }}
            title="Close camera window"
          >
            <IconClose size={11} />
          </button>
        </div>
      </div>

      {/* WINDOW BODY */}
      {!isMinimized && (
        <div className="floating-cam-body" style={{ height }}>
          <CameraView
            topic={topic}
            quality={50}
            width={width}
            showBoxes={showBoxes}
            onFocus={() => onFocus && onFocus(topic)}
          />

          {/* RESIZE HANDLE */}
          <div
            className="floating-cam-resize-handle"
            onPointerDown={handleResizePointerDown}
            title="Drag to resize window"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" strokeWidth="1.5" />
              <line x1="9" y1="6" x2="6" y2="9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
        </div>
      )}
    </div>
  )
}
