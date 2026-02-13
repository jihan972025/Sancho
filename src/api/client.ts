const BASE_URL = 'http://127.0.0.1:8765'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// Chat API
export async function sendMessageStream(
  messages: { role: string; content: string }[],
  model: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  onSkillStart?: (skill: string) => void,
  onSkillResult?: (skill: string) => void,
  onThinking?: (content: string) => void,
  conversationId?: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/chat/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model,
      stream: true,
      conversation_id: conversationId,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    onError(err.detail || `HTTP ${res.status}`)
    return
  }

  const reader = res.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const data = JSON.parse(line.slice(6))
        if (data.type === 'token') onToken(data.content)
        else if (data.type === 'done') onDone()
        else if (data.type === 'error') onError(data.content)
        else if (data.type === 'skill_start') onSkillStart?.(data.content)
        else if (data.type === 'skill_result') onSkillResult?.(data.content)
        else if (data.type === 'thinking') onThinking?.(data.content)
      } catch {
        // skip malformed data
      }
    }
  }
}

export function stopGeneration(sessionId = 'default') {
  return request('/api/chat/stop', {
    method: 'POST',
    body: JSON.stringify(sessionId),
  })
}

export function getModels() {
  return request<{ models: { id: string; provider: string }[] }>('/api/chat/models')
}

// File API
export function listFiles(path: string) {
  return request<{ items: any[] }>(`/api/files/list?path=${encodeURIComponent(path)}`)
}

export function createFile(path: string, isDir: boolean, content = '') {
  return request('/api/files/create', {
    method: 'POST',
    body: JSON.stringify({ path, is_dir: isDir, content }),
  })
}

export function createDirectory(path: string) {
  return createFile(path, true)
}

export function requestDelete(path: string) {
  return request<any>('/api/files/delete', {
    method: 'DELETE',
    body: JSON.stringify({ path }),
  })
}

export function confirmDelete(token: string) {
  return request('/api/files/delete/confirm', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

export function moveFile(src: string, dst: string) {
  return request('/api/files/move', {
    method: 'POST',
    body: JSON.stringify({ src, dst }),
  })
}

export function organizeFiles(path: string, model?: string, instructions = '') {
  return request('/api/files/organize', {
    method: 'POST',
    body: JSON.stringify({ path, model, instructions }),
  })
}

// Browser API
export function startBrowser() {
  return request('/api/browser/start', { method: 'POST' })
}

export function navigateBrowser(url: string) {
  return request<{ url: string }>('/api/browser/navigate', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export function takeScreenshot() {
  return request<{ image: string; format: string }>('/api/browser/screenshot', {
    method: 'POST',
  })
}

export function takeSnapshot() {
  return request<{ snapshot: string }>('/api/browser/snapshot', {
    method: 'POST',
  })
}

export function runBrowserAgent(task: string, model?: string) {
  return request('/api/browser/agent/run', {
    method: 'POST',
    body: JSON.stringify({ task, model }),
  })
}

export function stopBrowserAgent() {
  return request('/api/browser/agent/stop', { method: 'POST' })
}

export function getBrowserAgentStatus() {
  return request<any>('/api/browser/agent/status')
}

export function closeBrowser() {
  return request('/api/browser/close', { method: 'DELETE' })
}

// Settings API
export function getSettings() {
  return request<any>('/api/settings')
}

export function updateSettings(config: any) {
  return request('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(config),
  })
}

// Scheduler API
export function getSchedulerTasks() {
  return request<{ tasks: any[] }>('/api/scheduler/tasks')
}

export function createSchedulerTask(data: {
  name: string
  prompt: string
  model?: string
  schedule_type?: string
  cron_hour?: number
  cron_minute?: number
  cron_days?: string[]
  interval_minutes?: number
  timezone?: string
  notify_apps?: { whatsapp: boolean; telegram: boolean; matrix: boolean }
  enabled?: boolean
}) {
  return request<{ task: any }>('/api/scheduler/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateSchedulerTask(id: string, data: Record<string, any>) {
  return request<{ task: any }>(`/api/scheduler/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteSchedulerTask(id: string) {
  return request('/api/scheduler/tasks/' + id, { method: 'DELETE' })
}

export function toggleSchedulerTask(id: string) {
  return request<{ task: any }>(`/api/scheduler/tasks/${id}/toggle`, {
    method: 'POST',
  })
}

export function runSchedulerTask(id: string) {
  return request<{ task: any }>(`/api/scheduler/tasks/${id}/run`, {
    method: 'POST',
  })
}

export function getSchedulerLogs(taskId?: string) {
  const query = taskId ? `?task_id=${taskId}` : ''
  return request<{ logs: any[] }>(`/api/scheduler/logs${query}`)
}

// User Profile API
export function getUserProfile() {
  return request<{ exists: boolean; content: string | null }>('/api/settings/user-profile')
}

export function saveUserProfile(data: {
  name: string
  gender: string
  language: string
  country: string
  city: string
}) {
  return request('/api/settings/user-profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// Sancho Profile API
export function getSanchoProfile() {
  return request<{ exists: boolean; content: string | null }>('/api/settings/sancho-profile')
}

export function saveSanchoProfile(data: { nickname: string; role: string }) {
  return request('/api/settings/sancho-profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// Logs API
export function streamLogs(
  onLogEntry: (entry: { timestamp: string; level: string; name: string; message: string }) => void,
  onError?: (error: string) => void,
): { stop: () => void } {
  const controller = new AbortController()

  fetch(`${BASE_URL}/api/logs/stream`, { signal: controller.signal })
    .then(async (res) => {
      if (!res.ok) {
        onError?.(`HTTP ${res.status}`)
        return
      }
      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const entry = JSON.parse(line.slice(6))
            onLogEntry(entry)
          } catch {
            // skip malformed data
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError?.(err.message)
      }
    })

  return { stop: () => controller.abort() }
}

export function clearLogs() {
  return request('/api/logs', { method: 'DELETE' })
}

// Memory API
export function getMemories() {
  return request<{ memories: any[] }>('/api/memory')
}

export function deleteMemory(id: string) {
  return request('/api/memory/' + id, { method: 'DELETE' })
}

export function toggleMemory(id: string) {
  return request<{ memory: any }>('/api/memory/' + id + '/toggle', {
    method: 'POST',
  })
}

export function clearAllMemories() {
  return request('/api/memory', { method: 'DELETE' })
}

// Conversation API
export function getConversations() {
  return request<{ conversations: any[] }>('/api/conversations')
}

export function createConversation(title = '', model = '') {
  return request<{ conversation: any }>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ title, model }),
  })
}

export function getConversation(id: string) {
  return request<{ conversation: any }>(`/api/conversations/${id}`)
}

export function renameConversation(id: string, title: string) {
  return request<{ conversation: any }>(`/api/conversations/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ title }),
  })
}

export function deleteConversationApi(id: string) {
  return request('/api/conversations/' + id, { method: 'DELETE' })
}

// Health check
export function healthCheck() {
  return request<{ status: string }>('/api/health')
}
