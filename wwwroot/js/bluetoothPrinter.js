// bluetoothPrinter.js — โหมดเครื่องพิมพ์ "Bluetooth (Web Serial)": Chrome ของเครื่อง client ส่ง ZPL ตรงไปที่เครื่องพิมพ์ที่ pair
// ไว้กับเครื่องนั้นเอง ไม่ผ่าน backend (/printer/send) — ใช้กับเครื่องพิมพ์ที่ backend ยิงไปไม่ถึงเพราะไม่มี IP
// ต้องโหลดหลัง js/api.js (ใช้ api) และ js/zplBuilder.js (ใช้ escHtml)
// CSS ของ .rp-pd-bt-* / .rp-pd-add อยู่ที่ wwwroot/css/printqr.css
//
// ข้อจำกัดของ Web Serial: ใช้ได้เฉพาะ Chrome/Edge บน desktop และหน้าเว็บต้องเป็น HTTPS (หรือ localhost)
// เครื่องที่ user เพิ่มไว้ Chrome จำให้ต่อ origin + browser profile ของเครื่องนั้น — ไม่ได้อยู่ใน /printer/all
// เลยไม่ผ่านการกรองตาม location permission (filterPrintersByLocation) และ user แต่ละเครื่องต้องกด Add Printer เอง
//
// printer id ของโหมดนี้ขึ้นต้นด้วย "bt:" เสมอ เก็บลง hidden input ตัวเดียวกับ printerIp ของเครื่องปกติ
// จุดที่สั่งพิมพ์ให้เรียก printerSend(payload) แทน api('/printer/send') ตรงๆ แล้ว printerSend จะแยกทางให้เอง
// id นี้อยู่แค่ในหน้าที่เปิดอยู่ (Web Serial ไม่มี id ถาวรของ port) — โหลดหน้าใหม่ต้องเลือกเครื่องใหม่ เหมือน dropdown เดิม

const BT_PRINTER_PREFIX = 'bt:'

// Chrome ไม่บอกชื่ออุปกรณ์ให้หน้าเว็บ เลยถามชื่อจากเครื่องพิมพ์เองด้วยคำสั่ง SGD ของ Zebra (เครื่องยี่ห้ออื่นจะไม่ตอบ → ใช้ชื่อ default)
const BT_NAME_QUERY      = '! U1 getvar "bluetooth.friendly_name"\r\n'
const BT_NAME_TIMEOUT_MS = 2500

// หลังตัดการเชื่อมต่อ Bluetooth เครื่องพิมพ์ต้องใช้เวลาสักพัก (เคยเห็นถึง ~24 วินาที) ก่อนจะรับการเชื่อมต่อใหม่ได้
// ระหว่างนั้น open() จะ fail ด้วย NetworkError เลยรอแล้วลองใหม่แทนที่จะรายงาน error ทันที (12 ครั้ง x 3 วินาที ≈ 36 วินาที)
const BT_OPEN_RETRY_MS = 3000
const BT_OPEN_ATTEMPTS = 12

let _btPrinters = []        // { id, port, name, status: 'checking' | 'online' | 'offline', pending, isOpen }
let _btSeq = 0
let _btLoadInFlight = null
const _btListeners = []

function btSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator
}

function isBluetoothPrinterId(value) {
    return typeof value === 'string' && value.startsWith(BT_PRINTER_PREFIX)
}

function btGetPrinters() {
    return _btPrinters
}

function btGetPrinter(id) {
    return _btPrinters.find(p => p.id === id) || null
}

function btPrinterName(p) {
    return p.name || `Bluetooth Printer #${_btPrinters.indexOf(p) + 1}`
}

// ให้ dropdown มาลงทะเบียนไว้ — เรียกทุกครั้งที่รายการ/สถานะของเครื่อง Bluetooth เปลี่ยน (เช่น ถามชื่อเครื่องเสร็จ) เพื่อ render ใหม่
function btOnChange(fn) {
    _btListeners.push(fn)
}

function _btNotify() {
    _btListeners.forEach(fn => { try { fn() } catch (_) {} })
}

function _btNewEntry(port) {
    return { id: BT_PRINTER_PREFIX + (++_btSeq), port, name: null, status: 'checking', pending: null, isOpen: false }
}

// งานบน port เดียวกันต้องทำทีละอย่าง (เปิด port ซ้อนกันไม่ได้)
function _btEnqueue(p, job) {
    const run = (p.pending || Promise.resolve()).then(job)
    p.pending = run.catch(() => {})
    return run
}

async function _btOpen(p, attempts = 1, onRetry = null) {
    if (p.isOpen) return
    for (let attempt = 1; ; attempt++) {
        try {
            await p.port.open({ baudRate: 9600 })
            break
        } catch (err) {
            if (err.name === 'InvalidStateError') break   // เปิดค้างอยู่แล้ว ใช้ต่อได้
            if (err.name !== 'NetworkError' || attempt >= attempts) throw err
            onRetry?.(attempt, attempts)
            await new Promise(resolve => setTimeout(resolve, BT_OPEN_RETRY_MS))
        }
    }
    p.isOpen = true
}

async function _btClose(p) {
    if (!p.isOpen) return
    p.isOpen = false
    try { await p.port.close() } catch (_) { /* หลุดไปแล้ว */ }
}

async function _btQueryName(p) {
    await _btOpen(p)
    try {
        const writer = p.port.writable.getWriter()
        await writer.write(new TextEncoder().encode(BT_NAME_QUERY))
        writer.releaseLock()

        const reader  = p.port.readable.getReader()
        const timer   = setTimeout(() => reader.cancel(), BT_NAME_TIMEOUT_MS)
        const decoder = new TextDecoder()
        let text = ''
        try {
            while (!/"[^"]*"/.test(text)) {
                const { value, done } = await reader.read()
                if (done) break
                text += decoder.decode(value, { stream: true })
            }
        } finally {
            clearTimeout(timer)
            reader.releaseLock()
        }
        return text.match(/"([^"]*)"/)?.[1] || null
    } finally {
        await _btClose(p)
    }
}

// ลองต่อเครื่องแล้วถามชื่อ — ต่อได้ = online (แม้เครื่องจะไม่ตอบชื่อ), ต่อไม่ได้ = offline
function _btCheck(p) {
    p.status = 'checking'
    _btNotify()
    return _btEnqueue(p, () => _btQueryName(p)).then(
        name => { p.name = name || p.name; p.status = 'online' },
        ()   => { p.status = 'offline' }
    ).then(_btNotify)
}

// โหลดรายการเครื่องที่ user เคยเพิ่มไว้ใน browser นี้ แล้วเช็คสถานะ/ชื่อทีละเครื่อง — เรียกตอนเข้าหน้าที่มี dropdown โหมดนี้
function btLoadPrinters() {
    if (!btSupported()) return Promise.resolve(_btPrinters)
    if (_btLoadInFlight) return _btLoadInFlight
    _btLoadInFlight = (async () => {
        try {
            const ports = await navigator.serial.getPorts()
            _btPrinters = ports.map(port => _btPrinters.find(p => p.port === port) || _btNewEntry(port))
            _btNotify()
            await Promise.all(_btPrinters.map(_btCheck))
        } catch (_) { /* อ่านรายการไม่ได้ — เหลือรายการเดิมไว้ */ }
        return _btPrinters
    })()
    return _btLoadInFlight.finally(() => { _btLoadInFlight = null })
}

// เปิด popup ของ Chrome ให้ user เลือกเครื่องที่ pair ไว้ (ต้องเรียกจาก click ของ user เท่านั้น) — คืน entry ของเครื่องที่เลือก
// หรือ null ถ้า user ปิด popup ไปเฉยๆ
async function btAddPrinter() {
    if (!btSupported()) throw new Error('This browser does not support Bluetooth printing — use Chrome or Edge on a computer (HTTPS)')
    let port
    try {
        port = await navigator.serial.requestPort()
    } catch (err) {
        if (err?.name === 'NotFoundError') return null
        throw err
    }
    let p = _btPrinters.find(x => x.port === port)
    if (!p) {
        p = _btNewEntry(port)
        _btPrinters.push(p)
    }
    await _btCheck(p)
    return p
}

async function btRemovePrinter(id) {
    const p = btGetPrinter(id)
    if (!p) return
    await p.pending
    await _btClose(p)
    await p.port.forget()
    _btPrinters = _btPrinters.filter(x => x !== p)
    _btNotify()
}

// ส่ง ZPL ไปที่เครื่องพิมพ์: เชื่อมต่อใหม่ → ส่ง → รอจนข้อมูลออกไปจริง (close ของ writer) → ตัดการเชื่อมต่อ
// เชื่อมต่อใหม่ทุกงานโดยตั้งใจ — เคยลองเปิดค้างไว้ให้เร็วขึ้นแล้วข้อมูลที่ส่งผ่านการเชื่อมต่อที่ค้างไว้ไปไม่ถึงเครื่องพิมพ์
async function btPrint(id, zpl, onRetry = null) {
    const p = btGetPrinter(id)
    if (!p) throw new Error('Bluetooth printer not found — please add the printer again')

    const bytes = new TextEncoder().encode(zpl)
    await _btEnqueue(p, async () => {
        await _btOpen(p, BT_OPEN_ATTEMPTS, onRetry)
        try {
            const writer = p.port.writable.getWriter()
            await writer.write(bytes)
            await writer.close()
        } finally {
            await _btClose(p)
        }
    })
    p.status = 'online'
    _btNotify()
}

// id ของ print mode ตาม GET /printer/print-mode: 0 = WIFI, 1 = Bluetooth, 2 = USB
const BT_PRINT_MODE = 1

// ── บันทึกประวัติการพิมพ์ของโหมด Bluetooth (POST /printer/histories) ──
// โหมดนี้ไม่ผ่าน /printer/send ซึ่งเป็นตัวบันทึกประวัติให้เครื่องปกติ เลยต้องยิงบันทึกเองหลังพิมพ์ทุกครั้ง ทั้งสำเร็จและไม่สำเร็จ
// (printerSend() เป็นคนเรียก) payload = ตัวเดียวกับที่แต่ละหน้าส่งให้ /printer/send
//   printerIp  โหมดนี้ไม่มี IP — ใส่ชื่อเครื่องเหมือน printerName
//   isReprint  ใช้ค่าที่แต่ละหน้าใส่มาใน payload อยู่แล้ว: Lot ใหม่ที่พิมพ์ครั้งแรก = false, พิมพ์ซ้ำในหน้านั้น/มาจากแท็บ Reprint = true
//   reprintReason / errorMessage  ใส่เฉพาะตอนมีค่า (แบบเดียวกับที่ payload ของ /printer/send ไม่ส่ง reprintReason ตอนไม่ได้กรอก)
async function recordBluetoothPrintHistory({ payload, printerName, success, errorMessage }) {
    const name = printerName || 'Bluetooth'
    const body = {
        lotNo:       payload.lotNo ?? '',
        printerIp:   name,
        printerName: name,
        mode:        BT_PRINT_MODE,
        zplData:     payload.zpl ?? '',
        success,
        isReprint:   payload.isReprint === true,
    }
    if (payload.reprintReason) body.reprintReason = payload.reprintReason
    if (errorMessage) body.errorMessage = errorMessage
    await api('/printer/histories', 'POST', body, 10000)
}

// ใช้แทน api('/printer/send', 'POST', payload, 10000) — payload.printerIp ที่เป็น id ของเครื่อง Bluetooth ("bt:…") จะถูกส่งตรง
// ผ่าน Bluetooth ไม่ยิง backend, นอกนั้นยิง /printer/send เหมือนเดิมทุกอย่าง
// โหมด Bluetooth: สำเร็จคืน null (ผู้เรียกเดิมเช็ค res?.problemDetails/statusCode อยู่แล้ว เลยผ่านเป็น success), ไม่สำเร็จ throw
// และบันทึกประวัติผ่าน POST /printer/histories ให้เองทั้งสองกรณี
async function printerSend(payload, { onRetry = null } = {}) {
    if (!isBluetoothPrinterId(payload?.printerIp)) return api('/printer/send', 'POST', payload, 10000)

    const p = btGetPrinter(payload.printerIp)
    const printerName = p ? btPrinterName(p) : ''
    let errorMessage = null
    try {
        await btPrint(payload.printerIp, payload.zpl, onRetry)
    } catch (err) {
        errorMessage = `Bluetooth: ${err?.message || err}`
    }
    try {
        await recordBluetoothPrintHistory({ payload, printerName, success: !errorMessage, errorMessage })
    } catch (err) {
        // บันทึกประวัติไม่ได้ ไม่ควรทำให้ผลการพิมพ์เปลี่ยน (กระดาษออกไปแล้ว/หรือ error ของการพิมพ์สำคัญกว่า) — ทิ้งร่องรอยไว้ใน console
        console.warn('[Bluetooth] POST /printer/histories failed', { lotNo: payload.lotNo, error: err })
    }

    if (errorMessage) throw new Error(errorMessage)
    return null
}

// ── ส่วนของ dropdown (.rp-pd-menu) — ใช้ร่วมกันได้ทุก dropdown: ต่อ HTML นี้ท้ายเมนู แล้วเรียก btBindMenuSection() ──

function _btStatusText(p) {
    return p.status === 'checking' ? 'Checking…' : p.status === 'offline' ? 'Not reachable' : 'Ready'
}

// HTML ของแถวเครื่อง Bluetooth ที่เพิ่มไว้ + แถว "Add Printer" ล่างสุด (data-ip = id ให้เข้ากับโค้ด dropdown เดิมที่ไล่หาแถวจาก data-ip)
function btMenuSectionHtml(selectedId) {
    const rows = _btPrinters.map(p => {
        const selected = p.id === selectedId
        return `<div class="rp-pd-item rp-pd-bt-item${selected ? ' active' : ''}" data-ip="${p.id}" data-bt-id="${p.id}">
            <span class="rp-pd-dot${p.status === 'online' ? ' online' : ''}"></span>
            <div class="rp-pd-info">
                <div class="rp-pd-info-row">
                    <span class="rp-pd-item-name">${escHtml(btPrinterName(p))}</span>
                </div>
                <div class="rp-pd-info-row">
                    <span class="rp-pd-bt-badge"><i class="bi bi-bluetooth"></i>Bluetooth</span>
                    <span class="rp-pd-item-ip">${_btStatusText(p)}</span>
                </div>
            </div>
            <button type="button" class="rp-pd-bt-remove" data-bt-remove="${p.id}" title="Remove this Bluetooth printer"><i class="bi bi-trash3"></i></button>
            <i class="bi bi-check2 rp-pd-check" style="display:${selected ? '' : 'none'}"></i>
        </div>`
    }).join('')

    const add = btSupported()
        ? `<div class="rp-pd-item rp-pd-add" data-bt-add="1"><i class="bi bi-plus-circle"></i><span>Add Printer</span></div>`
        : `<div class="rp-pd-item rp-pd-add disabled" title="Bluetooth printing needs Chrome or Edge on a computer (HTTPS)"><i class="bi bi-plus-circle"></i><span>Add Printer</span><span class="rp-pd-add-note">Chrome / Edge on a computer only</span></div>`
    return rows + add
}

// ผูก event ให้ส่วนที่ btMenuSectionHtml() สร้าง — ต้องเรียกทุกครั้งหลังเซ็ต innerHTML ของเมนูใหม่
//   onPick(printer)       user เลือกเครื่อง Bluetooth (รวมถึงเครื่องที่เพิ่งเพิ่มเสร็จ) — ให้ dropdown เซ็ตค่าที่เลือกเอง
//   onChanged(removedId)  รายการเปลี่ยน/กลับจากหน้าเลือก mode — ให้ dropdown render เมนูใหม่ (removedId มีค่าเฉพาะตอนลบเครื่อง)
//   onError(err)          เพิ่ม/ลบเครื่องไม่สำเร็จ
// stopPropagation ทุกจุดที่เซ็ต innerHTML ใหม่ ไม่งั้น handler "คลิกนอก dropdown แล้วปิด" ของหน้าจะเห็น target ที่หลุดจาก DOM ไปแล้วและปิดเมนูทิ้ง
function btBindMenuSection(menuEl, { onPick, onChanged, onError } = {}) {
    if (!menuEl) return

    menuEl.querySelectorAll('[data-bt-id]').forEach(item => {
        item.addEventListener('click', e => {
            if (e.target.closest('[data-bt-remove]')) return
            const p = btGetPrinter(item.dataset.btId)
            if (p) onPick?.(p)
        })
    })

    menuEl.querySelectorAll('[data-bt-remove]').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation()
            const p = btGetPrinter(btn.dataset.btRemove)
            if (!p || !confirm(`Remove Bluetooth printer "${btPrinterName(p)}"?`)) return
            try {
                await btRemovePrinter(p.id)
            } catch (err) {
                onError?.(err)
            }
            onChanged?.(p.id)
        })
    })

    menuEl.querySelector('[data-bt-add]')?.addEventListener('click', e => {
        e.stopPropagation()
        _btShowModeList(menuEl, { onPick, onChanged, onError })
    })
}

// หน้าเลือก mode ของ "Add Printer" (แทนที่เนื้อหาเมนูชั่วคราว) — ตอนนี้มี mode เดียว เพิ่ม mode ใหม่ได้โดยเพิ่มแถว data-bt-mode
function _btShowModeList(menuEl, { onPick, onChanged, onError }) {
    menuEl.innerHTML = `
        <div class="rp-pd-bt-head">
            <button type="button" class="rp-pd-bt-back" data-bt-back="1" title="Back"><i class="bi bi-arrow-left"></i></button>
            <span>Add Printer — select mode</span>
        </div>
        <div class="rp-pd-item" data-bt-mode="webserial">
            <i class="bi bi-bluetooth rp-pd-bt-mode-icon"></i>
            <div class="rp-pd-info">
                <div class="rp-pd-info-row"><span class="rp-pd-item-name">Bluetooth (Web Serial)</span></div>
                <div class="rp-pd-info-row"><span class="rp-pd-bt-mode-desc">Printer paired with this computer</span></div>
            </div>
        </div>`

    menuEl.querySelector('[data-bt-back]')?.addEventListener('click', e => {
        e.stopPropagation()
        onChanged?.()
    })

    menuEl.querySelector('[data-bt-mode="webserial"]')?.addEventListener('click', async e => {
        e.stopPropagation()
        menuEl.innerHTML = '<div class="rp-pd-msg"><span class="spinner-border spinner-border-sm me-2" style="width:14px;height:14px;border-width:2px"></span>Select the printer in the browser dialog…</div>'
        let added = null
        try {
            added = await btAddPrinter()
        } catch (err) {
            onError?.(err)
        }
        onChanged?.()
        if (added) onPick?.(added)
    })
}
