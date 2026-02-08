### filesystem — Local File Management

Manage files and folders on the local computer. Supports listing, creating directories, moving, copying, and deleting files.

**Safety:** Protected system directories (C:\Windows, C:\Program Files, etc.) are blocked. All operations go through safety checks.

**Parameters:**
- `action` (string, required): One of "list", "mkdir", "move", "copy", "delete", "write", "read", "batch"

#### action: "list"
List files in a directory with details (name, size, modified date).
- `path` (string, required): Directory path to list

#### action: "mkdir"
Create a new directory (creates parent directories automatically).
- `path` (string, required): Directory path to create

#### action: "move"
Move or rename a file/directory.
- `src` (string, required): Source path
- `dst` (string, required): Destination path

#### action: "copy"
Copy a file or directory.
- `src` (string, required): Source path
- `dst` (string, required): Destination path

#### action: "delete"
Delete a file or directory.
- `path` (string, required): Path to delete

#### action: "write"
Create or overwrite a file with text content.
- `path` (string, required): File path to write
- `content` (string, required): Text content to write

#### action: "read"
Read a text file (max 1MB).
- `path` (string, required): File path to read

#### action: "batch"
Execute multiple operations in sequence. Use this to organize files efficiently in a single call.
- `operations` (array, required): List of operations, each with the same format as individual actions.
  Each operation object has: `action`, plus action-specific parameters (path, src, dst, content).

**Examples:**
```
[SKILL_CALL]{"skill": "filesystem", "params": {"action": "list", "path": "C:\\Users\\user\\Downloads"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "filesystem", "params": {"action": "write", "path": "C:\\Users\\user\\Downloads\\note.txt", "content": "Hello World"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "filesystem", "params": {"action": "read", "path": "C:\\Users\\user\\Downloads\\note.txt"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "filesystem", "params": {"action": "batch", "operations": [
  {"action": "mkdir", "path": "C:\\Users\\user\\Downloads\\2025-01"},
  {"action": "mkdir", "path": "C:\\Users\\user\\Downloads\\2025-02"},
  {"action": "move", "src": "C:\\Users\\user\\Downloads\\report.pdf", "dst": "C:\\Users\\user\\Downloads\\2025-01\\report.pdf"},
  {"action": "move", "src": "C:\\Users\\user\\Downloads\\photo.jpg", "dst": "C:\\Users\\user\\Downloads\\2025-02\\photo.jpg"}
]}}[/SKILL_CALL]
```

**Workflow for organizing files:**
1. First call with `list` to see directory contents and modification dates.
2. Based on the listing, plan the organization and call `batch` with mkdir + move operations.

**Workflow for saving text to a file:**
Use `write` action with `path` and `content` parameters. Creates parent directories automatically.
