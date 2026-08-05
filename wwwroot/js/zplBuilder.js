// zplBuilder.js — โค้ดสร้าง/render ZPL label ที่ใช้ร่วมกันได้ทุกหน้า (Print QR, Split, Merge, ...)
// แยกออกมาจาก PrintQR.cshtml เดิม เพื่อให้หน้าอื่น (Split.cshtml, Merge.cshtml) เรียกใช้ได้โดยไม่ต้อง copy โค้ดซ้ำ
// ต้องโหลดหลัง js/api.js (ใช้ api() ใน _fetchUniqueId)

// ── 13+ Fixed Field Schema (ใช้ร่วมกันทุก tab/หน้าที่ print label) ──
const FIELD_LABELS = {
    partNo:          'P/N',
    quantity:        'QTY',
    unit:            'UNIT',
    itemType:        'ITEM TYPE',
    description:     'DESCRIPTION',
    vendor:          'VENDOR',
    dateCode:        'D/C',
    tradingCode:     'T/C',
    po:              'PO',
    inventoryNo:     'I/N',
    traceId:         'TRACE ID',
    rawBarCode:      'RAW BARCODE',
    workOrder:       'W/O',
    line:            'LINE',
    lotNo:           'LOT NO',
    uniqueId:        'UNIQUE ID',
    productionArea:  'AREA',
    createdAt:       'CREATED AT',
}
const ALL_FIELD_KEYS    = Object.keys(FIELD_LABELS)
const FIELD_PLACEHOLDERS = {
    tradingCode:  'Trading Code',
    dateCode:     'Date Code',
    inventoryNo:  'Inventory Number',
    rawBarCode:   'Raw Barcode',
    description:  'Description',
}
const REQUIRED_KEYS    = new Set(['partNo','quantity','unit'])
const QR_REQUIRED_KEYS = new Set(['lotNo','uniqueId'])

function applyPrintOffset(zpl, cfg) {
    const x = cfg?.printOffsetX ?? 100
    const y = cfg?.printOffsetY ?? 0
    if (!x && !y) return zpl
    return zpl.replace(/(\^XA\n?)/, `$1^LH${x},${y}\n`)
}

// ── Helpers ──
const cid = k => k.replace(/[^a-zA-Z0-9]/g, '_')
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// ISO Z → local display "YYYY-MM-DD HH:mm:ss"
function fmtCreatedAt(isoZ) {
    if (!isoZ) return ''
    try {
        const d = new Date(isoZ)
        if (isNaN(d)) return isoZ
        const pad = n => String(n).padStart(2,'0')
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
               `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    } catch (_) { return isoZ }
}

// เติม , คั่นหลักพันสำหรับแสดงผลเท่านั้น (ไม่กระทบค่าจริงที่เก็บ/ส่งไป API) เช่น 1500 -> "1,500"
function fmtQty(v) {
    if (v === '' || v === null || v === undefined) return ''
    const n = Number(v)
    if (isNaN(n)) return String(v)
    return n.toLocaleString('en-US')
}

// ค่าจริงของแต่ละ field ตาม key — ใช้ร่วมกันทุกหน้าที่ print label กันพฤติกรรมเพี้ยนระหว่างกัน
function resolveFieldValue(k, data) {
    if (k === 'productionArea') return data._productionAreaName || data[k] || ''
    if (k === 'createdAt')      return fmtCreatedAt(data[k])
    if (k === 'quantity')       return fmtQty(data[k])
    return data[k] ?? ''
}

// สร้าง textFields (label+value) จาก labelFields config + ข้อมูลจริง ใช้ร่วมกันทุกจุดที่ build ZPL label
function buildLabelTextFields(labelFieldsCfg, data) {
    return Array.isArray(labelFieldsCfg)
        ? labelFieldsCfg.filter(f => f.show).map(f => ({ label: f.label ?? FIELD_LABELS[f.key] ?? f.key, value: resolveFieldValue(f.key, data) }))
        : Object.keys(FIELD_LABELS).filter(k => data[k]).map(k => ({ label: FIELD_LABELS[k], value: resolveFieldValue(k, data) }))
}

function buildQrContent(data, qrFields) {
    if (!qrFields || !qrFields.length) return JSON.stringify(data)
    const selectedKeys = qrFields.filter(f => f.inQr).map(f => f.key)
    const obj = {}
    selectedKeys.forEach(k => { if (data[k] !== undefined && data[k] !== null && data[k] !== '') obj[k] = data[k] })
    return JSON.stringify(obj)
}

// Parse the JSON blob stored in zplData field ของ saved layout
function parseZplDataJson(layout) {
    const raw = layout.zplData
    if (!raw) return {}
    try {
        const obj = JSON.parse(raw)
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            // Migrate stale saved label "PROD AREA" → "AREA"
            if (Array.isArray(obj.labelFields)) {
                obj.labelFields.forEach(f => {
                    if (f.key === 'productionArea' && f.label === 'PROD AREA') f.label = 'AREA'
                })
            }
            return obj
        }
    } catch (_) {}
    return { zplTemplate: raw }  // legacy: plain ZPL string
}

function parseLayoutFields(layout) {
    const config = parseZplDataJson(layout)
    const lf = config.labelFields
    if (!lf) return null
    try {
        if (Array.isArray(lf) && lf[0]?.key) return lf
        if (Array.isArray(lf)) return lf.map(k => ({ key:k, label:FIELD_LABELS[k]??k, show:true }))
    } catch (_) {}
    return null
}

// ── ZPL Builder ──
function buildZpl({ qrContent, textFields, qrX, qrY, qrSize, dataX, dataY, fontSize, valOffset, lineHeight, printOffsetX = 0 }) {
    const lineH  = lineHeight ?? Math.round(fontSize * 1.5)
    const pqrX   = qrX   + printOffsetX
    const pdataX = dataX + printOffsetX
    let zpl = `^XA\n^CI28\n`
    zpl += `^FO${pqrX},${qrY}^BQN,2,${qrSize}^FDMA,${qrContent}^FS\n`

    textFields.forEach(({ label, value }, i) => {
        const y = dataY + i * lineH
        zpl += `^FO${pdataX},${y}^A0N,${fontSize},${fontSize}^FD${label}:^FS\n`
        zpl += `^FO${pdataX + valOffset},${y}^A0N,${fontSize},${fontSize}^FD${value}^FS\n`
    })

    zpl += `^XZ`
    return zpl
}

// ── ZPL Preview — client-side renderer (ไม่ต้องเน็ต ไม่ผ่าน server) ──
async function callZplPreview(zpl, dpi, width, height) {
    return await renderZplClient(zpl, dpi, width, height)
}

// ── ZPL Client Renderer ───────────────────────────────────────────────
const ZPL_DPI = { '6dpmm':152, '8dpmm':203, '12dpmm':300, '24dpmm':600 }

// Preload ZebraFont ให้ browser และ Canvas รู้จักก่อน render
const _zebraFontReady = document.fonts.load('bold 20px ZebraFont')

async function renderZplClient(zpl, dpiStr, widthInch, heightInch) {
    await _zebraFontReady  // รอให้ font โหลดเสร็จก่อน
    const dpi = ZPL_DPI[dpiStr] || 203
    const cw  = Math.round((+widthInch  || 4) * dpi)
    const ch  = Math.round((+heightInch || 3) * dpi)

    const canvas = document.createElement('canvas')
    canvas.width  = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, cw, ch)

    // ── Parse ZPL by splitting on '^' ──────────────────────────────
    // แต่ละ segment หลัง ^ คือ: 2 chars = command, ส่วนที่เหลือ = params/data
    // เช่น 'A0N,22,22' → cmd='A0', rest='N,22,22'
    //       'BQN,2,5'  → cmd='BQ', rest='N,2,5'
    //       'FDVENDOR:' → cmd='FD', rest='VENDOR:'
    const segs = zpl.split('^').slice(1)

    let fo           = { x:0, y:0 }
    let fontH        = 20
    let pendingBQ    = null
    let qrDrawBounds = null

    for (const seg of segs) {
        const cmd  = seg.slice(0, 2)
        const rest = seg.slice(2).replace(/[\r\n]+$/, '') // trim trailing newline

        switch (cmd) {
            case 'FO': {
                const p = rest.split(',')
                fo = { x: +p[0]||0, y: +p[1]||0 }
                break
            }
            case 'A0': {
                // rest = 'N,22,22' → strip orientation letter prefix
                const p = rest.replace(/^[A-Z],/, '').split(',')
                fontH = +p[0] || 20
                break
            }
            case 'BQ': {
                const p = rest.split(',')
                pendingBQ = { mag: +p[2] || 3 }
                break
            }
            case 'GF': {
                // ^GFA,totalBytes,totalBytes,bytesPerRow,hexData
                const parts = rest.split(',')
                if (parts.length < 5) break
                const bytesPerRow = parseInt(parts[3])
                const hexStr = parts.slice(4).join('')
                if (!bytesPerRow || !hexStr.trim()) break

                const rows     = Math.floor(hexStr.length / (bytesPerRow * 2))
                const imgWidth = bytesPerRow * 8
                const imgData  = ctx.createImageData(imgWidth, rows)
                const d = imgData.data

                for (let r = 0; r < rows; r++) {
                    for (let b = 0; b < bytesPerRow; b++) {
                        const ho   = (r * bytesPerRow + b) * 2
                        const byte = parseInt(hexStr.slice(ho, ho + 2), 16)
                        for (let bit = 0; bit < 8; bit++) {
                            const dark  = (byte >> (7 - bit)) & 1
                            const pxOff = (r * imgWidth + b * 8 + bit) * 4
                            d[pxOff]     = dark ? 0   : 255
                            d[pxOff + 1] = dark ? 0   : 255
                            d[pxOff + 2] = dark ? 0   : 255
                            d[pxOff + 3] = dark ? 255 : 0    // white = transparent
                        }
                    }
                }
                ctx.putImageData(imgData, fo.x, fo.y)
                break
            }
            case 'FD': {
                if (pendingBQ) {
                    // ── QR Code — ใช้ server endpoint (ไม่ต้องเน็ต) ──
                    let data = rest
                    let ecl  = 'M' // default
                    // ^FDLA,{data} → L=ECL Low, M=Medium, Q=Quartile, H=High
                    const eclMatch = data.match(/^([LMQH])A,/)
                    if (eclMatch) { ecl = eclMatch[1]; data = data.slice(3) }
                    try {
                        const img = new Image()
                        img.src = `api/qr/image?data=${encodeURIComponent(data)}&scale=${pendingBQ.mag}&ecl=M`
                        await new Promise((resolve, reject) => {
                            img.onload  = resolve
                            img.onerror = () => reject(new Error('QR image load failed'))
                        })
                        // QRCoder ใส่ quiet zone 4 modules ไว้ใน PNG เสมอ
                        // X: ลบ qz ออกทั้งหมด → ชิดขอบซ้าย
                        // Y: ลบ qz แต่คืน 2 modules → เว้นขอบบนนิดหน่อย
                        const qz  = 4 * pendingBQ.mag
                        const dx  = fo.x - qz
                        const dy  = fo.y - qz + pendingBQ.mag * 2
                        ctx.drawImage(img, dx, dy)
                        qrDrawBounds = { x: dx, y: dy, w: img.naturalWidth, h: img.naturalHeight, qz }
                    } catch (e) {
                        console.warn('[ZPL] QR error:', e.message)
                        ctx.strokeStyle = '#aaa'
                        ctx.lineWidth   = 2
                        ctx.strokeRect(fo.x, fo.y, 80, 80)
                        ctx.fillStyle = '#aaa'
                        ctx.font = '11px sans-serif'
                        ctx.fillText('QR', fo.x + 32, fo.y + 44)
                    }
                    pendingBQ = null
                } else if (rest) {
                    // ── Text ──
                    ctx.fillStyle = '#000'
                    ctx.font = `bold ${fontH}px ZebraFont, "Arial Narrow", sans-serif`
                    ctx.fillText(rest, fo.x, fo.y + fontH * 0.85)
                }
                break
            }
        }
    }

    return canvas.toDataURL('image/png')
}

// Client-generated print identifier — fallback only เมื่อ API ล่ม, ต้องได้ uniqueId จริงจาก _fetchUniqueId() ก่อนเสมอ
function genUniqueId() {
    const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
    let id = ''
    for (let i = 0; i < 10; i++) id += B32[Math.floor(Math.random() * 32)]
    return 'PRT_' + id
}

// uniqueId จริงจาก server — ต้องเรียกใหม่ทุกครั้งที่ print/reprint เพื่อการันตีว่า unique จริง
async function _fetchUniqueId() {
    const res = await api('/printer/get-unique-id', 'GET')
    return res?.uniqueId ?? ''
}

// ── Printer list ──────────────────────────────────────────────────────
// filter printer list ตาม permission — ใช้ร่วมกันได้ทุกหน้า
// WMS.UI.Printer.All            => เห็นทุก Printer (ไม่ filter)
// WMS.UI.Printer.<PREFIX>       => เห็นเฉพาะ printer ที่ชื่อขึ้นต้นด้วย <PREFIX>_ (แบ่งด้วย "_" เอาส่วนหน้า)
//   เช่น WMS.UI.Printer.CH   -> CH_Printer_01
//        WMS.UI.Printer.F1BR -> F1BR_Printer_01
// isAdmin เห็นทุก Printer เสมอ, ถ้าไม่มี permission ที่ match เลยจะไม่เห็น printer ใดๆ
function filterPrintersByPermission(printers, isAdmin) {
    if (isAdmin) return printers

    let permis = []
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}')
        permis = Array.isArray(user.permissions) ? user.permissions : []
    } catch (_) {}

    if (permis.includes('WMS.UI.Printer.All')) return printers

    const prefixTag = 'WMS.UI.Printer.'
    const allowedPrefixes = permis
        .filter(p => p.startsWith(prefixTag) && p.length > prefixTag.length)
        .map(p => p.slice(prefixTag.length))

    if (!allowedPrefixes.length) return []

    return printers.filter(p => {
        const namePrefix = (p.printerName || '').trim().split('_')[0]
        return allowedPrefixes.includes(namePrefix)
    })
}

// ── Layout Template list ──────────────────────────────────────────────
// filter layout list ตาม permission — ใช้ร่วมกันได้ทุกหน้าที่โหลด Layout (Design, Receive, Reprint, Split, Merge, ฯลฯ)
// WMS.UI.PrinterLayout.<DESC>  => เห็นเฉพาะ Layout ที่ description ตรงกับ <DESC> เป๊ะๆ (case-insensitive)
//   เช่น WMS.UI.PrinterLayout.X -> เห็นเฉพาะ Layout ที่ description = "X"
// isAdmin เห็นทุก Layout เสมอ, ถ้าไม่มี permission กลุ่มนี้ที่ match เลยจะไม่เห็น Layout ใดๆ (Layout ที่ description ว่างก็จะไม่เห็นด้วย เพราะไม่มี permission ไหน match กับค่าว่างได้)
function filterLayoutsByPermission(layouts, isAdmin) {
    if (isAdmin) return layouts

    let permis = []
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}')
        permis = Array.isArray(user.permissions) ? user.permissions : []
    } catch (_) {}

    const prefixTag = 'WMS.UI.PrinterLayout.'
    const allowedDescs = permis
        .filter(p => p.startsWith(prefixTag) && p.length > prefixTag.length)
        .map(p => p.slice(prefixTag.length).toLowerCase())

    if (!allowedDescs.length) return []

    return layouts.filter(l => allowedDescs.includes((l.description ?? '').trim().toLowerCase()))
}

// เติม <option> ของ saved Design Layout ลง <select> ธรรมดา — คืน array ของ layout ที่โหลดมาให้ผู้เรียกใช้ lookup config ต่อได้
// ถ้ายังไม่เคยเลือกไว้ (select ว่างอยู่) จะ auto-select ตัวแรกในลิสต์ให้เอง แล้ว dispatch 'change' ให้ onchange handler ของหน้านั้นๆ ทำงานตามปกติ
async function loadLayoutOptions(selectEl, isAdmin) {
    if (!selectEl) return []
    const hadNoSelection = !selectEl.value
    selectEl.innerHTML = '<option value="">Loading…</option>'
    try {
        const res = await api('/printer/template/all', 'GET')
        const all = Array.isArray(res) ? res : (res?.data ?? [])
        const arr = filterLayoutsByPermission(all, isAdmin)
        selectEl.innerHTML = '<option value="">-- Select Layout --</option>' +
            arr.map(l => `<option value="${l.id}">${escHtml(l.templateName ?? 'Untitled')}</option>`).join('')
        if (hadNoSelection && arr.length) {
            selectEl.value = arr[0].id
            selectEl.dispatchEvent(new Event('change'))
        }
        return arr
    } catch (err) {
        selectEl.innerHTML = '<option value="">-- Load failed --</option>'
        return []
    }
}
