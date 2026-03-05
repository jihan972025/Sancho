# Ontology Analysis — Technical Documentation

Sancho's **Ontology Analysis** is a static code analysis tool that visually analyzes relationships between classes, methods, and functions in source code.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Supported Languages & Parsing Engine](#2-supported-languages--parsing-engine)
3. [Graph Data Model](#3-graph-data-model)
4. [Static Analysis Algorithms](#4-static-analysis-algorithms)
5. [Security Vulnerability Detection Engine](#5-security-vulnerability-detection-engine)
6. [Canvas Rendering Engine](#6-canvas-rendering-engine)
7. [Layout Algorithms](#7-layout-algorithms)
8. [Interaction System](#8-interaction-system)
9. [API Specification](#9-api-specification)
10. [Performance Optimization](#10-performance-optimization)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Canvas 2D)                               │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │FileList  │  │ OntologyGraph│  │ OntologyProperties    │  │
│  │(Tree UI) │  │ (Canvas 2D)  │  │ (Stats, Vulns, Paths) │  │
│  └──────────┘  └──────────────┘  └───────────────────────┘  │
│       ↑              ↑                     ↑                │
│       └──────────────┼─────────────────────┘                │
│                OntologyPanel (State Orchestrator)            │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API (POST)
┌─────────────────────────┴───────────────────────────────────┐
│  Backend (Python FastAPI)                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ routes_ontology.py                                    │   │
│  │  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │   │
│  │  │ Parsers │→ │ Analysis │→ │ Vulnerability Scan │  │   │
│  │  │(Regex)  │  │(DFS/BFS) │  │  (35 Regex Rules)  │  │   │
│  │  └─────────┘  └──────────┘  └────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend | Python 3.11 + FastAPI | REST API, file scanning, static analysis |
| Parsing | Python `re` (regex) | Source code parsing (regex-based, no AST) |
| Frontend | React 18 + TypeScript | State management, UI components |
| Rendering | HTML5 Canvas 2D API | Graph visualization, physics simulation |
| State | Zustand + React Hooks | Global/local state management |
| Styling | Tailwind CSS | UI styling |

### Design Principles

- **Lightweight regex-based parsing**: Rapidly extract code structure using regex without a full AST parser
- **Server-side analysis + client-side rendering**: Analysis on the backend, visualization on the frontend
- **Direct Canvas rendering**: Handle thousands of nodes via Canvas 2D without DOM manipulation
- **Responsive physics simulation**: Natural graph layout using force-directed algorithms

---

## 2. Supported Languages & Parsing Engine

### Supported Extensions

```python
SUPPORTED_EXTENSIONS = {
    ".java", ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs",
    ".go", ".c", ".cpp", ".cc", ".h", ".hpp",
}
```

### Scan Limits

| Parameter | Limit | Reason |
|-----------|-------|--------|
| `MAX_FILES` | 500 files | Prevent memory/time overflow |
| `MAX_FILE_SIZE` | 512 KB | Exclude large generated files |
| Excluded directories | `.git`, `node_modules`, `__pycache__`, `venv`, `build`, `dist`, `target`, `bin`, `obj` | Exclude non-source code |

### 2.1 Java-Specific Parser (`_parse_java`)

Java receives the most detailed analysis.

#### Regex Patterns

```python
# Class/Interface/Enum declarations
_JAVA_CLASS_RE = re.compile(
    r"""\b(?:public\s+|abstract\s+|final\s+)*(?:class|interface|enum)\s+(\w+)
    (?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?""", re.VERBOSE)

# Method declarations (access modifier + return type + name + params + throws + {)
_JAVA_METHOD_RE = re.compile(
    r"""(?:public|protected|private|static|final|abstract|synchronized|native|\s)+
    [\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{""", re.VERBOSE)

# Method calls
_JAVA_CALL_RE = re.compile(r"""\b(\w+)\s*\(""")

# Import statements
_JAVA_IMPORT_RE = re.compile(r"""import\s+(?:static\s+)?([\w.]+)\s*;""")
```

#### Node Generation

| Pattern | Node ID Format | Node Type |
|---------|---------------|-----------|
| `class MyClass` | `class:MyClass` | `class` |
| `interface IFace` | `class:IFace` | `interface` |
| `void method()` | `method:MyClass.method` | `method` |
| `import com.pkg.X` | `class:X` | `class` (external) |

#### Edge Generation

| Relationship | Edge Type | Order |
|-------------|-----------|-------|
| `class A extends B` | `extends` | - |
| `class A implements I` | `implements` | - |
| `A` → `A.method` | `calls` | - |
| `foo()` called inside method | `calls` | 0, 1, 2... (call order) |

#### Method Body Analysis

```
1. Start at the opening brace {
2. Track brace depth to determine method scope
3. Extract all function calls within the body
4. Filter out 37+ built-in methods/keywords:
   - Control flow: if, for, while, switch, catch, return
   - Base classes: System, String, Integer, Math
   - Collections: get, set, add, remove, put, contains
   - Strings: toString, equals, substring, trim
5. Record call order (order)
6. Record method body line count (lines)
```

### 2.2 Generic Parser (`_parse_generic`)

Handles Python, TypeScript/JavaScript, Go, and C/C++.

#### Python Patterns

```python
_PY_IMPORT_RE  = r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))"
_PY_CLASS_RE   = r"^\s*class\s+(\w+)"
_PY_FUNC_RE    = r"^\s*def\s+(\w+)"
```

#### TypeScript/JavaScript Patterns

```python
_TS_IMPORT_RE  = r"(?:import\s+...from\s+)?['\"]([^'\"]+)['\"]|require\s*\(['\"]([^'\"]+)['\"]\)"
_TS_CLASS_RE   = r"\bclass\s+(\w+)"
_TS_FUNC_RE    = r"(?:export\s+)?(?:async\s+)?function\s+(\w+)"
```

#### Go Patterns

```python
_GO_IMPORT_RE  = r"\"([\w./]+)\""
_GO_FUNC_RE    = r"^func\s+(?:\([^)]*\)\s+)?(\w+)"
```

#### C/C++ Patterns

```python
_C_INCLUDE_RE  = r"#include\s+[<\"]([^>\"]+)[>\"]"
_C_FUNC_RE     = r"^[\w*]+\s+(\w+)\s*\([^)]*\)\s*\{"
```

#### Generic Parser Nodes/Edges

| Node Type | ID Format | Creation Condition |
|----------|-----------|-------------------|
| `file` | `file:path/to/file.py` | Every file |
| `module` | `module:name` | import/require |
| `class` | `class:Name` | Class declaration |
| `function` | `function:file.name` | Function definition |

Edge types: `imports` (file → module), `references` (file → class/function)

---

## 3. Graph Data Model

### Pydantic Models (Backend)

```python
class OntologyNode(BaseModel):
    id: str              # "class:MyClass", "method:A.foo", "function:file.fn"
    label: str           # Display name
    type: str            # class | method | function | file | module | interface
    file: str            # Source file path (external: "(external)")
    line: int | None     # Definition line number
    cluster: int = 0     # Community ID (Label Propagation)
    size: int = 1        # fanIn + fanOut (minimum 1)
    fanIn: int = 0       # Incoming edge count
    fanOut: int = 0      # Outgoing edge count
    lines: int = 0       # Method body line count
    dead: bool = False   # Dead code flag
    vulnCount: int = 0   # Vulnerability count

class OntologyEdge(BaseModel):
    source: str          # Source node ID
    target: str          # Target node ID
    type: str            # calls | imports | extends | implements | references
    order: int | None    # Call order (calls only)
    circular: bool = False  # Circular reference flag

class Vulnerability(BaseModel):
    rule: str            # "sql-injection", "xss", etc.
    severity: str        # critical | high | medium | low
    message: str         # Description message
    line: int            # Line where found
    file: str            # File path
    nodeId: str          # Owning node ID
```

### TypeScript Types (Frontend)

```typescript
interface GraphNode extends OntologyNode {
    x: number; y: number   // Canvas coordinates
    vx: number; vy: number // Physics velocity
}

type LayoutMode = 'force' | 'tree' | 'radial'
```

---

## 4. Static Analysis Algorithms

### 4.1 Community Detection (Label Propagation)

Groups related nodes into clusters (communities).

```
Algorithm:
1. Assign each node a unique label (0 to n-1)
2. Build undirected adjacency list
3. Repeat 10 iterations:
   a. Randomly shuffle node order
   b. Update each node to the most frequent label among neighbors
4. Remap to sequential IDs (0, 1, 2...)

Complexity: O(10 × E)
Purpose: Node color grouping, Radial layout sector separation
```

### 4.2 Circular Reference Detection (DFS 3-Color)

```
Algorithm: DFS with WHITE-GRAY-BLACK marking

States:
  WHITE (0) = Unvisited
  GRAY  (1) = Currently in DFS stack
  BLACK (2) = Processing complete

Process:
1. Initialize all nodes as WHITE
2. Start DFS from each unvisited node
3. Mark as GRAY upon visit
4. If neighbor is GRAY → back-edge detected = cycle!
5. If neighbor is WHITE → recurse
6. Mark as BLACK when processing complete

Result: Edges marked with circular=true
Complexity: O(V + E)
```

### 4.3 Dead Code Detection

```
Algorithm:
1. Collect all edge targets → set of referenced nodes
2. method/function nodes NOT in the referenced set → dead=true

Limitations:
- Entry points (main, @RequestMapping, etc.) may produce false positives
- Cannot detect reflection-based or event handler references
- Cannot track external API calls
```

### 4.4 Impact Analysis (BFS 3-Level)

Explores nodes affected when a selected node is modified.

```
Algorithm: Breadth-First Search (BFS)

Input: Selected node (starting point)
Process:
1. Build outgoing adjacency list
2. BFS from starting node, explore up to depth 3
3. Record impact depth for each node

Visualization:
  Level 1 (direct call)    → Orange ring, opacity 0.7
  Level 2 (indirect impact) → Orange ring, opacity 0.5
  Level 3 (ripple effect)   → Orange ring, opacity 0.35
```

### 4.5 Complexity Metrics

```
Fan-in  = Number of edges calling/referencing this node (popularity)
Fan-out = Number of edges this node calls/references (coupling)
Size    = max(1, Fan-in + Fan-out)        (degree centrality)
Lines   = Method body line count           (Java only)

Visual Mapping:
  Node radius = max(3, min(18, 3 + size * 1.5)) pixels
  Node color  = Cluster color + complexity heatmap blending
    - complexity = fanIn + fanOut
    - heat = min(1, complexity / 20)
    - Higher → blends toward red
```

---

## 5. Security Vulnerability Detection Engine

### Architecture

```
File content
  ↓
[Filter rules by file extension]
  ↓
[Regex pattern matching]
  ↓
[Exclude comment lines]  ← Skip lines starting with //, #, *
  ↓
[Map to owning node]     ← Assign to nearest node by line number
  ↓
Vulnerability object created
```

### Total: 35 Rules

#### Java (25 Rules)

**Injection Attacks (7)**

| Severity | Rule | Detection Pattern |
|----------|------|-------------------|
| Critical | SQL Injection | `"SELECT" + variable` string concatenation |
| Critical | Command Injection | `Runtime.exec()`, `ProcessBuilder` |
| Critical | JNDI Injection | `InitialContext.lookup()` with dynamic input |
| Critical | EL Injection | `SpelExpressionParser.parseExpression()` with dynamic input |
| Critical | Template Injection | `Velocity.evaluate()`, FreeMarker, Thymeleaf |
| High | LDAP Injection | String concatenation in `.search()` filter |
| Medium | Log Injection | `logger.info("" + request.getParameter())` |

**Deserialization & Reflection (4)**

| Severity | Rule | Detection Pattern |
|----------|------|-------------------|
| Critical | Unsafe Deserialization | `ObjectInputStream.readObject()` |
| High | Reflection Abuse | `Class.forName()` with dynamic class name |
| High | Unsafe Reflection | `getMethod()` + `invoke()` with dynamic input |
| High | Insecure File Upload | `FileOutputStream(getOriginalFilename())` |

**Cryptography & Authentication (5)**

| Severity | Rule | Detection Pattern |
|----------|------|-------------------|
| Critical | Hardcoded Encryption Key | `SecretKeySpec("hardcoded".getBytes())` |
| Critical | Null Cipher | `new NullCipher()` |
| High | Insecure TLS | `SSLContext.getInstance("TLSv1")`, `NoopHostnameVerifier` |
| Medium | Weak Crypto | `MessageDigest.getInstance("MD5\|SHA1\|DES")` |
| Medium | Insecure Random | `new Random()` (instead of SecureRandom) |

**Web Security (5)**

| Severity | Rule | Detection Pattern |
|----------|------|-------------------|
| High | SSRF | `new URL(request.getParameter())` |
| High | Session Fixation | `getSession()` then `setAttribute("user")` without `invalidate()` |
| Medium | Open Redirect | `sendRedirect(request.getParameter())` |
| Medium | CSRF Disabled | Spring Security `csrf().disable()` |
| Medium | Insecure Cookie | `new Cookie()` without calling `setSecure(true)` |

**File & Miscellaneous (4)**

| Severity | Rule | Detection Pattern |
|----------|------|-------------------|
| High | Path Traversal | `new File(request.getParameter())` |
| Medium | XXE | `DocumentBuilderFactory.newInstance()` |
| Medium | Race Condition | `file.exists()` followed by `file.delete()` (TOCTOU) |
| Medium | Unvalidated Redirect | `response.sendRedirect(request.getParameter())` |

#### Python (4 Rules)

| Severity | Rule | Detection Pattern |
|----------|------|-------------------|
| Critical | SQL Injection | `execute(f"SELECT {var}")` |
| Critical | Command Injection | `os.system()`, `subprocess(shell=True)` |
| Critical | Unsafe Deserialization | `pickle.loads()`, `yaml.load()` |
| High | eval/exec | `eval()`, `exec()` |

#### JS/TS (4 Rules)

| Severity | Rule | Detection Pattern |
|----------|------|-------------------|
| Critical | Command Injection | `child_process.exec()` |
| High | XSS | `innerHTML =`, `document.write()`, `dangerouslySetInnerHTML` |
| High | eval/Function | `eval()`, `new Function()` |
| Medium | Prototype Pollution | `__proto__[` or `__proto__ =` |

#### All Languages (2 Rules)

| Severity | Rule | Detection Pattern |
|----------|------|-------------------|
| High | Hardcoded Credential | `password = "secret123"` |
| Low | Hardcoded IP | `"192.168.1.1"` |

### Comment Filtering

```python
# Skip if the matched line is a comment
stripped = line_text.lstrip()
if stripped.startswith("//") or stripped.startswith("#") or stripped.startswith("*"):
    continue
```

### Owning Node Mapping

```python
# Sort nodes per file by line number in descending order
# Assign to the nearest node preceding the matched line
for n in file_nodes.get(rel_path, []):
    if n.line and n.line <= line_no:
        node_id = n.id
        break
```

---

## 6. Canvas Rendering Engine

### Rendering Pipeline

```
requestAnimationFrame loop
  ↓
tick() — Physics simulation (Force layout only)
  ↓
render() — Canvas 2D drawing
  │
  ├── Background (black)
  ├── Camera transform (translate + scale)
  ├── Edge rendering (arrows + order badges)
  ├── Node rendering (circles + labels + indicators)
  ├── Minimap rendering
  └── HUD info (node/edge count, zoom level)
```

### DPR (Device Pixel Ratio) Handling

```typescript
const dpr = window.devicePixelRatio || 1
canvas.width = rect.width * dpr
canvas.height = rect.height * dpr
ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
```

### Camera System

```typescript
interface Camera {
    x: number    // Horizontal offset
    y: number    // Vertical offset
    zoom: number // Zoom level [0.1 ~ 5.0]
}

// World coordinate transform
ctx.translate(canvasWidth/2 + cam.x, canvasHeight/2 + cam.y)
ctx.scale(cam.zoom, cam.zoom)
```

### Edge Rendering

```
Default:      Opacity 0.15, width 0.5
Hover link:   Opacity 0.6, cluster color
Selected:     Opacity 0.7, width 1.8
Circular ref: Red rgba(255,60,60,0.7), width 1.5+

Arrows:
  Arrow base positioned at target node radius + 2px
  Arrow size = max(4, lineWidth * 3)

Call order badges:
  Orange circle at edge midpoint (radius 7/zoom px)
  Order number displayed inside
```

### Node Rendering

```
Radius: max(3, min(18, 3 + size * 1.5)) px

Color determination:
  1. Cluster color (10-color palette)
  2. Complexity heatmap blending:
     heat = min(1, (fanIn + fanOut) / 20)
     Red intensified, green/blue reduced
  3. Dead code: Gray rgb(120,120,120)

Glow effects:
  Hover: radius+8px radial gradient
  Selected: radius+6px orange gradient

Label display condition:
  zoom > 0.4 OR size > 3 OR hovered OR selected

Vulnerability indicator:
  Red dot at upper-right (radius = max(4, nodeRadius * 0.4))
  Vulnerability count shown when zoom > 0.4

Dead code indicator:
  Dashed border [3,3] pattern
```

### Minimap

```
Position: Bottom-left of canvas (8px margin)
Size: 140×90 px
Background: Semi-transparent black

Node display: 2×2 px dots (dead=gray, others=cluster color)
Viewport: Orange border rectangle (currently visible area)
Interaction: Click/drag to move camera
```

---

## 7. Layout Algorithms

### 7.1 Force-Directed (Physics Simulation)

```
Parameters:
  Initial alpha: 0.3
  Alpha decay: 0.99 per tick
  Stop condition: alpha < 0.005
  Velocity damping: 0.6 per tick

Forces:
  Repulsion: F = (800 × alpha) / distance²    (all node pairs, O(n²))
  Attraction: F = distance × 0.005 × alpha    (edge-connected nodes)
  Gravity:   F = -position × 0.001 × alpha    (pull toward origin)

Characteristics:
  - Natural graph layout
  - Connected nodes cluster together
  - Simulation continues during real-time drag
```

### 7.2 Tree (Hierarchical Layout)

```
Parameters:
  NODE_GAP = 35px   (vertical spacing between siblings)
  DEPTH_GAP = 120px (horizontal spacing between depths)

Algorithm:
1. Select nodes with in-degree=0 as roots
2. Build spanning tree via BFS
3. Calculate leaf count per subtree (bottom-up)
4. X coordinate = depth × DEPTH_GAP
5. Y coordinate distributed based on subtree height
6. Disconnected nodes treated as additional roots
7. Center entire tree at origin

Use case: Call hierarchy visualization, inheritance tree display
```

### 7.3 Radial (Circular Layout)

```
Parameters:
  baseRadius = max(180, nodes.length × 6)
  ringGap = max(50, 30 + nodes.length × 0.5)
  MIN_ARC_DIST = 40px (minimum arc distance between nodes on a ring)

Algorithm:
1. Group nodes by cluster
2. Assign sector angle per cluster (2π / cluster count, 10% padding)
3. Place nodes in each cluster on concentric rings:
   - Arc length per ring = radius × usableAngle
   - Nodes per ring = max(1, floor(arcLen / MIN_ARC_DIST))
4. Node position = (sectorCenter + (i+0.5) × step) angle

Use case: Inter-cluster relationship analysis, overall structure overview
```

---

## 8. Interaction System

### Mouse Events

| Action | Behavior |
|--------|----------|
| Click (node) | Select/deselect node → show properties panel |
| Click (empty space) | Deselect all |
| Drag (node) | Move node position (reset physics velocity) |
| Drag (empty space) | Pan camera |
| Double-click | Focus camera on target node |
| Scroll wheel | Zoom in/out (1.1x / 0.9x, range 0.1–5.0) |
| Hover | Highlight connected nodes + code preview after 400ms |
| Minimap drag | Move camera |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Toggle search |
| `Escape` | Close search |

### Badge Navigation

```
Badge click → Sequential traversal of nodes in that category
  → Select node + focus camera
  → Click again to move to next node (cyclic)

Badge types:
  cycles: Nodes involved in circular references
  dead: Dead code nodes
  vulns: Nodes with vulnerabilities
```

### Inheritance Tree Mode

```
When activated:
  - Filter to extends/implements edges only
  - Display only related nodes
  - Automatically switch layout to Tree mode
```

### Code Preview (Hover Tooltip)

```
1. 400ms debounce on node hover
2. Call backend /api/ontology/code-preview API
3. Return code snippet at line ± 5 lines
4. Display code tooltip near mouse cursor
```

---

## 9. API Specification

### POST `/api/ontology/analyze`

Analyzes a source code folder and returns the graph and vulnerabilities.

```json
// Request
{ "path": "C:/project/my-java-app" }

// Response
{
  "nodes": [
    {
      "id": "class:UserService",
      "label": "UserService",
      "type": "class",
      "file": "src/main/java/com/app/UserService.java",
      "line": 15,
      "cluster": 2,
      "size": 8,
      "fanIn": 3,
      "fanOut": 5,
      "lines": 0,
      "dead": false,
      "vulnCount": 1
    }
  ],
  "edges": [
    {
      "source": "method:UserService.findUser",
      "target": "method:UserRepository.query",
      "type": "calls",
      "order": 0,
      "circular": false
    }
  ],
  "vulnerabilities": [
    {
      "rule": "sql-injection",
      "severity": "critical",
      "message": "Potential SQL injection via string concatenation",
      "line": 42,
      "file": "src/main/java/com/app/UserRepository.java",
      "nodeId": "method:UserRepository.query"
    }
  ]
}
```

### POST `/api/ontology/list-files`

Returns the list of files eligible for analysis.

```json
// Request
{ "path": "C:/project/my-java-app" }

// Response
{
  "files": [
    { "path": "src/main/java/com/app/UserService.java", "ext": ".java" },
    { "path": "src/main/java/com/app/UserRepository.java", "ext": ".java" }
  ]
}
```

### POST `/api/ontology/code-preview`

Returns a code snippet from a specific file.

```json
// Request
{ "file": "C:/project/my-java-app/src/UserService.java", "line": 42, "context": 5 }

// Response
{
  "code": "    public User findUser(String name) {\n        String sql = ...",
  "startLine": 37,
  "endLine": 47
}
```

---

## 10. Performance Optimization

### Backend Optimization

| Technique | Description |
|-----------|-------------|
| File size limit | Skip files larger than 512 KB |
| File count limit | Stop scanning beyond 500 files |
| Directory exclusion | Immediately skip non-source directories (node_modules, etc.) |
| Edge deduplication | Based on (source, target, type) tuple |
| Compiled regex | Compile once at module load time |

### Frontend Optimization

| Technique | Description |
|-----------|-------------|
| `useMemo` | Cache search results, impact analysis, display nodes/edges |
| `useRef` | Store physics state (nodes, edges, camera) in refs to avoid unnecessary re-renders |
| Direct Canvas rendering | Handle thousands of nodes/edges via Canvas 2D without DOM nodes |
| RAF-based loop | 60fps rendering with `requestAnimationFrame` |
| Adjacency list caching | `adjRef` for O(1) neighbor node lookup |
| Node map | `nodeMapRef` for O(1) ID-based node lookup |
| Hover debouncing | 400ms debounce to prevent unnecessary API calls |
| Conditional label rendering | Show/hide labels based on zoom level |
| Alpha decay | Simulation auto-stops when stabilized (alpha < 0.005) |

### Parallel API Calls

```typescript
const [fileResult, graphResult] = await Promise.all([
    listOntologyFiles(folder),
    analyzeOntology(folder),
])
```

---

## Source Files

| File | Role |
|------|------|
| `backend/api/routes_ontology.py` | Complete backend analysis engine |
| `src/components/Ontology/OntologyGraph.tsx` | Canvas rendering, physics simulation, layout |
| `src/components/Ontology/OntologyPanel.tsx` | State management, UI orchestration, Doc modal |
| `src/components/Ontology/OntologyProperties.tsx` | Properties panel, stats, vulnerabilities, cycle paths |
| `src/components/Ontology/OntologyFileList.tsx` | File tree browser |
| `src/api/client.ts` | API type definitions, HTTP client |
