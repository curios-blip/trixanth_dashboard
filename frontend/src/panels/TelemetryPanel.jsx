import { config } from '../config'
import { Panel, Readout, fmt } from '../components/ui'
import { useTopic, yawFrom } from '../ros'

const FIX = { '-1': 'no fix', 0: 'single', 1: 'SBAS', 2: 'GBAS/RTK' }

export default function TelemetryPanel() {
  const odom = useTopic(config.topics.odom, { throttle: 250 })
  const battery = useTopic(config.topics.battery, { throttle: 1000 })
  const gps = useTopic(config.topics.gps, { throttle: 1000 })
  const imu = useTopic(config.topics.imu, { throttle: 500 })

  const p = odom?.pose?.pose?.position
  const yaw = odom ? yawFrom(odom.pose.pose.orientation) : null
  const tw = odom?.twist?.twist
  const speed = tw ? Math.hypot(tw.linear.x, tw.linear.y) : null
  const hCov = gps?.position_covariance?.[0]

  const volts = battery?.voltage
  const vTone =
    volts == null ? null
      : volts < config.battery.critical ? 'fault'
      : volts < config.battery.warn ? 'warn'
      : null

  return (
    <Panel title="Telemetry">
      <div className="readouts">
        <Readout label="x" value={fmt(p?.x)} unit="m" />
        <Readout label="y" value={fmt(p?.y)} unit="m" />
        <Readout label="speed" value={fmt(speed)} unit="m/s" />
        <Readout label="yaw rate" value={fmt(tw?.angular?.z)} unit="rad/s" />
        <Readout label="battery" value={fmt(volts, 1)} unit="V" tone={vTone} />
        <Readout label="charge"
                 value={battery?.percentage != null ? Math.round(battery.percentage * 100) : null}
                 unit="%" />
        <Readout label="draw" value={fmt(battery?.current, 1)} unit="A" />
        <Readout label="pack temp" value={fmt(battery?.temperature, 0)} unit="°C" />
      </div>

      <div className="telemetry-split">
        <HeadingDial yaw={yaw} />
        <div className="gps">
          <Readout label="GPS fix" value={gps ? FIX[String(gps.status?.status)] ?? 'unknown' : null} />
          <Readout label="lat" value={gps ? gps.latitude.toFixed(6) : null} unit="°" />
          <Readout label="lon" value={gps ? gps.longitude.toFixed(6) : null} unit="°" />
          <Readout label="horiz σ" value={hCov != null ? Math.sqrt(hCov).toFixed(2) : null} unit="m" />
          <Readout label="accel z" value={fmt(imu?.linear_acceleration?.z)} unit="m/s²" />
        </div>
      </div>
    </Panel>
  )
}

function HeadingDial({ yaw }) {
  const live = yaw != null
  const deg = live ? (yaw * 180) / Math.PI : 0
  const compass = ((450 - deg) % 360).toFixed(0)
  return (
    <div className="dial-wrap">
      <svg viewBox="-60 -60 120 120" className={live ? 'dial' : 'dial stale'} role="img"
           aria-label={`Heading ${compass} degrees`}>
        <circle r="50" className="dial-ring" />
        {Array.from({ length: 12 }, (_, i) => i * 30).map((a) => (
          <line key={a} x1="0" y1="-50" x2="0" y2={a % 90 === 0 ? '-40' : '-45'}
                transform={`rotate(${a})`} className="dial-tick" />
        ))}
        <g transform={`rotate(${deg})`}>
          <polygon points="0,-40 9,14 0,7 -9,14" className="dial-needle" />
        </g>
      </svg>
      <span className="dial-value mono">{live ? `${compass}°` : '—'}</span>
    </div>
  )
}
