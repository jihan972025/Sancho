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
    fanIn: int = 0
    fanOut: int = 0
    lines: int = 0
    dead: bool = False
    vulnCount: int = 0


class OntologyEdge(BaseModel):
    source: str
    target: str
    type: str  # calls, imports, extends, implements, references
    order: Optional[int] = None  # call sequence order within a method (0-based)
    circular: bool = False


class Vulnerability(BaseModel):
    rule: str        # e.g. "sql-injection", "hardcoded-credential"
    severity: str    # "critical", "high", "medium", "low"
    message: str     # Human-readable description
    line: int        # Line number in file
    file: str        # Relative file path
    nodeId: str      # Enclosing node ID


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

        # Find method calls inside this method body (with call order)
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
        nodes[method_id].lines = body.count("\n") + 1
        call_order = 0
        for call in _JAVA_CALL_RE.finditer(body):
            callee = call.group(1)
            if callee in (
                "if", "for", "while", "switch", "catch", "return",
                "new", "super", "this", "System", "String", "Integer",
                "Boolean", "Long", "Double", "Float", "Math",
                "println", "print", "printf", "format", "toString",
                "equals", "hashCode", "valueOf", "size", "length",
                "get", "set", "add", "remove", "put", "contains",
                "isEmpty", "clear", "iterator", "next", "hasNext",
                "append", "delete", "replace", "substring", "trim",
                "split", "join", "charAt", "indexOf", "lastIndexOf",
                "startsWith", "endsWith", "toLowerCase", "toUpperCase",
                "parseInt", "parseDouble", "parseLong", "parseFloat",
            ):
                continue
            # Try to match to a known method in same class
            callee_id = f"method:{owner}.{callee}"
            if callee_id != method_id:
                # Create placeholder node for callee if it doesn't exist yet
                if callee_id not in nodes:
                    nodes[callee_id] = OntologyNode(
                        id=callee_id,
                        label=f"{owner}.{callee}()",
                        type="method",
                        file=file_label,
                    )
                edges.append(
                    OntologyEdge(source=method_id, target=callee_id, type="calls", order=call_order)
                )
                call_order += 1


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
# Circular dependency detection (DFS back-edge detection)
# ---------------------------------------------------------------------------

def _detect_cycles(nodes: dict, edges: list) -> int:
    """Mark edges that participate in cycles. Returns count of circular edges."""
    adj: dict[str, list[tuple[str, int]]] = {nid: [] for nid in nodes}
    for i, e in enumerate(edges):
        if e.source in adj:
            adj[e.source].append((e.target, i))

    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {nid: WHITE for nid in nodes}
    circular_indices: set[int] = set()

    def dfs(u: str):
        color[u] = GRAY
        for v, ei in adj.get(u, []):
            if v not in color:
                continue
            if color[v] == GRAY:
                circular_indices.add(ei)
            elif color[v] == WHITE:
                dfs(v)
        color[u] = BLACK

    # Increase recursion limit for large graphs
    import sys
    old_limit = sys.getrecursionlimit()
    sys.setrecursionlimit(max(old_limit, len(nodes) + 1000))
    try:
        for nid in nodes:
            if color.get(nid, WHITE) == WHITE:
                dfs(nid)
    finally:
        sys.setrecursionlimit(old_limit)

    for ei in circular_indices:
        edges[ei].circular = True
    return len(circular_indices)


# ---------------------------------------------------------------------------
# Dead code detection
# ---------------------------------------------------------------------------

def _detect_dead_code(nodes: dict, edges: list) -> int:
    """Mark method/function nodes with zero incoming call/reference edges as dead."""
    targets: set[str] = set()
    for e in edges:
        if e.type in ("calls", "references"):
            targets.add(e.target)

    count = 0
    for nid, node in nodes.items():
        if node.type in ("method", "function") and nid not in targets:
            node.dead = True
            count += 1
    return count


# ---------------------------------------------------------------------------
# Security vulnerability detection (regex-based)
# ---------------------------------------------------------------------------

_VULN_RULES: list[tuple[str, str, str, set, re.Pattern]] = []


def _add_rule(rule_id: str, severity: str, message: str, langs: set, pattern: str, flags: int = 0):
    _VULN_RULES.append((rule_id, severity, message, langs, re.compile(pattern, flags)))


# Java
_add_rule("sql-injection", "critical",
    "Potential SQL injection via string concatenation",
    {".java"},
    r"""(?:"|')\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+.*?\+\s*\w+""",
    re.IGNORECASE)

_add_rule("command-injection", "critical",
    "Potential command injection via Runtime.exec() or ProcessBuilder",
    {".java"},
    r"""Runtime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec\s*\(|new\s+ProcessBuilder\s*\(""")

_add_rule("unsafe-deserialization", "critical",
    "Unsafe deserialization via ObjectInputStream.readObject()",
    {".java"},
    r"""ObjectInputStream.*?\.\s*readObject\s*\(""")

_add_rule("weak-crypto", "medium",
    "Use of weak cryptographic algorithm (MD5/SHA1/DES)",
    {".java"},
    r"""MessageDigest\s*\.\s*getInstance\s*\(\s*["'](?:MD5|SHA-?1|DES)["']""",
    re.IGNORECASE)

_add_rule("xxe", "medium",
    "XML parsing without disabling external entities (potential XXE)",
    {".java"},
    r"""DocumentBuilderFactory\s*\.\s*newInstance\s*\(""")

_add_rule("path-traversal", "high",
    "Potential path traversal via File or Paths.get with user-controlled input",
    {".java"},
    r"""(?:new\s+File|Paths\s*\.\s*get)\s*\(\s*(?:request\s*\.\s*getParameter|req\s*\.\s*getParameter|params\s*\.\s*get|input|userInput|fileName|filePath|path\s*\+)""")

_add_rule("ldap-injection", "high",
    "Potential LDAP injection via string concatenation in search filter",
    {".java"},
    r"""\.search\s*\([^)]*["']\s*\(\s*\w+\s*=\s*["']\s*\+""")

_add_rule("ssrf", "high",
    "Potential SSRF via URL connection with user-controlled input",
    {".java"},
    r"""new\s+URL\s*\(\s*(?:request\s*\.\s*getParameter|req\s*\.\s*getParameter|url|uri|endpoint|target)\s*[)+]""")

_add_rule("log-injection", "medium",
    "Potential log injection via string concatenation in logger call",
    {".java"},
    r"""(?:logger|log|LOG|LOGGER)\s*\.\s*(?:info|debug|warn|error|trace|fatal)\s*\(\s*["'].*?\+\s*(?:request\s*\.\s*getParameter|req\s*\.\s*getParameter)""")

_add_rule("insecure-random", "medium",
    "Use of java.util.Random instead of SecureRandom for potentially security-sensitive operation",
    {".java"},
    r"""new\s+Random\s*\(\s*\)|java\s*\.\s*util\s*\.\s*Random""")

_add_rule("jndi-injection", "critical",
    "Potential JNDI injection via InitialContext.lookup with dynamic input",
    {".java"},
    r"""(?:InitialContext|Context)\s*\(?\s*\)?\s*\.?\s*lookup\s*\(\s*(?!["'][a-zA-Z]+:[a-zA-Z])""")

_add_rule("open-redirect", "medium",
    "Potential open redirect via sendRedirect or forward with user-controlled input",
    {".java"},
    r"""(?:sendRedirect|forward)\s*\(\s*(?:request\s*\.\s*getParameter|req\s*\.\s*getParameter|url|redirect|returnUrl|next|target|destination)""",
    re.IGNORECASE)

_add_rule("insecure-file-upload", "high",
    "File upload without proper validation of content type or extension",
    {".java"},
    r"""new\s+FileOutputStream\s*\(\s*.*?(?:getOriginalFilename|getSubmittedFileName)""")

_add_rule("reflection-abuse", "high",
    "Dynamic class loading via Class.forName() with potentially user-controlled input",
    {".java"},
    r"""Class\s*\.\s*forName\s*\(\s*(?!["'])""")

_add_rule("session-fixation", "high",
    "Potential session fixation - session used without invalidation after authentication",
    {".java"},
    r"""request\s*\.\s*getSession\s*\(\s*(?:true\s*)?\)[\s\S]{0,200}setAttribute\s*\(\s*["'](?:user|auth|login|role|principal)""")

_add_rule("csrf-disabled", "medium",
    "CSRF protection explicitly disabled in Spring Security configuration",
    {".java"},
    r"""csrf\s*\(\s*\)\s*\.\s*disable\s*\(\s*\)|csrf\s*\(\s*(?:AbstractHttpConfigurer|Customizer)\s*::\s*disable\s*\)""")

_add_rule("insecure-cookie", "medium",
    "Cookie created without Secure and/or HttpOnly flags",
    {".java"},
    r"""new\s+Cookie\s*\(\s*["'][^"']+["']\s*,\s*[^)]+\)(?![\s\S]{0,200}(?:setSecure\s*\(\s*true|setHttpOnly\s*\(\s*true))""")

_add_rule("hardcoded-encryption-key", "critical",
    "Hardcoded encryption key in SecretKeySpec or Cipher initialization",
    {".java"},
    r"""new\s+SecretKeySpec\s*\(\s*(?:["'][^"']+["']\.getBytes|new\s+byte\s*\[\s*\]\s*\{)""")

_add_rule("insecure-tls", "high",
    "Insecure SSL/TLS protocol version or disabled certificate verification",
    {".java"},
    r"""SSLContext\s*\.\s*getInstance\s*\(\s*["'](?:SSL|TLS|TLSv1(?:\.0|\.1)?)["']\)|HostnameVerifier.*?return\s+true|setHostnameVerifier\s*\(\s*(?:SSLConnectionSocketFactory\s*\.\s*ALLOW_ALL|NoopHostnameVerifier|ALLOW_ALL)""")

_add_rule("el-injection", "critical",
    "Potential Spring Expression Language (SpEL) injection via dynamic expression parsing",
    {".java"},
    r"""(?:SpelExpressionParser|ExpressionParser)\s*(?:\(\s*\))?\s*\.?\s*parseExpression\s*\(\s*(?!["'])""")

_add_rule("template-injection", "critical",
    "Potential server-side template injection via dynamic template evaluation",
    {".java"},
    r"""Velocity\s*\.\s*evaluate\s*\(|VelocityEngine\s*.*?\.(?:evaluate|mergeTemplate)\s*\(|freemarker\s*.*?\.process\s*\(|\.processTemplateIntoString\s*\(""",
    re.IGNORECASE)

_add_rule("race-condition", "medium",
    "Potential race condition in check-then-act pattern on file (TOCTOU)",
    {".java"},
    r"""\.exists\s*\(\s*\)[\s\S]{0,100}(?:\.createNewFile|\.mkdir|\.delete|new\s+FileOutputStream|new\s+FileWriter|Files\s*\.\s*write)""")

_add_rule("null-cipher", "critical",
    "Use of NullCipher provides no encryption",
    {".java"},
    r"""new\s+NullCipher\s*\(""")

_add_rule("unsafe-reflection", "high",
    "Reflective method invocation with potentially user-controlled method name",
    {".java"},
    r"""(?:getMethod|getDeclaredMethod)\s*\(\s*(?!["']).*?\.\s*invoke\s*\(""",
    re.DOTALL)

_add_rule("unvalidated-redirect", "medium",
    "URL redirect using request parameter without validation",
    {".java"},
    r"""(?:response\s*\.\s*sendRedirect|response\s*\.\s*setHeader\s*\(\s*["']Location["'])\s*\(\s*(?:request\s*\.\s*getParameter|req\s*\.\s*getParameter)""")

# Python
_add_rule("sql-injection", "critical",
    "Potential SQL injection via string formatting in execute()",
    {".py"},
    r"""\.execute\s*\(\s*(?:f["']|["'].*?%|["'].*?\.\s*format\s*\()""")

_add_rule("command-injection", "critical",
    "Potential command injection via os.system() or subprocess with shell=True",
    {".py"},
    r"""os\s*\.\s*system\s*\(|subprocess\s*\.\s*(?:call|run|Popen)\s*\([^)]*shell\s*=\s*True""")

_add_rule("unsafe-deserialization", "critical",
    "Unsafe deserialization via pickle or yaml.load without SafeLoader",
    {".py"},
    r"""pickle\s*\.\s*loads?\s*\(|yaml\s*\.\s*load\s*\([^)]*(?!Loader)""")

_add_rule("eval-usage", "high",
    "Use of eval() or exec() can execute arbitrary code",
    {".py"},
    r"""\b(?:eval|exec)\s*\(""")

# TypeScript / JavaScript
_add_rule("xss", "high",
    "Potential XSS via innerHTML, document.write, or dangerouslySetInnerHTML",
    {".ts", ".tsx", ".js", ".jsx", ".mjs"},
    r"""\.innerHTML\s*=|document\s*\.\s*write\s*\(|dangerouslySetInnerHTML""")

_add_rule("command-injection", "critical",
    "Potential command injection via child_process",
    {".ts", ".tsx", ".js", ".jsx", ".mjs"},
    r"""child_process.*?\.exec\s*\(""")

_add_rule("eval-usage", "high",
    "Use of eval() or new Function() can execute arbitrary code",
    {".ts", ".tsx", ".js", ".jsx", ".mjs"},
    r"""\beval\s*\(|new\s+Function\s*\(""")

_add_rule("prototype-pollution", "medium",
    "Potential prototype pollution via __proto__",
    {".ts", ".tsx", ".js", ".jsx", ".mjs"},
    r"""__proto__\s*[=\[]""")

# All languages
_add_rule("hardcoded-credential", "high",
    "Hardcoded credential or secret in source code",
    {".java", ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".go", ".c", ".cpp", ".cc", ".h", ".hpp"},
    r"""(?:password|passwd|secret|api_?key|apikey|api_?secret|auth_?token|access_?token|private_?key)\s*[=:]\s*["'][^"']{4,}["']""",
    re.IGNORECASE)

_add_rule("hardcoded-ip", "low",
    "Hardcoded IP address found",
    {".java", ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".go", ".c", ".cpp", ".cc", ".h", ".hpp"},
    r"""["'](?:\d{1,3}\.){3}\d{1,3}["']""")


def _detect_vulnerabilities(
    nodes: dict, file_contents: dict
) -> list:
    """Scan file contents for security vulnerability patterns."""
    vulnerabilities: list[Vulnerability] = []

    # Build lookup: file -> nodes sorted by line desc (to find enclosing node)
    file_nodes: dict[str, list] = {}
    for node in nodes.values():
        if node.file and node.file != "(external)" and node.line:
            file_nodes.setdefault(node.file, []).append(node)
    for fn_list in file_nodes.values():
        fn_list.sort(key=lambda n: n.line or 0, reverse=True)

    for rel_path, content in file_contents.items():
        ext = os.path.splitext(rel_path)[1].lower()
        lines = content.split("\n")

        for rule_id, severity, message, langs, pattern in _VULN_RULES:
            if ext not in langs:
                continue

            for m in pattern.finditer(content):
                line_no = content[:m.start()].count("\n") + 1

                # Skip matches inside comments
                line_text = lines[line_no - 1] if line_no <= len(lines) else ""
                stripped = line_text.lstrip()
                if stripped.startswith("//") or stripped.startswith("#") or stripped.startswith("*"):
                    continue

                # Find enclosing node
                node_id = f"file:{rel_path}"
                for n in file_nodes.get(rel_path, []):
                    if n.line and n.line <= line_no:
                        node_id = n.id
                        break

                vulnerabilities.append(Vulnerability(
                    rule=rule_id,
                    severity=severity,
                    message=message,
                    line=line_no,
                    file=rel_path,
                    nodeId=node_id,
                ))

    # Update vulnCount on nodes
    for v in vulnerabilities:
        if v.nodeId in nodes:
            nodes[v.nodeId].vulnCount += 1

    return vulnerabilities


# ---------------------------------------------------------------------------
# Compute node sizes based on degree
# ---------------------------------------------------------------------------

def _compute_sizes(nodes: dict, edges: list) -> None:
    in_deg: dict[str, int] = {nid: 0 for nid in nodes}
    out_deg: dict[str, int] = {nid: 0 for nid in nodes}
    for e in edges:
        if e.source in out_deg:
            out_deg[e.source] += 1
        if e.target in in_deg:
            in_deg[e.target] += 1
    for nid in nodes:
        nodes[nid].fanIn = in_deg[nid]
        nodes[nid].fanOut = out_deg[nid]
        nodes[nid].size = max(1, in_deg[nid] + out_deg[nid])


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
    file_contents: dict[str, str] = {}  # rel_path -> content for vuln scanning
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

            # Cache file content for vulnerability scanning
            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    file_contents[rel] = f.read()
            except Exception:
                pass

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
    _detect_cycles(nodes, unique_edges)
    _detect_dead_code(nodes, unique_edges)
    vulnerabilities = _detect_vulnerabilities(nodes, file_contents)

    return list(nodes.values()), unique_edges, vulnerabilities


# ---------------------------------------------------------------------------
# API endpoint
# ---------------------------------------------------------------------------

@router.post("/analyze")
async def analyze_ontology(req: AnalyzeRequest):
    folder = req.path
    if not os.path.isdir(folder):
        raise HTTPException(status_code=400, detail=f"Not a directory: {folder}")
    nodes, edges, vulnerabilities = _scan_and_parse(folder)
    return {
        "nodes": [n.model_dump() for n in nodes],
        "edges": [e.model_dump() for e in edges],
        "vulnerabilities": [v.model_dump() for v in vulnerabilities],
    }


class CodePreviewRequest(BaseModel):
    file: str
    line: int
    context: int = 5


@router.post("/code-preview")
async def code_preview(req: CodePreviewRequest):
    """Return a code snippet around a given line number."""
    if not os.path.isfile(req.file):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(req.file, "r", encoding="utf-8", errors="ignore") as f:
            all_lines = f.readlines()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    start = max(0, req.line - 1 - req.context)
    end = min(len(all_lines), req.line + req.context)
    snippet = "".join(all_lines[start:end])
    return {"code": snippet, "startLine": start + 1, "endLine": end}


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
