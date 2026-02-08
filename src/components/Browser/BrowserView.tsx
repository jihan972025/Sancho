import { useState, useEffect, useRef } from 'react'
import { Play, Square, Globe, Camera, RefreshCw } from 'lucide-react'
import ScreenshotView from './ScreenshotView'
import { useAgentStore } from '../../stores/agentStore'
import {
  startBrowser,
  closeBrowser,
  navigateBrowser,
  takeScreenshot,
  runBrowserAgent,
  stopBrowserAgent,
  getBrowserAgentStatus,
} from '../../api/client'

export default function BrowserView() {
  const [url, setUrl] = useState('https://www.google.com')
  const [task, setTask] = useState('')
  const [browserStarted, setBrowserStarted] = useState(false)
  const [loading, setLoading] = useState(false)
  const { browserAgent, lastScreenshot, setBrowserState, setScreenshot } = useAgentStore()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const handleStartBrowser = async () => {
    setLoading(true)
    try {
      await startBrowser()
      setBrowserStarted(true)
    } catch (err: any) {
      alert(err.message)
    }
    setLoading(false)
  }

  const handleCloseBrowser = async () => {
    try {
      if (pollRef.current) clearInterval(pollRef.current)
      await closeBrowser()
      setBrowserStarted(false)
      setScreenshot(null)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleNavigate = async () => {
    if (!url.trim()) return
    setLoading(true)
    try {
      await navigateBrowser(url)
      const { image } = await takeScreenshot()
      setScreenshot(image)
    } catch (err: any) {
      alert(err.message)
    }
    setLoading(false)
  }

  const handleScreenshot = async () => {
    try {
      const { image } = await takeScreenshot()
      setScreenshot(image)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleRunAgent = async () => {
    if (!task.trim()) return
    try {
      await runBrowserAgent(task)
      setBrowserState({ status: 'running', task })
      // Start polling for status
      pollRef.current = setInterval(async () => {
        try {
          const status = await getBrowserAgentStatus()
          setBrowserState(status)
          if (status.status !== 'running') {
            if (pollRef.current) clearInterval(pollRef.current)
            // Take final screenshot
            try {
              const { image } = await takeScreenshot()
              setScreenshot(image)
            } catch {
              // Browser might be closed
            }
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current)
        }
      }, 2000)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleStopAgent = async () => {
    try {
      await stopBrowserAgent()
      if (pollRef.current) clearInterval(pollRef.current)
    } catch (err: any) {
      alert(err.message)
    }
  }

  const isRunning = browserAgent.status === 'running'

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {!browserStarted ? (
          <button
            onClick={handleStartBrowser}
            disabled={loading}
            className="flex items-center gap-2 bg-angel-600 hover:bg-angel-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
          >
            <Globe size={16} />
            Start Browser
          </button>
        ) : (
          <>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
              placeholder="https://..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500"
            />
            <button
              onClick={handleNavigate}
              disabled={loading}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300"
              title="Navigate"
            >
              <Globe size={16} />
            </button>
            <button
              onClick={handleScreenshot}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300"
              title="Screenshot"
            >
              <Camera size={16} />
            </button>
            <button
              onClick={handleCloseBrowser}
              className="p-2 bg-red-600/20 hover:bg-red-600/30 rounded-lg text-red-400"
              title="Close browser"
            >
              <Square size={16} />
            </button>
          </>
        )}
      </div>

      {/* Agent task */}
      {browserStarted && (
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isRunning && handleRunAgent()}
            placeholder="Describe a task (e.g., Search for weather on Naver)"
            disabled={isRunning}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-angel-500 disabled:opacity-50"
          />
          {isRunning ? (
            <button
              onClick={handleStopAgent}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              <Square size={16} />
              Stop
            </button>
          ) : (
            <button
              onClick={handleRunAgent}
              disabled={!task.trim()}
              className="flex items-center gap-2 bg-angel-600 hover:bg-angel-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
            >
              <Play size={16} />
              Run
            </button>
          )}
        </div>
      )}

      {/* Status bar */}
      {browserAgent.status !== 'idle' && (
        <div className="bg-slate-800 rounded-lg px-4 py-2 text-sm shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`w-2 h-2 rounded-full ${
                isRunning ? 'bg-green-500 animate-pulse' : browserAgent.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
              }`}
            />
            <span className="text-slate-300 capitalize">{browserAgent.status}</span>
            {isRunning && (
              <span className="text-slate-500">
                Step {browserAgent.current_step}/{browserAgent.max_steps}
              </span>
            )}
          </div>
          {browserAgent.last_thought && (
            <p className="text-slate-400 text-xs">{browserAgent.last_thought}</p>
          )}
          {browserAgent.result && (
            <p className="text-angel-400 text-xs mt-1">{browserAgent.result}</p>
          )}
          {browserAgent.error && (
            <p className="text-red-400 text-xs mt-1">{browserAgent.error}</p>
          )}
        </div>
      )}

      {/* Screenshot */}
      <div className="flex-1 min-h-0">
        <ScreenshotView screenshot={lastScreenshot} />
      </div>
    </div>
  )
}
