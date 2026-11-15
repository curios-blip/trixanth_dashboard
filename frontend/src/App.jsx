import { useState } from 'react'
import { DEMO } from './config'
import HeaderBar from './panels/HeaderBar'
import LaunchPanel from './panels/LaunchPanel'
import Stage from './panels/Stage'
import ConsolePanel from './panels/ConsolePanel'
import RightSideLogsDock from './panels/RightSideLogsDock'
import { useKeyboardTeleop } from './hooks/useKeyboardTeleop'

const DEFAULT_SIDEBAR_WIDTH = 210
const COMPRESSED_SIDEBAR_WIDTH = 48
const MIN_SIDEBAR_WIDTH = 64
const MAX_SIDEBAR_WIDTH = 480

export default function App() {
  const [stopped, setStopped] = useState(false)
  const [activeSubsystem, setActiveSubsystem] = useState('general')
  const [currentStageView, setCurrentStageView] = useState('operations')
  const [isLaunchMinimized, setIsLaunchMinimized] = useState(false)

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('trixanth_sidebar_width')
      if (saved) return Math.min(Math.max(MIN_SIDEBAR_WIDTH, parseInt(saved, 10)), MAX_SIDEBAR_WIDTH)
    } catch {}
    return DEFAULT_SIDEBAR_WIDTH
  })
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)

  // Panel maximization: Takes up the entire screen
  const [isPanelMaximized, setIsPanelMaximized] = useState(false)

  const drivingActive = useKeyboardTeleop(stopped === true)

  const handleSelectSubsystem = (subId) => {
    setActiveSubsystem(subId)
    setCurrentStageView('operations')
  }

  // Edge drag handler: moving edge left reduces sidebar width, increasing panel view!
  const handleResizerMouseDown = (e) => {
    e.preventDefault()
    setIsResizingSidebar(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const mainEl = document.querySelector('main')
    const containerLeft = mainEl ? mainEl.getBoundingClientRect().left : 0

    const onMouseMove = (moveEvent) => {
      const targetWidth = moveEvent.clientX - containerLeft
      const newWidth = Math.min(Math.max(MIN_SIDEBAR_WIDTH, targetWidth), MAX_SIDEBAR_WIDTH)
      setSidebarWidth(newWidth)
      try {
        localStorage.setItem('trixanth_sidebar_width', newWidth.toString())
      } catch {}
    }

    const onMouseUp = () => {
      setIsResizingSidebar(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div className={`app ${isResizingSidebar ? 'sidebar-dragging' : ''} ${isPanelMaximized ? 'panel-maximized-fullscreen' : ''}`}>
      {DEMO && (
        <div className="demo-banner">
          Demo mode — every reading on this page is simulated. Not connected to a rover.
        </div>
      )}

      {/* Header hidden when panel is taking up the entire screen */}
      {!isPanelMaximized && (
        <HeaderBar
          stopped={stopped}
          setStopped={setStopped}
          drivingActive={drivingActive}
        />
      )}

      <main
        className={`${isLaunchMinimized ? 'launch-minimized-layout' : ''} ${isPanelMaximized ? 'main-fullscreen' : ''}`}
        style={
          !isPanelMaximized
            ? {
                gridTemplateColumns: `${isLaunchMinimized ? COMPRESSED_SIDEBAR_WIDTH : sidebarWidth}px ${isLaunchMinimized ? '4px' : '8px'} minmax(0, 1fr)`,
              }
            : undefined
        }
      >
        {/* LAUNCHES SIDEBAR (Compressed to 48px rail when viewed using icons) */}
        {!isPanelMaximized && (
          <div
            className={`col left ${isLaunchMinimized ? 'col-minimized' : ''}`}
            style={{ width: `${isLaunchMinimized ? COMPRESSED_SIDEBAR_WIDTH : sidebarWidth}px` }}
          >
            <LaunchPanel
              activeSubsystem={activeSubsystem}
              onSelectSubsystem={handleSelectSubsystem}
              isMinimized={isLaunchMinimized}
              onToggleMinimize={setIsLaunchMinimized}
            />
          </div>
        )}

        {/* DRAGGABLE RESIZER HANDLE: Dragging edge resizes sidebar & panel view */}
        {!isPanelMaximized && !isLaunchMinimized && (
          <div
            className={`sidebar-resizer ${isResizingSidebar ? 'resizing' : ''}`}
            onMouseDown={handleResizerMouseDown}
            onDoubleClick={() => {
              setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
              try {
                localStorage.setItem('trixanth_sidebar_width', DEFAULT_SIDEBAR_WIDTH.toString())
              } catch {}
            }}
            title="Drag edge to resize sidebar and panel view (double-click to reset)"
          >
            <div className="resizer-handle-line" />
          </div>
        )}
        {!isPanelMaximized && isLaunchMinimized && (
          <div className="sidebar-resizer-collapsed" />
        )}

        {/* CENTRE PANEL VIEW IN FULLSCREEN: Main Operations Deck on left, Constant Logs Dock on right */}
        {isPanelMaximized ? (
          <div className="fullscreen-unified-container">
            {/* MAIN OPERATIONS VIEWPORT (Fully visible, scrollable, 100% vertical headroom) */}
            <div className="fullscreen-stage-viewport">
              <Stage
                activeSubsystem={activeSubsystem}
                onSelectSubsystem={handleSelectSubsystem}
                currentView={currentStageView}
                onViewChange={setCurrentStageView}
                isMaximized={true}
                onToggleMaximize={setIsPanelMaximized}
                hideInlineLogs={true}
              />
            </div>

            {/* DEDICATED CONSTANT RIGHT-SIDE LOGS DOCK (Stays in one place across all windows!) */}
            <RightSideLogsDock
              activeSubsystem={activeSubsystem}
              onSelectSubsystem={handleSelectSubsystem}
            />
          </div>
        ) : (
          <div className="col centre">
            <Stage
              activeSubsystem={activeSubsystem}
              onSelectSubsystem={handleSelectSubsystem}
              currentView={currentStageView}
              onViewChange={setCurrentStageView}
              isMaximized={false}
              onToggleMaximize={setIsPanelMaximized}
              hideInlineLogs={false}
            />

            {/* DUAL CONSOLE & PROCESS LOGS (Scrollable, accessible) */}
            <ConsolePanel activeSubsystem={activeSubsystem} />
          </div>
        )}
      </main>
    </div>
  )
}
