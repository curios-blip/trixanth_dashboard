import { useState } from 'react'
import { config } from '../config'
import { useTopic } from '../ros'
import { Readout, fmt, Chip } from '../components/ui'

const BANDS = ['UHF 433 MHz', 'S-Band 2.45 GHz', 'X-Band 8.4 GHz']
const MODES = ['BEACON_FOLLOW', 'SATELLITE_TRACK', 'MANUAL_AIM']

export default function RADOSection() {
  const [band, setBand] = useState('S-Band 2.45 GHz')
  const [mode, setMode] = useState('BEACON_FOLLOW')
  const [azimuthOverride, setAzimuthOverride] = useState(null)
  const [elevationOverride, setElevationOverride] = useState(null)
  const [txPower, setTxPower] = useState(25)
  const [actionFeedback, setActionFeedback] = useState(null)

  const rado = useTopic(config.topics.radoSensors, { throttle: 200 })

  const liveAzimuth = azimuthOverride ?? (rado?.dish?.azimuth_deg ?? 148.5)
  const liveElevation = elevationOverride ?? (rado?.dish?.elevation_deg ?? 34.2)
  const rssi = rado?.rf?.rssi_dbm ?? -68
  const snr = rado?.rf?.snr_db ?? 26.4
  const vswr = rado?.rf?.vswr ?? 1.18

  const jogDish = (axis, delta) => {
    if (axis === 'az') {
      const next = (liveAzimuth + delta + 360) % 360
      setAzimuthOverride(next)
      setActionFeedback(`Dish Azimuth Jogged to ${next.toFixed(1)}°`)
    } else {
      const next = Math.max(0, Math.min(90, liveElevation + delta))
      setElevationOverride(next)
      setActionFeedback(`Dish Elevation Jogged to ${next.toFixed(1)}°`)
    }
    setTimeout(() => setActionFeedback(null), 3000)
  }

  const stowDish = () => {
    setAzimuthOverride(0)
    setElevationOverride(0)
    setActionFeedback('Antenna Dish Stowed in Transit Lock (0°, 0°)')
    setTimeout(() => setActionFeedback(null), 4000)
  }

  const alignToBase = () => {
    setAzimuthOverride(180)
    setElevationOverride(45)
    setActionFeedback('Antenna Re-aligned to Base Station Beacon (180°, 45°)')
    setTimeout(() => setActionFeedback(null), 4000)
  }

  return (
    <div className="dedicated-section-container rado-section">
      <div className="section-head-bar">
        <div className="section-title-wrap">
          <h2>RADO Array — Radio Astronomy & Long-Range Comms</h2>
          <span className="mono badge ok">LOCK ACTIVE · S-BAND</span>
        </div>
        <div className="section-actions">
          {actionFeedback && <span className="calib-feedback mono">{actionFeedback}</span>}
          <button type="button" className="ops-btn" onClick={alignToBase}>
            Aim Base Beacon
          </button>
          <button type="button" className="ops-btn" onClick={stowDish}>
            Stow Dish
          </button>
        </div>
      </div>

      <div className="rado-grid">
        {/* DISH AZIMUTH / ELEVATION POSITIONING & CONTROL */}
        <div className="tel-card dish-control-card">
          <div className="tel-card-head">
            <h3>Antenna Dish Gimbal & Aiming</h3>
            <span className="mono badge ok">DUAL SERVO ACTIVE</span>
          </div>

          <div className="dish-visualization-wrap">
            {/* Azimuth Compass Dial */}
            <div className="azimuth-compass">
              <span className="compass-mark n">N</span>
              <span className="compass-mark e">E</span>
              <span className="compass-mark s">S</span>
              <span className="compass-mark w">W</span>
              <div
                className="dish-azimuth-needle"
                style={{ transform: `rotate(${liveAzimuth}deg)` }}
              >
                <div className="needle-head" />
                <div className="needle-dish-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 10a10 10 0 0 1 10-10" />
                    <line x1="4" y1="20" x2="9" y2="15" />
                    <path d="M2 22l6-6" />
                  </svg>
                </div>
              </div>
              <div className="compass-center mono">{liveAzimuth.toFixed(1)}°</div>
            </div>

            {/* Elevation Arc Meter */}
            <div className="elevation-meter">
              <div className="elevation-arc-track">
                <div
                  className="elevation-arc-indicator"
                  style={{
                    transform: `rotate(${-45 + (liveElevation / 90) * 90}deg)`,
                  }}
                />
              </div>
              <div className="elevation-readout mono">
                <span className="el-label">ELEVATION</span>
                <span className="el-val">{liveElevation.toFixed(1)}°</span>
              </div>
            </div>
          </div>

          {/* Servo Jog Controls */}
          <div className="dish-jog-controls">
            <span className="jog-title">Gimbal Authority Jog:</span>
            <div className="jog-btn-group">
              <button type="button" className="jog-btn" onClick={() => jogDish('az', -5)}>
                Az -5°
              </button>
              <button type="button" className="jog-btn" onClick={() => jogDish('az', +5)}>
                Az +5°
              </button>
              <button type="button" className="jog-btn" onClick={() => jogDish('el', -5)}>
                El -5°
              </button>
              <button type="button" className="jog-btn" onClick={() => jogDish('el', +5)}>
                El +5°
              </button>
            </div>
          </div>

          <div className="tel-card-stats">
            <Readout label="Azimuth" value={liveAzimuth.toFixed(1)} unit="°" tone="ok" />
            <Readout label="Elevation" value={liveElevation.toFixed(1)} unit="°" tone="ok" />
            <Readout label="Servo Current" value="1.6" unit="A" />
            <Readout label="Backlash" value="0.04" unit="°" />
          </div>
        </div>

        {/* RF SPECTRUM WATERFALL & SIGNAL METRICS */}
        <div className="tel-card rf-spectrum-card">
          <div className="tel-card-head">
            <h3>RF Spectrum & Signal Analysis</h3>
            <span className="mono badge ok">SNR {snr.toFixed(1)} dB</span>
          </div>

          {/* Animated RF Waterfall Graphic */}
          <div className="waterfall-canvas-wrap">
            <div className="spectrum-bars-row">
              {Array.from({ length: 28 }).map((_, i) => {
                const distFromCenter = Math.abs(i - 14)
                const heightPct = Math.max(
                  15,
                  Math.min(95, 90 - distFromCenter * 5 + Math.sin(i * 1.5) * 12)
                )
                return (
                  <div key={i} className="spectrum-bar-col">
                    <div
                      className={`spectrum-bar-fill ${distFromCenter < 3 ? 'carrier' : ''}`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="spectrum-axis-labels mono">
              <span>2.440 GHz</span>
              <span className="peak-marker">▲ CARRIER 2.450 GHz</span>
              <span>2.460 GHz</span>
            </div>
          </div>

          <div className="tel-metrics-list">
            <div className="metric-row">
              <span className="label">RSSI Signal Strength</span>
              <span className="val mono ok">{rssi} dBm (Nominal &gt; -85dBm)</span>
            </div>
            <div className="metric-row">
              <span className="label">Signal-to-Noise Ratio (SNR)</span>
              <span className="val mono ok">{snr.toFixed(1)} dB</span>
            </div>
            <div className="metric-row">
              <span className="label">VSWR (Impedance Match)</span>
              <span className="val mono ok">{vswr.toFixed(2)}:1 (&lt; 1.3:1)</span>
            </div>
            <div className="metric-row">
              <span className="label">Bit Error Rate (BER)</span>
              <span className="val mono">1.2 × 10⁻⁶</span>
            </div>
          </div>

          <div className="tel-card-stats">
            <Readout label="RSSI" value={String(rssi)} unit="dBm" tone="ok" />
            <Readout label="SNR" value={snr.toFixed(1)} unit="dB" tone="ok" />
            <Readout label="Link Bitrate" value="4.8" unit="Mbps" />
            <Readout label="VSWR" value={vswr.toFixed(2)} unit=":1" />
          </div>
        </div>

        {/* FREQUENCY BAND & RF POWER CONTROL */}
        <div className="tel-card rf-config-card">
          <div className="tel-card-head">
            <h3>RF Transceiver & Power Configuration</h3>
            <span className="mono badge ok">{band}</span>
          </div>

          <div className="rf-config-group">
            <label className="config-label">Active Frequency Band:</label>
            <div className="chip-row">
              {BANDS.map((b) => (
                <Chip key={b} active={band === b} onClick={() => setBand(b)}>
                  {b}
                </Chip>
              ))}
            </div>
          </div>

          <div className="rf-config-group">
            <label className="config-label">Tracking Mode:</label>
            <div className="chip-row">
              {MODES.map((m) => (
                <Chip key={m} active={mode === m} onClick={() => setMode(m)}>
                  {m.replace('_', ' ')}
                </Chip>
              ))}
            </div>
          </div>

          <div className="rf-config-group">
            <label className="config-label">
              Transmit RF Power: <span className="mono ok">{txPower} Watts</span>
            </label>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={txPower}
              onChange={(e) => setTxPower(Number(e.target.value))}
              className="power-slider"
            />
          </div>

          <div className="tel-card-stats">
            <Readout label="TX Power" value={String(txPower)} unit="W" />
            <Readout label="Reflected" value={(txPower * 0.04).toFixed(1)} unit="W" />
            <Readout label="PA Temp" value="42.3" unit="°C" />
            <Readout label="Mesh Hops" value="Direct" tone="ok" />
          </div>
        </div>
      </div>
    </div>
  )
}
