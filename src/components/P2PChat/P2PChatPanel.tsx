import { useEffect, useState } from 'react'
import { Circle, Plus, Hash, Users, RefreshCw, LogIn } from 'lucide-react'
import { useP2PChatStore } from '../../stores/p2pChatStore'
import { getUserProfile } from '../../api/client'
import { useTranslation } from 'react-i18next'
import P2PChatMessageArea from './P2PChatMessageArea'

export default function P2PChatPanel() {
  const { t } = useTranslation()
  const {
    connected, connecting, username, rooms, activeRoomId, users,
    setUsername, connect, disconnect, switchRoom, requestRooms, createRoom,
  } = useP2PChatStore()

  const [newRoomName, setNewRoomName] = useState('')
  const [showNewRoom, setShowNewRoom] = useState(false)
  const [manualName, setManualName] = useState('')
  const [needsName, setNeedsName] = useState(false)

  // Load username from profile on mount and auto-connect
  useEffect(() => {
    const init = async () => {
      try {
        const profile = await getUserProfile()
        if (profile.exists && profile.content) {
          const parsed = JSON.parse(profile.content)
          if (parsed.name) {
            setUsername(parsed.name)
            return
          }
        }
      } catch { /* ignore */ }
      // No profile name — ask user
      setNeedsName(true)
    }
    if (!username) {
      init()
    }
  }, [])

  // Auto-connect once username is set
  useEffect(() => {
    if (username && !connected && !connecting) {
      connect()
    }
  }, [username])

  // Fetch rooms when connected
  useEffect(() => {
    if (connected) {
      requestRooms()
    }
  }, [connected])

  const handleSetName = () => {
    if (!manualName.trim()) return
    setUsername(manualName.trim())
    setNeedsName(false)
  }

  const handleCreateRoom = () => {
    if (!newRoomName.trim()) return
    createRoom(newRoomName)
    setNewRoomName('')
    setShowNewRoom(false)
  }

  // Username input screen
  if (needsName) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-80 space-y-4">
          <div className="text-center">
            <Users size={32} className="text-angel-400 mx-auto mb-2" />
            <h2 className="text-lg font-semibold text-slate-200">{t('p2pchat.title')}</h2>
            <p className="text-xs text-slate-400 mt-1">{t('p2pchat.setUsername')}</p>
          </div>
          <input
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetName()}
            placeholder={t('p2pchat.username')}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-angel-500"
            autoFocus
          />
          <button
            onClick={handleSetName}
            disabled={!manualName.trim()}
            className="w-full py-2 bg-angel-600 hover:bg-angel-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <LogIn size={14} className="inline mr-1.5" />
            {t('p2pchat.join')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 text-xs">
          <Circle
            size={8}
            className={connected ? 'fill-green-500 text-green-500' : connecting ? 'fill-amber-500 text-amber-500' : 'fill-red-500 text-red-500'}
          />
          <span className="text-slate-400">
            {connected
              ? t('p2pchat.connected')
              : connecting
                ? t('p2pchat.reconnecting')
                : t('p2pchat.disconnected')}
          </span>
          {connected && (
            <span className="text-slate-500">
              ({users.length} {t('p2pchat.onlineUsers')})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{username}</span>
          {connected && (
            <button
              onClick={requestRooms}
              className="p-1 rounded hover:bg-slate-800 transition-colors"
              title="Refresh rooms"
            >
              <RefreshCw size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — rooms + users */}
        <div className="w-48 border-r border-slate-800 flex flex-col shrink-0">
          {/* Room list */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-2 space-y-0.5">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('p2pchat.rooms')}</span>
                <button
                  onClick={() => setShowNewRoom(!showNewRoom)}
                  className="p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <Plus size={12} />
                </button>
              </div>

              {showNewRoom && (
                <div className="flex gap-1 px-1 pb-1">
                  <input
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                    placeholder={t('p2pchat.roomName')}
                    className="flex-1 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-angel-500"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateRoom}
                    disabled={!newRoomName.trim()}
                    className="px-1.5 py-0.5 bg-angel-600 text-white text-xs rounded disabled:opacity-50"
                  >
                    OK
                  </button>
                </div>
              )}

              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => switchRoom(room.id)}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
                    activeRoomId === room.id
                      ? 'bg-angel-600/20 text-angel-400'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Hash size={12} />
                  <span className="truncate">{room.name}</span>
                  <span className="ml-auto text-[10px] text-slate-600">{room.user_count}</span>
                </button>
              ))}

              {rooms.length === 0 && connected && (
                <div className="text-[10px] text-slate-600 text-center py-2">
                  {t('p2pchat.rooms')}...
                </div>
              )}
            </div>
          </div>

          {/* Online users */}
          <div className="border-t border-slate-800 p-2">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 mb-1">
              {t('p2pchat.onlineUsers')} ({users.length})
            </div>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {users.map((u) => (
                <div key={u} className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-slate-400">
                  <Circle size={6} className="fill-green-500 text-green-500 shrink-0" />
                  <span className={`truncate ${u === username ? 'text-angel-400 font-medium' : ''}`}>
                    {u}
                    {u === username ? ` (${t('p2pchat.you')})` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — messages */}
        <P2PChatMessageArea />
      </div>
    </div>
  )
}
