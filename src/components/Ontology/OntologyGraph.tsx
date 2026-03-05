import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react'

export interface GraphNode {
  id: string
  label: string
  type: string
  file: string
  line?: number
  cluster: number
  size: number
  fanIn?: number
  fanOut?: number
  lines?: number
  dead?: boolean
  // Physics simulation state
  x: number
  y: number
  vx: number
  vy: number
}

export interface GraphEdge {
  source: string
  target: string
  type: string
  order?: number
  circular?: boolean
}

export type LayoutMode = 'force' | 'tree' | 'radial'

export interface GraphHandle {
  zoomIn: () => void
  zoomOut: () => void
  focusOnFile: (file: string) => void
  focusOnNode: (nodeId: string) => void
  getCanvas: () => HTMLCanvasElement | null
}

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId: string | null
  highlightFile: string | null
  layout: LayoutMode
  impactMap: Map<string, number> | null
  onSelectNode: (node: GraphNode | null) => void
  onHoverNode?: (node: GraphNode | null, screenX: number, screenY: number) => void
}

// InfraNode-style cluster colors
const CLUSTER_COLORS = [
  '#C9A961', // golden
  '#4A9FD8', // cyan
  '#9BC816', // lime
  '#C653E1', // magenta
  '#E07B54', // orange
  '#58C9B9', // teal
  '#D94F6B', // rose
  '#7B8CDE', // periwinkle
  '#B8D44E', // yellow-green
  '#E8A0BF', // pink
]

function getClusterColor(cluster: number): string {
  return CLUSTER_COLORS[cluster % CLUSTER_COLORS.length]
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

// --- Layout algorithms ---

function computeTreeLayout(nodes: GraphNode[], edges: GraphEdge[]) {
  if (nodes.length === 0) return
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const NODE_GAP = 35        // vertical gap between sibling nodes
  const DEPTH_GAP = 120      // horizontal gap between depth levels (left→right)

  // Build adjacency
  const incomingSet = new Set<string>()
  const outAdj = new Map<string, string[]>()
  for (const n of nodes) outAdj.set(n.id, [])
  for (const e of edges) {
    incomingSet.add(e.target)
    outAdj.get(e.source)?.push(e.target)
  }

  // BFS to build a spanning tree (one parent per node)
  const roots = nodes.filter(n => !incomingSet.has(n.id))
  if (roots.length === 0) roots.push(nodes[0])

  const treeChildren = new Map<string, string[]>()
  const assigned = new Set<string>()
  const bfsQueue: string[] = []
  const depthMap = new Map<string, number>()

  for (const r of roots) {
    assigned.add(r.id)
    treeChildren.set(r.id, [])
    depthMap.set(r.id, 0)
    bfsQueue.push(r.id)
  }

  let qi = 0
  while (qi < bfsQueue.length) {
    const curr = bfsQueue[qi++]
    const depth = depthMap.get(curr)!
    for (const nb of outAdj.get(curr) ?? []) {
      if (!assigned.has(nb)) {
        assigned.add(nb)
        depthMap.set(nb, depth + 1)
        if (!treeChildren.has(curr)) treeChildren.set(curr, [])
        treeChildren.get(curr)!.push(nb)
        treeChildren.set(nb, [])
        bfsQueue.push(nb)
      }
    }
  }

  // Orphans (disconnected nodes) → group as extra roots
  const orphans = nodes.filter(n => !assigned.has(n.id))
  for (const o of orphans) {
    assigned.add(o.id)
    depthMap.set(o.id, 0)
    treeChildren.set(o.id, [])
    roots.push(o)
  }

  // Calculate subtree height (leaf count) bottom-up
  const subtreeH = new Map<string, number>()
  function calcHeight(nid: string): number {
    const ch = treeChildren.get(nid) ?? []
    if (ch.length === 0) { subtreeH.set(nid, 1); return 1 }
    const h = ch.reduce((sum, c) => sum + calcHeight(c), 0)
    subtreeH.set(nid, h)
    return h
  }

  // Left-to-right layout: x = depth, y = siblings stacked vertically
  function positionSubtree(nid: string, topY: number, depth: number) {
    const n = nodeMap.get(nid)
    if (!n) return
    const ch = treeChildren.get(nid) ?? []
    const h = subtreeH.get(nid) ?? 1

    n.x = depth * DEPTH_GAP
    n.y = topY + (h - 1) * NODE_GAP / 2
    n.vx = 0
    n.vy = 0

    let childY = topY
    for (const c of ch) {
      const ch_h = subtreeH.get(c) ?? 1
      positionSubtree(c, childY, depth + 1)
      childY += ch_h * NODE_GAP
    }
  }

  // Layout all root subtrees stacked vertically
  for (const r of roots) calcHeight(r.id)

  let totalY = 0
  for (const r of roots) {
    positionSubtree(r.id, totalY, 0)
    totalY += (subtreeH.get(r.id) ?? 1) * NODE_GAP
  }

  // Center the whole tree at origin
  const xs = nodes.map(n => n.x)
  const ys = nodes.map(n => n.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  for (const n of nodes) { n.x -= cx; n.y -= cy }
}

function computeRadialLayout(nodes: GraphNode[]) {
  if (nodes.length === 0) return
  const clusters = new Map<number, GraphNode[]>()
  for (const n of nodes) {
    if (!clusters.has(n.cluster)) clusters.set(n.cluster, [])
    clusters.get(n.cluster)!.push(n)
  }

  const clusterKeys = [...clusters.keys()].sort()
  const numClusters = Math.max(1, clusterKeys.length)
  const sectorAngle = (2 * Math.PI) / numClusters
  const sectorPad = sectorAngle * 0.1  // 10% gap between sectors
  const usableAngle = sectorAngle - sectorPad

  // Dynamic radius: scale with total node count for more breathing room
  const baseRadius = Math.max(180, nodes.length * 6)
  const ringGap = Math.max(50, 30 + nodes.length * 0.5)
  const MIN_ARC_DIST = 40 // minimum arc distance between nodes on same ring

  clusterKeys.forEach((cid, ci) => {
    const clusterNodes = clusters.get(cid)!
    const sectorCenter = ci * sectorAngle + sectorPad / 2

    // Distribute nodes across rings so they don't overlap
    let ringIdx = 0
    let placed = 0
    while (placed < clusterNodes.length) {
      const r = baseRadius + ringIdx * ringGap
      // How many nodes fit on this ring's arc with MIN_ARC_DIST spacing?
      const arcLen = r * usableAngle
      const perRing = Math.max(1, Math.floor(arcLen / MIN_ARC_DIST))
      const count = Math.min(perRing, clusterNodes.length - placed)
      const step = usableAngle / Math.max(1, count)

      for (let i = 0; i < count; i++) {
        const n = clusterNodes[placed + i]
        const angle = sectorCenter + (i + 0.5) * step
        n.x = Math.cos(angle) * r
        n.y = Math.sin(angle) * r
        n.vx = 0
        n.vy = 0
      }
      placed += count
      ringIdx++
    }
  })
}

const OntologyGraph = forwardRef<GraphHandle, Props>(function OntologyGraph(
  { nodes, edges, selectedNodeId, highlightFile, layout, impactMap, onSelectNode, onHoverNode },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const nodesRef = useRef<GraphNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])
  const layoutRef = useRef<LayoutMode>('force')

  // Camera state
  const camRef = useRef({ x: 0, y: 0, zoom: 1 })

  // Minimap bounds cache
  const minimapRef = useRef<{ x: number; y: number; w: number; h: number; minX: number; minY: number; scale: number } | null>(null)

  useImperativeHandle(ref, () => ({
    zoomIn() {
      camRef.current.zoom = Math.min(5, camRef.current.zoom * 1.3)
    },
    zoomOut() {
      camRef.current.zoom = Math.max(0.1, camRef.current.zoom * 0.7)
    },
    focusOnFile(file: string) {
      const fileNodes = nodesRef.current.filter((n) => n.file === file)
      if (fileNodes.length === 0) return
      let cx = 0, cy = 0
      for (const n of fileNodes) { cx += n.x; cy += n.y }
      cx /= fileNodes.length
      cy /= fileNodes.length
      camRef.current.x = -cx * camRef.current.zoom
      camRef.current.y = -cy * camRef.current.zoom
    },
    focusOnNode(nodeId: string) {
      const node = nodesRef.current.find(n => n.id === nodeId)
      if (!node) return
      camRef.current.x = -node.x * camRef.current.zoom
      camRef.current.y = -node.y * camRef.current.zoom
    },
    getCanvas() {
      return canvasRef.current
    },
  }))

  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; camStartX: number; camStartY: number; draggedNode: GraphNode | null; minimapDrag: boolean }>({
    dragging: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0, draggedNode: null, minimapDrag: false,
  })
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)

  // Build adjacency for fast lookup
  const adjRef = useRef<Map<string, Set<string>>>(new Map())

  // Apply layout when layout mode changes
  useEffect(() => {
    layoutRef.current = layout
    const ns = nodesRef.current
    const es = edgesRef.current
    if (ns.length === 0) return
    if (layout === 'tree') {
      computeTreeLayout(ns, es)
      camRef.current = { x: 0, y: 0, zoom: 1 }
    } else if (layout === 'radial') {
      computeRadialLayout(ns)
      camRef.current = { x: 0, y: 0, zoom: 1 }
    }
    // force: just let physics resume
  }, [layout])

  // Initialize node positions
  useEffect(() => {
    if (nodes.length === 0) {
      nodesRef.current = []
      edgesRef.current = []
      return
    }

    const initialized = nodes.map((n, i) => {
      const angle = i * 2.39996
      const r = Math.sqrt(i) * 30
      return {
        ...n,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        vx: 0,
        vy: 0,
      }
    })
    nodesRef.current = initialized
    edgesRef.current = edges

    // Build adjacency
    const adj = new Map<string, Set<string>>()
    for (const n of initialized) adj.set(n.id, new Set())
    for (const e of edges) {
      adj.get(e.source)?.add(e.target)
      adj.get(e.target)?.add(e.source)
    }
    adjRef.current = adj

    // Apply initial layout
    if (layoutRef.current === 'tree') {
      computeTreeLayout(initialized, edges)
    } else if (layoutRef.current === 'radial') {
      computeRadialLayout(initialized)
    }

    camRef.current = { x: 0, y: 0, zoom: 1 }
  }, [nodes, edges])

  // Map from node id to node for fast lookup
  const nodeMapRef = useRef<Map<string, GraphNode>>(new Map())
  useEffect(() => {
    const m = new Map<string, GraphNode>()
    for (const n of nodesRef.current) m.set(n.id, n)
    nodeMapRef.current = m
  }, [nodes])

  // Force simulation + render loop
  const simulationActive = useRef(true)
  const tickCount = useRef(0)

  const tick = useCallback(() => {
    const ns = nodesRef.current
    const es = edgesRef.current
    if (ns.length === 0) return

    // Skip physics for static layouts
    if (layoutRef.current !== 'force') {
      for (const n of ns) nodeMapRef.current.set(n.id, n)
      return
    }

    const alpha = Math.max(0.001, 0.3 * Math.pow(0.99, tickCount.current))
    tickCount.current++

    if (alpha > 0.005) {
      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x
          const dy = ns[j].y - ns[i].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = (800 * alpha) / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          ns[i].vx -= fx
          ns[i].vy -= fy
          ns[j].vx += fx
          ns[j].vy += fy
        }
      }

      // Attraction along edges
      const nodeMap = new Map<string, GraphNode>()
      for (const n of ns) nodeMap.set(n.id, n)
      for (const e of es) {
        const s = nodeMap.get(e.source)
        const t = nodeMap.get(e.target)
        if (!s || !t) continue
        const dx = t.x - s.x
        const dy = t.y - s.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = dist * 0.005 * alpha
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        s.vx += fx
        s.vy += fy
        t.vx -= fx
        t.vy -= fy
      }

      // Centering gravity
      for (const n of ns) {
        n.vx -= n.x * 0.001 * alpha
        n.vy -= n.y * 0.001 * alpha
      }

      // Apply velocity with damping
      for (const n of ns) {
        if (dragRef.current.draggedNode?.id === n.id) continue
        n.vx *= 0.6
        n.vy *= 0.6
        n.x += n.vx
        n.y += n.vy
      }
    }

    for (const n of ns) nodeMapRef.current.set(n.id, n)
  }, [])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const cam = camRef.current
    const ns = nodesRef.current
    const es = edgesRef.current

    // Clear
    ctx.fillStyle = '#111111'
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.translate(w / 2 + cam.x, h / 2 + cam.y)
    ctx.scale(cam.zoom, cam.zoom)

    const adj = adjRef.current
    const hovId = hoveredNode?.id ?? null
    const selId = selectedNodeId
    const hlFile = highlightFile
    const impact = impactMap

    // Determine connected nodes for hover highlighting
    const connectedToHover = new Set<string>()
    if (hovId) {
      connectedToHover.add(hovId)
      adj.get(hovId)?.forEach((id) => connectedToHover.add(id))
    }

    const connectedToSel = new Set<string>()
    if (selId) {
      connectedToSel.add(selId)
      adj.get(selId)?.forEach((id) => connectedToSel.add(id))
    }

    const fileRelated = new Set<string>()
    if (hlFile) {
      for (const n of ns) {
        if (n.file === hlFile) {
          fileRelated.add(n.id)
          adj.get(n.id)?.forEach((id) => fileRelated.add(id))
        }
      }
    }

    // Draw edges
    for (const e of es) {
      const s = nodeMapRef.current.get(e.source)
      const t = nodeMapRef.current.get(e.target)
      if (!s || !t) continue

      let opacity = 0.15
      let width = 0.5
      let showArrow = false
      let showOrder = false
      let edgeColor = `rgba(94,94,94,${opacity})`

      const isSelEdge = selId && (e.source === selId || e.target === selId)

      if (hovId) {
        if (connectedToHover.has(e.source) && connectedToHover.has(e.target)) {
          const color = getClusterColor(s.cluster)
          const [r, g, b] = hexToRgb(color)
          edgeColor = `rgba(${r},${g},${b},0.6)`
          width = 1.5
          showArrow = true
          if (e.type === 'calls') { showOrder = e.order != null }
        } else {
          edgeColor = `rgba(94,94,94,0.06)`
          width = 0.3
        }
      } else if (isSelEdge) {
        const color = getClusterColor(s.cluster)
        const [r, g, b] = hexToRgb(color)
        edgeColor = `rgba(${r},${g},${b},0.7)`
        width = 1.8
        showArrow = true
        if (e.type === 'calls') { showOrder = e.order != null }
      } else if (hlFile) {
        const srcInFile = fileRelated.has(e.source) && (nodeMapRef.current.get(e.source)?.file === hlFile)
        const tgtInFile = fileRelated.has(e.target) && (nodeMapRef.current.get(e.target)?.file === hlFile)
        if (srcInFile || tgtInFile) {
          const color = getClusterColor(s.cluster)
          const [r, g, b] = hexToRgb(color)
          edgeColor = `rgba(${r},${g},${b},0.5)`
          width = 1.2
          showArrow = true
          if (e.type === 'calls') { showOrder = e.order != null }
        } else {
          edgeColor = `rgba(94,94,94,0.04)`
          width = 0.3
        }
      } else {
        if (e.type === 'calls') {
          showArrow = true
          edgeColor = `rgba(94,94,94,0.3)`
          width = 0.8
        }
      }

      // Circular dependency override: red
      if (e.circular) {
        edgeColor = `rgba(255,60,60,0.7)`
        width = Math.max(width, 1.5)
        showArrow = true
      }

      ctx.strokeStyle = edgeColor
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(t.x, t.y)
      ctx.stroke()

      // Arrow head
      if (showArrow) {
        const dx = t.x - s.x
        const dy = t.y - s.y
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len > 0) {
          const tRadius = Math.max(3, Math.min(18, 3 + t.size * 1.5))
          const ux = dx / len
          const uy = dy / len
          const ax = t.x - ux * (tRadius + 2)
          const ay = t.y - uy * (tRadius + 2)
          const arrowSize = Math.max(4, width * 3)
          ctx.fillStyle = edgeColor
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(ax - ux * arrowSize - uy * arrowSize * 0.5, ay - uy * arrowSize + ux * arrowSize * 0.5)
          ctx.lineTo(ax - ux * arrowSize + uy * arrowSize * 0.5, ay - uy * arrowSize - ux * arrowSize * 0.5)
          ctx.closePath()
          ctx.fill()
        }
      }

      // Order number badge
      if (showOrder && e.order != null) {
        const mx = (s.x + t.x) / 2
        const my = (s.y + t.y) / 2
        const badgeR = 7 / cam.zoom
        ctx.fillStyle = '#FF8C00'
        ctx.beginPath()
        ctx.arc(mx, my, badgeR, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#000'
        const badgeFont = Math.max(7, 10 / cam.zoom)
        ctx.font = `bold ${Math.round(badgeFont)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${e.order + 1}`, mx, my)
      }
    }

    // Draw nodes
    for (const n of ns) {
      const baseRadius = Math.max(3, Math.min(18, 3 + n.size * 1.5))
      const color = getClusterColor(n.cluster)
      let [r, g, b] = hexToRgb(color)

      // Complexity heat: blend toward orange/red for high fan-in+fan-out
      const complexity = (n.fanIn ?? 0) + (n.fanOut ?? 0)
      if (complexity > 4 && !n.dead) {
        const heat = Math.min(1, complexity / 20)
        r = Math.round(r + (255 - r) * heat * 0.5)
        g = Math.round(g * (1 - heat * 0.4))
        b = Math.round(b * (1 - heat * 0.6))
      }

      // Dead code: override to gray
      if (n.dead) {
        r = 120; g = 120; b = 120
      }

      let alpha = 1
      const radius = baseRadius
      let glowRadius = 0

      // Dimming
      if (hovId && !connectedToHover.has(n.id)) {
        alpha = 0.15
      } else if (!hovId && !hlFile && selId && !connectedToSel.has(n.id)) {
        alpha = 0.2
      }

      if (hlFile) {
        if (n.file === hlFile) {
          alpha = 1
          glowRadius = radius + 4
        } else if (fileRelated.has(n.id)) {
          alpha = 0.7
        } else {
          alpha = 0.08
        }
      }

      if (n.id === hovId) {
        glowRadius = radius + 8
        alpha = 1
      }

      if (n.id === selId) {
        glowRadius = radius + 6
        alpha = 1
      }

      // Draw glow
      if (glowRadius > 0) {
        const grad = ctx.createRadialGradient(n.x, n.y, radius, n.x, n.y, glowRadius)
        if (n.id === selId) {
          grad.addColorStop(0, `rgba(255,140,0,0.5)`)
          grad.addColorStop(1, `rgba(255,140,0,0)`)
        } else {
          grad.addColorStop(0, `rgba(${r},${g},${b},0.4)`)
          grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
        }
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(n.x, n.y, glowRadius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Impact analysis: depth rings
      if (impact && selId) {
        const depth = impact.get(n.id)
        if (depth !== undefined && depth > 0) {
          const depthColors = ['rgba(255,140,0,0.7)', 'rgba(204,112,0,0.5)', 'rgba(153,83,0,0.35)']
          ctx.strokeStyle = depthColors[Math.min(depth - 1, 2)]
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(n.x, n.y, radius + 4, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // Draw circle
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
      ctx.beginPath()
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2)
      ctx.fill()

      // Dead code: dashed border
      if (n.dead) {
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = `rgba(180,180,180,${alpha * 0.6})`
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Selected border
      if (n.id === selId) {
        ctx.strokeStyle = '#FF8C00'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Label
      if (cam.zoom > 0.4 || n.size > 3 || n.id === hovId || n.id === selId) {
        const fontSize = Math.max(11, Math.min(22, 10 + n.size * 1.2)) / cam.zoom * 0.7
        ctx.font = `bold ${Math.round(fontSize)}px -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.9})`
        ctx.fillText(n.label, n.x, n.y + radius + 3)
      }
    }

    ctx.restore()

    // --- Minimap ---
    if (ns.length > 0) {
      const mmW = 140
      const mmH = 90
      const mmX = 8
      const mmY = h - mmH - 24

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const n of ns) {
        if (n.x < minX) minX = n.x
        if (n.x > maxX) maxX = n.x
        if (n.y < minY) minY = n.y
        if (n.y > maxY) maxY = n.y
      }
      const rangeX = (maxX - minX) || 1
      const rangeY = (maxY - minY) || 1
      const pad = 8
      const scaleX = (mmW - pad * 2) / rangeX
      const scaleY = (mmH - pad * 2) / rangeY
      const mmScale = Math.min(scaleX, scaleY)

      // Background
      ctx.fillStyle = 'rgba(15,15,15,0.85)'
      ctx.fillRect(mmX, mmY, mmW, mmH)
      ctx.strokeStyle = 'rgba(80,80,80,0.5)'
      ctx.lineWidth = 1
      ctx.strokeRect(mmX, mmY, mmW, mmH)

      // Node dots
      for (const n of ns) {
        const mx = mmX + pad + (n.x - minX) * mmScale
        const my = mmY + pad + (n.y - minY) * mmScale
        ctx.fillStyle = n.dead ? 'rgba(120,120,120,0.5)' : getClusterColor(n.cluster)
        ctx.fillRect(mx - 1, my - 1, 2, 2)
      }

      // Viewport rectangle
      const vpCenterWX = -cam.x / cam.zoom
      const vpCenterWY = -cam.y / cam.zoom
      const vpHalfW = w / 2 / cam.zoom
      const vpHalfH = h / 2 / cam.zoom
      const vpL = mmX + pad + (vpCenterWX - vpHalfW - minX) * mmScale
      const vpT = mmY + pad + (vpCenterWY - vpHalfH - minY) * mmScale
      const vpW = (w / cam.zoom) * mmScale
      const vpH = (h / cam.zoom) * mmScale
      ctx.strokeStyle = 'rgba(255,140,0,0.7)'
      ctx.lineWidth = 1
      ctx.strokeRect(vpL, vpT, vpW, vpH)

      // Store for click handling
      minimapRef.current = { x: mmX, y: mmY, w: mmW, h: mmH, minX, minY, scale: mmScale }
    }

    // HUD info
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`Nodes: ${ns.length}  Edges: ${es.length}  Zoom: ${cam.zoom.toFixed(2)}x`, 8, h - 8)
  }, [hoveredNode, selectedNodeId, highlightFile, impactMap])

  // Animation loop
  useEffect(() => {
    simulationActive.current = true
    tickCount.current = 0

    const loop = () => {
      if (!simulationActive.current) return
      tick()
      render()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)

    return () => {
      simulationActive.current = false
      cancelAnimationFrame(animRef.current)
    }
  }, [tick, render])

  // Find node at canvas position
  const findNodeAt = useCallback((clientX: number, clientY: number): GraphNode | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const cam = camRef.current
    const w = rect.width
    const h = rect.height
    const wx = (clientX - rect.left - w / 2 - cam.x) / cam.zoom
    const wy = (clientY - rect.top - h / 2 - cam.y) / cam.zoom

    let closest: GraphNode | null = null
    let closestDist = Infinity
    for (const n of nodesRef.current) {
      const dx = n.x - wx
      const dy = n.y - wy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const radius = Math.max(3, Math.min(18, 3 + n.size * 1.5)) + 4
      if (dist < radius && dist < closestDist) {
        closest = n
        closestDist = dist
      }
    }
    return closest
  }, [])

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Check minimap interaction
    const canvas = canvasRef.current
    if (canvas && minimapRef.current) {
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const mm = minimapRef.current
      if (cx >= mm.x && cx <= mm.x + mm.w && cy >= mm.y && cy <= mm.y + mm.h) {
        // Start minimap drag — move camera to clicked position and begin drag
        const pad = 8
        const worldX = (cx - mm.x - pad) / mm.scale + mm.minX
        const worldY = (cy - mm.y - pad) / mm.scale + mm.minY
        camRef.current.x = -worldX * camRef.current.zoom
        camRef.current.y = -worldY * camRef.current.zoom
        dragRef.current = {
          dragging: true, startX: e.clientX, startY: e.clientY,
          camStartX: camRef.current.x, camStartY: camRef.current.y,
          draggedNode: null, minimapDrag: true,
        }
        return
      }
    }

    const node = findNodeAt(e.clientX, e.clientY)
    if (node) {
      dragRef.current = {
        dragging: true, startX: e.clientX, startY: e.clientY,
        camStartX: camRef.current.x, camStartY: camRef.current.y,
        draggedNode: node, minimapDrag: false,
      }
    } else {
      dragRef.current = {
        dragging: true, startX: e.clientX, startY: e.clientY,
        camStartX: camRef.current.x, camStartY: camRef.current.y,
        draggedNode: null, minimapDrag: false,
      }
    }
  }, [findNodeAt])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current
    if (d.dragging) {
      if (d.minimapDrag && minimapRef.current) {
        // Minimap drag: convert mouse delta to world coords and move camera
        const mm = minimapRef.current
        const dx = e.clientX - d.startX
        const dy = e.clientY - d.startY
        const worldDx = dx / mm.scale
        const worldDy = dy / mm.scale
        camRef.current.x = d.camStartX - worldDx * camRef.current.zoom
        camRef.current.y = d.camStartY - worldDy * camRef.current.zoom
      } else {
        const dx = e.clientX - d.startX
        const dy = e.clientY - d.startY
        if (d.draggedNode) {
          d.draggedNode.x += dx / camRef.current.zoom
          d.draggedNode.y += dy / camRef.current.zoom
          d.draggedNode.vx = 0
          d.draggedNode.vy = 0
          d.startX = e.clientX
          d.startY = e.clientY
        } else {
          camRef.current.x = d.camStartX + dx
          camRef.current.y = d.camStartY + dy
        }
      }
    } else {
      const node = findNodeAt(e.clientX, e.clientY)
      setHoveredNode(node)
      onHoverNode?.(node, e.clientX, e.clientY)
    }
  }, [findNodeAt, onHoverNode])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current
    if (d.dragging && !d.minimapDrag) {
      const dx = Math.abs(e.clientX - d.startX)
      const dy = Math.abs(e.clientY - d.startY)
      if (d.draggedNode && dx < 3 && dy < 3) {
        onSelectNode(d.draggedNode.id === selectedNodeId ? null : d.draggedNode)
      } else if (!d.draggedNode && dx < 3 && dy < 3) {
        onSelectNode(null)
      }
    }
    dragRef.current = { dragging: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0, draggedNode: null, minimapDrag: false }
  }, [onSelectNode, selectedNodeId])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(5, camRef.current.zoom * factor))
    camRef.current.zoom = newZoom
  }, [])

  const handleDblClick = useCallback((e: React.MouseEvent) => {
    const node = findNodeAt(e.clientX, e.clientY)
    if (node) {
      camRef.current.x = -node.x * camRef.current.zoom
      camRef.current.y = -node.y * camRef.current.zoom
    }
  }, [findNodeAt])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      style={{ background: '#111111' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setHoveredNode(null)
        onHoverNode?.(null, 0, 0)
        if (dragRef.current.dragging) {
          dragRef.current = { dragging: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0, draggedNode: null, minimapDrag: false }
        }
      }}
      onWheel={handleWheel}
      onDoubleClick={handleDblClick}
    />
  )
})

export default OntologyGraph
