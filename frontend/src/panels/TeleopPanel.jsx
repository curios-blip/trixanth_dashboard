import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { makePublisher } from '../ros'
import { Panel } from '../components/ui'

// Hold-to-drive only. There is no latching teleop mode: release the pad or the
// key and the rover stops on the next tick. A dropped WiFi link therefore
// stops the rover rather than leaving the last command running -- but that is
// still not a substitute for the hardware watchdog on the Teensy.

const KEYS = {
  w: [1, 0], ArrowUp: [1, 0],
  s: [-1, 0], ArrowDown: [-1, 0],
  a: [0, 1], ArrowLeft: [0, 1],
  d: [0, -1], ArrowRight: [0, -1],
}

export default function TeleopPanel({ inhibited }) {
  const [enabled, setEnabled] = useState(false)
  const [scale, setScale] = useState(0.5)
  const [cmd, setCmd] = useState({ v: 0, w: 0 })
  const axes = useRef({ v: 0, w: 0 })
  const pub = useRef(null)
  const padRef = useRef(null)
  if (!pub.current) pub.current = makePublisher(config.topics.cmdVel)

  const active = enabled && !inhibited

  // keyboard
  useEffect(() => {
    if (!active) return
    const held = new Set()
    const recompute = () => {
      let v = 0
      let w = 0
      held.forEach((k) => { v += KEYS[k][0]; w += KEYS[k][1] })
      axes.current = { v: Math.max(-1, Math.min(1, v)), w: Math.max(-1, Math.min(1, w)) }
    }
    const down = (e) => {
      if (!KEYS[e.key] || e.repeat) return
      e.preventDefault()
      held.add(e.key)
      recompute()
    }
    const up = (e) => {
      if (!KEYS[e.key]) return
      held.delete(e.key)
      recompute()
    }
    const blur = () => { held.clear(); recompute() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      axes.current = { v: 0, w: 0 }
    }
  }, [active])

  // publish loop — keeps sending while active, and sends one zero on release
  useEffect(() => {
    let sentZero = true
    const id = setInterval(() => {
      const { v, w } = active ? axes.current : { v: 0, w: 0 }
      const linear = v * config.teleop.maxLinear * scale
      const angular = w * config.teleop.maxAngular * scale
      if (v === 0 && w === 0) {
        if (sentZero) return
        sentZero = true
      } else {
        sentZero = false
      }
      pub.current.publish({
        linear: { x: linear, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: angular },
      })
      setCmd({ v: linear, w: angular })
    }, 1000 / config.teleop.rateHz)
    return () => clearInterval(id)
  }, [active, scale])

  // pointer pad
  const onPad = (e) => {
    if (!active || e.buttons === 0) return
    const r = padRef.current.getBoundingClientRect()
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1
    axes.current = {
      v: Math.max(-1, Math.min(1, -ny)),
      w: Math.max(-1, Math.min(1, -nx)),
    }
  }
  const releasePad = () => { axes.current = { v: 0, w: 0 } }

  return (
    <Panel
      title="Teleop"
      actions={
        <label className="checkbox">
          <input type="checkbox" checked={enabled} disabled={inhibited}
                 onChange={(e) => setEnabled(e.target.checked)} />
          Enable
        </label>
      }
    >
      {inhibited && <p className="notice">Soft stop is engaged. Release it to drive.</p>}
      <div
        ref={padRef}
        className={active ? 'pad' : 'pad off'}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onPad(e) }}
        onPointerMove={onPad}
        onPointerUp={releasePad}
        onPointerLeave={releasePad}
      >
        <span className="pad-hint">
          {active ? 'Hold to drive · WASD also works' : 'Enable to drive'}
        </span>
        <div
          className="pad-dot"
          style={{
            left: `${50 - (cmd.w / (config.teleop.maxAngular * scale || 1)) * 42}%`,
            top: `${50 - (cmd.v / (config.teleop.maxLinear * scale || 1)) * 42}%`,
          }}
        />
      </div>
      <div className="stream-controls">
        <label>
          Speed
          <input type="range" min="0.1" max="1" step="0.05" value={scale}
                 onChange={(e) => setScale(+e.target.value)} />
          <span className="mono">{Math.round(scale * 100)}%</span>
        </label>
        <span className="mono muted">
          {cmd.v.toFixed(2)} m/s · {cmd.w.toFixed(2)} rad/s
        </span>
      </div>
    </Panel>
  )
}
