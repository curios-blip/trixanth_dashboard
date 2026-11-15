import { useState } from 'react'
import CameraView from './CameraView'
import DraggableFloatingCam from '../components/DraggableFloatingCam'
import {
  IconCamera,
  IconSwap,
  IconMaximize,
  IconPiP,
  IconTelemetry,
} from '../components/Icons'

export const AVAILABLE_CAMERAS = [
  { topic: '/camera/color/image_raw', label: 'Front Intel RealSense D435i (RGB Color)', short: 'Front (D435i RGB)' },
  { topic: '/camera/depth/image_rect_raw', label: 'Front RealSense D435i (Depth Map)', short: 'Front (Depth Map)' },
  { topic: '/camera/infra1/image_rect_raw', label: 'Front RealSense D435i (Infrared IR)', short: 'Front (IR Mono)' },
  { topic: '/camera_rear/image_raw', label: 'Rear Back Nav Webcam (1080p)', short: 'Rear Webcam' },
  { topic: '/camera_arm/image_raw', label: 'Manipulator Arm Inspection Webcam', short: 'Arm Webcam' },
  { topic: '/camera_left/image_raw', label: 'Rover Left Side Blind-Spot Webcam', short: 'Left Side' },
  { topic: '/camera_right/image_raw', label: 'Rover Right Side Blind-Spot Webcam', short: 'Right Side' },
]

export default function CustomMultiCam({
  onFocusCamera = null,
  onOpenPiP = null,
}) {
  // Layout modes: 'dual' (2 side-by-side 1:1) | 'triple' (3 side-by-side) | 'quad' (2x2) | 'hero' (2:1) | 'matrix' (5 cams)
  const [layout, setLayout] = useState('dual')

  // Slot camera mappings
  const [slots, setSlots] = useState([
    '/camera/color/image_raw',
    '/camera_rear/image_raw',
    '/camera_arm/image_raw',
    '/camera_left/image_raw',
    '/camera_right/image_raw',
  ])

  // Drag and drop state for slot interchanging
  const [draggedSlotIdx, setDraggedSlotIdx] = useState(null)
  const [dropTargetSlotIdx, setDropTargetSlotIdx] = useState(null)

  // Global overlay options
  const [showBoxes, setShowBoxes] = useState(true)

  // Floating draggable windows
  const [floatingWindows, setFloatingWindows] = useState([])

  // Layout-specific slot count
  const getSlotCount = () => {
    switch (layout) {
      case 'dual':
        return 2
      case 'triple':
        return 3
      case 'quad':
        return 4
      case 'hero':
        return 3
      case 'matrix':
      default:
        return 5
    }
  }

  const activeSlotCount = getSlotCount()
  const visibleSlots = slots.slice(0, activeSlotCount)

  // Slot interchange via dropdown
  const handleSlotCameraChange = (slotIdx, newTopic) => {
    setSlots((prev) => {
      const next = [...prev]
      next[slotIdx] = newTopic
      return next
    })
  }

  // Swap two slots
  const handleSwapSlots = (fromIdx, toIdx) => {
    if (fromIdx === toIdx || fromIdx == null || toIdx == null) return
    setSlots((prev) => {
      const next = [...prev]
      const temp = next[fromIdx]
      next[fromIdx] = next[toIdx]
      next[toIdx] = temp
      return next
    })
  }

  // HTML5 Drag and drop handlers
  const handleDragStart = (e, slotIdx) => {
    e.dataTransfer.setData('text/plain', slotIdx.toString())
    e.dataTransfer.effectAllowed = 'move'
    setDraggedSlotIdx(slotIdx)
  }

  const handleDragOver = (e, slotIdx) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropTargetSlotIdx !== slotIdx) {
      setDropTargetSlotIdx(slotIdx)
    }
  }

  const handleDragLeave = () => {
    setDropTargetSlotIdx(null)
  }

  const handleDrop = (e, targetIdx) => {
    e.preventDefault()
    const sourceIdx = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (!isNaN(sourceIdx)) {
      handleSwapSlots(sourceIdx, targetIdx)
    }
    setDraggedSlotIdx(null)
    setDropTargetSlotIdx(null)
  }

  const handleDragEnd = () => {
    setDraggedSlotIdx(null)
    setDropTargetSlotIdx(null)
  }

  // Spawn draggable floating window
  const handleSpawnFloatingCam = (topic) => {
    const newId = Date.now() + Math.random()
    const offset = (floatingWindows.length % 5) * 35
    setFloatingWindows((prev) => [
      ...prev,
      {
        id: newId,
        topic: topic || '/camera/color/image_raw',
        pos: { x: Math.max(40, 160 + offset), y: Math.max(80, 120 + offset) },
        width: 380,
      },
    ])
  }

  const handleCloseFloatingCam = (id) => {
    setFloatingWindows((prev) => prev.filter((w) => w.id !== id))
  }

  // Quick preset layouts
  const applyPreset = (presetName) => {
    switch (presetName) {
      case 'drive':
        setLayout('dual')
        setSlots([
          '/camera/color/image_raw',
          '/camera_rear/image_raw',
          '/camera_arm/image_raw',
          '/camera_left/image_raw',
          '/camera_right/image_raw',
        ])
        break
      case 'arm':
        setLayout('dual')
        setSlots([
          '/camera_arm/image_raw',
          '/camera/color/image_raw',
          '/camera_rear/image_raw',
          '/camera_left/image_raw',
          '/camera_right/image_raw',
        ])
        break
      case 'depth':
        setLayout('dual')
        setSlots([
          '/camera/color/image_raw',
          '/camera/depth/image_rect_raw',
          '/camera_rear/image_raw',
          '/camera_arm/image_raw',
          '/camera_left/image_raw',
        ])
        break
      case 'perimeter':
        setLayout('quad')
        setSlots([
          '/camera/color/image_raw',
          '/camera_rear/image_raw',
          '/camera_left/image_raw',
          '/camera_right/image_raw',
          '/camera_arm/image_raw',
        ])
        break
      case 'all5':
        setLayout('matrix')
        break
      default:
        break
    }
  }

  return (
    <div className="custom-multicam-container">
      {/* MULTI-CAM CONTROLS & LAYOUT TOOLBAR */}
      <div className="custom-multicam-toolbar">
        {/* LAYOUT SELECTOR */}
        <div className="multicam-layout-picker">
          <span className="picker-lbl mono">LAYOUT:</span>
          <button
            type="button"
            className={`layout-btn ${layout === 'dual' ? 'active' : ''}`}
            onClick={() => setLayout('dual')}
            title="Side-by-Side Dual View (1:1 split, 2 cameras 50% width)"
          >
            <span className="layout-badge">2</span>
            <span>Dual Split (1:1)</span>
          </button>
          <button
            type="button"
            className={`layout-btn ${layout === 'triple' ? 'active' : ''}`}
            onClick={() => setLayout('triple')}
            title="Triple Column View (1:1:1 split, 3 cameras side-by-side)"
          >
            <span className="layout-badge">3</span>
            <span>Triple (1:1:1)</span>
          </button>
          <button
            type="button"
            className={`layout-btn ${layout === 'quad' ? 'active' : ''}`}
            onClick={() => setLayout('quad')}
            title="Quad Grid (2x2 grid, 4 cameras)"
          >
            <span className="layout-badge">4</span>
            <span>Quad (2×2)</span>
          </button>
          <button
            type="button"
            className={`layout-btn ${layout === 'hero' ? 'active' : ''}`}
            onClick={() => setLayout('hero')}
            title="Hero + Companion (2:1 split, 1 large + 2 stacked)"
          >
            <span className="layout-badge">2:1</span>
            <span>Hero Split</span>
          </button>
          <button
            type="button"
            className={`layout-btn ${layout === 'matrix' ? 'active' : ''}`}
            onClick={() => setLayout('matrix')}
            title="Full 5-Camera Matrix View"
          >
            <span className="layout-badge">5</span>
            <span>5-Cam Matrix</span>
          </button>
        </div>

        {/* QUICK PRESETS */}
        <div className="multicam-presets-row">
          <span className="picker-lbl mono">PRESETS:</span>
          <button
            type="button"
            className="preset-btn"
            onClick={() => applyPreset('drive')}
            title="Front RealSense + Rear Webcam side-by-side"
          >
            Drive (Front + Rear)
          </button>
          <button
            type="button"
            className="preset-btn"
            onClick={() => applyPreset('arm')}
            title="Manipulator Arm + Front RealSense side-by-side"
          >
            Arm Delivery
          </button>
          <button
            type="button"
            className="preset-btn"
            onClick={() => applyPreset('depth')}
            title="Front RGB + Front Depth Map side-by-side"
          >
            RGB + Depth Map
          </button>
          <button
            type="button"
            className="preset-btn"
            onClick={() => applyPreset('perimeter')}
            title="Front + Rear + Left + Right 4-Way Grid"
          >
            360° Perimeter
          </button>
        </div>

        {/* TOOLBAR ACTIONS */}
        <div className="multicam-tools-actions">
          <button
            type="button"
            className={`tool-action-btn ${showBoxes ? 'active' : ''}`}
            onClick={() => setShowBoxes((b) => !b)}
            title="Toggle YOLOv8 AI object bounding boxes on camera feeds"
          >
            <IconTelemetry size={13} />
            <span>AI Boxes: {showBoxes ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            className="tool-action-btn highlight"
            onClick={() => handleSpawnFloatingCam('/camera_arm/image_raw')}
            title="Spawn a new draggable floating camera window that can be moved anywhere"
          >
            <IconPiP size={13} />
            <span>+ Float Window</span>
          </button>
        </div>
      </div>

      {/* DRAG AND DROP SWAP HINT BAR */}
      <div className="multicam-drag-hint-bar mono">
        <span>TIP: Drag any camera slot header and drop onto another to swap positions instantly, or use slot dropdowns.</span>
        {floatingWindows.length > 0 && (
          <span className="active-floating-tag">({floatingWindows.length} Floating Windows Active)</span>
        )}
      </div>

      {/* INTERCHANGEABLE CAMERA SLOTS GRID */}
      <div className={`custom-multicam-deck layout-${layout}`}>
        {visibleSlots.map((topic, slotIdx) => {
          const isDraggingThis = draggedSlotIdx === slotIdx
          const isDropTargetThis = dropTargetSlotIdx === slotIdx
          const camMeta = AVAILABLE_CAMERAS.find((c) => c.topic === topic) || {
            short: `Cam ${slotIdx + 1}`,
            label: topic,
          }
          const isFront = topic.includes('color') || topic.includes('depth') || topic.includes('infra')

          return (
            <div
              key={slotIdx}
              className={`multicam-slot-card ${isDraggingThis ? 'is-dragging' : ''} ${
                isDropTargetThis ? 'is-drop-target' : ''
              } ${layout === 'hero' && slotIdx === 0 ? 'hero-slot' : ''}`}
              onDragOver={(e) => handleDragOver(e, slotIdx)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, slotIdx)}
            >
              {/* DRAGGABLE & INTERCHANGEABLE SLOT HEADER */}
              <div
                className="slot-header"
                draggable={true}
                onDragStart={(e) => handleDragStart(e, slotIdx)}
                onDragEnd={handleDragEnd}
                title="Drag this header and drop onto another slot to swap positions!"
              >
                <div className="slot-grip-tag">
                  <span className="drag-handle-dots">:::</span>
                  <span className="slot-idx-tag mono">SLOT {slotIdx + 1}</span>
                </div>

                {/* SLOT CAMERA SELECTOR DROPDOWN */}
                <div className="slot-camera-select-wrap">
                  <select
                    className="slot-camera-select mono"
                    value={topic}
                    onChange={(e) => handleSlotCameraChange(slotIdx, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    title="Change which camera is displayed in this slot"
                  >
                    {AVAILABLE_CAMERAS.map((cam) => (
                      <option key={cam.topic} value={cam.topic}>
                        {cam.short}
                      </option>
                    ))}
                  </select>
                </div>

                {/* SLOT ACTION BUTTONS */}
                <div className="slot-actions-group">
                  <button
                    type="button"
                    className="slot-action-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSpawnFloatingCam(topic)
                    }}
                    title="Pop this camera out into a movable draggable floating window"
                  >
                    <IconPiP size={12} />
                    <span className="btn-text">Float</span>
                  </button>

                  {onFocusCamera && (
                    <button
                      type="button"
                      className="slot-action-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onFocusCamera(topic)
                      }}
                      title="Focus this camera in full panel view"
                    >
                      <IconMaximize size={12} />
                      <span className="btn-text">Zoom</span>
                    </button>
                  )}

                  {/* Swap with next button */}
                  <button
                    type="button"
                    className="slot-action-btn swap-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      const nextIdx = (slotIdx + 1) % activeSlotCount
                      handleSwapSlots(slotIdx, nextIdx)
                    }}
                    title="Swap feed with next slot"
                  >
                    <IconSwap size={12} />
                  </button>
                </div>
              </div>

              {/* DROP TARGET OVERLAY */}
              {isDropTargetThis && !isDraggingThis && (
                <div className="drop-target-indicator mono">
                  DROP TO SWAP WITH SLOT {draggedSlotIdx + 1}
                </div>
              )}

              {/* SLOT CAMERA FEED BODY */}
              <div className="slot-camera-body">
                <CameraView
                  topic={topic}
                  quality={layout === 'dual' ? 65 : 50}
                  width={layout === 'dual' ? 720 : 540}
                  showBoxes={showBoxes}
                  showHud={false}
                  onFocus={onFocusCamera}
                />
              </div>

              {/* SPECIAL FRONT REALSENSE CONTROLS IF DISPLAYED IN THIS SLOT */}
              {isFront && (
                <div className="slot-front-modes-bar">
                  <span className="bar-label mono">D435i MODE:</span>
                  <button
                    type="button"
                    className={`mode-mini-chip ${topic.includes('color') ? 'active' : ''}`}
                    onClick={() => handleSlotCameraChange(slotIdx, '/camera/color/image_raw')}
                  >
                    RGB Color
                  </button>
                  <button
                    type="button"
                    className={`mode-mini-chip ${topic.includes('depth') ? 'active' : ''}`}
                    onClick={() => handleSlotCameraChange(slotIdx, '/camera/depth/image_rect_raw')}
                  >
                    Depth Map
                  </button>
                  <button
                    type="button"
                    className={`mode-mini-chip ${topic.includes('infra') ? 'active' : ''}`}
                    onClick={() => handleSlotCameraChange(slotIdx, '/camera/infra1/image_rect_raw')}
                  >
                    Infrared IR
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* DRAGGABLE FLOATING CAMERA WINDOWS (POPPED OUT) */}
      {floatingWindows.map((win) => (
        <DraggableFloatingCam
          key={win.id}
          id={win.id}
          initialTopic={win.topic}
          initialPos={win.pos}
          initialWidth={win.width}
          onClose={handleCloseFloatingCam}
          onFocus={onFocusCamera}
        />
      ))}
    </div>
  )
}
