import { useEffect, useRef, useState } from 'react'
import { config, DEMO } from '../config'
import { useTopicCallback } from '../ros'

export default function CameraView({
  topic = '/camera/color/image_raw',
  quality = 60,
  width = 640,
  showBoxes = true,
  showHud = true,
  onFocus = null,
}) {
  const [loadError, setLoadError] = useState(false)
  const [rsMode, setRsMode] = useState('color') // 'color' | 'depth' | 'infra'
  const isDemoOrFallback = DEMO || loadError

  const isFront = topic.includes('color') || topic.includes('front') || topic.includes('depth') || topic.includes('infra')

  // Compute effective stream topic based on RealSense mode if front camera
  let effectiveTopic = topic
  if (isFront) {
    if (rsMode === 'depth') effectiveTopic = '/camera/depth/image_rect_raw'
    else if (rsMode === 'infra') effectiveTopic = '/camera/infra1/image_rect_raw'
    else effectiveTopic = '/camera/color/image_raw'
  }

  const src = `${config.videoServerUrl}/stream?topic=${encodeURIComponent(effectiveTopic)}` +
    `&type=mjpeg&quality=${quality}&width=${width}`

  const camMeta = config.cameras.find((c) => c.topic === effectiveTopic || c.name === effectiveTopic) || {
    label: isFront ? 'Front Cam (D435i)' : effectiveTopic.replace(/^\/camera_?/, '').replace(/\/image_raw$/, '') || effectiveTopic,
    res: isFront ? (rsMode === 'color' ? '1080p60' : '720p60') : '720p60',
    fov: isFront ? '87° × 58°' : '100°',
  }

  return (
    <div className="cam-wrap">
      {isDemoOrFallback ? (
        <SyntheticFeed topic={effectiveTopic} rsMode={rsMode} />
      ) : (
        <img
          src={src}
          alt={`Live feed from ${effectiveTopic}`}
          className="cam-img"
          onError={() => setLoadError(true)}
          onLoad={() => setLoadError(false)}
        />
      )}

      {showBoxes && rsMode === 'color' && <DetectionOverlay topic={effectiveTopic} />}

      {showHud && (
        <div className="cam-hud-overlay">
          <div className="cam-hud-top">
            <span className="cam-hud-live">
              <span className="cam-hud-dot" /> LIVE
            </span>
            <span className="cam-hud-name mono">
              {isFront ? `INTEL REALSENSE D435i · ${rsMode.toUpperCase()} · ${camMeta.res}` : `${camMeta.label.toUpperCase()} · ${camMeta.res}`}
            </span>
          </div>

          <div className="cam-hud-bottom">
            <div className="cam-hud-tags-group">
              <span className="cam-hud-tag mono">FOV {camMeta.fov}</span>
              {isFront && (
                <div className="rs-mode-switcher">
                  <button
                    type="button"
                    className={`rs-mode-btn ${rsMode === 'color' ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setRsMode('color') }}
                  >
                    RGB Color
                  </button>
                  <button
                    type="button"
                    className={`rs-mode-btn ${rsMode === 'depth' ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setRsMode('depth') }}
                  >
                    Depth Map
                  </button>
                  <button
                    type="button"
                    className={`rs-mode-btn ${rsMode === 'infra' ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setRsMode('infra') }}
                  >
                    Infrared IR
                  </button>
                </div>
              )}
            </div>

            {onFocus && (
              <button
                type="button"
                className="cam-hud-focus-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onFocus(effectiveTopic)
                }}
                title="Focus on this camera"
              >
                Focus
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Detection boxes drawn over camera stage, scaled from source px. */
function DetectionOverlay({ topic }) {
  const ref = useRef(null)
  const dets = useRef([])
  const marker = useRef(null)

  const isApplicable = topic.includes('color') || topic.includes('front') || topic.includes('arm')

  useTopicCallback(
    config.topics.detections,
    (msg) => {
      if (isApplicable) {
        dets.current = msg?.detections ?? []
      }
    },
    { throttle: 100 }
  )

  useTopicCallback(
    config.topics.marker,
    (msg) => {
      if (isApplicable) {
        marker.current = msg ?? null
      }
    },
    { throttle: 100 }
  )

  useEffect(() => {
    if (!isApplicable) return
    let raf
    const draw = () => {
      const el = ref.current
      if (el) {
        const rect = el.parentElement.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        if (el.width !== rect.width * dpr || el.height !== rect.height * dpr) {
          el.width = rect.width * dpr
          el.height = rect.height * dpr
        }
        const ctx = el.getContext('2d')
        if (!ctx) return
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, rect.width, rect.height)
        const { width: sw, height: sh } = config.detectionSourceSize
        const kx = rect.width / sw
        const ky = rect.height / sh
        ctx.lineWidth = 1.8
        ctx.font = '600 11px ui-monospace, monospace'

        for (const d of dets.current) {
          let x, y, w, h, label, score, dist
          if (d.bbox) {
            w = d.bbox.size_x * kx
            h = d.bbox.size_y * ky
            x = d.bbox.center.position.x * kx - w / 2
            y = d.bbox.center.position.y * ky - h / 2
            label = d.results?.[0]?.hypothesis?.class_id ?? d.label ?? 'object'
            score = d.results?.[0]?.hypothesis?.score ?? d.confidence ?? 0
          } else {
            x = (d.x ?? 0) * kx
            y = (d.y ?? 0) * ky
            w = (d.w ?? 60) * kx
            h = (d.h ?? 60) * ky
            label = d.label || 'object'
            score = d.confidence || 0
          }
          if (d.position && typeof d.position.z === 'number' && !isNaN(d.position.z)) {
            dist = d.position.z
          }

          // Corner bracket style bounding box
          ctx.strokeStyle = '#4fd6a0'
          const bl = Math.min(14, w * 0.25, h * 0.25)
          ctx.beginPath()
          ctx.moveTo(x, y + bl); ctx.lineTo(x, y); ctx.lineTo(x + bl, y); ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(x + w - bl, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + bl); ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(x, y + h - bl); ctx.lineTo(x, y + h); ctx.lineTo(x + bl, y + h); ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(x + w - bl, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - bl); ctx.stroke()

          ctx.fillStyle = 'rgba(79, 214, 160, 0.08)'
          ctx.fillRect(x, y, w, h)

          const distText = dist != null ? ` [${dist.toFixed(1)}m]` : ''
          const text = `${label} ${(score || 0).toFixed(2)}${distText}`
          const tw = ctx.measureText(text).width + 10
          ctx.fillStyle = 'rgba(10, 14, 20, 0.85)'
          ctx.fillRect(x, y - 18, tw, 18)
          ctx.fillStyle = '#4fd6a0'
          ctx.fillText(text, x + 5, y - 5)
        }

        // Target delivery marker observation (trixanth_interfaces/msg/MarkerObservation)
        const m = marker.current
        if (m && m.visible) {
          const bearing = m.bearing_rad || 0
          const mx = rect.width / 2 - bearing * (rect.width / 1.5)
          const my = rect.height * 0.55
          const mw = Math.max(36, Math.min(120, (m.area_ratio || 0.04) * rect.width * 2.5))
          const mh = mw

          ctx.strokeStyle = '#5aa9ff'
          ctx.lineWidth = 2
          ctx.setLineDash([4, 4])
          ctx.strokeRect(mx - mw / 2, my - mh / 2, mw, mh)
          ctx.setLineDash([])

          // Crosshair inside marker
          ctx.beginPath()
          ctx.moveTo(mx - 8, my); ctx.lineTo(mx + 8, my)
          ctx.moveTo(mx, my - 8); ctx.lineTo(mx, my + 8)
          ctx.stroke()

          const markerLabel = `MARKER [${(m.colour || 'TARGET').toUpperCase()}] ${m.range_m ? m.range_m.toFixed(2) + 'm' : ''}`
          const mtw = ctx.measureText(markerLabel).width + 10
          ctx.fillStyle = 'rgba(10, 20, 36, 0.9)'
          ctx.fillRect(mx - mtw / 2, my - mh / 2 - 20, mtw, 18)
          ctx.fillStyle = '#5aa9ff'
          ctx.fillText(markerLabel, mx - mtw / 2 + 5, my - mh / 2 - 7)
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [isApplicable])

  if (!isApplicable) return null
  return <canvas ref={ref} className="cam-overlay" />
}

/**
 * Rich synthetic animated feeds for each camera:
 * - Intel RealSense D435i: RGB Color, Z16 Depth Map, or Active Stereo IR Dot Projector
 * - Rear: Backward viewpoint with tire tracks and parking lines
 * - Arm: Manipulator gripper and laser spot
 * - Science: Multispectral crystalline scan
 */
function SyntheticFeed({ topic, rsMode = 'color' }) {
  const ref = useRef(null)

  useEffect(() => {
    let raf
    let t = 0

    const draw = () => {
      const el = ref.current
      if (!el) return
      const rect = el.parentElement?.getBoundingClientRect() || { width: 640, height: 360 }
      const dpr = window.devicePixelRatio || 1
      if (el.width !== rect.width * dpr || el.height !== rect.height * dpr) {
        el.width = rect.width * dpr
        el.height = rect.height * dpr
      }
      const ctx = el.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const { width: w, height: h } = rect

      if (topic.includes('rear')) {
        drawRearCamera(ctx, w, h, t)
      } else if (topic.includes('arm')) {
        drawArmCamera(ctx, w, h, t)
      } else if (topic.includes('left')) {
        drawLeftCamera(ctx, w, h, t)
      } else if (topic.includes('right')) {
        drawRightCamera(ctx, w, h, t)
      } else if (topic.includes('science')) {
        drawScienceCamera(ctx, w, h, t)
      } else {
        // Front Camera: Intel RealSense D435i
        if (rsMode === 'depth' || topic.includes('depth')) {
          drawRealSenseDepth(ctx, w, h, t)
        } else if (rsMode === 'infra' || topic.includes('infra')) {
          drawRealSenseInfra(ctx, w, h, t)
        } else {
          drawRealSenseColor(ctx, w, h, t)
        }
      }

      t += 1
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [topic, rsMode])

  return <canvas ref={ref} className="cam-img" />
}

/** INTEL REALSENSE D435i: RGB Color Stream */
function drawRealSenseColor(ctx, w, h, t) {
  const horizon = h * 0.38

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, '#1c2430')
  sky.addColorStop(0.7, '#3c322b')
  sky.addColorStop(1, '#5a4634')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, horizon)

  // Distant terrain ridge
  ctx.fillStyle = '#2f241d'
  ctx.beginPath()
  ctx.moveTo(0, horizon)
  for (let x = 0; x <= w; x += 30) {
    const ridgeH = Math.sin(x * 0.015 + 1.2) * 12 + Math.cos(x * 0.04) * 6
    ctx.lineTo(x, horizon - 8 - ridgeH)
  }
  ctx.lineTo(w, horizon)
  ctx.closePath()
  ctx.fill()

  // Ground terrain gradient
  const ground = ctx.createLinearGradient(0, horizon, 0, h)
  ground.addColorStop(0, '#664e3b')
  ground.addColorStop(0.3, '#543e2f')
  ground.addColorStop(1, '#2c2018')
  ctx.fillStyle = ground
  ctx.fillRect(0, horizon, w, h - horizon)

  // Perspective terrain lines
  ctx.strokeStyle = 'rgba(255, 230, 200, 0.06)'
  ctx.lineWidth = 1
  for (let i = 0; i < 18; i++) {
    const progress = (i / 18 + (t * 0.025) % (1 / 18))
    const y = horizon + Math.pow(progress, 2.2) * (h - horizon)
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // Approaching boulders with shadows
  for (let i = 0; i < 6; i++) {
    const cycle = (t * 0.012 + i * 0.28) % 1
    const y = horizon + Math.pow(cycle, 1.8) * (h - horizon - 20)
    const xSpread = (i % 2 === 0 ? 1 : -1) * (0.2 + (i * 0.17) % 0.4)
    const x = w / 2 + xSpread * (w * 0.5) * (y / h)
    const r = (5 + (i * 3.5)) * Math.pow(cycle, 1.4) + 2

    // Shadow
    ctx.fillStyle = 'rgba(15, 10, 8, 0.45)'
    ctx.beginPath()
    ctx.ellipse(x + r * 0.3, y + r * 0.7, r * 1.5, r * 0.4, 0, 0, Math.PI * 2)
    ctx.fill()

    // Rock
    const rockGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
    rockGrad.addColorStop(0, '#8c7058')
    rockGrad.addColorStop(1, '#4a382c')
    ctx.fillStyle = rockGrad
    ctx.beginPath()
    ctx.ellipse(x, y, r * 1.3, r, (i * 0.5), 0, Math.PI * 2)
    ctx.fill()
  }

  // Rover front chassis edge
  ctx.fillStyle = '#161b22'
  ctx.beginPath()
  ctx.moveTo(w * 0.22, h)
  ctx.lineTo(w * 0.35, h - 20)
  ctx.lineTo(w * 0.65, h - 20)
  ctx.lineTo(w * 0.78, h)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#262d38'
  ctx.stroke()

  // RealSense D435i Crosshair & HUD
  drawCrosshair(ctx, w / 2, horizon + 28, '#4fd6a0', 16)

  ctx.fillStyle = 'rgba(79, 214, 160, 0.75)'
  ctx.font = '10px ui-monospace, monospace'
  ctx.fillText('INTEL REALSENSE D435i · RGB COLOR · librealsense2 2.58.3', 12, h - 10)
}

/** INTEL REALSENSE D435i: Z16 Metric Depth Colormap */
function drawRealSenseDepth(ctx, w, h, t) {
  const horizon = h * 0.38

  // Sky = Infinity (dark purple/black)
  ctx.fillStyle = '#08051a'
  ctx.fillRect(0, 0, w, horizon)

  // Ground depth colormap (Turbo/Jet palette: near = blue/cyan, mid = green/yellow, far = red)
  const depthGrad = ctx.createLinearGradient(0, horizon, 0, h)
  depthGrad.addColorStop(0, '#8a0020') // Far (red/orange)
  depthGrad.addColorStop(0.3, '#d47500')
  depthGrad.addColorStop(0.6, '#28a745') // Mid (green)
  depthGrad.addColorStop(0.85, '#00b4d8') // Near (cyan)
  depthGrad.addColorStop(1, '#0052cc') // Very near (deep blue)
  ctx.fillStyle = depthGrad
  ctx.fillRect(0, horizon, w, h - horizon)

  // Contour depth lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.lineWidth = 1
  for (let i = 0; i < 14; i++) {
    const progress = (i / 14 + (t * 0.02) % (1 / 14))
    const y = horizon + Math.pow(progress, 2.0) * (h - horizon)
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w - 30, y); ctx.stroke()
  }

  // Approaching obstacles in depth colormap
  for (let i = 0; i < 5; i++) {
    const cycle = (t * 0.012 + i * 0.32) % 1
    const y = horizon + Math.pow(cycle, 1.8) * (h - horizon - 20)
    const xSpread = (i % 2 === 0 ? 1 : -1) * (0.22 + (i * 0.15) % 0.4)
    const x = w / 2 + xSpread * (w * 0.5) * (y / h)
    const r = (6 + (i * 4)) * Math.pow(cycle, 1.4) + 2

    // Depth color of rock (closer = cyan/blue)
    const rockHue = cycle > 0.6 ? '#00b4d8' : cycle > 0.3 ? '#28a745' : '#d47500'
    ctx.fillStyle = rockHue
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Crosshair with real-time distance readout
  const cx = w / 2, cy = horizon + 30
  drawCrosshair(ctx, cx, cy, '#00ffff', 14)
  const distM = (1.4 + Math.sin(t * 0.04) * 0.6 + 0.8).toFixed(2)

  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
  ctx.fillRect(cx + 10, cy - 10, 85, 20)
  ctx.fillStyle = '#00ffff'
  ctx.font = '600 11px ui-monospace, monospace'
  ctx.fillText(`DIST: ${distM} m`, cx + 16, cy + 4)

  // RealSense Depth Legend on right side
  const legW = 10, legH = h - 60, legX = w - 24, legY = 30
  const legGrad = ctx.createLinearGradient(0, legY + legH, 0, legY)
  legGrad.addColorStop(0, '#0052cc')
  legGrad.addColorStop(0.3, '#00b4d8')
  legGrad.addColorStop(0.6, '#28a745')
  legGrad.addColorStop(0.85, '#d47500')
  legGrad.addColorStop(1, '#8a0020')
  ctx.fillStyle = legGrad
  ctx.fillRect(legX, legY, legW, legH)
  ctx.strokeStyle = '#35404f'
  ctx.strokeRect(legX, legY, legW, legH)

  ctx.fillStyle = '#ffffff'
  ctx.font = '9px ui-monospace, monospace'
  ctx.fillText('0.1m', legX - 24, legY + legH)
  ctx.fillText('10m', legX - 20, legY + 8)

  ctx.fillStyle = '#00ffff'
  ctx.font = '10px ui-monospace, monospace'
  ctx.fillText('D435i STEREO DEPTH (Z16) · ALIGNED TO COLOR · 720p60', 12, h - 10)
}

/** INTEL REALSENSE D435i: Active Infrared Emitter Stream */
function drawRealSenseInfra(ctx, w, h, t) {
  // Grayscale IR background
  ctx.fillStyle = '#14171a'
  ctx.fillRect(0, 0, w, h)

  // Monochromatic terrain
  const horizon = h * 0.4
  const irGround = ctx.createLinearGradient(0, horizon, 0, h)
  irGround.addColorStop(0, '#2c333a')
  irGround.addColorStop(1, '#0e1114')
  ctx.fillStyle = irGround
  ctx.fillRect(0, horizon, w, h - horizon)

  // Active IR Projector dot matrix pattern (semi-random dot grid from D435i laser projector)
  ctx.fillStyle = 'rgba(230, 245, 255, 0.45)'
  for (let px = 20; px < w; px += 26) {
    for (let py = 20; py < h; py += 26) {
      const jitterX = Math.sin(px * 12.3 + py * 7.1) * 6
      const jitterY = Math.cos(py * 9.7 + px * 3.4) * 6
      const dotR = ((px + py) % 4 === 0) ? 1.5 : 0.9
      ctx.beginPath()
      ctx.arc(px + jitterX, py + jitterY, dotR, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Crosshair
  drawCrosshair(ctx, w / 2, horizon + 25, '#ffffff', 14)

  ctx.fillStyle = '#e7ece8'
  ctx.font = '10px ui-monospace, monospace'
  ctx.fillText('REALSENSE D435i INFRA-1 (850nm) · ACTIVE IR PROJECTOR ON', 12, h - 10)
}

/** REAR CAMERA: Backward viewpoint, tire tracks, parking lines */
function drawRearCamera(ctx, w, h, t) {
  const horizon = h * 0.42

  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, '#1d232c')
  sky.addColorStop(1, '#483c34')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, horizon)

  const ground = ctx.createLinearGradient(0, horizon, 0, h)
  ground.addColorStop(0, '#5e4838')
  ground.addColorStop(1, '#2c1e16')
  ctx.fillStyle = ground
  ctx.fillRect(0, horizon, w, h - horizon)

  // Tire tracks
  const leftTrackX1 = w * 0.36, leftTrackX2 = w * 0.47
  const rightTrackX1 = w * 0.64, rightTrackX2 = w * 0.53

  ctx.strokeStyle = 'rgba(28, 18, 12, 0.75)'
  ctx.lineWidth = 14
  ctx.beginPath()
  ctx.moveTo(leftTrackX1, h); ctx.lineTo(leftTrackX2, horizon + 4)
  ctx.moveTo(rightTrackX1, h); ctx.lineTo(rightTrackX2, horizon + 4)
  ctx.stroke()

  // Guide lines
  ctx.lineWidth = 2
  ctx.strokeStyle = '#e5544b'
  ctx.beginPath(); ctx.moveTo(w * 0.30, h - 35); ctx.lineTo(w * 0.70, h - 35); ctx.stroke()
  ctx.strokeStyle = '#e8b84b'
  ctx.beginPath(); ctx.moveTo(w * 0.35, h - 75); ctx.lineTo(w * 0.65, h - 75); ctx.stroke()
  ctx.strokeStyle = '#4fd6a0'
  ctx.beginPath(); ctx.moveTo(w * 0.40, h - 115); ctx.lineTo(w * 0.60, h - 115); ctx.stroke()

  ctx.fillStyle = '#161b22'
  ctx.fillRect(w * 0.28, h - 18, w * 0.44, 18)
  ctx.strokeStyle = '#35404f'
  ctx.strokeRect(w * 0.28, h - 18, w * 0.44, 18)
}

/** ARM CAMERA: Downward manipulator view with 2-finger gripper claws */
function drawArmCamera(ctx, w, h, t) {
  const bg = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.6)
  bg.addColorStop(0, '#5a4636')
  bg.addColorStop(0.7, '#3c2e24')
  bg.addColorStop(1, '#221a14')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  const cx = w / 2, cy = h / 2
  ctx.fillStyle = '#8f7358'
  ctx.beginPath()
  ctx.ellipse(cx, cy, 38, 28, 0.4, 0, Math.PI * 2)
  ctx.fill()

  const pulse = Math.sin(t * 0.1) * 2
  ctx.fillStyle = '#ff3b30'
  ctx.beginPath(); ctx.arc(cx, cy, 3.5 + pulse * 0.4, 0, Math.PI * 2); ctx.fill()

  ctx.strokeStyle = 'rgba(255, 59, 48, 0.65)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.stroke()

  // Gripper claws
  const gripShift = Math.sin(t * 0.05) * 6
  ctx.fillStyle = '#262d38'
  ctx.strokeStyle = '#4f5b6d'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, h * 0.3)
  ctx.lineTo(w * 0.22 + gripShift, h * 0.42)
  ctx.lineTo(w * 0.22 + gripShift, h * 0.58)
  ctx.lineTo(0, h * 0.7)
  ctx.closePath()
  ctx.fill(); ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(w, h * 0.3)
  ctx.lineTo(w * 0.78 - gripShift, h * 0.42)
  ctx.lineTo(w * 0.78 - gripShift, h * 0.58)
  ctx.lineTo(w, h * 0.7)
  ctx.closePath()
  ctx.fill(); ctx.stroke()

  ctx.fillStyle = '#4fd6a0'
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillText('GRIP: 65% · DIST: 0.38m', w * 0.05, h - 14)
}

/** SCIENCE CAMERA: Multispectral microscope scan */
function drawScienceCamera(ctx, w, h, t) {
  ctx.fillStyle = '#10141a'
  ctx.fillRect(0, 0, w, h)

  for (let x = 20; x < w; x += 44) {
    for (let y = 20; y < h; y += 44) {
      const heat = Math.sin(x * 0.05 + t * 0.03) * Math.cos(y * 0.05 + t * 0.02)
      ctx.fillStyle = heat > 0.3 ? 'rgba(79, 214, 160, 0.28)' : 'rgba(232, 184, 75, 0.2)'
      ctx.beginPath()
      ctx.arc(x, y, 14 + heat * 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.strokeStyle = 'rgba(79, 214, 160, 0.4)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w / 2, h / 2); ctx.stroke()

  const gw = 120, gh = 45, gx = w - gw - 12, gy = h - gh - 12
  ctx.fillStyle = 'rgba(10, 14, 20, 0.85)'
  ctx.fillRect(gx, gy, gw, gh)
  ctx.strokeStyle = '#262d38'
  ctx.strokeRect(gx, gy, gw, gh)

  ctx.strokeStyle = '#5aa9ff'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i <= gw; i += 4) {
    const freq = i * 0.08
    const val = Math.sin(freq + t * 0.06) * 12 + Math.cos(freq * 2.2) * 6
    const py = gy + gh / 2 + val
    if (i === 0) ctx.moveTo(gx + i, py)
    else ctx.lineTo(gx + i, py)
  }
  ctx.stroke()

  ctx.fillStyle = '#7f8a9c'
  ctx.font = '9px ui-monospace, monospace'
  ctx.fillText('λ: 400-980nm (UV-NIR)', gx + 5, gy + 12)
}

/** ROVER LEFT SIDE CAMERA: Portside wheel clearance & lateral terrain */
function drawLeftCamera(ctx, w, h, t) {
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#1c1b18')
  bg.addColorStop(0.45, '#352e25')
  bg.addColorStop(1, '#1b140f')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Ground horizon
  ctx.strokeStyle = '#635341'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, h * 0.45)
  ctx.lineTo(w, h * 0.45)
  ctx.stroke()

  // Left Front Wheel
  ctx.fillStyle = '#181d22'
  ctx.strokeStyle = '#3d4856'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(w * 0.72, h * 0.65, w * 0.16, h * 0.28, 0.1, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()

  // Tread ribs
  ctx.strokeStyle = '#28323e'
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    const rx = w * 0.72 + Math.cos(a + t * 0.04) * (w * 0.14)
    const ry = h * 0.65 + Math.sin(a + t * 0.04) * (h * 0.24)
    ctx.beginPath(); ctx.moveTo(w * 0.72, h * 0.65); ctx.lineTo(rx, ry); ctx.stroke()
  }

  // Suspension arm
  ctx.strokeStyle = '#4f5b6d'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(w * 0.72, h * 0.65)
  ctx.lineTo(w * 0.9, h * 0.45)
  ctx.stroke()

  ctx.fillStyle = '#4fd6a0'
  ctx.font = '10.5px ui-monospace, monospace'
  ctx.fillText('PORT / LEFT BOGIE · CLEARANCE: 28cm', 12, h - 14)
}

/** ROVER RIGHT SIDE CAMERA: Starboard wheel clearance & lateral terrain */
function drawRightCamera(ctx, w, h, t) {
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#1c1b18')
  bg.addColorStop(0.45, '#352e25')
  bg.addColorStop(1, '#1b140f')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Ground horizon
  ctx.strokeStyle = '#635341'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, h * 0.45)
  ctx.lineTo(w, h * 0.45)
  ctx.stroke()

  // Right Front Wheel
  ctx.fillStyle = '#181d22'
  ctx.strokeStyle = '#3d4856'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(w * 0.28, h * 0.65, w * 0.16, h * 0.28, -0.1, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()

  // Tread ribs
  ctx.strokeStyle = '#28323e'
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    const rx = w * 0.28 + Math.cos(a + t * 0.04) * (w * 0.14)
    const ry = h * 0.65 + Math.sin(a + t * 0.04) * (h * 0.24)
    ctx.beginPath(); ctx.moveTo(w * 0.28, h * 0.65); ctx.lineTo(rx, ry); ctx.stroke()
  }

  // Suspension arm
  ctx.strokeStyle = '#4f5b6d'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(w * 0.28, h * 0.65)
  ctx.lineTo(w * 0.1, h * 0.45)
  ctx.stroke()

  ctx.fillStyle = '#4fd6a0'
  ctx.font = '10.5px ui-monospace, monospace'
  ctx.fillText('STARBOARD / RIGHT BOGIE · CLEARANCE: 29cm', 12, h - 14)
}

function drawCrosshair(ctx, cx, cy, color, size) {
  ctx.strokeStyle = color
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(cx - size, cy); ctx.lineTo(cx - 4, cy)
  ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + size, cy)
  ctx.moveTo(cx, cy - size); ctx.lineTo(cx, cy - 4)
  ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + size)
  ctx.stroke()
}
