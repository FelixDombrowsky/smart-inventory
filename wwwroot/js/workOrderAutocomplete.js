// workOrderAutocomplete.js — ใช้ร่วมกันสำหรับช่อง autocomplete ค้นหา Work Order
// แต่ละหน้าเรียก createWorkOrderAutocomplete(...) ครั้งเดียว ฟังก์ชันจะผูก event ของ input/dropdown ให้เอง
function createWorkOrderAutocomplete({
    inputId, dropdownId,
    endpoint = '/workorder', pageSize = 100, minLength = 1,
    positionDropdown = false,
    status = null,   // กรอง Work Order ตาม Status (เช่น 1 = Active) — ไม่ระบุ = ไม่กรอง (ค้นทุก Status เหมือนเดิม)
    renderItem,
    onSelect,
    fromText = text => ({ moNumber: text, lineName: null }),
    emptyText = 'ไม่พบ Work Order',
    loadingText = 'กำลังค้นหา…',
    errorText = 'โหลดไม่สำเร็จ',
    debounceMs = 300
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
            const statusQuery = status != null ? `&Status=${encodeURIComponent(status)}` : ''
            const json = await api(`${endpoint}?Page=1&PageSize=${pageSize}&Search=${encodeURIComponent(text)}&SortBy=LastSyncedAt&SortDir=desc${statusQuery}`, 'GET')
            if (token !== fetchToken) return   // ผลลัพธ์เก่า ถูกแทนที่ด้วยการค้นหาใหม่แล้ว
            results = json?.data?.data ?? json?.data ?? []
            if (!results.length) {
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
                    if (res?.success && res.synced > 0) {
                        btn.innerHTML = `<i class="bi bi-check2"></i> Sync สำเร็จ — กำลังค้นหาใหม่…`
                        setTimeout(() => { if (token === fetchToken) doFetch(text) }, 500)
                    } else {
                        btn.disabled = false
                        btn.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ไม่พบใน Source ระบบต้นทาง — ลองใหม่`
                    }
                })
                return
            }
            dd.innerHTML = results.map((x, i) => renderItem ? renderItem(x, i) : defaultRenderItem(x, i)).join('')
        } catch {
            if (token !== fetchToken) return
            dd.innerHTML = `<div class="loc-item" style="color:var(--red);cursor:default"><i class="bi bi-exclamation-circle me-2"></i>${errorText}</div>`
        }
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
            commit(results[0])
            return
        }

        // ยังไม่มีผลลัพธ์ (กำลัง debounce หรือกำลังโหลดอยู่) — ยิง fetch ทันที แล้วเลือกอันแรกเมื่อผลลัพธ์มาถึง
        clearTimeout(timer)
        await doFetch(text)
        if (results.length) commit(results[0])
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
// คืนค่า { success, requested, synced, notFound, message } ตามที่ backend ส่งกลับ
async function resyncWork(moNumbers) {
    const list = Array.isArray(moNumbers) ? moNumbers : [moNumbers]
    if (!list.length) return null
    try {
        return await api('/workorder/re-sync/workorders', 'POST', list)
    } catch (err) {
        return { success: false, requested: list.length, synced: 0, notFound: list, message: err.message }
    }
}
