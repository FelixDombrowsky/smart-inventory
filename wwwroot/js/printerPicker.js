// printerPicker.js — printer dropdown แบบ custom (status dot + battery + IP) ใช้ร่วมกันได้ทุกหน้า (PrintQR, Split, Merge)
// ต้องโหลดหลัง js/api.js, js/printerCache.js (ใช้ getPrinterCache/refreshPrinterCache/fetchPrinterStatusBatch),
// js/zplBuilder.js (ใช้ escHtml), js/loadLocation.js, js/loadPrinter.js (ใช้ filterPrintersByLocation) และ
// js/locationTypeMeta.js (ใช้ locTypeBadgeStyle/locHierTypeIcon สำหรับ location badge ต่อแถว)
// filterByPermission (ค่า default true) ต้องมี myLocations พร้อมแล้ว (เรียก await loadPerLocation() ก่อน .load()) ไม่งั้น user ทั่วไปจะไม่เห็น printer เลย
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

// ไอคอนเตือนปัญหาเครื่อง (Head Open / Paper Out) จาก /printer/status — รวมเป็นไอคอนเดียว ⚠ พร้อม title บอกรายละเอียด (ประหยัดที่ในแถว dropdown ที่แคบ)
function printerWarningHtml(opts = {}) {
    const issues = []
    if (opts.isHeadOpen) issues.push('Head Open')
    if (opts.isPaperOut) issues.push('Paper Out')
    if (!issues.length) return ''
    return `<i class="bi bi-exclamation-triangle-fill rp-pd-warn" title="${escHtml(issues.join(', '))}"></i>`
}

// Badge สี+ไอคอนตาม Location Type ของเครื่องพิมพ์นั้น (เหมือน rprLocBadge ใน _Reprint.cshtml/palOpenDetail ใน _Pallet.cshtml
// แต่ตัวนั้น scope อยู่แค่ใน PrintQR.cshtml เท่านั้น — ไฟล์นี้ใช้ร่วมกับ Split/Merge/Assembly ด้วย เลยมีของตัวเองแยกไว้ ไม่พึ่งฟังก์ชัน
// ของหน้าอื่น) หา location จาก printer.locationId ผ่าน _locIdMap (โหลดจาก loadLocation() ใน loadLocation.js แชร์กันทั้งระบบ)
function printerLocationBadgeHtml(p) {
    const loc = typeof _locIdMap !== 'undefined' ? _locIdMap.get(p.locationId) : null
    const name = loc?.displayName || loc?.locationCode || ''
    if (!name) return ''
    const type  = loc?.typeName || ''
    const style = typeof locTypeBadgeStyle === 'function' ? locTypeBadgeStyle(type) : 'background:#f1f5f9;color:#64748b'
    const icon  = typeof locHierTypeIcon  === 'function' ? locHierTypeIcon(type)  : ''
    return `<span class="rp-pd-loc-badge" style="${style}">${icon}${escHtml(name)}</span>`
}

// HTML ของเนื้อใน 1 แถว printer ใน dropdown (dot + name + battery + warning + location badge + ip + check) — ไม่รวม
// wrapper div.rp-pd-item เอง เพื่อให้ผู้เรียกใส่ data-* attribute ของ wrapper เองได้ตามต้องการ
// แยกเป็น 2 แถวย่อยใน .rp-pd-info: บน = ชื่อ+แบต+warning, ล่าง = location badge+ip (ยัดทุกอย่างแถวเดียวจะแน่นเกินไปพอเพิ่ม badge)
function printerRowHtml(p, opts = {}) {
    const online = opts.online === true
    const name   = (p.printerName || '').replace(/[\r\n]+/g, ' ').trim()
    return `
        <span class="rp-pd-dot${online ? ' online' : ''}"></span>
        <div class="rp-pd-info">
            <div class="rp-pd-info-row">
                <span class="rp-pd-item-name">${escHtml(name)}</span>
                ${printerBatteryHtml(opts.batteryPercent)}
                ${printerWarningHtml(opts)}
            </div>
            <div class="rp-pd-info-row">
                ${printerLocationBadgeHtml(p)}
                <span class="rp-pd-item-ip">${escHtml(p.printerIp)}</span>
            </div>
        </div>
        <i class="bi bi-check2 rp-pd-check" style="display:${opts.selected ? '' : 'none'}"></i>`
}

// ── Widget แบบเบ็ดเสร็จ — ใช้กับหน้าที่ยังไม่มี custom dropdown ของตัวเอง (Split.cshtml, Merge.cshtml) ──
// ต้องมี DOM ตาม convention เดียวกับ PrintQR: .rp-pd-wrap > .rp-pd-trigger (มี dot/name/ip ข้างใน) + .rp-pd-menu, input hidden เก็บ ip ที่เลือก
// bluetooth:true = ต่อท้ายรายการด้วยเครื่องพิมพ์โหมด Bluetooth (Web Serial) ที่ user เพิ่มไว้ + แถว "Add Printer" — หน้าที่เปิดต้องโหลด
// js/bluetoothPrinter.js ด้วย และจุดสั่งพิมพ์ต้องเรียก printerSend() แทน api('/printer/send') (ค่าใน hidden จะเป็น id "bt:…" ไม่ใช่ ip)
function createPrinterPicker({ triggerId, menuId, hiddenId, dotId, nameId, ipId, isAdmin = false, filterByPermission = true, bluetooth = false, onSelect }) {
    let printers  = []
    let statusMap = {}
    let loaded    = false   // _apply() รอบแรกผ่านแล้ว — กัน render จากฝั่ง Bluetooth ทับข้อความ "Loading…" ก่อน printer ปกติโหลดเสร็จ
    const placeholderName = nameId ? document.getElementById(nameId)?.textContent : ''

    function toggle() {
        const menu    = document.getElementById(menuId)
        const trigger = document.getElementById(triggerId)
        if (!menu) return
        const opening = menu.style.display === 'none' || !menu.style.display
        closeAll()
        if (opening) {
            menu.style.display = ''
            trigger?.classList.add('open')
            _refreshSilently()   // fire-and-forget เบื้องหลัง — ไม่บล็อกการเปิด dropdown, apply ทับแบบเนียนๆ เมื่อ fetch เสร็จ (ไม่ reset เป็น offline ก่อน)
        }
    }

    // fetch สถานะสดตอนเปิด dropdown — ผ่าน refreshPrinterCache() แบบไม่ force เลยยังโดน throttle 30s กันยิงถี่ตอนเปิด/ปิด/เปิดซ้ำเร็วๆ อยู่
    async function _refreshSilently() {
        const fresh = typeof refreshPrinterCache === 'function' ? await refreshPrinterCache() : null
        if (fresh) _apply(fresh)
    }

    function closeAll() {
        document.querySelectorAll('.rp-pd-menu').forEach(m => m.style.display = 'none')
        document.querySelectorAll('.rp-pd-trigger').forEach(t => t.classList.remove('open'))
    }

    function render() {
        const menu = document.getElementById(menuId)
        if (!menu) return
        const selectedIp = document.getElementById(hiddenId)?.value
        const rows = !printers.length
            ? '<div class="rp-pd-msg">No printers found</div>'
            : printers.map(p => {
                const st = statusMap[p.printerIp] || {}
                return `<div class="rp-pd-item${p.printerIp === selectedIp ? ' active' : ''}" data-ip="${escHtml(p.printerIp)}" data-port="${p.printerPort || 9100}">
                    ${printerRowHtml(p, { online: st.isReady === true, batteryPercent: st.batteryPercent, isHeadOpen: st.isHeadOpen, isPaperOut: st.isPaperOut, selected: p.printerIp === selectedIp })}
                </div>`
            }).join('')
        menu.innerHTML = rows + (bluetooth ? btMenuSectionHtml(selectedIp) : '')
        // [data-port] = เฉพาะแถว printer ปกติ — แถวของโหมด Bluetooth ผูก event แยกใน btBindMenuSection()
        menu.querySelectorAll('.rp-pd-item[data-port]').forEach(item => {
            item.addEventListener('click', () => selectByIp(item.dataset.ip))
        })
        if (bluetooth) {
            btBindMenuSection(menu, {
                onPick:    selectBluetooth,
                onChanged: removedId => {
                    if (removedId && removedId === document.getElementById(hiddenId)?.value) clearSelected()
                    render()
                },
                onError:   err => alert(`Bluetooth: ${err?.message || err}`),
            })
        }
    }

    // เซ็ตค่าที่เลือกลง hidden + ส่วนแสดงผลบน trigger (dot/ชื่อ/บรรทัดรอง) แล้วปิด dropdown
    function _setSelected(value, port, name, subText, online) {
        const hidden = document.getElementById(hiddenId)
        if (hidden) { hidden.value = value; hidden.dataset.port = port }
        const dot = dotId && document.getElementById(dotId)
        if (dot) { dot.className = 'rp-pd-dot' + (online ? ' online' : ''); dot.style.display = '' }
        const nameEl = nameId && document.getElementById(nameId)
        if (nameEl) { nameEl.textContent = name; nameEl.style.color = ''; nameEl.style.fontWeight = '600' }
        const ipEl = ipId && document.getElementById(ipId)
        if (ipEl) { ipEl.textContent = subText; ipEl.style.display = '' }
        render()
        closeAll()
    }

    function selectByIp(ip) {
        const p = printers.find(x => x.printerIp === ip)
        if (!p) return
        _setSelected(ip, p.printerPort || 9100, (p.printerName || '').replace(/[\r\n]+/g, ' ').trim(), ip, statusMap[ip]?.isReady === true)
        onSelect?.(p)
    }

    // เลือกเครื่องโหมด Bluetooth (entry จาก bluetoothPrinter.js) — hidden เก็บ id "bt:…" แทน ip, ไม่มี port
    function selectBluetooth(p) {
        _setSelected(p.id, '', btPrinterName(p), 'Bluetooth', p.status === 'online')
        onSelect?.(p)
    }

    // กลับเป็น "ยังไม่ได้เลือก printer" (ใช้ตอนเครื่อง Bluetooth ที่เลือกอยู่ถูกลบออกจากรายการ)
    function clearSelected() {
        const hidden = document.getElementById(hiddenId)
        if (hidden) { hidden.value = ''; hidden.dataset.port = '' }
        const dot = dotId && document.getElementById(dotId)
        if (dot) dot.style.display = 'none'
        const nameEl = nameId && document.getElementById(nameId)
        if (nameEl) { nameEl.textContent = placeholderName; nameEl.style.color = 'var(--t2)'; nameEl.style.fontWeight = '400' }
        const ipEl = ipId && document.getElementById(ipId)
        if (ipEl) ipEl.style.display = 'none'
    }

    // sync จุดสถานะบน trigger ของ printer ที่เลือกอยู่ (render() แก้แค่รายการใน dropdown)
    function _syncSelectedDot() {
        const selected = document.getElementById(hiddenId)?.value
        if (!selected) return
        const online = bluetooth && isBluetoothPrinterId(selected)
            ? btGetPrinter(selected)?.status === 'online'
            : statusMap[selected]?.isReady === true
        const dot = dotId && document.getElementById(dotId)
        if (dot) dot.className = 'rp-pd-dot' + (online ? ' online' : '')
    }

    // apply ผล { printers, statusMap } (raw ยังไม่กรอง) ตัวใหม่เข้า state จริง + กรองตาม permission + render
    // ใช้ร่วมกันทั้ง hydrate จาก cache, silent background refresh, และ manual refresh
    function _apply(fresh) {
        const filtered = filterByPermission ? filterPrintersByLocation(fresh.printers, isAdmin) : fresh.printers
        printers  = filtered
        statusMap = fresh.statusMap || {}
        loaded    = true
        render()   // ไม่มี printer ปกติเลยก็ render ได้ — ขึ้น "No printers found" (+ ส่วนของโหมด Bluetooth ถ้าเปิดไว้)
        if (!printers.length) return
        const selectedIp = document.getElementById(hiddenId)?.value
        if (selectedIp) {
            // เลือก printer ไว้อยู่แล้ว — render() แก้แค่รายการใน dropdown เฉยๆ ต้อง sync จุดสถานะบน trigger เองด้วย
            // ไม่งั้น status ใหม่ที่ fetch มา (เช่น จาก offline → online) จะไม่ขึ้นที่ trigger จนกว่าจะเลือกใหม่
            _syncSelectedDot()
        } else if (!isAdmin && printers.length === 1) {
            // ยังไม่เคยเลือก printer ไว้ในหน้านี้ + มี printer ให้เห็นแค่เครื่องเดียว (myPrinter = 1) — auto-select ให้เลย
            // แต่ถ้ามีมากกว่า 1 เครื่อง (รวมถึง Admin ที่เห็นทุกเครื่อง) ไม่ auto-select ให้ บังคับให้เลือกเองกัน human error (มือลั่นกด print เครื่องแรกที่ auto มาให้)
            selectByIp(printers[0].printerIp)
        }
    }

    // โหลดครั้งแรกตอนเข้าหน้า — hydrate จาก cache กลาง (printerCache.js) ทันทีถ้ามี ไม่ fetch ซ้ำอัตโนมัติ (จะ fetch สดตอนกด dropdown แทน ดู toggle())
    // ถ้ายังไม่มี cache เลย (edge case แรกสุดของ session ที่ _Layout ยัง warm ไม่ทัน) ค่อย fetch ครั้งเดียวเป็น fallback ให้มีอะไรโชว์ก่อน
    async function load() {
        // เครื่องโหมด Bluetooth ที่ user เคยเพิ่มไว้ใน browser นี้ — โหลด + เช็คสถานะเบื้องหลัง ไม่บล็อกการโหลด printer ปกติ
        if (bluetooth) btLoadPrinters()

        const cached = typeof getPrinterCache === 'function' ? getPrinterCache() : null
        if (cached) {
            _apply(cached)
            return
        }

        const menu = document.getElementById(menuId)
        if (menu) menu.innerHTML = '<div class="rp-pd-msg"><span class="spinner-border spinner-border-sm me-2" style="width:14px;height:14px;border-width:2px"></span>Loading…</div>'
        const fresh = await refreshPrinterCache()
        if (!fresh) {
            if (menu) menu.innerHTML = '<div class="rp-pd-msg" style="color:var(--red)">⚠️ Load failed</div>'
            return
        }
        _apply(fresh)
    }

    // ปุ่ม Refresh Printer กดเอง — reset เป็น offline หมดก่อนให้เห็นชัดๆ ว่า refresh จริง (ต่างจาก load() ที่ silent) แล้วค่อย fetch ใหม่มา apply
    // force:true ข้ามการเช็คความสดของ cache (PRINTER_CACHE_STALE_MS) เสมอ — user กดเองต้องได้ fetch จริง ไม่ใช่โดนสกัดเพราะเพิ่งมีหน้าอื่น warm cache ไปหมาดๆ
    async function reloadManual() {
        if (printers.length) { statusMap = {}; render() }
        else {
            const menu = document.getElementById(menuId)
            if (menu) menu.innerHTML = '<div class="rp-pd-msg"><span class="spinner-border spinner-border-sm me-2" style="width:14px;height:14px;border-width:2px"></span>Loading…</div>'
        }
        const fresh = await refreshPrinterCache(true)
        if (!fresh) {
            const menu = document.getElementById(menuId)
            if (menu) menu.innerHTML = '<div class="rp-pd-msg" style="color:var(--red)">⚠️ Load failed</div>'
            return
        }
        _apply(fresh)
    }

    // ยิง /printer/zebra/status/batch ครั้งเดียวสำหรับ printer ทั้งหมด (แทนยิงทีละตัว) — พอผลกลับมาก็ patch ทุกแถวพร้อมกัน
    // เรียกทั้งตอน load ครั้งแรก และทุกครั้งที่เปิด dropdown (สถานะ online/battery ไม่ realtime — ต้อง refresh ใหม่กันค่าเก่าค้าง)
    function refreshStatuses() {
        fetchPrinterStatusBatch(printers).then(map => {
            printers.forEach(p => {
                statusMap[p.printerIp] = map.get(p.printerIp) || {}
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

    // รายการ/สถานะของเครื่อง Bluetooth เปลี่ยน (เช่น ถามชื่อเครื่องเสร็จ) → render รายการใหม่ + sync จุดสถานะของเครื่องที่เลือกอยู่
    if (bluetooth) btOnChange(() => { if (loaded) { render(); _syncSelectedDot() } })

    document.getElementById(triggerId)?.addEventListener('click', toggle)
    document.addEventListener('click', e => {
        if (!e.target.closest(`#${triggerId}`) && !e.target.closest(`#${menuId}`)) closeAll()
    })

    return { load, reload: reloadManual, refreshStatuses, getSelectedIp: () => document.getElementById(hiddenId)?.value || '' }
}

// ปุ่มกด Refresh Printer ของ createPrinterPicker (Split/Merge/Assembly) — reload() เฉยๆ ไม่มี concept
// ของปุ่มที่กด เลยไม่มีใครสั่ง spin animation ให้ ต้องผ่าน wrapper นี้แทนถึงจะเห็น icon หมุน (เหมือน rpManualRefreshPrinters ของ PrintQR.cshtml)
function printerPickerManualRefresh(picker, btn) {
    btn?.classList.add('spinning')
    picker.reload()
    setTimeout(() => btn?.classList.remove('spinning'), 650)
}
