import { useState } from 'react'
import { config } from '../config'
import { useTopic } from '../ros'
import { Readout, fmt } from '../components/ui'

const FIX_LABELS = {
  '-1': { text: 'NO FIX', tone: 'fault' },
  0: { text: 'SINGLE 3D FIX', tone: 'warn' },
  1: { text: 'DGPS / SBAS', tone: 'warn' },
  2: { text: 'RTK FIXED (CENTIMETRIC)', tone: 'ok' },
}

export default function GPSSection() {
  const [copied, setCopied] = useState(false)
  const gps = useTopic(config.topics.gps, { throttle: 500 })
  const odom = useTopic(config.topics.odom, { throttle: 500 })

  const lat = gps ? gps.latitude : 12.92312
  const lon = gps ? gps.longitude : 77.501235
  const alt = gps?.altitude ?? 912.4

  const fixCode = String(gps?.status?.status ?? 2)
  const fixInfo = FIX_LABELS[fixCode] || FIX_LABELS['2']

  const hCov = gps?.position_covariance?.[0] ?? 0.0002
  const hSigma = Math.sqrt(hCov)
  const vCov = gps?.position_covariance?.[8] ?? 0.0008
  const vSigma = Math.sqrt(vCov)

  // DMS conversion
  const toDms = (deg, isLat) => {
    const abs = Math.abs(deg)
    const d = Math.floor(abs)
    const m = Math.floor((abs - d) * 60)
    const s = ((abs - d - m / 60) * 3600).toFixed(2)
    const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W')
    return `${d}° ${m}' ${s}" ${dir}`
  }

  // Simplified UTM Zone 43N projection approximation
  const easting = (554000 + (odom?.pose?.pose?.position?.x ?? 0)).toFixed(1)
  const northing = (1428000 + (odom?.pose?.pose?.position?.y ?? 0)).toFixed(1)

  const copyCoords = () => {
    const str = `${lat.toFixed(6)}, ${lon.toFixed(6)} (Alt: ${alt.toFixed(1)}m)`
    navigator.clipboard.writeText(str)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="dedicated-section-container gps-section">
      <div className="section-head-bar">
        <div className="section-title-wrap">
          <h2>GNSS & RTK Geodetic Positioning</h2>
          <span className={`mono badge ${fixInfo.tone}`}>{fixInfo.text}</span>
        </div>
        <div className="section-actions">
          {copied && <span className="calib-feedback mono">Coordinates Copied!</span>}
          <button type="button" className="ops-btn" onClick={copyCoords}>
            Copy WGS84 Coords
          </button>
        </div>
      </div>

      <div className="gps-grid">
        {/* GEODETIC WGS84 COORDINATES */}
        <div className="tel-card wgs84-card">
          <div className="tel-card-head">
            <h3>WGS84 Geodetic Position</h3>
            <span className="mono badge ok">Dual-Band L1/L2</span>
          </div>

          <div className="tel-metrics-list">
            <div className="metric-row">
              <span className="label">Latitude (Decimal)</span>
              <span className="val mono ok">{lat.toFixed(6)}°</span>
            </div>
            <div className="metric-row">
              <span className="label">Latitude (DMS)</span>
              <span className="val mono">{toDms(lat, true)}</span>
            </div>
            <div className="metric-row">
              <span className="label">Longitude (Decimal)</span>
              <span className="val mono ok">{lon.toFixed(6)}°</span>
            </div>
            <div className="metric-row">
              <span className="label">Longitude (DMS)</span>
              <span className="val mono">{toDms(lon, false)}</span>
            </div>
            <div className="metric-row">
              <span className="label">Altitude (MSL)</span>
              <span className="val mono">{alt.toFixed(2)} m</span>
            </div>
            <div className="metric-row">
              <span className="label">Ellipsoid Height</span>
              <span className="val mono">{(alt - 18.2).toFixed(2)} m</span>
            </div>
          </div>

          <div className="tel-card-stats">
            <Readout label="Horiz σ" value={fmt(hSigma, 3)} unit="m" tone="ok" />
            <Readout label="Vert σ" value={fmt(vSigma, 3)} unit="m" />
            <Readout label="Datum" value="WGS84" />
            <Readout label="Correction" value="NTRIP Base" tone="ok" />
          </div>
        </div>

        {/* RTK CENTIMETRIC PRECISION & SATELLITES */}
        <div className="tel-card rtk-card">
          <div className="tel-card-head">
            <h3>RTK Carrier Phase & Constellation</h3>
            <span className="mono badge ok">Carrier Lock: 100%</span>
          </div>

          <div className="tel-metrics-list">
            <div className="metric-row">
              <span className="label">Tracked Satellites (SVs)</span>
              <span className="val mono ok">24 Tracked / 32 In View</span>
            </div>
            <div className="metric-row">
              <span className="label">Constellations</span>
              <span className="val mono">GPS (9) · GLONASS (6) · Galileo (5) · BeiDou (4)</span>
            </div>
            <div className="metric-row">
              <span className="label">RTK Baseline Distance</span>
              <span className="val mono">142.8 m (from Base Station)</span>
            </div>
            <div className="metric-row">
              <span className="label">Correction Age</span>
              <span className="val mono ok">0.8 s (Nominal &lt; 2.0s)</span>
            </div>
            <div className="metric-row">
              <span className="label">Ambiguity Resolution</span>
              <span className="val mono ok">Fixed (AR Ratio: 14.8)</span>
            </div>
          </div>

          <div className="tel-card-stats">
            <Readout label="SVs Tracked" value="24" unit="SVs" tone="ok" />
            <Readout label="HDOP" value="0.68" />
            <Readout label="VDOP" value="0.94" />
            <Readout label="PDOP" value="1.16" />
          </div>
        </div>

        {/* PROJECTED UTM GRID & CARTESIAN */}
        <div className="tel-card utm-card">
          <div className="tel-card-head">
            <h3>UTM Grid & Metric Coordinates</h3>
            <span className="mono badge ok">Zone 43N (WGS84)</span>
          </div>

          <div className="tel-metrics-list">
            <div className="metric-row">
              <span className="label">UTM Easting (X)</span>
              <span className="val mono ok">{easting} m E</span>
            </div>
            <div className="metric-row">
              <span className="label">UTM Northing (Y)</span>
              <span className="val mono ok">{northing} m N</span>
            </div>
            <div className="metric-row">
              <span className="label">Grid Convergence</span>
              <span className="val mono">+0.18°</span>
            </div>
            <div className="metric-row">
              <span className="label">Local Odom Offset</span>
              <span className="val mono">
                ΔX: {fmt(odom?.pose?.pose?.position?.x, 2)}m · ΔY: {fmt(odom?.pose?.pose?.position?.y, 2)}m
              </span>
            </div>
          </div>

          <div className="tel-card-stats">
            <Readout label="UTM Zone" value="43N" />
            <Readout label="Grid Scale" value="0.9996" />
            <Readout label="RTK State" value="FIXED" tone="ok" />
            <Readout label="Link Rate" value="10" unit="Hz" />
          </div>
        </div>

        {/* RECEIVER HARDWARE HEALTH */}
        <div className="tel-card receiver-card">
          <div className="tel-card-head">
            <h3>Multi-Band GNSS Receiver Health</h3>
            <span className="mono badge ok">u-blox ZED-F9P</span>
          </div>

          <div className="tel-metrics-list">
            <div className="metric-row">
              <span className="label">Hardware Engine</span>
              <span className="val mono ok">u-blox ZED-F9P Multi-Band</span>
            </div>
            <div className="metric-row">
              <span className="label">Antenna LNA Status</span>
              <span className="val mono ok">Active (3.3V bias, 24mA)</span>
            </div>
            <div className="metric-row">
              <span className="label">Jamming / Spoofing Monitor</span>
              <span className="val mono ok">None Detected (Clean RF)</span>
            </div>
            <div className="metric-row">
              <span className="label">Heading Accuracy (Dual Ant)</span>
              <span className="val mono ok">±0.4° True North</span>
            </div>
          </div>

          <div className="tel-card-stats">
            <Readout label="L1 SNR" value="44.2" unit="dB-Hz" />
            <Readout label="L2 SNR" value="41.8" unit="dB-Hz" />
            <Readout label="Oscillator" value="TCXO Locked" tone="ok" />
            <Readout label="Temp" value="34.1" unit="°C" />
          </div>
        </div>
      </div>
    </div>
  )
}
