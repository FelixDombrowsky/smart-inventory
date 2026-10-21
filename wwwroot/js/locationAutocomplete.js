// locationAutocomplete.js — location picker จาก permitted locations ของ user
function createLocationAutocomplete({
    inputId, dropdownId,
    locations = [],
    getLocations = null,
    renderItem = null,
    onSelect,
    onClear,
    maxItems = 30,
    emptyText = 'ไม่พบ Location',
    // autoCommitScan: เครื่องสแกน (keyboard wedge) ที่พิมพ์เข้าช่องนี้ตรงๆ — ตรวจจับจากความเร็วพิมพ์ (ตัวอักษรห่างกัน < SCAN_GAP_MS
    // ติดกันหลายตัว) แล้วพอหยุดพิมพ์ให้เลือก location ให้เลยโดยไม่ต้องกด Enter/คลิก (ชื่อ/รหัสตรงตัวก่อน ไม่งั้นเอาอันแรกในรายการ)
    autoCommitScan = false
}) {
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

    let _permLocs = locations, _results = []

    const _getLocs = () => getLocations ? getLocations() : _permLocs

    const input    = () => document.getElementById(inputId)
    const dropdown = () => document.getElementById(dropdownId)

    function hide() {
        const dd = dropdown()
        if (dd) dd.style.display = 'none'
    }

    function commit(loc) {
        const inp = input()
        if (inp) inp.value = loc.displayName || ''
        hide()
        onSelect?.(loc)
    }

    function render(items) {
        _results = items
        const dd = dropdown()
        if (!items.length) {
            dd.innerHTML = `<div class="loc-item" style="color:var(--t2);cursor:default"><i class="bi bi-search me-2"></i>${emptyText}</div>`
            dd.style.display = 'block'
            return
        }
        // badge สีตาม location type (locTypeBadge จาก locationTypeMeta.js — โหลดคู่กันทุกหน้าที่ใช้ picker นี้อยู่แล้ว) แทน
        // badge สีฟ้าล้วน + ตัด icon pin หน้าชื่อทิ้ง (ตาม pattern เดียวกับ _Receive.cshtml ของ PrintQR)
        dd.innerHTML = items.slice(0, maxItems).map((loc, i) =>
            renderItem
                ? renderItem(loc, i)
                : `<div class="loc-item" data-idx="${i}">
                <span style="min-width:0">
                    <strong>${esc(loc.displayName || '')}</strong>
                    <span style="color:var(--t2);font-size:12px;margin-left:6px">${esc(loc.locationCode)}</span>
                </span>
                <span style="margin-left:auto;flex-shrink:0">${typeof locTypeBadge === 'function' ? locTypeBadge(loc.typeName) : esc(loc.typeName || '')}</span>
            </div>`
        ).join('')
        dd.style.display = 'block'
    }

    function filter(q) {
        return q
            ? _permLocs.filter(l =>
                (l.locationCode || '').toLowerCase().includes(q) ||
                (l.displayName  || '').toLowerCase().includes(q))
            : _permLocs
    }

    const inp = input()

    // เด้ง dropdown ทันทีที่กดกล่อง — ผูกทั้ง focus (ครั้งแรกที่โฟกัส) และ click (คลิกซ้ำตอน field โฟกัสอยู่แล้ว ซึ่ง
    // "focus" เฉยๆ ไม่ยิงซ้ำให้ เพราะ browser ยิง focus แค่ตอน transition จาก unfocused → focused เท่านั้น)
    function openOnInteract() {
        const filtered = filter(inp.value.trim().toLowerCase())
        if (filtered.length) render(filtered)
    }
    inp.addEventListener('focus', openOnInteract)
    inp.addEventListener('click', openOnInteract)

    const SCAN_GAP_MS = 50, SCAN_MIN_BURST = 3, SCAN_IDLE_MS = 200
    let _lastInputAt = 0, _burst = 0, _scanTimer = null

    inp.addEventListener('input', function() {
        onClear?.()
        const q = this.value.trim().toLowerCase()
        if (!q) { hide(); _burst = 0; return }
        render(filter(q))
        if (!autoCommitScan) return
        const now = Date.now()
        _burst = now - _lastInputAt < SCAN_GAP_MS ? _burst + 1 : 1
        _lastInputAt = now
        clearTimeout(_scanTimer)
        _scanTimer = setTimeout(() => {
            if (_burst < SCAN_MIN_BURST) return   // คนพิมพ์เอง — ปล่อยให้เลือกเองตามปกติ
            _burst = 0
            const v = inp.value.trim()
            if (!selectByCode(v) && _results[0]) commit(_results[0])
        }, SCAN_IDLE_MS)
    })

    inp.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return
        clearTimeout(_scanTimer)
        // Enter (ทั้งคนพิมพ์และเครื่องสแกนที่ส่ง Enter ตามท้าย) — ชื่อ/รหัสตรงตัวก่อน ไม่งั้นเอาอันแรกในรายการ
        if (selectByCode(inp.value)) return
        const first = _results[0]
        if (first) commit(first)
    })

    inp.addEventListener('blur', function() {
        setTimeout(hide, 150)
    })

    const dd = dropdown()
    dd.addEventListener('mousedown', e => {
        const el = e.target.closest('[data-idx]')
        if (!el) return
        commit(_results[+el.dataset.idx])
    })

    // ใช้กับการสแกน Location (กล้อง / HW scanner): ข้อความที่สแกนได้ เช่น "A0001" → หา location ที่ชื่อ (displayName / locationName)
    // หรือ locationCode ตรงกันพอดี (ไม่สนตัวพิมพ์/ช่องว่างหัวท้าย) ในรายการเดียวกับที่ใช้ค้นหาตอนพิมพ์ → เลือกให้ทันที ไม่ต้องกดเลือก
    // คืน location ที่เลือก หรือ null ถ้าไม่เจอ (ไม่มีในระบบ / ไม่มีสิทธิ์)
    function selectByCode(raw) {
        const q = String(raw ?? '').trim().toLowerCase()
        if (!q) return null
        const locs = _getLocs() || []
        const keys = l => [l.displayName, l.locationName, l.name, l.locationCode].filter(Boolean).map(v => String(v).trim().toLowerCase())
        const loc = locs.find(l => keys(l).includes(q))
        if (loc) commit(loc)
        return loc || null
    }

    return { hide, selectByCode }
}
