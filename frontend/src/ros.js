import { useEffect, useRef, useState } from 'react'
import ROSLIB from 'roslib'
import { config, DEMO } from './config'
import * as mock from './mock/mockRos'

// One shared rosbridge connection for the whole app. roslibjs does not
// reconnect on its own, so we rebuild the socket on close.

let ros = null
const listeners = new Set()
let status = DEMO ? 'demo' : 'connecting'

function setStatus(next) {
  status = next
  listeners.forEach((fn) => fn(next))
}

function connect() {
  ros = new ROSLIB.Ros({ url: config.rosbridgeUrl })
  ros.on('connection', () => setStatus('connected'))
  ros.on('error', () => setStatus('error'))
  ros.on('close', () => {
    setStatus('disconnected')
    setTimeout(connect, 2000)
  })
}

export function getRos() {
  if (!ros && !DEMO) connect()
  return ros
}

if (DEMO) mock.start()

export function useRosStatus() {
  const [s, setS] = useState(status)
  useEffect(() => {
    if (DEMO) return
    getRos()
    listeners.add(setS)
    return () => listeners.delete(setS)
  }, [])
  return s
}

export const isLive = () => (DEMO ? true : status === 'connected')

// ------------------------------------------------------------- subscriptions

function rawSubscribe({ name, type }, cb, throttle) {
  if (DEMO) return mock.subscribe(name, cb)
  const topic = new ROSLIB.Topic({
    ros: getRos(),
    name,
    messageType: type,
    throttle_rate: throttle,
    queue_length: 1,
  })
  topic.subscribe(cb)
  return () => topic.unsubscribe()
}

/** Subscribe and re-render on each message. Use for low-rate readouts. */
export function useTopic(spec, { throttle = 200 } = {}) {
  const [msg, setMsg] = useState(null)
  useEffect(() => rawSubscribe(spec, setMsg, throttle), [spec.name, spec.type, throttle])
  return msg
}

/** Subscribe without re-rendering. Use for canvas draws and high-rate data. */
export function useTopicCallback(spec, cb, { throttle = 100 } = {}) {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(
    () => rawSubscribe(spec, (m) => ref.current(m), throttle),
    [spec.name, spec.type, throttle]
  )
}

/** Keep a rolling buffer of the last `size` messages. */
export function useTopicBuffer(spec, size = 200, { throttle = 200, paused = false } = {}) {
  const [items, setItems] = useState([])
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  useEffect(
    () =>
      rawSubscribe(
        spec,
        (m) => {
          if (pausedRef.current) return
          setItems((prev) => [...prev.slice(-(size - 1)), { ...m, _rx: Date.now() }])
        },
        throttle
      ),
    [spec.name, spec.type, size, throttle]
  )
  return items
}

// ---------------------------------------------------------------- publishing

export function makePublisher({ name, type }) {
  if (DEMO) return { publish: (msg) => mock.publishTo(name, msg) }
  const topic = new ROSLIB.Topic({ ros: getRos(), name, messageType: type })
  return { publish: (msg) => topic.publish(new ROSLIB.Message(msg)) }
}

export function publishTo(specOrName, msg) {
  const name = typeof specOrName === 'string' ? specOrName : specOrName?.name
  const type = typeof specOrName === 'object' ? specOrName?.type : 'std_msgs/msg/String'
  if (DEMO) return mock.publishTo(name, msg)
  const topic = new ROSLIB.Topic({ ros: getRos(), name, messageType: type })
  topic.publish(new ROSLIB.Message(msg))
}

export function callService({ name, type }, request = {}) {
  if (DEMO) return mock.callService(name, request)
  return new Promise((resolve, reject) => {
    const svc = new ROSLIB.Service({ ros: getRos(), name, serviceType: type })
    svc.callService(new ROSLIB.ServiceRequest(request), resolve, reject)
  })
}

/** Ask rosapi what exists, so camera feeds are discovered rather than hardcoded. */
export function listTopics() {
  if (DEMO) return mock.listTopics()
  return new Promise((resolve, reject) => {
    const svc = new ROSLIB.Service({
      ros: getRos(),
      name: '/rosapi/topics',
      serviceType: 'rosapi/Topics',
    })
    svc.callService(
      new ROSLIB.ServiceRequest({}),
      (res) => resolve(res.topics.map((t, i) => ({ name: t, type: res.types?.[i] }))),
      reject
    )
  })
}

// -------------------------------------------------------------------- maths

export function yawFrom(q) {
  if (!q) return 0
  const { x, y, z, w } = q
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
}

export const quatFromYaw = (yaw) => ({
  x: 0,
  y: 0,
  z: Math.sin(yaw / 2),
  w: Math.cos(yaw / 2),
})
