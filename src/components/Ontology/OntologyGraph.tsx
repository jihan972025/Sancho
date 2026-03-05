import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react'

export interface GraphNode {
  id: string
  label: string
  type: string
  file: string
  line?: number
  cluster: number
  size: number
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
}

export interface GraphHandle {
  zoomIn: () => void
  zoomOut: () => void
  focusOnFile: (file: string) => void
}

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId: string | null
  highlightFile: string | null
  onSelectNode: (node: GraphNode | null) => void
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

const OntologyGraph = forwardRef<GraphHandle, Props>(function OntologyGraph({ nodes, edges, selectedNodeId, highlightFile, onSelectNode }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const nodesRef = useRef<GraphNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])

  // Camera state
  const camRef = useRef({ x: 0, y: 0, zoom: 1 })

  useImperativeHandle(ref, () => ({
    zoomIn() {
      camRef.current.zoom = Math.min(5, camRef.current.zoom * 1.3)
    },
    zoomOut() {
      camRef.current.zoom = Math.max(0.1, camRef.current.zoom * 0.7)
    },
    focusOnFile(file: string) {
      // Find all nodes belonging to this file
      const fileNodes = nodesRef.current.filter((n) => n.file === file)
      if (fileNodes.length === 0) return
      // Compute centroid
      let cx = 0, cy = 0
      for (const n of fileNodes) { cx += n.x; cy += n.y }
      cx /= fileNodes.length
      cy /= fileNodes.length
      // Center camera on centroid with a nice zoom level
      camRef.current.x = -cx * camRef.current.zoom
      camRef.current.y = -cy * camRef.current.zoom
    },
  }))
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; camStartX: number; camStartY: number; draggedNode: GraphNode | null }>({
    dragging: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0, draggedNode: null,
  })
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)

  // Build adjacency for fast lookup
  const adjRef = useRef<Map<string, Set<string>>>(new Map())

  // Initialize node positions
  useEffect(() => {
    if (nodes.length === 0) {
      nodesRef.current = []
      edgesRef.current = []
      return
    }

    // Initialize positions in a spiral
    const initialized = nodes.map((n, i) => {
      const angle = i * 2.39996  // golden angle
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

    // Center camera
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

    // Cool down simulation after initial convergence
    const alpha = Math.max(0.001, 0.3 * Math.pow(0.99, tickCount.current))
    tickCount.current++

    if (alpha > 0.005) {
      // Repulsion (Barnes-Hut simplified: all pairs for < 500 nodes)
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

    // Update node map
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

    // Clear with dark background
    ctx.fillStyle = '#111111'
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.translate(w / 2 + cam.x, h / 2 + cam.y)
    ctx.scale(cam.zoom, cam.zoom)

    const adj = adjRef.current
    const hovId = hoveredNode?.id ?? null
    const selId = selectedNodeId
    const hlFile = highlightFile

    // Determine connected nodes for highlighting
    const connectedToHover = new Set<string>()
    if (hovId) {
      connectedToHover.add(hovId)
      adj.get(hovId)?.forEach((id) => connectedToHover.add(id))
    }

    // Determine file-related nodes (file's own nodes + their direct neighbors)
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

      if (hovId) {
        if (connectedToHover.has(e.source) && connectedToHover.has(e.target)) {
          const color = getClusterColor(s.cluster)
          const [r, g, b] = hexToRgb(color)
          edgeColor = `rgba(${r},${g},${b},0.6)`
          width = 1.5
          if (e.type === 'calls') { showArrow = true; showOrder = e.order != null }
        } else {
          edgeColor = `rgba(94,94,94,0.06)`
          width = 0.3
        }
      } else if (hlFile) {
        const srcInFile = fileRelated.has(e.source) && (nodeMapRef.current.get(e.source)?.file === hlFile)
        const tgtInFile = fileRelated.has(e.target) && (nodeMapRef.current.get(e.target)?.file === hlFile)
        if (srcInFile || tgtInFile) {
          const color = getClusterColor(s.cluster)
          const [r, g, b] = hexToRgb(color)
          edgeColor = `rgba(${r},${g},${b},0.5)`
          width = 1.2
          if (e.type === 'calls') { showArrow = true; showOrder = e.order != null }
        } else {
          edgeColor = `rgba(94,94,94,0.04)`
          width = 0.3
        }
      } else {
        if (e.type === 'calls') showArrow = true
      }

      ctx.strokeStyle = edgeColor
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(t.x, t.y)
      ctx.stroke()

      // Arrow head for call edges
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

      // Order number badge for call edges
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
      const [r, g, b] = hexToRgb(color)

      let alpha = 1
      let radius = baseRadius
      let glowRadius = 0

      // Dimming when hovering another node
      if (hovId && !connectedToHover.has(n.id)) {
        alpha = 0.15
      }

      // Highlight for file filter: file's nodes full, neighbors slightly dim, rest very dim
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

      // Glow for hovered node
      if (n.id === hovId) {
        glowRadius = radius + 8
        alpha = 1
      }

      // Selected node: orange ring
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

      // Draw circle
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
      ctx.beginPath()
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2)
      ctx.fill()

      // Selected border
      if (n.id === selId) {
        ctx.strokeStyle = '#FF8C00'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Label (only if zoom > 0.4 or node is important)
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

    // HUD info
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`Nodes: ${ns.length}  Edges: ${es.length}  Zoom: ${cam.zoom.toFixed(2)}x`, 8, h - 8)
  }, [hoveredNode, selectedNodeId, highlightFile])

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
    // Convert screen coords to world coords
    const wx = (clientX - rect.left - w / 2 - cam.x) / cam.zoom
    const wy = (clientY - rect.top - h / 2 - cam.y) / cam.zoom

    let closest: GraphNode | null = null
    let closestDist = Infinity
    for (const n of nodesRef.current) {
      const dx = n.x - wx
      const dy = n.y - wy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const radius = Math.max(3, Math.min(18, 3 + n.size * 1.5)) + 4 // hit area padding
      if (dist < radius && dist < closestDist) {
        closest = n
        closestDist = dist
      }
    }
    return closest
  }, [])

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const node = findNodeAt(e.clientX, e.clientY)
    if (node) {
      dragRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        camStartX: camRef.current.x,
        camStartY: camRef.current.y,
        draggedNode: node,
      }
    } else {
      dragRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        camStartX: camRef.current.x,
        camStartY: camRef.current.y,
        draggedNode: null,
      }
    }
  }, [findNodeAt])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current
    if (d.dragging) {
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (d.draggedNode) {
        // Drag node
        d.draggedNode.x += dx / camRef.current.zoom
        d.draggedNode.y += dy / camRef.current.zoom
        d.draggedNode.vx = 0
        d.draggedNode.vy = 0
        d.startX = e.clientX
        d.startY = e.clientY
      } else {
        // Pan camera
        camRef.current.x = d.camStartX + dx
        camRef.current.y = d.camStartY + dy
      }
    } else {
      const node = findNodeAt(e.clientX, e.clientY)
      setHoveredNode(node)
    }
  }, [findNodeAt])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current
    if (d.dragging) {
      const dx = Math.abs(e.clientX - d.startX)
      const dy = Math.abs(e.clientY - d.startY)
      // Click (not drag)
      if (d.draggedNode && dx < 3 && dy < 3) {
        onSelectNode(d.draggedNode.id === selectedNodeId ? null : d.draggedNode)
      } else if (!d.draggedNode && dx < 3 && dy < 3) {
        onSelectNode(null)
      }
    }
    dragRef.current = { dragging: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0, draggedNode: null }
  }, [onSelectNode, selectedNodeId])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(5, camRef.current.zoom * factor))
    camRef.current.zoom = newZoom
  }, [])

  // Double-click to center on node
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
        if (dragRef.current.dragging) {
          dragRef.current = { dragging: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0, draggedNode: null }
        }
      }}
      onWheel={handleWheel}
      onDoubleClick={handleDblClick}
    />
  )
})

export default OntologyGraph
