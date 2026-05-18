# generate-qr.html — Overview & Developer Reference

## Purpose
Single-page frontend for generating, previewing, and printing ZPL barcode labels.  
Backed by a .NET 10 Web API (`/api/zpl/preview`, `/api/layouts`).

---

## Page Structure — Two Top-level Tabs

| Tab | ID | Purpose |
|-----|----|---------|
| Print QR-Code | `#pagePrint` | Scan → fill data → preview → print |
| Design Layout | `#pageDesign` | Create / edit ZPL label templates |

Switching is handled by `setPageTab('print' | 'design')`.

---

## Fixed Field Schema (13 fields)

All fields are fixed — no dynamic add/remove.

```js
const FIELD_LABELS = {
  partNo:          'P/N',
  quantity:        'QTY',
  unit:            'UNIT',
  vendor:          'VENDOR',
  dateCode:        'D/C',
  tradingCode:     'T/C',
  po:              'PO',
  inventoryNo:     'I/N',
  traceId:         'TRACE ID',
  workOrder:       'W/O',
  line:            'LINE',
  internalTraceId: 'IN_TRACE_ID',
  createdAt:       'CREATED AT',
};
const ALL_FIELD_KEYS = Object.keys(FIELD_LABELS); // order matters for ZPL row sequence
const REQUIRED_KEYS  = new Set(['partNo','quantity','workOrder','line']);
```

Key naming convention: camelCase keys match the backend JSON schema exactly.  
`cid(k)` sanitizes a key for DOM IDs: `k.replace(/[^a-zA-Z0-9]/g, '_')`.

---

## Tab 1 — Print QR-Code

### Step Flow

```
Step 1: Scan
  ├── [Scan QR Code] button  → doScan(MOCK_QR_OBJ, 'Mock Scan')
  └── JSON textarea          → parse & doScan(parsed, 'JSON Input')

Step 2: กรอกข้อมูล (Form)
  ├── WorkOrder autocomplete → fills workOrder + line in checklist
  ├── Layout selector        → applyLayoutToSliders() + renderChecklist(layoutFields)
  ├── [Preview] button       → doPreview()
  └── [Back]                 → return to Step 1

Step 3: Preview (shown after doPreview() succeeds)
  ├── Left:  3-tab result  (Label Preview | QR Data | ZPL Code)
  ├── Right: ข้อมูลที่แสดงบน LABEL  (checklist panel)
  └── Bottom: Printer selector + [Print] button
```

### State Object

```js
let printState = {
  scannedData:        '',   // raw JSON string from scan
  parsedQrData:       {},   // parsed QR object
  selectedLayoutId:   null,
  hasPreviewedOnce:   false,
  activeLayoutFields: null, // [{key,label,show}] from selected layout
  formOverrides:      {},   // {workOrder, line} from autocomplete selection
};
```

### doScan(data, displayName)
Populates `printState.parsedQrData`, calls `updateDataPanel()`, navigates to Step 2.  
Resets: previewResult hidden, checklistPanel hidden, printerSection hidden.

### updateDataPanel()
- Builds QR JSON preview with auto-generated placeholders for `traceId`, `internalTraceId`, `createdAt`
- Calls `renderChecklist(printState.activeLayoutFields)`

### renderChecklist(layoutFields)
Renders ALL 13 fields regardless of QR data availability.

Each row:
```
[checkbox]  Display Label  *  {variableKey}  [editable value input]
```
- `checked` state: from `layoutFields[k].show` if layout selected, else `false`
- Value: `formOverrides[k]` → `parsedQrData[k]` → `''`
- Required fields show red `*` and `placeholder="required"`
- `onclick="event.stopPropagation()"` on input prevents checkbox toggle

### doPreview()
1. Reads all `fci_val_*` inputs to build `fullData` (overrides `parsedQrData`)
2. Auto-generates `internalTraceId` (ULID: `TR-` + `genUlid()`) and `createdAt` (ISO) if empty
3. Updates `#qrJsonOutput`
4. Syncs auto-generated values to checklist inputs (non-destructive: only fills if empty)
5. Calls `getCheckedFields()` → builds ZPL via `buildZpl()`
6. POSTs to `/api/zpl/preview` → renders PNG
7. Shows: `previewResult`, `checklistPanel`, `printerSection`

### getCheckedFields()
Returns `[{label, value}]` for all checked fields, reading values from `fci_val_*` inputs.

### buildZpl({ qrContent, textFields })
```
^XA
^CI28
^FO{qrX},{qrY}^BQN,2,{qrSize}^FDLA,{qrContent}^FS
^FO{dataX},{y}^A0N,{fs},{fs}^FD{label}:^FS
^FO{dataX+valOffset},{y}^A0N,{fs},{fs}^FD{value}^FS
...
^XZ
```
Layout parameters (qrX, qrY, qrSize, dataX, dataY, fontSize, valOffset) come from sliders  
in the selected layout. If no layout selected, defaults are used.

### WorkOrder Autocomplete
```js
const MOCK_WO_LIST = [{ wo: 'W3622502555', line: 'F05' }, ...];
```
- Filters by WO or line substring match (case-insensitive)
- On select: updates `woInput`, `lineDisplay`, `printState.formOverrides`, and checklist inputs directly

---

## Tab 2 — Design Layout

### Two Sub-modes

| Mode | Container | Trigger |
|------|-----------|---------|
| List | `#designList` | default, after Back |
| Edit | `#designEdit` | click Edit / New Layout |

Switching: `showListMode()` ↔ `openEditMode(layout, fromPrint)` / `openCreateMode(fromPrint)`

### Edit Mode Layout (top→bottom)

```
[Template Name] [Description]
[─────────── Preview Area (full width) ───────────]
│  DPI  Width  Height                              │
│  [Label Preview] [QR Data] [ZPL Code] tabs       │
│  → Label Preview: rendered PNG (max-height:300px) │
│  → QR Data:       QR_SCHEMA_TEMPLATE (static)    │
│  → ZPL Code:      buildZplTemplate() output      │
[──────────────────────────────────────────────────]
[── QR Component ──] [── Data Component ──]   2-col
   X, Y, Size sliders   X, Y, Font, Offset sliders
[────── ข้อมูลที่แสดงบน LABEL (field list) ────────]
[Save Layout]  [Apply to Print]
```

### Field List Row (Design tab)

```
[checkbox]  Display Label  {variableKey}  [✏️ pencil]  [OK]
```
- Display label is editable (pencil → inline input → Enter/OK to confirm)
- Variable key `{partNo}` etc. is always fixed (shown as blue badge)
- `show: false` → unchecked → field excluded from ZPL template

### QR_SCHEMA_TEMPLATE (static, left panel / QR Data tab)
```js
const QR_SCHEMA_TEMPLATE = JSON.stringify(
  Object.fromEntries(Object.keys(FIELD_LABELS).map(k => [k, `{${k}}`])), null, 2
);
// Result: { "partNo": "{partNo}", "quantity": "{quantity}", ... }
```
Shows users exactly what JSON structure gets encoded into the QR code.

### DESIGN_SAMPLE (sample data for preview rendering)
```js
const DESIGN_SAMPLE = {
  partNo: '4104097105M', quantity: '100', unit: 'PCE',
  vendor: '676894', dateCode: '260309', tradingCode: '06',
  po: 'T3FY261023', inventoryNo: 'QQT20260251',
  traceId: '20260309000059', workOrder: 'W3622502555', line: 'F05',
  internalTraceId: 'TR-01KRWD7FAG', createdAt: '2026-05-18T02:04:21.200Z',
};
```

### populateDesignFieldList(fieldDefs)
`fieldDefs`: `[{ key, label, show }]` for all 13 fields.  
Reads from `layoutFields` (saved layout) or defaults from `FIELD_LABELS`.

### getDesignFields()
Reads from `#designFieldList .field-row` DOM elements — includes any state from pencil edits.

### saveLayout()
Sends to `/api/layouts` (POST) or `/api/layouts/{id}` (PUT):
```js
{
  templateName, description,
  qrX, qrY, qrSize, dataX, dataY, fontSize, valOffset,
  zplTemplate: buildZplTemplate(fields),  // ZPL with {key} placeholders
  labelFields: fields,                    // [{key, label, show}] — JsonElement in C#
}
```
**Important**: `labelFields` must be sent as a full object array, not string array.  
C# model uses `System.Text.Json.JsonElement?` for `LabelFields` to accept any JSON structure.

### buildZplTemplate(fields)
Same as `buildZpl()` but uses `{key}` placeholders instead of actual values:
```
^FO{dataX},{y}^A0N,{fs},{fs}^FD{label}:^FS
^FO{dataX+vo},{y}^A0N,{fs},{fs}^FD{partNo}^FS   ← placeholder
```

### parseLayoutFields(layout)
Converts stored `labelFieldsJson` back to `[{key, label, show}]`:
- New format: `[{key,label,show}]` → returned as-is
- Old format: `["key1","key2"]` → converted using `FIELD_LABELS`, absent keys → `show:false`

---

## ZPL Coordinate System

```
(0,0) ┌─────────────────────────────────────────┐
      │  QR Code at (qrX, qrY), size=qrSize     │
      │                                          │
      │  dataX          dataX+valOffset          │
      │  LABEL:         VALUE                    │
      │  QTY:           100                      │
      │  P/N:           4104097105M              │
      └─────────────────────────────────────────┘
```

Line height = `Math.round(fontSize * 1.5)`  
Labelary API: `POST https://api.labelary.com/v1/printers/{dpi}/labels/{w}x{h}/0/`

---

## API Endpoints Used

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/zpl/preview` | ZPL → PNG (proxies Labelary) |
| GET | `/api/layouts` | List saved layout templates |
| POST | `/api/layouts` | Create new layout |
| PUT | `/api/layouts/{id}` | Update existing layout |
| DELETE | `/api/layouts/{id}` | Delete layout |

---

## ULID Generator (mock)

```js
function genUlid() {
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32
  // 10-char timestamp + 16-char random → 26 chars total
}
// Usage: `TR-${genUlid()}` → "TR-01JZXKM4NRABC3DEF7GH9JKMPQ"
```

---

## Key Patterns for Reuse

### DOM ID Convention
```js
const cid = k => k.replace(/[^a-zA-Z0-9]/g, '_');
// checklist checkbox:  chk_partNo
// checklist value:     fci_val_partNo
// design field label:  dfl_lbl_partNo
// design field input:  dfl_inp_partNo
// design field edit:   dfl_edit_partNo
```

### Checklist → ZPL Pipeline
```
renderChecklist()       → user checks fields, edits values
getCheckedFields()      → [{label, value}] (reads fci_val_* inputs)
buildZpl({textFields})  → ZPL string
POST /api/zpl/preview   → PNG blob → URL.createObjectURL()
```

### Layout → Checklist Application
```
layoutSelect onChange
  → applyLayoutToSliders(layout)       // set slider values
  → parseLayoutFields(layout)          // [{key,label,show}]
  → printState.activeLayoutFields = …
  → updateDataPanel()
      → renderChecklist(activeLayoutFields)  // apply checked/label state
```

### ZPL Content: QR encodes full JSON, label shows selected fields only
```js
// QR content = all fields (including ones not shown on label)
qrContent: JSON.stringify(fullData)

// Label text = only checked fields with user-edited display labels
textFields: getCheckedFields()  // [{label:'P/N', value:'4104097105M'}, ...]
```
