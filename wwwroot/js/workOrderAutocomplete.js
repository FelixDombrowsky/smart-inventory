// workOrderAutocomplete.js — ใช้ร่วมกันสำหรับช่อง autocomplete ค้นหา Work Order
// แต่ละหน้าเรียก createWorkOrderAutocomplete(...) ครั้งเดียว ฟังก์ชันจะผูก event ของ input/dropdown ให้เอง
function createWorkOrderAutocomplete({
    inputId, dropdownId,
    endpoint = '/workorder', pageSize = 100, minLength = 1,
    positionDropdown = false,
    status = null,   // กรอง Work Order ตาม Status (เช่น 1 = Active) — ไม่ระบุ = ไม่กรอง (ค้นทุก Status เหมือนเดิม)
                      // เป็น function ก็ได้ (เช่น () => someToggle ? null : 1) จะถูกเรียกใหม่ทุกครั้งที่ search เพื่ออ่านค่าล่าสุด ไม่ fix ไว้ตอนสร้าง
    isDisabled = () => false,   // item => boolean — กันเลือก item นั้นทั้งจาก click และ Enter (เช่น WO status = Closed ที่ยังไม่ได้ skip permission)
                                 // แค่กันตอน "commit" เท่านั้น ไม่ได้ตัด item ออกจาก results เลย — caller ยังต้อง render ให้ดูออกว่ากดไม่ได้เอง (renderItem)
    renderItem,
    onSelect,
    fromText = text => ({ moNumber: text, lineName: null }),
    emptyText = 'ไม่พบ Work Order',
    loadingText = 'กำลังค้นหา…',
    errorText = 'โหลดไม่สำเร็จ',
    debounceMs = 300,
    showResync = true,  // false = ซ่อนปุ่ม "Re-Sync จากระบบต้นทาง" ตอนไม่พบผลลัพธ์ (เช่นหน้า filter ที่แค่ค้นหา ไม่ได้ต้องการสร้าง/sync WO ใหม่)
    rowResync = false   // true = เติมปุ่ม Re-Sync ท้ายทุกแถว (กดได้ทุก Status รวมถึง Closed) — sync เสร็จแล้วดึง WO นั้นมาใหม่แทนแถวเดิม
                        // ถ้า Status เปลี่ยน (เช่น Closed → Active) isDisabled/renderItem จะถูกคำนวณใหม่ ทำให้แถวนั้นกดเลือกได้ทันที
}) {
    let results = [], timer = null, fetchToken = 0

    const input    = () => document.getElementById(inputId)
    const dropdown = () => document.getElementById(dropdownId)
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

    function defaultRenderItem(x, i) {
        return `<div class="loc-item" data-idx="${i}">
            <i class="bi bi-box-seam" style="color:var(--blue);flex-shrink:0"></i>
            <span>
                <strong>${esc(x.moNumber)}</strong>
                ${x.modelName ? `<span style="color:var(--t2);font-size:12px;margin-left:6px">${esc(x.modelName)}</span>` : ''}
            </span>
            ${x.lineName ? `<span style="margin-left:auto;font-size:11px;color:var(--t3)">${esc(x.lineName)}</span>` : ''}
        </div>`
    }

    function hide() {
        const dd = dropdown()
        if (dd) dd.style.display = 'none'
    }

    function position() {
        if (!positionDropdown) return
        const rect = input().getBoundingClientRect()
        const dd = dropdown()
        dd.style.top   = (rect.bottom + 4) + 'px'
        dd.style.left  = rect.left + 'px'
        dd.style.width = rect.width + 'px'
    }

    function commit(item) {
        if (isDisabled(item)) return
        const inp = input()
        if (inp) inp.value = item.moNumber
        hide()
        onSelect?.(item)
    }

    async function doFetch(text) {
        const dd = dropdown()
        const token = ++fetchToken
        position()
        dd.innerHTML = `<div class="loc-item" style="color:var(--t2);cursor:default">
            <span class="spinner-border spinner-border-sm me-2" style="width:14px;height:14px;border-width:2px"></span>${loadingText}
        </div>`
        dd.style.display = 'block'

        try {
            const statusVal   = typeof status === 'function' ? status() : status
            const statusQuery = statusVal != null ? `&Status=${encodeURIComponent(statusVal)}` : ''
            const json = await api(`${endpoint}?Page=1&PageSize=${pageSize}&Search=${encodeURIComponent(text)}&SortBy=LastSyncedAt&SortDir=desc${statusQuery}`, 'GET')
            if (token !== fetchToken) return   // ผลลัพธ์เก่า ถูกแทนที่ด้วยการค้นหาใหม่แล้ว
            results = json?.data?.data ?? json?.data ?? []
            if (!results.length) {
                if (!showResync) {
                    dd.innerHTML = `<div class="loc-item" style="color:var(--t2);cursor:default">
                        <i class="bi bi-search me-2"></i>${emptyText}
                    </div>`
                    return
                }
                dd.innerHTML = `<div class="loc-item" style="color:var(--t2);cursor:default;flex-direction:column;align-items:stretch;gap:8px">
                    <div><i class="bi bi-search me-2"></i>${emptyText}</div>
                    <button type="button" class="wo-resync-btn" style="align-self:flex-start;font-size:12px;font-weight:700;color:#fff;background:var(--blue);border:none;border-radius:6px;padding:6px 12px;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:inherit">
                        <i class="bi bi-arrow-repeat"></i> Re-Sync "${esc(text)}" จากระบบต้นทาง
                    </button>
                </div>`
                const btn = dd.querySelector('.wo-resync-btn')
                // preventDefault กัน input เสีย focus (ไม่งั้น blur handler จะสั่ง hide() ทับตอนกำลัง Re-Sync)
                btn?.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation() })
                btn?.addEventListener('click', async e => {
                    e.stopPropagation()
                    if (token !== fetchToken) return
                    btn.disabled = true
                    btn.innerHTML = `<span class="spinner-border spinner-border-sm" style="width:12px;height:12px;border-width:2px"></span> กำลัง Re-Sync…`
                    const res = await resyncWork(text)
                    if (token !== fetchToken) return
                    if (res?.success) {
                        btn.innerHTML = `<i class="bi bi-check2"></i> Sync สำเร็จ — กำลังค้นหาใหม่…`
                        // backend ตอบ "Success" แม้ MO นั้นจะไม่มีในต้นทางจริง — ค้นหาซ้ำแล้วถ้ายังว่างอยู่ ให้บอก user ตรงๆ แทนการโชว์ปุ่มเดิมเงียบๆ
                        setTimeout(async () => {
                            if (token !== fetchToken) return
                            await doFetch(text)
                            if (results.length) return
                            const again = dropdown()?.querySelector('.wo-resync-btn')
                            if (again) again.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Sync แล้วแต่ยังไม่พบ "${esc(text)}" ในระบบต้นทาง — ลองใหม่`
                        }, 500)
                    } else {
                        btn.disabled = false
                        btn.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ไม่พบใน Source ระบบต้นทาง — ลองใหม่`
                    }
                })
                return
            }
            dd.innerHTML = results.map((x, i) => renderItem ? renderItem(x, i) : defaultRenderItem(x, i)).join('')
            if (rowResync) dd.querySelectorAll('[data-idx]').forEach(row => attachRowResync(row, token))
        } catch {
            if (token !== fetchToken) return
            dd.innerHTML = `<div class="loc-item" style="color:var(--red);cursor:default"><i class="bi bi-exclamation-circle me-2"></i>${errorText}</div>`
        }
    }

    // ปุ่ม Re-Sync ท้ายแถว — ใส่ผ่าน DOM หลัง renderItem เพื่อให้ทุกหน้าที่ส่ง renderItem ของตัวเองได้ปุ่มเหมือนกันโดยไม่ต้องแก้ template
    function attachRowResync(row, token) {
        const idx  = +row.dataset.idx
        const item = results[idx]
        if (!item?.moNumber) return
        const btn = document.createElement('button')
        btn.type      = 'button'
        btn.className = 'wo-row-resync-btn'
        btn.title     = `Re-Sync ${item.moNumber} จากระบบต้นทาง`
        btn.style.cssText = 'flex-shrink:0;margin-left:8px;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;' +
            'border:1px solid var(--border, #e2e8f0);border-radius:6px;background:var(--surface, #fff);color:var(--blue);cursor:pointer;padding:0;font-size:13px'
        btn.innerHTML = `<i class="bi bi-arrow-repeat"></i>`
        // ถ้า renderItem ไม่ได้ดัน line ไปชิดขวา (margin-left:auto) ให้ปุ่มชิดขวาเอง
        if (!row.querySelector('[style*="margin-left:auto"]')) btn.style.marginLeft = 'auto'
        row.appendChild(btn)

        // mousedown: กันไม่ให้ไปโดน handler เลือกแถวของ dropdown + กัน input เสีย focus (blur จะสั่ง hide() ทับ)
        btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation() })
        btn.addEventListener('click', async e => {
            e.preventDefault(); e.stopPropagation()
            if (btn.disabled) return
            btn.disabled = true
            btn.innerHTML = `<span class="spinner-border spinner-border-sm" style="width:12px;height:12px;border-width:2px"></span>`
            const res = await resyncWork(item.moNumber)
            if (token !== fetchToken) return   // ผู้ใช้พิมพ์ค้นหาใหม่ไปแล้ว — dropdown นี้ไม่ใช่ชุดเดิมแล้ว
            if (!res?.success) {
                btn.disabled  = false
                btn.style.color = 'var(--red)'
                btn.title     = res?.message || 'ไม่พบใน Source ระบบต้นทาง — ลองใหม่'
                btn.innerHTML = `<i class="bi bi-exclamation-triangle"></i>`
                return
            }
            // sync สำเร็จ — ดึง WO ตัวนี้มาใหม่ (Status/Line/Type อาจเปลี่ยน) แล้ว render แถวนี้ใหม่แทนที่เดิม
            let fresh = null
            try {
                const json = await api(`${endpoint}?Page=1&PageSize=20&Search=${encodeURIComponent(item.moNumber)}`, 'GET')
                const arr  = json?.data?.data ?? json?.data ?? []
                fresh = arr.find(x => x.moNumber === item.moNumber) || null
            } catch (_) {}
            if (token !== fetchToken) return
            if (fresh) results[idx] = fresh
            const tmp = document.createElement('div')
            tmp.innerHTML = (renderItem ? renderItem(results[idx], idx) : defaultRenderItem(results[idx], idx)).trim()
            const newRow = tmp.firstElementChild
            if (!newRow) return
            row.replaceWith(newRow)
            attachRowResync(newRow, token)
            const newBtn = newRow.querySelector('.wo-row-resync-btn')
            if (newBtn) {
                newBtn.style.color = 'var(--green)'
                newBtn.title       = 'Sync สำเร็จ'
                newBtn.innerHTML   = `<i class="bi bi-check2"></i>`
                setTimeout(() => { newBtn.style.color = 'var(--blue)'; newBtn.title = `Re-Sync ${results[idx].moNumber} จากระบบต้นทาง`; newBtn.innerHTML = `<i class="bi bi-arrow-repeat"></i>` }, 1500)
            }
        })
    }

    function search() {
        const text = input().value.trim()
        results = []
        onSelect?.(null)

        if (text.length < minLength) { hide(); return }

        clearTimeout(timer)
        timer = setTimeout(() => doFetch(text), debounceMs)
    }

    async function handleKey(e) {
        if (e.key !== 'Enter') return
        e.preventDefault()

        const text = input().value.trim()
        if (!text) return

        if (results.length) {
            const pick = results.find(r => !isDisabled(r))   // ข้าม item ที่กดไม่ได้ (เช่น Closed) ไปหาตัวแรกที่เลือกได้จริงแทน
            if (pick) commit(pick)
            return
        }

        // ยังไม่มีผลลัพธ์ (กำลัง debounce หรือกำลังโหลดอยู่) — ยิง fetch ทันที แล้วเลือกอันแรกที่เลือกได้เมื่อผลลัพธ์มาถึง
        clearTimeout(timer)
        await doFetch(text)
        if (results.length) {
            const pick = results.find(r => !isDisabled(r))
            if (pick) commit(pick)
        }
        else commit(fromText(text))
    }

    const inp = input()
    inp.addEventListener('input', search)
    inp.addEventListener('keydown', handleKey)
    inp.addEventListener('blur', () => setTimeout(hide, 200))

    const dd = dropdown()
    dd.addEventListener('mousedown', e => {
        const el = e.target.closest('[data-idx]')
        if (!el) return
        commit(results[+el.dataset.idx])
    })

    return { hide }
}

// หา WorkOrder ที่ไม่มีในระบบ (Re-Synced) — moNumbers: string เดียวหรือ array ของ MO Number
// คืนค่า { success, requested, synced, notFound, message } เสมอ
// backend ตัวจริงตอบ 200 + string "Success" เฉยๆ (ไม่ใช่ object) — normalize ให้เป็น shape เดียวกัน ไม่งั้น res.success จะเป็น undefined
// แล้วโดนนับเป็น fail ทุกครั้ง; ถ้าเป็น object ก็ใช้ success ตามที่ส่งมา (ไม่มี field success เลย = ถือว่าสำเร็จ เพราะ HTTP 2xx แล้ว)
async function resyncWork(moNumbers) {
    const list = Array.isArray(moNumbers) ? moNumbers : [moNumbers]
    if (!list.length) return null
    try {
        const res = await api('/workorder/re-sync/workorders', 'POST', list)
        if (res == null || typeof res !== 'object') {
            const msg = res == null ? '' : String(res)
            const ok  = !msg || /success/i.test(msg)
            return { success: ok, requested: list.length, synced: ok ? list.length : 0, notFound: ok ? [] : list, message: msg }
        }
        return { ...res, success: res.success !== false }
    } catch (err) {
        return { success: false, requested: list.length, synced: 0, notFound: list, message: err.message }
    }
}
