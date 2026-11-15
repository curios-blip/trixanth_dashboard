"""
Trixanth launch manager.

Wraps `ros2 launch` invocations as supervised subprocesses and exposes them over
REST + WebSocket so the web dashboard can start/stop them and tail their output.

Run it on the Jetson, NOT from a shell that already has the workspace sourced --
each child re-sources the environment itself so the manager can be started from
systemd with an empty environment.

    uvicorn main:app --host 0.0.0.0 --port 8000

Environment:
    ROS_DISTRO     (default: jazzy)
    TRIXANTH_WS    (default: ~/trixanth_ws)
"""

import asyncio
import os
import signal
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

ROS_DISTRO = os.environ.get("ROS_DISTRO", "jazzy")
WS_PATH = os.environ.get("TRIXANTH_WS", os.path.expanduser("~/trixanth_ws"))
LOG_BUFFER_LINES = 500
SHUTDOWN_GRACE_S = 8.0


# --------------------------------------------------------------------------
# What the dashboard is allowed to launch.
#
# `group` is a mutual-exclusion key: two launches in the same non-empty group
# can never run at the same time. Without this you can bring up two Nav2 stacks
# that both publish /cmd_vel, which is a genuinely dangerous failure mode.
# --------------------------------------------------------------------------
@dataclass(frozen=True)
class LaunchSpec:
    package: str
    launch_file: str
    label: str
    group: str = ""
    args: tuple = ()


LAUNCHES: dict[str, LaunchSpec] = {
    "hardware": LaunchSpec(
        "trixanth_bringup", "hardware.launch.py", "Hardware + localization"
    ),
    "perception": LaunchSpec(
        "trixanth_bringup", "perception.launch.py", "Perception"
    ),
    "navigation": LaunchSpec(
        "trixanth_bringup", "navigation.launch.py", "Navigation", group="nav"
    ),
    "manipulation": LaunchSpec(
        "trixanth_bringup", "manipulation.launch.py", "Manipulation"
    ),
    "science": LaunchSpec("trixanth_bringup", "science.launch.py", "Science"),
    "mission_rado": LaunchSpec(
        "trixanth_bringup", "mission_rado.launch.py", "Mission: RADO", group="nav"
    ),
    "mission_abex": LaunchSpec(
        "trixanth_bringup", "mission_abex.launch.py", "Mission: ABEx", group="nav"
    ),
    "mission_idmo": LaunchSpec(
        "trixanth_bringup", "mission_idmo.launch.py", "Mission: IDMO", group="nav"
    ),
    "full_system": LaunchSpec(
        "trixanth_bringup", "full_system.launch.py", "Full system", group="nav"
    ),
}


def build_command(spec: LaunchSpec, args: list[str]) -> list[str]:
    """Source the ROS environment inside the child, then exec ros2 launch.

    `exec` matters: without it bash stays as an extra layer between us and the
    launch process and the PID we hold isn't the one we need to signal.
    """
    quoted = " ".join(f"'{a}'" for a in [*spec.args, *args])
    inner = (
        f"source /opt/ros/{ROS_DISTRO}/setup.bash && "
        f"source '{WS_PATH}/install/setup.bash' && "
        f"exec ros2 launch {spec.package} {spec.launch_file} {quoted}"
    )
    return ["/bin/bash", "-c", inner]


@dataclass
class ManagedLaunch:
    name: str
    spec: LaunchSpec
    proc: Optional[asyncio.subprocess.Process] = None
    started_at: Optional[float] = None
    exit_code: Optional[int] = None
    stopping: bool = False
    log: deque = field(default_factory=lambda: deque(maxlen=LOG_BUFFER_LINES))
    subscribers: set = field(default_factory=set)

    @property
    def state(self) -> str:
        if self.proc is not None and self.proc.returncode is None:
            return "stopping" if self.stopping else "running"
        if self.exit_code in (None, 0, -signal.SIGINT, -signal.SIGTERM):
            return "stopped"
        return "crashed"

    def emit(self, line: str) -> None:
        stamped = f"{time.strftime('%H:%M:%S')} {line}"
        self.log.append(stamped)
        for q in list(self.subscribers):
            try:
                q.put_nowait(stamped)
            except asyncio.QueueFull:
                pass

    def status(self) -> dict:
        return {
            "name": self.name,
            "label": self.spec.label,
            "group": self.spec.group,
            "state": self.state,
            "pid": self.proc.pid if self.proc and self.proc.returncode is None else None,
            "uptime_s": round(time.time() - self.started_at, 1)
            if self.started_at and self.state in ("running", "stopping")
            else None,
            "exit_code": self.exit_code,
        }


MANAGED = {name: ManagedLaunch(name, spec) for name, spec in LAUNCHES.items()}

app = FastAPI(title="Trixanth launch manager")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local network only; do not expose this port publicly
    allow_methods=["*"],
    allow_headers=["*"],
)


async def pump_output(ml: ManagedLaunch) -> None:
    assert ml.proc and ml.proc.stdout
    async for raw in ml.proc.stdout:
        ml.emit(raw.decode(errors="replace").rstrip())
    await ml.proc.wait()
    ml.exit_code = ml.proc.returncode
    ml.stopping = False
    ml.emit(f"-- exited with code {ml.exit_code} --")


@app.get("/api/launches")
async def list_launches():
    return [ml.status() for ml in MANAGED.values()]


@app.post("/api/launches/{name}/start")
async def start(name: str, args: Optional[list[str]] = None):
    ml = MANAGED.get(name)
    if ml is None:
        raise HTTPException(404, f"unknown launch '{name}'")
    if ml.state in ("running", "stopping"):
        raise HTTPException(409, f"'{name}' is already {ml.state}")

    if ml.spec.group:
        for other in MANAGED.values():
            if (
                other.name != name
                and other.spec.group == ml.spec.group
                and other.state in ("running", "stopping")
            ):
                raise HTTPException(
                    409,
                    f"'{other.name}' is {other.state} and conflicts with '{name}' "
                    f"(group '{ml.spec.group}'). Stop it first.",
                )

    cmd = build_command(ml.spec, args or [])
    ml.log.clear()
    ml.exit_code = None
    ml.emit(f"-- starting: ros2 launch {ml.spec.package} {ml.spec.launch_file} --")
    ml.proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        start_new_session=True,  # own process group, so we can kill the whole tree
    )
    ml.started_at = time.time()
    asyncio.create_task(pump_output(ml))
    return ml.status()


async def signal_group(ml: ManagedLaunch, sig: int) -> None:
    if ml.proc is None or ml.proc.returncode is not None:
        return
    try:
        os.killpg(os.getpgid(ml.proc.pid), sig)
    except ProcessLookupError:
        pass


@app.post("/api/launches/{name}/stop")
async def stop(name: str):
    ml = MANAGED.get(name)
    if ml is None:
        raise HTTPException(404, f"unknown launch '{name}'")
    if ml.state not in ("running", "stopping"):
        raise HTTPException(409, f"'{name}' is not running")

    ml.stopping = True
    # SIGINT first: ros2 launch treats it as a clean shutdown and gives nodes
    # their on_shutdown handlers. Escalate only if it ignores us.
    await signal_group(ml, signal.SIGINT)
    for _ in range(int(SHUTDOWN_GRACE_S * 10)):
        if ml.proc.returncode is not None:
            return ml.status()
        await asyncio.sleep(0.1)
    ml.emit("-- did not exit on SIGINT, sending SIGTERM --")
    await signal_group(ml, signal.SIGTERM)
    await asyncio.sleep(2.0)
    if ml.proc.returncode is None:
        ml.emit("-- did not exit on SIGTERM, sending SIGKILL --")
        await signal_group(ml, signal.SIGKILL)
    return ml.status()


@app.post("/api/stop_all")
async def stop_all():
    for ml in MANAGED.values():
        if ml.state == "running":
            await stop(ml.name)
    return [ml.status() for ml in MANAGED.values()]


@app.websocket("/ws/logs/{name}")
async def logs(ws: WebSocket, name: str):
    ml = MANAGED.get(name)
    if ml is None:
        await ws.close(code=4404)
        return
    await ws.accept()
    q: asyncio.Queue = asyncio.Queue(maxsize=1000)
    ml.subscribers.add(q)
    try:
        for line in list(ml.log):
            await ws.send_text(line)
        while True:
            await ws.send_text(await q.get())
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        ml.subscribers.discard(q)


@app.on_event("shutdown")
async def cleanup():
    for ml in MANAGED.values():
        await signal_group(ml, signal.SIGINT)
