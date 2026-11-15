# Trixanth ground station

Local-network control, mapping and telemetry for the rover. Runs entirely on the
Jetson and whatever laptop is on the same network. No cloud dependency.

```
launch_manager/          FastAPI service supervising `ros2 launch` subprocesses
frontend/
  src/config.js          every topic, service, host and limit — edit this first
  src/ros.js             rosbridge layer: subscribe, publish, call, discover
  src/api.js             launch manager client
  src/mock/mockRos.js    simulated rover, demo mode only
  src/panels/            HeaderBar, LaunchPanel, MissionPanel, Stage, MapView,
                         CameraView, TelemetryPanel, TeleopPanel,
                         DiagnosticsPanel, ConsolePanel
```

## Try it before anything exists

Demo mode drives every panel from a simulated rover — no rosbridge, no packages,
no hardware. Useful for laying out the UI and for showing judges what the ground
station does when the rover is in pieces on a table.

```bash
cd frontend
npm install
npm run dev -- --host
# then open http://localhost:5173/?demo=1
```

The demo toggle is in the header. A hatched amber banner stays on screen the
whole time it's active so nobody mistakes simulated telemetry for the real rover.

## Running against the rover

On the Jetson:

```bash
ros2 launch trixanth_dashboard_bridge dashboard.launch.py   # rosbridge :9090, web_video_server :8080

# launch manager — start it from a shell WITHOUT the workspace sourced;
# it sources ROS itself for each child, so it also works from systemd
cd launch_manager
pip install -r requirements.txt
TRIXANTH_WS=~/trixanth_ws uvicorn main:app --host 0.0.0.0 --port 8000
```

From the laptop:

```bash
cd frontend
echo "VITE_ROVER_HOST=192.168.1.42" > .env.local    # skip if served from the Jetson
npm run build && npx vite preview --host
```

## What each panel does

**Launches** — start/stop every launch file, with state, uptime, exit code and a
streamed stdout tail. Launches sharing a `group` key can't run at once, so you
can't end up with two Nav2 stacks fighting over `/cmd_vel`.

**Mission** — FSM state with time-in-state, a transition history, the waypoint
leg list with progress, and one-click mission starts.

**View** — one source at a time, because several full-rate MJPEG feeds will
saturate a field link and starve the telemetry you actually need.
- *Map*: occupancy grid, live pose, global plan, waypoint legs. Click anywhere to
  send a `/goal_pose`, drag to pan, scroll to zoom, plus a costmap clear button.
- *Cameras*: auto-discovered through `/rosapi/topics`, with adjustable width and
  JPEG quality and a canvas overlay drawing YOLO boxes.

**Telemetry** — pose, speed, yaw rate, heading dial, battery volts/charge/draw/
temperature with threshold colouring, GPS fix type and horizontal sigma.

**Teleop** — hold-to-drive pad plus WASD. There is no latching mode: release the
pad or the key and it publishes zero on the next tick, so a dropped link stops
the rover instead of leaving the last command running.

**Diagnostics** — `/diagnostics_agg` grouped by level, expandable to the
key-value pairs, filterable to problems only.

**Console** — `/rosout` with level filter, text filter, pause and autoscroll.

## Before the field trial

Confirm every name in `src/config.js` against `trixanth_msgs`. These are
currently guesses: `/diagnostics_agg`, `/mission_fsm/state`, `/yolo/detections`,
`/waypoint_manager/legs`, `/trixanth_safety/soft_stop`.

`config.detectionSourceSize` must match the resolution the YOLO node runs at.
Boxes arrive in source-image pixels and get scaled to the displayed frame; if
this is wrong every box is offset and you'll blame the detector.

The leg list is read as a JSON string on a `std_msgs/String` topic
(`{"legs":[{"id":1,"label":"...","kind":"gnss","x":0,"y":0}],"active":0}`).
Swap it for a proper message in `trixanth_msgs` when you have one — only
`parseLegs` in `MapView.jsx` and `MissionPanel.jsx` needs to change.

Nothing in the current package tree publishes `/diagnostics`. Until a node does,
that panel stays empty.

## The stop button

The red button is a **soft stop**: a service call over WiFi. It fails in exactly
the situation where you most need a stop — link drop, or the Jetson pegged at
100% CPU. It's a convenience, not a safety device, and the UI never calls it an
e-stop.

The real e-stop is a hardware latching cutoff on the motor power path, plus a
heartbeat watchdog on the Teensy that kills drive output when it hasn't heard
from the Jetson for ~200 ms. Neither exists yet. Don't let the rover move under
its own power until both do.

## Implementation notes

- **Process groups.** Children start with `start_new_session=True` and are
  signalled with `killpg`; without that, stopping a launch orphans its nodes and
  the next start collides with the survivors.
- **SIGINT before SIGTERM.** `ros2 launch` treats SIGINT as a clean shutdown and
  runs node `on_shutdown` handlers. Escalation to SIGTERM then SIGKILL is
  automatic after 8 s.
- **Canvas over React for anything at rate.** The map and detection overlay
  subscribe through `useTopicCallback`, which writes to a ref and draws in a
  `requestAnimationFrame` loop. Nothing at 20 Hz goes through React state.
- **The occupancy grid is rendered once** into an offscreen canvas and blitted
  per frame, so pan and zoom stay smooth on a 260×260 grid.
- `npm run build` is clean; the demo path has a jsdom smoke test behind it.
