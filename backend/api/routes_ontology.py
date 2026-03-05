import os
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/ontology", tags=["ontology"])


class AnalyzeRequest(BaseModel):
    path: str


class OntologyNode(BaseModel):
    id: str
    label: str
    type: str  # class, method, file, function, module, interface
    file: str
    line: Optional[int] = None
    cluster: int = 0
    size: int = 1


class OntologyEdge(BaseModel):
    source: str
    target: str
    type: str  # calls, imports, extends, implements, references


# ---------------------------------------------------------------------------
# Java parser
# ---------------------------------------------------------------------------

_JAVA_CLASS_RE = re.compile(
    r"\b(?:public\s+|abstract\s+|final\s+)*(?:class|interface|enum)\s+(\w+)"
    r"(?:\s+extends\s+(\w+))?"
    r"(?:\s+implements\s+([\w,\s]+))?"
)
_JAVA_METHOD_RE = re.compile(
    r"(?:public|protected|private|static|final|abstract|synchronized|native|\s)+"
    r"[\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{"
)
_JAVA_CALL_RE = re.compile(r"\b(\w+)\s*\(")
_JAVA_IMPORT_RE = re.compile(r"import\s+(?:static\s+)?([\w.]+)\s*;")


def _parse_java(filepath: str, nodes: dict, edges: list, file_label: str):
    """Parse a .java file and extract classes, methods, and call relationships."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
    except Exception:
        return

    lines = content.split("\n")
    current_class = None

    # Extract imports
    for m in _JAVA_IMPORT_RE.finditer(content):
        imp = m.group(1)
        short = imp.split(".")[-1]
        imp_id = f"class:{short}"
        if imp_id not in nodes:
            nodes[imp_id] = OntologyNode(
                id=imp_id, label=short, type="class", file="(external)", cluster=0
            )

    # Extract classes / interfaces
    for m in _JAVA_CLASS_RE.finditer(content):
        cls_name = m.group(1)
        cls_id = f"class:{cls_name}"
        line_no = content[: m.start()].count("\n") + 1
        nodes[cls_id] = OntologyNode(
            id=cls_id, label=cls_name, type="class", file=file_label, line=line_no
        )
        current_class = cls_name

        if m.group(2):  # extends
            parent = m.group(2)
            parent_id = f"class:{parent}"
            if parent_id not in nodes:
                nodes[parent_id] = OntologyNode(
                    id=parent_id, label=parent, type="class", file="(external)"
                )
            edges.append(OntologyEdge(source=cls_id, target=parent_id, type="extends"))

        if m.group(3):  # implements
            for iface in m.group(3).split(","):
                iface = iface.strip()
                if iface:
                    iface_id = f"class:{iface}"
                    if iface_id not in nodes:
                        nodes[iface_id] = OntologyNode(
                            id=iface_id,
                            label=iface,
                            type="interface",
                            file="(external)",
                        )
                    edges.append(
                        OntologyEdge(
                            source=cls_id, target=iface_id, type="implements"
                        )
                    )

    # Extract methods
    for m in _JAVA_METHOD_RE.finditer(content):
        method_name = m.group(1)
        if method_name in ("if", "for", "while", "switch", "catch", "return"):
            continue
        line_no = content[: m.start()].count("\n") + 1
        owner = current_class or file_label
        method_id = f"method:{owner}.{method_name}"
        nodes[method_id] = OntologyNode(
            id=method_id,
            label=f"{owner}.{method_name}()",
            type="method",
            file=file_label,
            line=line_no,
        )
        if current_class:
            edges.append(
                OntologyEdge(
                    source=f"class:{current_class}", target=method_id, type="calls"
                )
            )

        # Find method calls inside this method body
        brace_count = 0
        body_start = m.end() - 1
        body_end = body_start
        for i in range(body_start, len(content)):
            if content[i] == "{":
                brace_count += 1
            elif content[i] == "}":
                brace_count -= 1
                if brace_count == 0:
                    body_end = i
                    break
        body = content[body_start:body_end]
        for call in _JAVA_CALL_RE.finditer(body):
            callee = call.group(1)
            if callee in (
                "if", "for", "while", "switch", "catch", "return",
                "new", "super", "this", "System", "String", "Integer",
                "Boolean", "Long", "Double", "Float", "Math",
            ):
                continue
            # Try to match to a known method
            callee_id = f"method:{owner}.{callee}"
            if callee_id != method_id:
                edges.append(
                    OntologyEdge(source=method_id, target=callee_id, type="calls")
                )


# ---------------------------------------------------------------------------
# Generic file parsers (Python, TypeScript/JS, C/C++, Go, etc.)
# ---------------------------------------------------------------------------

_PY_IMPORT_RE = re.compile(
    r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))", re.MULTILINE
)
_PY_CLASS_RE = re.compile(r"^\s*class\s+(\w+)", re.MULTILINE)
_PY_FUNC_RE = re.compile(r"^\s*def\s+(\w+)", re.MULTILINE)

_TS_IMPORT_RE = re.compile(
    r"""(?:import\s+(?:(?:\{[^}]*\}|\w+|\*\s+as\s+\w+)(?:\s*,\s*(?:\{[^}]*\}|\w+|\*\s+as\s+\w+))*\s+from\s+)?['\"]([^'\"]+)['\"]|require\s*\(\s*['\"]([^'\"]+)['\"]\s*\))"""
)
_TS_CLASS_RE = re.compile(r"\bclass\s+(\w+)", re.MULTILINE)
_TS_FUNC_RE = re.compile(
    r"(?:export\s+)?(?:async\s+)?function\s+(\w+)", re.MULTILINE
)

_GO_IMPORT_RE = re.compile(r'"([\w./]+)"')
_GO_FUNC_RE = re.compile(r"^func\s+(?:\([^)]*\)\s+)?(\w+)", re.MULTILINE)

_C_INCLUDE_RE = re.compile(r'#include\s+[<"]([^>"]+)[>"]')
_C_FUNC_RE = re.compile(
    r"^[\w*]+\s+(\w+)\s*\([^)]*\)\s*\{", re.MULTILINE
)


def _parse_generic(filepath: str, nodes: dict, edges: list, file_label: str):
    """Parse Python, TS/JS, Go, C/C++ files for basic relationships."""
    ext = os.path.splitext(filepath)[1].lower()
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
    except Exception:
        return

    file_id = f"file:{file_label}"
    nodes[file_id] = OntologyNode(
        id=file_id, label=file_label, type="file", file=file_label
    )

    if ext in (".py",):
        for m in _PY_IMPORT_RE.finditer(content):
            mod = m.group(1) or m.group(2)
            short = mod.split(".")[-1]
            mod_id = f"module:{short}"
            if mod_id not in nodes:
                nodes[mod_id] = OntologyNode(
                    id=mod_id, label=short, type="module", file="(external)"
                )
            edges.append(OntologyEdge(source=file_id, target=mod_id, type="imports"))
        for m in _PY_CLASS_RE.finditer(content):
            cls_id = f"class:{m.group(1)}"
            line_no = content[: m.start()].count("\n") + 1
            nodes[cls_id] = OntologyNode(
                id=cls_id, label=m.group(1), type="class", file=file_label, line=line_no
            )
            edges.append(OntologyEdge(source=file_id, target=cls_id, type="references"))
        for m in _PY_FUNC_RE.finditer(content):
            fn_id = f"function:{file_label}.{m.group(1)}"
            line_no = content[: m.start()].count("\n") + 1
            nodes[fn_id] = OntologyNode(
                id=fn_id, label=m.group(1), type="function", file=file_label, line=line_no
            )
            edges.append(OntologyEdge(source=file_id, target=fn_id, type="references"))

    elif ext in (".ts", ".tsx", ".js", ".jsx", ".mjs"):
        for m in _TS_IMPORT_RE.finditer(content):
            mod = m.group(1) or m.group(2)
            short = mod.split("/")[-1]
            mod_id = f"module:{short}"
            if mod_id not in nodes:
                nodes[mod_id] = OntologyNode(
                    id=mod_id, label=short, type="module", file="(external)"
                )
            edges.append(OntologyEdge(source=file_id, target=mod_id, type="imports"))
        for m in _TS_CLASS_RE.finditer(content):
            cls_id = f"class:{m.group(1)}"
            line_no = content[: m.start()].count("\n") + 1
            nodes[cls_id] = OntologyNode(
                id=cls_id, label=m.group(1), type="class", file=file_label, line=line_no
            )
            edges.append(OntologyEdge(source=file_id, target=cls_id, type="references"))
        for m in _TS_FUNC_RE.finditer(content):
            fn_id = f"function:{file_label}.{m.group(1)}"
            line_no = content[: m.start()].count("\n") + 1
            nodes[fn_id] = OntologyNode(
                id=fn_id, label=m.group(1), type="function", file=file_label, line=line_no
            )
            edges.append(OntologyEdge(source=file_id, target=fn_id, type="references"))

    elif ext in (".go",):
        for m in _GO_IMPORT_RE.finditer(content):
            mod = m.group(1).split("/")[-1]
            mod_id = f"module:{mod}"
            if mod_id not in nodes:
                nodes[mod_id] = OntologyNode(
                    id=mod_id, label=mod, type="module", file="(external)"
                )
            edges.append(OntologyEdge(source=file_id, target=mod_id, type="imports"))
        for m in _GO_FUNC_RE.finditer(content):
            fn_id = f"function:{file_label}.{m.group(1)}"
            line_no = content[: m.start()].count("\n") + 1
            nodes[fn_id] = OntologyNode(
                id=fn_id, label=m.group(1), type="function", file=file_label, line=line_no
            )
            edges.append(OntologyEdge(source=file_id, target=fn_id, type="references"))

    elif ext in (".c", ".cpp", ".cc", ".h", ".hpp"):
        for m in _C_INCLUDE_RE.finditer(content):
            inc = m.group(1).split("/")[-1]
            mod_id = f"module:{inc}"
            if mod_id not in nodes:
                nodes[mod_id] = OntologyNode(
                    id=mod_id, label=inc, type="module", file="(external)"
                )
            edges.append(OntologyEdge(source=file_id, target=mod_id, type="imports"))
        for m in _C_FUNC_RE.finditer(content):
            fn_name = m.group(1)
            if fn_name in ("if", "for", "while", "switch", "return", "main"):
                continue
            fn_id = f"function:{file_label}.{fn_name}"
            line_no = content[: m.start()].count("\n") + 1
            nodes[fn_id] = OntologyNode(
                id=fn_id, label=fn_name, type="function", file=file_label, line=line_no
            )
            edges.append(OntologyEdge(source=file_id, target=fn_id, type="references"))


# ---------------------------------------------------------------------------
# Community detection (simple label propagation)
# ---------------------------------------------------------------------------

def _detect_communities(nodes: dict, edges: list) -> None:
    """Assign cluster IDs via simple label propagation."""
    node_ids = list(nodes.keys())
    if not node_ids:
        return
    label_map = {nid: i for i, nid in enumerate(node_ids)}

    # Build adjacency
    adj: dict[str, list[str]] = {nid: [] for nid in node_ids}
    for e in edges:
        if e.source in adj and e.target in adj:
            adj[e.source].append(e.target)
            adj[e.target].append(e.source)

    # Iterate label propagation
    import random
    for _ in range(10):
        order = list(node_ids)
        random.shuffle(order)
        for nid in order:
            neighbors = adj.get(nid, [])
            if not neighbors:
                continue
            # Most common label among neighbors
            counts: dict[int, int] = {}
            for nb in neighbors:
                lbl = label_map[nb]
                counts[lbl] = counts.get(lbl, 0) + 1
            best = max(counts, key=lambda k: counts[k])
            label_map[nid] = best

    # Remap to consecutive cluster indices
    unique_labels = sorted(set(label_map.values()))
    remap = {old: new for new, old in enumerate(unique_labels)}
    for nid in node_ids:
        nodes[nid].cluster = remap[label_map[nid]]


# ---------------------------------------------------------------------------
# Compute node sizes based on degree
# ---------------------------------------------------------------------------

def _compute_sizes(nodes: dict, edges: list) -> None:
    degree: dict[str, int] = {nid: 0 for nid in nodes}
    for e in edges:
        if e.source in degree:
            degree[e.source] += 1
        if e.target in degree:
            degree[e.target] += 1
    for nid, d in degree.items():
        nodes[nid].size = max(1, d)


# ---------------------------------------------------------------------------
# Scan directory and build graph
# ---------------------------------------------------------------------------

SUPPORTED_EXTENSIONS = {
    ".java", ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs",
    ".go", ".c", ".cpp", ".cc", ".h", ".hpp",
}

MAX_FILES = 500
MAX_FILE_SIZE = 512 * 1024  # 512 KB


def _scan_and_parse(root: str):
    nodes: dict[str, OntologyNode] = {}
    edges: list[OntologyEdge] = []
    file_count = 0

    for dirpath, dirnames, filenames in os.walk(root):
        # Skip hidden and common non-source dirs
        dirnames[:] = [
            d for d in dirnames
            if not d.startswith(".")
            and d not in ("node_modules", "__pycache__", "venv", ".venv", "build",
                          "dist", "target", "bin", "obj", ".git", ".idea")
        ]
        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            if ext not in SUPPORTED_EXTENSIONS:
                continue
            filepath = os.path.join(dirpath, fname)
            if os.path.getsize(filepath) > MAX_FILE_SIZE:
                continue
            file_count += 1
            if file_count > MAX_FILES:
                break

            rel = os.path.relpath(filepath, root).replace("\\", "/")

            if ext == ".java":
                _parse_java(filepath, nodes, edges, rel)
            else:
                _parse_generic(filepath, nodes, edges, rel)

        if file_count > MAX_FILES:
            break

    # Deduplicate edges
    seen = set()
    unique_edges = []
    for e in edges:
        key = (e.source, e.target, e.type)
        if key not in seen:
            seen.add(key)
            # Only keep edges where both endpoints exist
            if e.source in nodes and e.target in nodes:
                unique_edges.append(e)

    _compute_sizes(nodes, unique_edges)
    _detect_communities(nodes, unique_edges)

    return list(nodes.values()), unique_edges


# ---------------------------------------------------------------------------
# API endpoint
# ---------------------------------------------------------------------------

@router.post("/analyze")
async def analyze_ontology(req: AnalyzeRequest):
    folder = req.path
    if not os.path.isdir(folder):
        raise HTTPException(status_code=400, detail=f"Not a directory: {folder}")
    nodes, edges = _scan_and_parse(folder)
    return {
        "nodes": [n.model_dump() for n in nodes],
        "edges": [e.model_dump() for e in edges],
    }


@router.post("/list-files")
async def list_files(req: AnalyzeRequest):
    """List supported source files in a directory."""
    folder = req.path
    if not os.path.isdir(folder):
        raise HTTPException(status_code=400, detail=f"Not a directory: {folder}")
    files = []
    count = 0
    for dirpath, dirnames, filenames in os.walk(folder):
        dirnames[:] = [
            d for d in dirnames
            if not d.startswith(".")
            and d not in ("node_modules", "__pycache__", "venv", ".venv", "build",
                          "dist", "target", "bin", "obj", ".git", ".idea")
        ]
        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            if ext not in SUPPORTED_EXTENSIONS:
                continue
            filepath = os.path.join(dirpath, fname)
            rel = os.path.relpath(filepath, folder).replace("\\", "/")
            files.append({"path": rel, "ext": ext})
            count += 1
            if count >= MAX_FILES:
                break
        if count >= MAX_FILES:
            break
    return {"files": files}
