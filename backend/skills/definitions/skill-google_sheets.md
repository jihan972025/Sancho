### google_sheets — Google Sheets

Read, write, and manage Google Sheets spreadsheets.

**Parameters:**
- `action` (string, required): One of "read", "write", "list"
- `spreadsheet_id` (string, required for read/write): Google Sheets spreadsheet ID
- `range` (string, for read/write): Cell range in A1 notation (e.g., "Sheet1!A1:D10")
- `values` (array, for write): 2D array of values to write

**Examples:**
```
[SKILL_CALL]{"skill": "google_sheets", "params": {"action": "read", "spreadsheet_id": "1BxiMVs0XRA...", "range": "Sheet1!A1:D10"}}[/SKILL_CALL]
```
```
[SKILL_CALL]{"skill": "google_sheets", "params": {"action": "write", "spreadsheet_id": "1BxiMVs0XRA...", "range": "Sheet1!A1", "values": [["Name", "Score"], ["Alice", 95]]}}[/SKILL_CALL]
```
