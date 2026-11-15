import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { makePublisher, isLive } from '../ros'

export function useKeyboardTeleop(inhibited = false) {
  const [active, setActive] = useState(false)
  const pressedKeys = useRef(new Set())
  const pubRef = useRef(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    pubRef.current = makePublisher(config.topics.cmdVel)
  }, [])

  useEffect(() => {
    if (inhibited) {
      pressedKeys.current.clear()
      setActive(false)
      if (pubRef.current && isLive()) {
        pubRef.current.publish({
          linear: { x: 0, y: 0, z: 0 },
          angular: { x: 0, y: 0, z: 0 },
        })
      }
      return
    }

    const handleKeyDown = (e) => {
      // Don't trigger if typing in an input, textarea, or contentEditable element
      const tag = e.target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return

      const code = e.code
      const valid = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']
      if (!valid.includes(code)) return

      e.preventDefault()
      pressedKeys.current.add(code)
      setActive(true)
    }

    const handleKeyUp = (e) => {
      const code = e.code
      if (pressedKeys.current.has(code)) {
        pressedKeys.current.delete(code)
        if (pressedKeys.current.size === 0) {
          setActive(false)
          // Send zero velocity immediately
          if (pubRef.current && isLive()) {
            pubRef.current.publish({
              linear: { x: 0, y: 0, z: 0 },
              angular: { x: 0, y: 0, z: 0 },
            })
          }
        }
      }
    }

    const handleBlur = () => {
      pressedKeys.current.clear()
      setActive(false)
      if (pubRef.current && isLive()) {
        pubRef.current.publish({
          linear: { x: 0, y: 0, z: 0 },
          angular: { x: 0, y: 0, z: 0 },
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    // Periodic publisher loop at config rate
    intervalRef.current = setInterval(() => {
      if (pressedKeys.current.size === 0 || inhibited || !pubRef.current || !isLive()) return

      let linear = 0
      let angular = 0

      if (pressedKeys.current.has('KeyW') || pressedKeys.current.has('ArrowUp')) linear += config.teleop.maxLinear
      if (pressedKeys.current.has('KeyS') || pressedKeys.current.has('ArrowDown')) linear -= config.teleop.maxLinear
      if (pressedKeys.current.has('KeyA') || pressedKeys.current.has('ArrowLeft')) angular += config.teleop.maxAngular
      if (pressedKeys.current.has('KeyD') || pressedKeys.current.has('ArrowRight')) angular -= config.teleop.maxAngular

      pubRef.current.publish({
        linear: { x: linear, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: angular },
      })
    }, 1000 / config.teleop.rateHz)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [inhibited])

  return active
}
