import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { callService, makePublisher, useTopic, useTopicCallback, yawFrom, quatFromYaw } from '../ros'
import { Chip } from '../components/ui'

// 2D map view. Draws the occupancy grid once into an offscreen canvas and
// blits it each frame, so pan/zoom stays smooth even on a 260x260 grid.

export default function MapView() {
  const canvasRef = useRef(null)
  const gridRef = useRef(null) // offscreen canvas holding the rendered grid
  const infoRef = useRef(null) // grid metadata (resolution, origin, size)
  const poseRef = useRef(null)
  const planRef = useRef([])
  const viewRef = useRef({ scale: 14, cx: 0, cy: 0 }) // px per metre, centre in world m
  const dragRef = useRef(null)

  const [follow, setFollow] = useState(true)
  const [showPlan, setShowPlan] = useState(true)
  const [goal, setGoal] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [hasMap, setHasMap] = useState(false)

  const legsMsg = useTopic(config.topics.legs, { throttle: 1000 })
  const legs = parseLegs(legsMsg)
  const goalPub = useRef(null)
  if (!goalPub.current) goalPub.current = makePublisher(config.topics.goalPose)

  // --- incoming data ------------------------------------------------------

  useTopicCallback(config.topics.map, (msg) => {
    if (!msg?.info) return
    const { width, height, resolution, origin } = msg.info
    const off = document.createElement('canvas')
    off.width = width
    off.height = height
    const ctx = off.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(width, height)
    const data = msg.data
    for (let i = 0; i < width * height; i++) {
      const v = data[i]
      // Flip vertically: grid row 0 is the bottom in map frame, top in canvas.
      const row = height - 1 - Math.floor(i / width)
      const o = (row * width + (i % width)) * 4
      let r, g, b
      if (v < 0) { r = 26; g = 30; b = 38 }            // unknown
      else if (v > 65) { r = 198; g = 204; b = 216 }    // occupied
      else { r = 46; g = 53; b = 65 }                   // free
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    gridRef.current = off
    infoRef.current = { width, height, resolution, origin: origin.position }
    setHasMap(true)
  }, { throttle: 5000 })

  useTopicCallback(config.topics.odom, (msg) => {
    const p = msg?.pose?.pose
    if (p) poseRef.current = { x: p.position.x, y: p.position.y, yaw: yawFrom(p.orientation) }
  }, { throttle: 100 })

  useTopicCallback(config.topics.globalPlan, (msg) => {
    planRef.current = (msg?.poses ?? []).map((p) => p.pose.position)
  }, { throttle: 500 })

  // --- view transform -----------------------------------------------------

  const toScreen = useCallback((wx, wy, rect) => {
    const v = viewRef.current
    return [rect.width / 2 + (wx - v.cx) * v.scale, rect.height / 2 - (wy - v.cy) * v.scale]
  }, [])

  const toWorld = useCallback((sx, sy, rect) => {
    const v = viewRef.current
    return [v.cx + (sx - rect.width / 2) / v.scale, v.cy - (sy - rect.height / 2) / v.scale]
  }, [])

  // --- render loop --------------------------------------------------------

  useEffect(() => {
    let raf
    const draw = () => {
      const cv = canvasRef.current
      if (cv) {
        const rect = cv.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        if (cv.width !== rect.width * dpr || cv.height !== rect.height * dpr) {
          cv.width = rect.width * dpr
          cv.height = rect.height * dpr
        }
        const ctx = cv.getContext('2d')
        if (!ctx) return
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, rect.width, rect.height)

        const pose = poseRef.current
        if (follow && pose) {
          viewRef.current.cx += (pose.x - viewRef.current.cx) * 0.12
          viewRef.current.cy += (pose.y - viewRef.current.cy) * 0.12
        }
        const v = viewRef.current

        // grid
        const info = infoRef.current
        if (gridRef.current && info) {
          const w = info.width * info.resolution * v.scale
          const h = info.height * info.resolution * v.scale
          const [ox, oy] = toScreen(info.origin.x, info.origin.y + info.height * info.resolution, rect)
          ctx.imageSmoothingEnabled = v.scale < 8
          ctx.drawImage(gridRef.current, ox, oy, w, h)
        }

        drawGraticule(ctx, rect, v, toScreen)

        // plan
        if (showPlan && planRef.current.length > 1) {
          ctx.beginPath()
          planRef.current.forEach((p, i) => {
            const [x, y] = toScreen(p.x, p.y, rect)
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
          })
          ctx.strokeStyle = '#5aa9ff'
          ctx.lineWidth = 2
          ctx.setLineDash([6, 4])
          ctx.stroke()
          ctx.setLineDash([])
        }

        // waypoint legs
        legs.forEach((leg, i) => {
          const [x, y] = toScreen(leg.x, leg.y, rect)
          const done = i < (legs.activeIndex ?? 0)
          const active = i === (legs.activeIndex ?? 0)
          ctx.beginPath()
          ctx.arc(x, y, 7, 0, Math.PI * 2)
          ctx.fillStyle = done ? '#3d4a5c' : active ? '#4fd6a0' : '#1f2630'
          ctx.fill()
          ctx.strokeStyle = active ? '#4fd6a0' : '#5a6678'
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.fillStyle = done || active ? '#0e1116' : '#8a94a6'
          ctx.font = '600 10px ui-monospace, monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(leg.id ?? i + 1), x, y + 0.5)
        })

        // manual goal
        if (goal) {
          const [x, y] = toScreen(goal.x, goal.y, rect)
          ctx.strokeStyle = '#e8b84b'
          ctx.lineWidth = 2
          ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7)
          ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); ctx.stroke()
        }

        // robot
        if (pose) {
          const [x, y] = toScreen(pose.x, pose.y, rect)
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(-pose.yaw)
          ctx.beginPath()
          ctx.moveTo(13, 0); ctx.lineTo(-8, 8); ctx.lineTo(-4, 0); ctx.lineTo(-8, -8)
          ctx.closePath()
          ctx.fillStyle = '#4fd6a0'
          ctx.fill()
          ctx.restore()
        } else {
          ctx.fillStyle = '#8a94a6'
          ctx.font = '12px system-ui'
          ctx.textAlign = 'center'
          ctx.fillText('Waiting for odometry', rect.width / 2, rect.height / 2)
        }

        drawScaleBar(ctx, rect, v.scale)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [follow, showPlan, goal, legs, toScreen])

  // --- interaction --------------------------------------------------------

  const onWheel = (e) => {
    const v = viewRef.current
    v.scale = Math.max(2, Math.min(90, v.scale * (e.deltaY < 0 ? 1.12 : 0.89)))
  }

  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, moved: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const [wx, wy] = toWorld(e.clientX - rect.left, e.clientY - rect.top, rect)
    setCursor([wx, wy])
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    d.moved += Math.abs(dx) + Math.abs(dy)
    viewRef.current.cx -= dx / viewRef.current.scale
    viewRef.current.cy += dy / viewRef.current.scale
    d.x = e.clientX
    d.y = e.clientY
    if (d.moved > 6) setFollow(false)
  }

  const onPointerUp = (e) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d || d.moved > 6) return
    const rect = e.currentTarget.getBoundingClientRect()
    const [wx, wy] = toWorld(e.clientX - rect.left, e.clientY - rect.top, rect)
    sendGoal(wx, wy)
  }

  const sendGoal = (x, y) => {
    const heading = poseRef.current
      ? Math.atan2(y - poseRef.current.y, x - poseRef.current.x)
      : 0
    goalPub.current.publish({
      header: { frame_id: 'map', stamp: { sec: 0, nanosec: 0 } },
      pose: { position: { x, y, z: 0 }, orientation: quatFromYaw(heading) },
    })
    setGoal({ x, y })
  }

  return (
    <div className="map-wrap">
      <canvas
        ref={canvasRef}
        className="map-canvas"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
      />
      <div className="map-tools">
        <Chip active={follow} onClick={() => setFollow((f) => !f)}>Follow rover</Chip>
        <Chip active={showPlan} onClick={() => setShowPlan((s) => !s)}>Plan</Chip>
        <Chip onClick={() => { viewRef.current.scale = 14; setFollow(true) }}>Reset view</Chip>
        <Chip onClick={() => callService(config.services.clearCostmaps)}>Clear costmaps</Chip>
      </div>
      <div className="map-hint">
        {!hasMap && 'No occupancy grid yet. '}
        Click to send a nav goal · drag to pan · scroll to zoom
        {cursor && <span className="mono"> · {cursor[0].toFixed(1)}, {cursor[1].toFixed(1)} m</span>}
      </div>
    </div>
  )
}

function parseLegs(msg) {
  if (!msg?.data) return Object.assign([], { activeIndex: 0 })
  try {
    const parsed = JSON.parse(msg.data)
    const arr = parsed.legs ?? []
    return Object.assign(arr, { activeIndex: parsed.active ?? 0 })
  } catch {
    return Object.assign([], { activeIndex: 0 })
  }
}

function drawGraticule(ctx, rect, v, toScreen) {
  // Metre grid that coarsens as you zoom out, so it never turns into mush.
  const step = v.scale > 26 ? 1 : v.scale > 11 ? 5 : 10
  const halfW = rect.width / 2 / v.scale
  const halfH = rect.height / 2 / v.scale
  ctx.strokeStyle = 'rgba(255,255,255,0.045)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = Math.ceil((v.cx - halfW) / step) * step; x < v.cx + halfW; x += step) {
    const [sx] = toScreen(x, 0, rect)
    ctx.moveTo(sx, 0); ctx.lineTo(sx, rect.height)
  }
  for (let y = Math.ceil((v.cy - halfH) / step) * step; y < v.cy + halfH; y += step) {
    const [, sy] = toScreen(0, y, rect)
    ctx.moveTo(0, sy); ctx.lineTo(rect.width, sy)
  }
  ctx.stroke()
}

function drawScaleBar(ctx, rect, scale) {
  const candidates = [1, 2, 5, 10, 20, 50]
  const metres = candidates.find((m) => m * scale > 60) ?? 50
  const px = metres * scale
  const x = rect.width - px - 16
  const y = rect.height - 18
  ctx.strokeStyle = '#8a94a6'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 4)
  ctx.stroke()
  ctx.fillStyle = '#8a94a6'
  ctx.font = '10px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`${metres} m`, x + px / 2, y - 7)
}
