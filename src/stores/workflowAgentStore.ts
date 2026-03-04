import { create } from 'zustand'
import type { AgentWorkflow, AgentLog, AgentSchedule, AgentNodeDef, AgentEdge, PortSide, NodeType } from '../types'
import {
  getAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  toggleAgent,
  runAgent,
  getAgentLogs,
} from '../api/client'

const defaultSchedule: AgentSchedule = {
  execution_type: 'recurring',
  schedule_type: 'cron',
  cron_hour: 9,
  cron_minute: 0,
  cron_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  interval_minutes: 60,
  timezone: 'Asia/Seoul',
  start_time: null,
  execute_immediately: false,
}

function newAgent(): AgentWorkflow {
  return {
    id: '',
    name: '',
    nodes: [],
    edges: [],
    schedule: { ...defaultSchedule },
    notify_apps: { whatsapp: false, telegram: false, matrix: false, slack: false, discord: false },
    model: '',
    enabled: true,
    created_at: '',
    updated_at: '',
    last_run: null,
    last_result: null,
    status: 'idle',
  }
}

let nodeCounter = 0

// ── Control node type detection ──

const CONTROL_NODE_IDS = new Set(['condition', 'fork', 'join', 'loop', 'delay', 'approval', 'subroute'])

function resolveNodeType(serviceId: string, explicitType?: string): NodeType {
  if (explicitType && explicitType !== 'service') return explicitType as NodeType
  if (CONTROL_NODE_IDS.has(serviceId)) return serviceId as NodeType
  return 'service'
}

// ── Topological sort utility ──

function computeTopologicalOrder(nodes: AgentNodeDef[], edges: AgentEdge[]): AgentNodeDef[] {
  if (edges.length === 0) return nodes.map((n, i) => ({ ...n, order: i }))

  const inDegree: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  nodes.forEach((n) => {
    inDegree[n.id] = 0
    adj[n.id] = []
  })
  edges.forEach((e) => {
    if (adj[e.source] && inDegree[e.target] !== undefined) {
      adj[e.source].push(e.target)
      inDegree[e.target]++
    }
  })

  const queue = Object.keys(inDegree)
    .filter((id) => inDegree[id] === 0)
    .sort((a, b) => {
      const na = nodes.find((n) => n.id === a)
      const nb = nodes.find((n) => n.id === b)
      return (na?.order ?? 0) - (nb?.order ?? 0)
    })
  const result: string[] = []

  while (queue.length) {
    const id = queue.shift()!
    result.push(id)
    for (const neighbor of adj[id]) {
      inDegree[neighbor]--
      if (inDegree[neighbor] === 0) queue.push(neighbor)
    }
  }

  // Include disconnected nodes
  const remaining = nodes.filter((n) => !result.includes(n.id)).map((n) => n.id)
  result.push(...remaining)

  const orderMap = Object.fromEntries(result.map((id, i) => [id, i]))
  return nodes.map((n) => ({ ...n, order: orderMap[n.id] ?? n.order }))
}

// ── Auto-layout for legacy agents or AI build ──

export function autoLayoutNodes(nodes: AgentNodeDef[], startX = 300, startY = 80, spacingY = 220): AgentNodeDef[] {
  return nodes.map((n, i) => ({ ...n, x: startX, y: startY + i * spacingY }))
}

export function autoLayoutGraph(nodes: AgentNodeDef[], edges: AgentEdge[], startX = 300, startY = 80, spacingX = 300, spacingY = 220): AgentNodeDef[] {
  if (nodes.length === 0) return nodes

  // Build adjacency & in-degree
  const adj: Record<string, string[]> = {}
  const inDegree: Record<string, number> = {}
  for (const n of nodes) {
    adj[n.id] = []
    inDegree[n.id] = 0
  }
  for (const e of edges) {
    if (adj[e.source]) adj[e.source].push(e.target)
    if (e.target in inDegree) inDegree[e.target]++
  }

  // Assign levels via BFS (topological)
  const level: Record<string, number> = {}
  const queue: string[] = []
  for (const n of nodes) {
    if (inDegree[n.id] === 0) {
      queue.push(n.id)
      level[n.id] = 0
    }
  }
  while (queue.length) {
    const id = queue.shift()!
    for (const next of (adj[id] || [])) {
      level[next] = Math.max(level[next] ?? 0, (level[id] ?? 0) + 1)
      inDegree[next]--
      if (inDegree[next] === 0) queue.push(next)
    }
  }

  // Group by level
  const levelGroups: Record<number, string[]> = {}
  for (const n of nodes) {
    const lv = level[n.id] ?? 0
    if (!levelGroups[lv]) levelGroups[lv] = []
    levelGroups[lv].push(n.id)
  }

  // Assign positions — center each level horizontally
  const posMap: Record<string, { x: number; y: number }> = {}
  const sortedLevels = Object.keys(levelGroups).map(Number).sort((a, b) => a - b)
  for (const lv of sortedLevels) {
    const group = levelGroups[lv]
    const totalWidth = (group.length - 1) * spacingX
    const offsetX = startX - totalWidth / 2
    group.forEach((id, idx) => {
      posMap[id] = { x: offsetX + idx * spacingX, y: startY + lv * spacingY }
    })
  }

  return nodes.map((n) => ({
    ...n,
    x: posMap[n.id]?.x ?? startX,
    y: posMap[n.id]?.y ?? startY,
  }))
}

export function autoCreateLinearEdges(nodes: AgentNodeDef[]): AgentEdge[] {
  const edges: AgentEdge[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ id: `auto-edge-${i}`, source: nodes[i].id, target: nodes[i + 1].id, sourcePort: 'bottom', targetPort: 'top', edgeType: '' })
  }
  return edges
}

// ── Store interface ──

interface WorkflowAgentState {
  // List
  agents: AgentWorkflow[]
  logs: AgentLog[]
  loading: boolean
  running: Record<string, boolean>

  // Builder
  editingAgent: AgentWorkflow
  isDirty: boolean

  // AI Build streaming
  aiBuildStreaming: boolean
  aiBuildStreamContent: string
  aiBuildError: string

  // Execution debug state
  executionStates: Record<string, 'pending' | 'running' | 'completed' | 'error'>

  // List actions
  fetchAgents: () => Promise<void>
  fetchLogs: (agentId?: string) => Promise<void>
  removeAgent: (id: string) => Promise<void>
  toggleAgentEnabled: (id: string) => Promise<void>
  runAgentNow: (id: string) => Promise<void>

  // Builder actions
  initNewAgent: () => void
  loadAgent: (agent: AgentWorkflow) => void
  setAgentName: (name: string) => void
  setAgentModel: (model: string) => void
  setSchedule: (schedule: Partial<AgentSchedule>) => void
  setNotifyApps: (apps: Partial<{ whatsapp: boolean; telegram: boolean; matrix: boolean; slack: boolean }>) => void
  addNode: (serviceId: string, serviceType: 'api' | 'chatapp', x?: number, y?: number, nodeType?: string) => void
  removeNode: (nodeId: string) => void
  updateNodePrompt: (nodeId: string, prompt: string) => void
  updateNodePosition: (nodeId: string, x: number, y: number) => void
  updateNodeConfig: (nodeId: string, config: Record<string, any>) => void
  updateNodeOutputVariable: (nodeId: string, name: string) => void
  reorderNodes: (fromIndex: number, toIndex: number) => void
  addEdge: (source: string, target: string, sourcePort?: PortSide, targetPort?: PortSide) => void
  removeEdge: (edgeId: string) => void
  updateEdgeType: (edgeId: string, edgeType: string) => void
  applyAiBuild: (result: {
    name: string
    nodes: { id?: string; serviceId: string; serviceType: string; prompt: string; order: number; nodeType?: string; config?: Record<string, any> }[]
    edges?: { source: string; target: string; edgeType?: string }[]
    schedule: Record<string, any>
  }) => void
  saveAgent: () => Promise<void>
  clearEditing: () => void

  // AI Build streaming actions
  setAiBuildStreaming: (v: boolean) => void
  appendAiBuildContent: (text: string) => void
  setAiBuildError: (err: string) => void
  resetAiBuildStream: () => void

  // Execution debug actions
  setExecutionState: (nodeId: string, state: 'pending' | 'running' | 'completed' | 'error') => void
  clearExecutionStates: () => void
}

export const useWorkflowAgentStore = create<WorkflowAgentState>((set, get) => ({
  agents: [],
  logs: [],
  loading: false,
  running: {},

  editingAgent: newAgent(),
  isDirty: false,

  aiBuildStreaming: false,
  aiBuildStreamContent: '',
  aiBuildError: '',

  executionStates: {},

  // ---- List actions ----

  fetchAgents: async () => {
    set({ loading: true })
    try {
      const { agents } = await getAgents()
      set({ agents })
    } catch {
      // ignore
    } finally {
      set({ loading: false })
    }
  },

  fetchLogs: async (agentId?: string) => {
    try {
      const { logs } = await getAgentLogs(agentId)
      set({ logs })
    } catch {
      // ignore
    }
  },

  removeAgent: async (id) => {
    await deleteAgent(id)
    await get().fetchAgents()
    await get().fetchLogs()
  },

  toggleAgentEnabled: async (id) => {
    await toggleAgent(id)
    await get().fetchAgents()
  },

  runAgentNow: async (id) => {
    set((s) => ({ running: { ...s.running, [id]: true } }))
    try {
      await runAgent(id)
      await get().fetchAgents()
      await get().fetchLogs()
    } finally {
      set((s) => {
        const running = { ...s.running }
        delete running[id]
        return { running }
      })
    }
  },

  // ---- Builder actions ----

  initNewAgent: () => {
    set({ editingAgent: newAgent(), isDirty: false })
  },

  loadAgent: (agent) => {
    const clone: AgentWorkflow = JSON.parse(JSON.stringify(agent))

    // Ensure edges array exists (backward compat)
    if (!clone.edges) clone.edges = []

    // Ensure new fields have defaults (backward compat)
    clone.nodes = clone.nodes.map((n) => ({
      ...n,
      nodeType: n.nodeType || resolveNodeType(n.serviceId),
      config: n.config || {},
      outputVariable: n.outputVariable || '',
    }))
    clone.edges = clone.edges.map((e) => ({
      ...e,
      edgeType: e.edgeType || '',
    }))

    // Auto-layout if all positions are 0 (legacy agent)
    const allZero = clone.nodes.length > 0 && clone.nodes.every((n) => (n.x ?? 0) === 0 && (n.y ?? 0) === 0)
    if (allZero) {
      clone.nodes = autoLayoutNodes(clone.nodes)
      if (clone.edges.length === 0 && clone.nodes.length > 1) {
        clone.edges = autoCreateLinearEdges(clone.nodes)
      }
    }

    set({ editingAgent: clone, isDirty: false })
  },

  setAgentName: (name) => {
    set((s) => ({ editingAgent: { ...s.editingAgent, name }, isDirty: true }))
  },

  setAgentModel: (model) => {
    set((s) => ({ editingAgent: { ...s.editingAgent, model }, isDirty: true }))
  },

  setSchedule: (partial) => {
    set((s) => ({
      editingAgent: {
        ...s.editingAgent,
        schedule: { ...s.editingAgent.schedule, ...partial },
      },
      isDirty: true,
    }))
  },

  setNotifyApps: (partial) => {
    set((s) => ({
      editingAgent: {
        ...s.editingAgent,
        notify_apps: { ...s.editingAgent.notify_apps, ...partial },
      },
      isDirty: true,
    }))
  },

  addNode: (serviceId, serviceType, x?, y?, nodeType?) => {
    nodeCounter++
    const nodes = get().editingAgent.nodes
    const nt = resolveNodeType(serviceId, nodeType)
    const node: AgentNodeDef = {
      id: `node-${Date.now()}-${nodeCounter}`,
      serviceId,
      serviceType,
      prompt: '',
      order: nodes.length,
      x: x ?? 300,
      y: y ?? (nodes.length * 220 + 80),
      nodeType: nt,
      config: {},
      outputVariable: '',
    }
    set((s) => ({
      editingAgent: {
        ...s.editingAgent,
        nodes: [...s.editingAgent.nodes, node],
      },
      isDirty: true,
    }))
  },

  removeNode: (nodeId) => {
    set((s) => ({
      editingAgent: {
        ...s.editingAgent,
        nodes: s.editingAgent.nodes
          .filter((n) => n.id !== nodeId)
          .map((n, i) => ({ ...n, order: i })),
        edges: s.editingAgent.edges.filter(
          (e) => e.source !== nodeId && e.target !== nodeId
        ),
      },
      isDirty: true,
    }))
  },

  updateNodePrompt: (nodeId, prompt) => {
    set((s) => ({
      editingAgent: {
        ...s.editingAgent,
        nodes: s.editingAgent.nodes.map((n) =>
          n.id === nodeId ? { ...n, prompt } : n
        ),
      },
      isDirty: true,
    }))
  },

  updateNodePosition: (nodeId, x, y) => {
    set((s) => ({
      editingAgent: {
        ...s.editingAgent,
        nodes: s.editingAgent.nodes.map((n) =>
          n.id === nodeId ? { ...n, x, y } : n
        ),
      },
      isDirty: true,
    }))
  },

  updateNodeConfig: (nodeId, config) => {
    set((s) => ({
      editingAgent: {
        ...s.editingAgent,
        nodes: s.editingAgent.nodes.map((n) =>
          n.id === nodeId ? { ...n, config: { ...n.config, ...config } } : n
        ),
      },
      isDirty: true,
    }))
  },

  updateNodeOutputVariable: (nodeId, name) => {
    set((s) => ({
      editingAgent: {
        ...s.editingAgent,
        nodes: s.editingAgent.nodes.map((n) =>
          n.id === nodeId ? { ...n, outputVariable: name } : n
        ),
      },
      isDirty: true,
    }))
  },

  reorderNodes: (fromIndex, toIndex) => {
    set((s) => {
      const nodes = [...s.editingAgent.nodes]
      const [moved] = nodes.splice(fromIndex, 1)
      nodes.splice(toIndex, 0, moved)
      return {
        editingAgent: {
          ...s.editingAgent,
          nodes: nodes.map((n, i) => ({ ...n, order: i })),
        },
        isDirty: true,
      }
    })
  },

  addEdge: (source, target, sourcePort?, targetPort?) => {
    // Prevent self-loops and duplicates
    if (source === target) return
    const edges = get().editingAgent.edges
    if (edges.some((e) => e.source === source && e.target === target && e.sourcePort === (sourcePort ?? 'bottom') && e.targetPort === (targetPort ?? 'top'))) return

    nodeCounter++
    const edge: AgentEdge = {
      id: `edge-${Date.now()}-${nodeCounter}`,
      source,
      target,
      sourcePort: sourcePort ?? 'bottom',
      targetPort: targetPort ?? 'top',
      edgeType: '',
    }
    set((s) => ({
      editingAgent: {
        ...s.editingAgent,
        edges: [...s.editingAgent.edges, edge],
      },
      isDirty: true,
    }))
  },

  removeEdge: (edgeId) => {
    set((s) => ({
      editingAgent: {
        ...s.editingAgent,
        edges: s.editingAgent.edges.filter((e) => e.id !== edgeId),
      },
      isDirty: true,
    }))
  },

  updateEdgeType: (edgeId, edgeType) => {
    set((s) => ({
      editingAgent: {
        ...s.editingAgent,
        edges: s.editingAgent.edges.map((e) =>
          e.id === edgeId ? { ...e, edgeType } : e
        ),
      },
      isDirty: true,
    }))
  },

  applyAiBuild: (result) => {
    // Build AI-id → real-id mapping
    const aiIdToRealId: Record<string, string> = {}

    let nodes: AgentNodeDef[] = result.nodes.map((n, i) => {
      nodeCounter++
      const nt = resolveNodeType(n.serviceId, n.nodeType)
      const realId = `node-${Date.now()}-${nodeCounter}`
      // Map AI-generated id (e.g. "node-0") and index to real id
      const aiId = (n as any).id || `node-${i}`
      aiIdToRealId[aiId] = realId
      aiIdToRealId[String(i)] = realId
      return {
        id: realId,
        serviceId: n.serviceId,
        serviceType: (n.serviceType === 'chatapp' ? 'chatapp' : 'api') as 'api' | 'chatapp',
        prompt: n.prompt || '',
        order: i,
        x: 0,
        y: 0,
        nodeType: nt,
        config: n.config || {},
        outputVariable: '',
      }
    })

    // If AI provided edges, use them with mapped IDs; otherwise auto-create linear edges
    let edges: AgentEdge[]
    if (result.edges && result.edges.length > 0) {
      edges = result.edges.map((e) => {
        nodeCounter++
        return {
          id: `edge-${Date.now()}-${nodeCounter}`,
          source: aiIdToRealId[e.source] || e.source,
          target: aiIdToRealId[e.target] || e.target,
          sourcePort: 'bottom' as PortSide,
          targetPort: 'top' as PortSide,
          edgeType: e.edgeType || '',
        }
      })
      // Graph-aware layout for fork/join/branch workflows
      nodes = autoLayoutGraph(nodes, edges)
    } else {
      nodes = autoLayoutNodes(nodes)
      edges = autoCreateLinearEdges(nodes)
    }

    const schedule: AgentSchedule = {
      ...defaultSchedule,
      execution_type: (result.schedule.execution_type === 'onetime' ? 'onetime' : 'recurring') as 'recurring' | 'onetime',
      schedule_type: (result.schedule.schedule_type === 'interval' ? 'interval' : 'cron') as 'cron' | 'interval',
      cron_hour: result.schedule.cron_hour ?? defaultSchedule.cron_hour,
      cron_minute: result.schedule.cron_minute ?? defaultSchedule.cron_minute,
      cron_days: result.schedule.cron_days ?? defaultSchedule.cron_days,
      interval_minutes: result.schedule.interval_minutes ?? defaultSchedule.interval_minutes,
      execute_immediately: result.schedule.execute_immediately ?? false,
    }

    set((s) => ({
      editingAgent: {
        ...s.editingAgent,
        name: result.name || s.editingAgent.name,
        nodes,
        edges,
        schedule,
      },
      isDirty: true,
    }))
  },

  saveAgent: async () => {
    const agent = get().editingAgent

    // Compute order from edge topology
    const orderedNodes = computeTopologicalOrder(agent.nodes, agent.edges)

    // Auto-detect notify_apps from chatapp nodes in the canvas
    const chatappNodes = agent.nodes.filter((n) => n.serviceType === 'chatapp')
    const chatappIds = chatappNodes.map((n) => n.serviceId)
    const notify_apps = {
      whatsapp: chatappIds.includes('whatsapp'),
      telegram: chatappIds.includes('telegram'),
      matrix: chatappIds.includes('matrix'),
      slack: chatappIds.includes('slack_app') || chatappIds.includes('slack'),
      discord: chatappIds.includes('discord'),
    }
    const data = {
      name: agent.name,
      nodes: orderedNodes,
      edges: agent.edges,
      schedule: agent.schedule,
      notify_apps,
      model: agent.model,
      enabled: agent.enabled,
    }
    if (agent.id) {
      await updateAgent(agent.id, data)
    } else {
      const { agent: saved } = await createAgent(data)
      set((s) => ({ editingAgent: { ...s.editingAgent, id: saved.id } }))
    }
    set({ isDirty: false })
    await get().fetchAgents()
  },

  clearEditing: () => {
    set({ editingAgent: newAgent(), isDirty: false })
  },

  // ---- AI Build streaming ----
  setAiBuildStreaming: (v) => set({ aiBuildStreaming: v }),
  appendAiBuildContent: (text) => set((s) => ({ aiBuildStreamContent: s.aiBuildStreamContent + text })),
  setAiBuildError: (err) => set({ aiBuildError: err }),
  resetAiBuildStream: () => set({ aiBuildStreaming: false, aiBuildStreamContent: '', aiBuildError: '' }),

  // ---- Execution debug ----
  setExecutionState: (nodeId, state) => set((s) => ({
    executionStates: { ...s.executionStates, [nodeId]: state },
  })),
  clearExecutionStates: () => set({ executionStates: {} }),
}))
