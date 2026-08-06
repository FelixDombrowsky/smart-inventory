// printerPicker.js — printer dropdown แบบ custom (status dot + battery + IP) ใช้ร่วมกันได้ทุกหน้า (PrintQR, Split, Merge)
// ต้องโหลดหลัง js/api.js และ js/zplBuilder.js (ใช้ escHtml, filterPrintersByPermission)
// CSS ของ .rp-pd-* ทั้งหมดอยู่ที่ wwwroot/css/printqr.css (ต้อง <link> ไฟล์นั้นเข้ามาในหน้าที่ใช้ widget นี้ด้วย)

// สีของแถบแบตเตอรี่ตาม % (เขียว=สูง, เหลือง=กลาง, แดง=ต่ำ, เทา=ไม่รู้ค่า)
function printerBatteryColor(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return '#d1d5db'
    if (pct >= 50) return '#22c55e'
    if (pct >= 20) return '#f59e0b'
    return '#dc2626'
}

// HTML ของ battery indicator (ทรงไอคอนแบตเตอรี่จริง — กรอบ + หัวนูนด้านขวา + แท่งไส้ในตาม %)
// ถ้าไม่มีค่า % (batteryPercent เป็น null/undefined) ไม่ต้อง render อะไรเลย
function printerBatteryHtml(pct) {
    const hasPct = typeof pct === 'number' && !isNaN(pct)
    if (!hasPct) return ''
    const clamped = Math.max(0, Math.min(100, pct))
    const color   = printerBatteryColor(clamped)
    return `<span class="rp-pd-battery" title="Battery ${clamped}%">
        <span class="rp-pd-batt-icon">
            <span class="rp-pd-batt-body">
                <span class="rp-pd-batt-fill" style="width:${clamped}%;background:${color}"></span>
            </span>
            <span class="rp-pd-batt-nub"></span>
        </span>
        <span class="rp-pd-battery-pct">${clamped}%</span>
    </span>`
}

// ยิง /printer/status/{ip}/{port} — คืน object ({isReady, batteryPercent, ...}) หรือ null ถ้า fail
async function fetchPrinterStatus(ip, port) {
    try {
        return await api(`/printer/status/${encodeURIComponent(ip)}/${port || 9100}`, 'GET')
    } catch (_) {
        return null
    }
}

// ไอคอนเตือนปัญหาเครื่อง (Head Open / Paper Out) จาก /printer/status — รวมเป็นไอคอนเดียว ⚠ พร้อม title บอกรายละเอียด (ประหยัดที่ในแถว dropdown ที่แคบ)
function printerWarningHtml(opts = {}) {
    const issues = []
    if (opts.isHeadOpen) issues.push('Head Open')
    if (opts.isPaperOut) issues.push('Paper Out')
    if (!issues.length) return ''
    return `<i class="bi bi-exclamation-triangle-fill rp-pd-warn" title="${escHtml(issues.join(', '))}"></i>`
}

// HTML ของเนื้อใน 1 แถว printer ใน dropdown (dot + name + battery + warning + ip + check) — ไม่รวม wrapper div.rp-pd-item เอง
// เพื่อให้ผู้เรียกใส่ data-* attribute ของ wrapper เองได้ตามต้องการ
function printerRowHtml(p, opts = {}) {
    const online = opts.online === true
    const name   = (p.printerName || '').replace(/[\r\n]+/g, ' ').trim()
    return `
        <span class="rp-pd-dot${online ? ' online' : ''}"></span>
        <div class="rp-pd-info">
            <span class="rp-pd-item-name">${escHtml(name)}</span>
            ${printerBatteryHtml(opts.batteryPercent)}
            ${printerWarningHtml(opts)}
            <span class="rp-pd-item-ip">${escHtml(p.printerIp)}</span>
        </div>
        <i class="bi bi-check2 rp-pd-check" style="display:${opts.selected ? '' : 'none'}"></i>`
}

// ── Widget แบบเบ็ดเสร็จ — ใช้กับหน้าที่ยังไม่มี custom dropdown ของตัวเอง (Split.cshtml, Merge.cshtml) ──
// ต้องมี DOM ตาม convention เดียวกับ PrintQR: .rp-pd-wrap > .rp-pd-trigger (มี dot/name/ip ข้างใน) + .rp-pd-menu, input hidden เก็บ ip ที่เลือก
function createPrinterPicker({ triggerId, menuId, hiddenId, dotId, nameId, ipId, isAdmin = false, filterByPermission = true, onSelect }) {
    let printers  = []
    let statusMap = {}

    function toggle() {
        const menu    = document.getElementById(menuId)
        const trigger = document.getElementById(triggerId)
        if (!menu) return
        const opening = menu.style.display === 'none' || !menu.style.display
        closeAll()
        if (opening) {
            menu.style.display = ''
            trigger?.classList.add('open')
        }
    }

    function closeAll() {
        document.querySelectorAll('.rp-pd-menu').forEach(m => m.style.display = 'none')
        document.querySelectorAll('.rp-pd-trigger').forEach(t => t.classList.remove('open'))
    }

    function render() {
        const menu = document.getElementById(menuId)
        if (!menu) return
        if (!printers.length) { menu.innerHTML = '<div class="rp-pd-msg">No printers found</div>'; return }
        const selectedIp = document.getElementById(hiddenId)?.value
        menu.innerHTML = printers.map(p => {
            const st = statusMap[p.printerIp] || {}
            return `<div class="rp-pd-item${p.printerIp === selectedIp ? ' active' : ''}" data-ip="${escHtml(p.printerIp)}" data-port="${p.printerPort || 9100}">
                ${printerRowHtml(p, { online: st.isReady === true, batteryPercent: st.batteryPercent, isHeadOpen: st.isHeadOpen, isPaperOut: st.isPaperOut, selected: p.printerIp === selectedIp })}
            </div>`
        }).join('')
        menu.querySelectorAll('.rp-pd-item').forEach(item => {
            item.addEventListener('click', () => selectByIp(item.dataset.ip))
        })
    }

    function selectByIp(ip) {
        const p = printers.find(x => x.printerIp === ip)
        if (!p) return
        const hidden = document.getElementById(hiddenId)
        if (hidden) { hidden.value = ip; hidden.dataset.port = p.printerPort || 9100 }
        const online = statusMap[ip]?.isReady === true
        const dot = dotId && document.getElementById(dotId)
        if (dot) { dot.className = 'rp-pd-dot' + (online ? ' online' : ''); dot.style.display = '' }
        const nameEl = nameId && document.getElementById(nameId)
        if (nameEl) { nameEl.textContent = (p.printerName || '').replace(/[\r\n]+/g, ' ').trim(); nameEl.style.color = ''; nameEl.style.fontWeight = '600' }
        const ipEl = ipId && document.getElementById(ipId)
        if (ipEl) { ipEl.textContent = ip; ipEl.style.display = '' }
        render()
        closeAll()
        onSelect?.(p)
    }

    async function load() {
        const menu = document.getElementById(menuId)
        if (menu) menu.innerHTML = '<div class="rp-pd-msg"><span class="spinner-border spinner-border-sm me-2" style="width:14px;height:14px;border-width:2px"></span>Loading…</div>'
        try {
            const res    = await api('/printer/all', 'GET')
            const all    = Array.isArray(res) ? res : (res?.data ?? [])
            const active = all.filter(p => p.isActive !== false)
            printers = filterByPermission ? filterPrintersByPermission(active, isAdmin) : active
        } catch (err) {
            if (menu) menu.innerHTML = '<div class="rp-pd-msg" style="color:var(--red)">⚠️ Load failed</div>'
            return
        }
        if (!printers.length) { if (menu) menu.innerHTML = '<div class="rp-pd-msg">No printers found</div>'; return }

        // รีเซ็ต statusMap ทุกครั้งที่ load ใหม่ (รวมถึงตอนกด Refresh) — กันโชว์สถานะเก่าค้างจากรอบก่อนไปพลางๆ
        // ก่อนที่ /printer/status รอบใหม่จะโหลดเสร็จ (เหมือน rpLoadPrinters() ของ PrintQR.cshtml)
        statusMap = {}
        render()

        // ยังไม่เคยเลือก printer ไว้ — auto-select ตัวแรกในลิสต์แทนที่จะปล่อยเป็น "-- Select Printer --"
        // ยกเว้น Admin ที่เห็นเครื่องพิมพ์ทุกเครื่อง — ไม่ auto-select ให้ บังคับให้เลือกเองกัน human error (มือลั่นกด print เครื่องแรกที่ auto มาให้)
        if (!isAdmin && !document.getElementById(hiddenId)?.value) selectByIp(printers[0].printerIp)

        refreshStatuses()
    }

    // ยิง /printer/status ทีละตัวแบบ background — พอผลกลับมาก็ patch แค่แถวนั้น (ไม่ re-render ทั้ง list)
    // เรียกทั้งตอน load ครั้งแรก และทุกครั้งที่เปิด dropdown (สถานะ online/battery ไม่ realtime — ต้อง refresh ใหม่กันค่าเก่าค้าง)
    function refreshStatuses() {
        printers.forEach(p => {
            fetchPrinterStatus(p.printerIp, p.printerPort).then(st => {
                statusMap[p.printerIp] = st || {}
                patchRow(p.printerIp)
            })
        })
    }

    function patchRow(ip) {
        const st     = statusMap[ip] || {}
        const online = st.isReady === true
        const p      = printers.find(x => x.printerIp === ip)
        const selectedIp = document.getElementById(hiddenId)?.value
        document.querySelectorAll(`#${menuId} .rp-pd-item[data-ip="${ip}"]`).forEach(item => {
            item.innerHTML = printerRowHtml(p, { online, batteryPercent: st.batteryPercent, isHeadOpen: st.isHeadOpen, isPaperOut: st.isPaperOut, selected: ip === selectedIp })
        })
        if (selectedIp === ip) {
            const dot = dotId && document.getElementById(dotId)
            if (dot) dot.className = 'rp-pd-dot' + (online ? ' online' : '')
        }
    }

    document.getElementById(triggerId)?.addEventListener('click', toggle)
    document.addEventListener('click', e => {
        if (!e.target.closest(`#${triggerId}`) && !e.target.closest(`#${menuId}`)) closeAll()
    })

    return { load, reload: load, refreshStatuses, getSelectedIp: () => document.getElementById(hiddenId)?.value || '' }
}

// ปุ่มกด Refresh Printer ของ createPrinterPicker (Split/Merge/Assembly) — reload() เฉยๆ ไม่มี concept
// ของปุ่มที่กด เลยไม่มีใครสั่ง spin animation ให้ ต้องผ่าน wrapper นี้แทนถึงจะเห็น icon หมุน (เหมือน rpManualRefreshPrinters ของ PrintQR.cshtml)
function printerPickerManualRefresh(picker, btn) {
    btn?.classList.add('spinning')
    picker.reload()
    setTimeout(() => btn?.classList.remove('spinning'), 650)
}
