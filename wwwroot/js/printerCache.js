// printerCache.js — cache กลาง (localStorage) ของ printer list + status ให้ทุกหน้าที่ต้องปริ้นท์ดึงไปใช้ได้ทันที ไม่ต้องรอ fetch ใหม่ทุกครั้ง
// โหลดใน _Layout.cshtml (ทุกหน้า) ต่อจาก js/api.js เสมอ — เพื่อ warm cache ต่อเนื่องขณะ user เดินเว็บอยู่ ไม่ผูกกับแค่หน้าที่ print เท่านั้น
// เก็บเป็น "unfiltered" list เสมอ (ยังไม่กรองตาม location/permission) — การกรองยังทำที่ createPrinterPicker() ตอน render เหมือนเดิม
//
// flow: _Layout.cshtml เรียก refreshPrinterCache() แบบ fire-and-forget ทุกครั้งที่โหลดหน้า (เก็บ cache ให้สดอยู่เรื่อยๆ)
//       หน้าที่มี printer dropdown (createPrinterPicker ใน printerPicker.js) จะ hydrate จาก getPrinterCache() ทันทีตอนเปิดหน้า (เห็นค่าเดิมไม่ต้องรอ)
//       แล้วค่อยยิง refreshPrinterCache() ซ้ำอีกรอบเบื้องหลัง แพตช์ผลเข้า dropdown แบบเนียนๆ เมื่อเสร็จ

const PRINTER_CACHE_KEY = 'sf_printer_cache'

function getPrinterCache() {
    try {
        const raw = localStorage.getItem(PRINTER_CACHE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || !Array.isArray(parsed.printers)) return null
        return parsed
    } catch (_) { return null }
}

function setPrinterCache(printers, statusMap) {
    try {
        localStorage.setItem(PRINTER_CACHE_KEY, JSON.stringify({ printers, statusMap, updatedAt: Date.now() }))
    } catch (_) { /* localStorage เต็ม/ปิดไว้ — ปล่อยผ่าน ไม่ critical ต่อการทำงานหลัก */ }
}

// ยิง /printer/zebra/status/batch ครั้งเดียวสำหรับ printer ทั้งลิสต์ (แทนยิง /printer/status/{ip}/{port} ทีละตัว) — คืน Map<ipAddress, statusObj>
// รับ printers เป็น array ของ object ที่มี printerIp/printerPort — จับคู่ผลลัพธ์กลับด้วย ipAddress เอง (ไม่พึ่งลำดับ array ที่ backend คืนมา)
// (ย้ายมาจาก printerPicker.js เดิม — ให้ printerCache.js เรียกใช้ได้เองโดยไม่ต้องพึ่ง printerPicker.js ซึ่งไม่ได้โหลดทุกหน้า)
async function fetchPrinterStatusBatch(printers) {
    const map = new Map()
    if (!printers.length) return map
    try {
        const body = printers.map(p => ({ ipAddress: p.printerIp, port: p.printerPort || 9100 }))
        const res  = await api('/printer/zebra/status/batch', 'POST', body)
        const list = Array.isArray(res) ? res : (res?.data ?? [])
        list.forEach(st => { if (st?.ipAddress) map.set(st.ipAddress, st) })
    } catch (_) { /* เหลือ map ว่างไว้ — ผู้เรียกจะได้ status ว่างเหมือน fail แบบเดิม */ }
    return map
}

// กันยิงซ้อนกันหลายจุดพร้อมกัน (เช่น _Layout warm-up กับ printerPicker.load() ชนกันพอดี) — รอ promise เดิมแทนที่จะยิงซ้ำ
let _printerCacheInFlight = null

// ถ้า cache เพิ่งอัปเดตมาไม่เกินนี้ ข้าม fetch รอบใหม่ไปเลย (เว้นแต่เรียกแบบ force=true) — กันยิง /printer/all + status batch
// รัวๆ ตอน user สลับหน้าไปมาถี่ๆ (ทุกหน้ามี _Layout warm-up call เหมือนกันหมด ไม่ใช่แค่หน้าที่ print)
const PRINTER_CACHE_STALE_MS = 30 * 1000

// ยิง /printer/all + /printer/zebra/status/batch แล้วเก็บผลลง localStorage — คืน { printers, statusMap } ตัวใหม่ (null ถ้า fetch ไม่สำเร็จ)
// ใช้ร่วมกันทั้ง background warm-up (จาก _Layout ทุกหน้า) และตอนหน้าที่มี printer dropdown ต้องการ fetch สดจริงๆ
// force=true (เฉพาะปุ่ม "Refresh Printer" ที่ user กดเอง) → ข้ามการเช็คความสดของ cache เสมอ ยิงจริงให้แน่ใจว่าเห็นผลใหม่จริงๆ
async function refreshPrinterCache(force = false) {
    if (!force && !_printerCacheInFlight) {
        const cached = getPrinterCache()
        if (cached && typeof cached.updatedAt === 'number' && (Date.now() - cached.updatedAt) < PRINTER_CACHE_STALE_MS) {
            return { printers: cached.printers, statusMap: cached.statusMap }
        }
    }
    if (_printerCacheInFlight) return _printerCacheInFlight
    _printerCacheInFlight = (async () => {
        try {
            const res    = await api('/printer/all', 'GET')
            const all    = Array.isArray(res) ? res : (res?.data ?? [])
            const active = all.filter(p => p.isActive !== false)
            const map    = await fetchPrinterStatusBatch(active)
            const statusMap = {}
            active.forEach(p => { statusMap[p.printerIp] = map.get(p.printerIp) || {} })
            setPrinterCache(active, statusMap)
            return { printers: active, statusMap }
        } catch (_) {
            return null
        }
    })()
    try {
        return await _printerCacheInFlight
    } finally {
        _printerCacheInFlight = null
    }
}
