# Ontology Analysis - Technical Documentation

Sancho의 **Ontology Analysis**는 소스 코드의 클래스, 메소드, 함수 간 관계를 시각적으로 분석하는 정적 코드 분석 도구입니다.

---

## 목차

1. [아키텍처 개요](#1-아키텍처-개요)
2. [지원 언어 및 파싱 엔진](#2-지원-언어-및-파싱-엔진)
3. [그래프 데이터 모델](#3-그래프-데이터-모델)
4. [정적 분석 알고리즘](#4-정적-분석-알고리즘)
5. [보안 취약점 탐지 엔진](#5-보안-취약점-탐지-엔진)
6. [캔버스 렌더링 엔진](#6-캔버스-렌더링-엔진)
7. [레이아웃 알고리즘](#7-레이아웃-알고리즘)
8. [인터랙션 시스템](#8-인터랙션-시스템)
9. [API 명세](#9-api-명세)
10. [성능 최적화](#10-성능-최적화)

---

## 1. 아키텍처 개요

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

### 기술 스택

| 계층 | 기술 | 용도 |
|------|------|------|
| Backend | Python 3.11 + FastAPI | REST API, 파일 스캔, 정적 분석 |
| Parsing | Python `re` (정규식) | 소스 코드 파싱 (AST 대신 regex 기반) |
| Frontend | React 18 + TypeScript | 상태 관리, UI 컴포넌트 |
| Rendering | HTML5 Canvas 2D API | 그래프 시각화, 물리 시뮬레이션 |
| State | Zustand + React Hooks | 전역/로컬 상태 관리 |
| Styling | Tailwind CSS | UI 스타일링 |

### 설계 원칙

- **Regex 기반 경량 파싱**: 완전한 AST 파서 없이 regex로 빠르게 코드 구조 추출
- **서버사이드 분석 + 클라이언트사이드 렌더링**: 분석은 Backend, 시각화는 Frontend
- **Canvas 직접 렌더링**: DOM 조작 없이 Canvas 2D로 수천 개 노드 처리
- **반응형 물리 시뮬레이션**: Force-directed layout으로 자연스러운 그래프 배치

---

## 2. 지원 언어 및 파싱 엔진

### 지원 확장자

```python
SUPPORTED_EXTENSIONS = {
    ".java", ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs",
    ".go", ".c", ".cpp", ".cc", ".h", ".hpp",
}
```

### 스캔 제한

| 항목 | 제한 | 이유 |
|------|------|------|
| `MAX_FILES` | 500개 | 메모리/시간 초과 방지 |
| `MAX_FILE_SIZE` | 512KB | 대용량 생성 파일 제외 |
| 제외 디렉토리 | `.git`, `node_modules`, `__pycache__`, `venv`, `build`, `dist`, `target`, `bin`, `obj` | 비소스 코드 제외 |

### 2.1 Java 전용 파서 (`_parse_java`)

Java는 가장 상세한 분석을 제공합니다.

#### 정규식 패턴

```python
# 클래스/인터페이스/enum 선언
_JAVA_CLASS_RE = re.compile(
    r"""\b(?:public\s+|abstract\s+|final\s+)*(?:class|interface|enum)\s+(\w+)
    (?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?""", re.VERBOSE)

# 메소드 선언 (접근 제어자 + 반환 타입 + 이름 + 매개변수 + throws + {)
_JAVA_METHOD_RE = re.compile(
    r"""(?:public|protected|private|static|final|abstract|synchronized|native|\s)+
    [\w<>\[\],\s]+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{""", re.VERBOSE)

# 메소드 호출
_JAVA_CALL_RE = re.compile(r"""\b(\w+)\s*\(""")

# import 문
_JAVA_IMPORT_RE = re.compile(r"""import\s+(?:static\s+)?([\w.]+)\s*;""")
```

#### 노드 생성

| 패턴 | 노드 ID 형식 | 노드 타입 |
|------|-------------|----------|
| `class MyClass` | `class:MyClass` | `class` |
| `interface IFace` | `class:IFace` | `interface` |
| `void method()` | `method:MyClass.method` | `method` |
| `import com.pkg.X` | `class:X` | `class` (external) |

#### 엣지 생성

| 관계 | 엣지 타입 | order |
|------|----------|-------|
| `class A extends B` | `extends` | - |
| `class A implements I` | `implements` | - |
| `A` → `A.method` | `calls` | - |
| `method` 내부에서 `foo()` 호출 | `calls` | 0, 1, 2... (호출 순서) |

#### 메소드 본문 분석

```
1. 여는 중괄호 { 에서 시작
2. 중괄호 depth 추적으로 메소드 범위 결정
3. 본문 내 모든 함수 호출 추출
4. 37+ 내장 메소드/키워드 필터링:
   - 제어 흐름: if, for, while, switch, catch, return
   - 기본 클래스: System, String, Integer, Math
   - 컬렉션: get, set, add, remove, put, contains
   - 문자열: toString, equals, substring, trim
5. 호출 순서(order) 기록
6. 메소드 본문 라인 수(lines) 기록
```

### 2.2 범용 파서 (`_parse_generic`)

Python, TypeScript/JavaScript, Go, C/C++을 처리합니다.

#### Python 패턴

```python
_PY_IMPORT_RE  = r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))"
_PY_CLASS_RE   = r"^\s*class\s+(\w+)"
_PY_FUNC_RE    = r"^\s*def\s+(\w+)"
```

#### TypeScript/JavaScript 패턴

```python
_TS_IMPORT_RE  = r"(?:import\s+...from\s+)?['\"]([^'\"]+)['\"]|require\s*\(['\"]([^'\"]+)['\"]\)"
_TS_CLASS_RE   = r"\bclass\s+(\w+)"
_TS_FUNC_RE    = r"(?:export\s+)?(?:async\s+)?function\s+(\w+)"
```

#### Go 패턴

```python
_GO_IMPORT_RE  = r"\"([\w./]+)\""
_GO_FUNC_RE    = r"^func\s+(?:\([^)]*\)\s+)?(\w+)"
```

#### C/C++ 패턴

```python
_C_INCLUDE_RE  = r"#include\s+[<\"]([^>\"]+)[>\"]"
_C_FUNC_RE     = r"^[\w*]+\s+(\w+)\s*\([^)]*\)\s*\{"
```

#### 범용 파서의 노드/엣지

| 노드 타입 | ID 형식 | 생성 조건 |
|----------|---------|----------|
| `file` | `file:path/to/file.py` | 모든 파일 |
| `module` | `module:name` | import/require |
| `class` | `class:Name` | class 선언 |
| `function` | `function:file.name` | 함수 정의 |

엣지 타입: `imports` (파일→모듈), `references` (파일→클래스/함수)

---

## 3. 그래프 데이터 모델

### Pydantic 모델 (Backend)

```python
class OntologyNode(BaseModel):
    id: str              # "class:MyClass", "method:A.foo", "function:file.fn"
    label: str           # 표시명
    type: str            # class | method | function | file | module | interface
    file: str            # 소스 파일 경로 (외부: "(external)")
    line: int | None     # 정의 라인 번호
    cluster: int = 0     # 커뮤니티 ID (Label Propagation)
    size: int = 1        # fanIn + fanOut (최소 1)
    fanIn: int = 0       # 들어오는 엣지 수
    fanOut: int = 0      # 나가는 엣지 수
    lines: int = 0       # 메소드 본문 라인 수
    dead: bool = False   # 데드 코드 여부
    vulnCount: int = 0   # 취약점 수

class OntologyEdge(BaseModel):
    source: str          # 출발 노드 ID
    target: str          # 도착 노드 ID
    type: str            # calls | imports | extends | implements | references
    order: int | None    # 호출 순서 (calls만)
    circular: bool = False  # 순환 참조 여부

class Vulnerability(BaseModel):
    rule: str            # "sql-injection", "xss" 등
    severity: str        # critical | high | medium | low
    message: str         # 설명 메시지
    line: int            # 발견 라인
    file: str            # 파일 경로
    nodeId: str          # 소속 노드 ID
```

### TypeScript 타입 (Frontend)

```typescript
interface GraphNode extends OntologyNode {
    x: number; y: number   // 캔버스 좌표
    vx: number; vy: number // 물리 속도
}

type LayoutMode = 'force' | 'tree' | 'radial'
```

---

## 4. 정적 분석 알고리즘

### 4.1 커뮤니티 탐지 (Label Propagation)

관련 노드들을 클러스터(커뮤니티)로 그룹화합니다.

```
알고리즘:
1. 각 노드에 고유 라벨 부여 (0 ~ n-1)
2. 무방향 인접 리스트 구축
3. 10회 반복:
   a. 노드 순서 랜덤 셔플
   b. 각 노드의 이웃 중 가장 많은 라벨로 업데이트
4. 연속 ID로 재매핑 (0, 1, 2...)

복잡도: O(10 × E)
용도: 노드 색상 그룹핑, Radial 레이아웃 섹터 분리
```

### 4.2 순환 참조 탐지 (DFS 3-Color)

```
알고리즘: DFS with WHITE-GRAY-BLACK marking

상태:
  WHITE (0) = 미방문
  GRAY  (1) = 현재 DFS 스택에 있음
  BLACK (2) = 처리 완료

과정:
1. 모든 노드 WHITE로 초기화
2. 각 미방문 노드에서 DFS 시작
3. 방문 시 GRAY로 표시
4. 이웃이 GRAY → 역방향 엣지(back-edge) = 순환!
5. 이웃이 WHITE → 재귀
6. 처리 완료 시 BLACK으로 표시

결과: circular=true 표시된 엣지들
복잡도: O(V + E)
```

### 4.3 데드 코드 탐지

```
알고리즘:
1. 모든 엣지의 target 수집 → 참조되는 노드 집합
2. method/function 노드 중 참조 집합에 없는 것 → dead=true

한계:
- entry point (main, @RequestMapping 등)은 오탐 가능
- 리플렉션, 이벤트 핸들러 감지 불가
- 외부 API 호출 추적 불가
```

### 4.4 영향도 분석 (BFS 3단계)

선택된 노드 변경 시 영향받는 노드를 탐색합니다.

```
알고리즘: 너비 우선 탐색 (BFS)

입력: 선택된 노드 (출발점)
과정:
1. outgoing 인접 리스트 구축
2. 출발 노드에서 BFS, depth 3까지 탐색
3. 각 노드에 영향 깊이 기록

시각화:
  1차 (직접 호출)  → 주황색 링, 불투명도 0.7
  2차 (간접 영향)  → 주황색 링, 불투명도 0.5
  3차 (파급 영향)  → 주황색 링, 불투명도 0.35
```

### 4.5 복잡도 메트릭

```
Fan-in  = 이 노드를 호출/참조하는 엣지 수 (인기도)
Fan-out = 이 노드가 호출/참조하는 엣지 수 (결합도)
Size    = max(1, Fan-in + Fan-out)        (연결 중심성)
Lines   = 메소드 본문 라인 수             (Java만)

시각적 반영:
  노드 크기 = max(3, min(18, 3 + size * 1.5)) 픽셀
  노드 색상 = 클러스터 색상 + 복잡도 히트맵 블렌딩
    - complexity = fanIn + fanOut
    - heat = min(1, complexity / 20)
    - 높을수록 → 빨간색 방향으로 블렌딩
```

---

## 5. 보안 취약점 탐지 엔진

### 아키텍처

```
파일 내용
  ↓
[확장자별 규칙 필터링]
  ↓
[Regex 패턴 매칭]
  ↓
[코멘트 라인 제외]  ← //, #, * 으로 시작하는 줄 스킵
  ↓
[소속 노드 매핑]    ← 라인 번호 기준 가장 가까운 노드에 할당
  ↓
Vulnerability 객체 생성
```

### 규칙 총 35개

#### Java (25개)

**Injection 공격 (7개)**

| Severity | Rule | 탐지 패턴 |
|----------|------|----------|
| Critical | SQL Injection | `"SELECT" + variable` 문자열 연결 |
| Critical | Command Injection | `Runtime.exec()`, `ProcessBuilder` |
| Critical | JNDI Injection | `InitialContext.lookup()` 동적 입력 |
| Critical | EL Injection | `SpelExpressionParser.parseExpression()` 동적 입력 |
| Critical | Template Injection | `Velocity.evaluate()`, FreeMarker, Thymeleaf |
| High | LDAP Injection | `.search()` 필터에 문자열 연결 |
| Medium | Log Injection | `logger.info("" + request.getParameter())` |

**역직렬화 & 리플렉션 (4개)**

| Severity | Rule | 탐지 패턴 |
|----------|------|----------|
| Critical | Unsafe Deserialization | `ObjectInputStream.readObject()` |
| High | Reflection Abuse | `Class.forName()` 동적 클래스명 |
| High | Unsafe Reflection | `getMethod()` + `invoke()` 동적 입력 |
| High | Insecure File Upload | `FileOutputStream(getOriginalFilename())` |

**암호화 & 인증 (5개)**

| Severity | Rule | 탐지 패턴 |
|----------|------|----------|
| Critical | Hardcoded Encryption Key | `SecretKeySpec("hardcoded".getBytes())` |
| Critical | Null Cipher | `new NullCipher()` |
| High | Insecure TLS | `SSLContext.getInstance("TLSv1")`, `NoopHostnameVerifier` |
| Medium | Weak Crypto | `MessageDigest.getInstance("MD5\|SHA1\|DES")` |
| Medium | Insecure Random | `new Random()` (SecureRandom 아닌) |

**웹 보안 (5개)**

| Severity | Rule | 탐지 패턴 |
|----------|------|----------|
| High | SSRF | `new URL(request.getParameter())` |
| High | Session Fixation | `getSession()` 후 `invalidate()` 없이 `setAttribute("user")` |
| Medium | Open Redirect | `sendRedirect(request.getParameter())` |
| Medium | CSRF Disabled | Spring Security `csrf().disable()` |
| Medium | Insecure Cookie | `new Cookie()` 후 `setSecure(true)` 미호출 |

**파일 & 기타 (4개)**

| Severity | Rule | 탐지 패턴 |
|----------|------|----------|
| High | Path Traversal | `new File(request.getParameter())` |
| Medium | XXE | `DocumentBuilderFactory.newInstance()` |
| Medium | Race Condition | `file.exists()` 후 `file.delete()` (TOCTOU) |
| Medium | Unvalidated Redirect | `response.sendRedirect(request.getParameter())` |

#### Python (4개)

| Severity | Rule | 탐지 패턴 |
|----------|------|----------|
| Critical | SQL Injection | `execute(f"SELECT {var}")` |
| Critical | Command Injection | `os.system()`, `subprocess(shell=True)` |
| Critical | Unsafe Deserialization | `pickle.loads()`, `yaml.load()` |
| High | eval/exec | `eval()`, `exec()` |

#### JS/TS (4개)

| Severity | Rule | 탐지 패턴 |
|----------|------|----------|
| Critical | Command Injection | `child_process.exec()` |
| High | XSS | `innerHTML =`, `document.write()`, `dangerouslySetInnerHTML` |
| High | eval/Function | `eval()`, `new Function()` |
| Medium | Prototype Pollution | `__proto__[` or `__proto__ =` |

#### 전체 언어 (2개)

| Severity | Rule | 탐지 패턴 |
|----------|------|----------|
| High | Hardcoded Credential | `password = "secret123"` |
| Low | Hardcoded IP | `"192.168.1.1"` |

### 코멘트 필터링

```python
# 매칭된 라인이 코멘트인 경우 스킵
stripped = line_text.lstrip()
if stripped.startswith("//") or stripped.startswith("#") or stripped.startswith("*"):
    continue
```

### 소속 노드 매핑

```python
# 파일별 노드를 라인 번호 역순으로 정렬
# 매칭 라인보다 앞에 있는 가장 가까운 노드에 할당
for n in file_nodes.get(rel_path, []):
    if n.line and n.line <= line_no:
        node_id = n.id
        break
```

---

## 6. 캔버스 렌더링 엔진

### 렌더링 파이프라인

```
requestAnimationFrame loop
  ↓
tick() — 물리 시뮬레이션 (Force 레이아웃일 때만)
  ↓
render() — Canvas 2D 그리기
  │
  ├── 배경 (검정)
  ├── 카메라 변환 (translate + scale)
  ├── 엣지 렌더링 (화살표 + 순서 뱃지)
  ├── 노드 렌더링 (원 + 라벨 + 인디케이터)
  ├── 미니맵 렌더링
  └── HUD 정보 (노드/엣지 수, 줌 레벨)
```

### DPR (Device Pixel Ratio) 처리

```typescript
const dpr = window.devicePixelRatio || 1
canvas.width = rect.width * dpr
canvas.height = rect.height * dpr
ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
```

### 카메라 시스템

```typescript
interface Camera {
    x: number    // 수평 이동
    y: number    // 수직 이동
    zoom: number // 확대 배율 [0.1 ~ 5.0]
}

// 월드 좌표 변환
ctx.translate(canvasWidth/2 + cam.x, canvasHeight/2 + cam.y)
ctx.scale(cam.zoom, cam.zoom)
```

### 엣지 렌더링

```
기본:       불투명도 0.15, 폭 0.5
호버 연결:  불투명도 0.6, 클러스터 색상
선택 연결:  불투명도 0.7, 폭 1.8
순환 참조:  빨간색 rgba(255,60,60,0.7), 폭 1.5+

화살표:
  대상 노드 반경 + 2px 거리에서 화살표 기저
  화살표 크기 = max(4, lineWidth * 3)

호출 순서 뱃지:
  엣지 중점에 주황색 원 (반경 7/zoom px)
  내부에 순서 번호 표시
```

### 노드 렌더링

```
반경: max(3, min(18, 3 + size * 1.5)) px

색상 결정:
  1. 클러스터 색상 (10색 팔레트)
  2. 복잡도 히트맵 블렌딩:
     heat = min(1, (fanIn + fanOut) / 20)
     빨강 강화, 초록/파랑 감소
  3. 데드 코드: 회색 rgb(120,120,120)

글로우 효과:
  호버: 반경+8px radial gradient
  선택: 반경+6px 주황 gradient

라벨 표시 조건:
  zoom > 0.4 OR size > 3 OR hovered OR selected

취약점 인디케이터:
  우상단 빨간 점 (반경 = max(4, nodeRadius * 0.4))
  zoom > 0.4 일 때 취약점 수 표시

데드 코드 인디케이터:
  점선 테두리 [3,3] 패턴
```

### 미니맵

```
위치: 캔버스 좌하단 (8px 마진)
크기: 140×90 px
배경: 반투명 검정

노드 표현: 2×2 px 점 (데드=회색, 기타=클러스터 색상)
뷰포트: 주황색 테두리 사각형 (현재 보이는 영역)
인터랙션: 클릭/드래그로 카메라 이동
```

---

## 7. 레이아웃 알고리즘

### 7.1 Force-Directed (물리 시뮬레이션)

```
파라미터:
  alpha 초기값: 0.3
  alpha 감쇠: 0.99 per tick
  정지 조건: alpha < 0.005
  속도 감쇠: 0.6 per tick

힘:
  반발력: F = (800 × alpha) / distance²    (모든 노드 쌍, O(n²))
  인력:   F = distance × 0.005 × alpha     (엣지로 연결된 노드)
  중력:   F = -position × 0.001 × alpha    (원점으로 당김)

특징:
  - 자연스러운 그래프 배치
  - 연결된 노드끼리 가까이
  - 실시간 드래그 중 시뮬레이션 계속
```

### 7.2 Tree (계층 구조)

```
파라미터:
  NODE_GAP = 35px  (형제 간 수직 간격)
  DEPTH_GAP = 120px (깊이 간 수평 간격)

알고리즘:
1. in-degree=0인 노드를 루트로 선택
2. BFS로 스패닝 트리 구축
3. 각 서브트리의 리프 수 계산 (bottom-up)
4. 깊이 × DEPTH_GAP = X 좌표
5. 서브트리 높이 기반 Y 좌표 분배
6. 연결되지 않은 노드는 추가 루트로 처리
7. 전체 트리를 원점 중심으로 정렬

용도: 호출 계층 구조 파악, 상속 트리 시각화
```

### 7.3 Radial (방사형)

```
파라미터:
  baseRadius = max(180, nodes.length × 6)
  ringGap = max(50, 30 + nodes.length × 0.5)
  MIN_ARC_DIST = 40px (동심원 위 노드 간 최소 호 거리)

알고리즘:
1. 클러스터별 노드 그룹화
2. 각 클러스터에 섹터 각도 할당 (2π / 클러스터 수, 10% 패딩)
3. 각 클러스터 내 노드를 동심원에 배치:
   - 링당 호 길이 = radius × usableAngle
   - 링당 노드 수 = max(1, floor(arcLen / MIN_ARC_DIST))
4. 노드 위치 = (sectorCenter + (i+0.5) × step) 각도

용도: 클러스터 간 관계 파악, 전체 구조 조망
```

---

## 8. 인터랙션 시스템

### 마우스 이벤트

| 동작 | 처리 |
|------|------|
| 클릭 (노드) | 노드 선택/해제 → 속성창 표시 |
| 클릭 (빈 공간) | 선택 해제 |
| 드래그 (노드) | 노드 위치 이동 (물리 속도 초기화) |
| 드래그 (빈 공간) | 카메라 패닝 |
| 더블클릭 | 해당 노드로 카메라 포커스 |
| 휠 | 줌 인/아웃 (1.1x / 0.9x, 범위 0.1~5.0) |
| 호버 | 연결 노드 하이라이트 + 400ms 후 코드 프리뷰 |
| 미니맵 드래그 | 카메라 이동 |

### 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `Ctrl+F` | 검색 토글 |
| `Escape` | 검색 닫기 |

### 배지 네비게이션

```
배지 클릭 → 해당 카테고리 노드 목록에서 순차 탐색
  → 노드 선택 + 카메라 포커스
  → 다시 클릭 시 다음 노드로 이동 (순환)

배지 종류:
  cycles: 순환 참조에 관련된 노드
  dead: 데드 코드 노드
  vulns: 취약점이 있는 노드
```

### 상속 트리 모드

```
활성화 시:
  - extends/implements 엣지만 필터링
  - 관련 노드만 표시
  - 레이아웃 자동 Tree 모드로 전환
```

### 코드 프리뷰 (호버 툴팁)

```
1. 노드 호버 시 400ms 디바운스
2. backend /api/ontology/code-preview API 호출
3. 해당 파일의 line ± 5줄 코드 반환
4. 마우스 근처에 코드 스니펫 툴팁 표시
```

---

## 9. API 명세

### POST `/api/ontology/analyze`

소스 코드 폴더를 분석하여 그래프와 취약점을 반환합니다.

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

분석 대상 파일 목록을 반환합니다.

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

특정 파일의 코드 스니펫을 반환합니다.

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

## 10. 성능 최적화

### Backend 최적화

| 기법 | 설명 |
|------|------|
| 파일 크기 제한 | 512KB 이상 파일 스킵 |
| 파일 수 제한 | 500개 초과 시 스캔 중단 |
| 디렉토리 제외 | node_modules 등 비소스 디렉토리 즉시 스킵 |
| 엣지 중복 제거 | (source, target, type) 기준 |
| 컴파일된 정규식 | 모듈 로드 시 한 번만 컴파일 |

### Frontend 최적화

| 기법 | 설명 |
|------|------|
| `useMemo` | 검색 결과, 영향도 분석, 디스플레이 노드/엣지 캐싱 |
| `useRef` | 물리 상태(노드, 엣지, 카메라)를 ref로 관리하여 불필요한 리렌더 방지 |
| Canvas 직접 렌더링 | DOM 노드 없이 Canvas 2D로 수천 개 노드/엣지 처리 |
| RAF 기반 루프 | `requestAnimationFrame`으로 60fps 렌더링 |
| 인접 리스트 캐싱 | `adjRef`로 O(1) 이웃 노드 조회 |
| 노드 맵 | `nodeMapRef`로 O(1) ID 기반 노드 조회 |
| 호버 디바운싱 | 400ms 디바운스로 불필요한 API 호출 방지 |
| 라벨 조건부 렌더링 | 줌 레벨에 따라 라벨 표시/숨김 |
| alpha 감쇠 | 시뮬레이션이 안정화되면 자동 정지 (alpha < 0.005) |

### 병렬 API 호출

```typescript
const [fileResult, graphResult] = await Promise.all([
    listOntologyFiles(folder),
    analyzeOntology(folder),
])
```

---

## 수정 파일 목록

| 파일 | 역할 |
|------|------|
| `backend/api/routes_ontology.py` | 백엔드 분석 엔진 전체 |
| `src/components/Ontology/OntologyGraph.tsx` | 캔버스 렌더링, 물리 시뮬레이션, 레이아웃 |
| `src/components/Ontology/OntologyPanel.tsx` | 상태 관리, UI 오케스트레이션, Doc 모달 |
| `src/components/Ontology/OntologyProperties.tsx` | 속성창, 통계, 취약점, 순환 경로 |
| `src/components/Ontology/OntologyFileList.tsx` | 파일 트리 탐색 |
| `src/api/client.ts` | API 타입 정의, HTTP 클라이언트 |
