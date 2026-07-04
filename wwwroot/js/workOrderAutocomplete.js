// workOrderAutocomplete.js — ใช้ร่วมกันสำหรับช่อง autocomplete ค้นหา Work Order
// แต่ละหน้าเรียก createWorkOrderAutocomplete(...) ครั้งเดียว ฟังก์ชันจะผูก event ของ input/dropdown ให้เอง
function createWorkOrderAutocomplete({
    inputId, dropdownId,
    endpoint = '/workorder', pageSize = 20, minLength = 1,
    positionDropdown = false,
    renderItem,
    onSelect,
    fromText = text => ({ moNumber: text, lineName: null }),
    emptyText = 'ไม่พบ Work Order',
    loadingText = 'กำลังค้นหา…',
    errorText = 'โหลดไม่สำเร็จ',
    debounceMs = 300
}) {
    let results = [], timer = null

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

    function search() {
        const text = input().value.trim()
        results = []
        onSelect?.(null)

        const dd = dropdown()
        if (text.length < minLength) { hide(); return }

        position()
        dd.innerHTML = `<div class="loc-item" style="color:var(--t2);cursor:default">
            <span class="spinner-border spinner-border-sm me-2" style="width:14px;height:14px;border-width:2px"></span>${loadingText}
        </div>`
        dd.style.display = 'block'

        clearTimeout(timer)
        timer = setTimeout(async () => {
            try {
                const json = await api(`${endpoint}?Page=1&PageSize=${pageSize}&Search=${encodeURIComponent(text)}&SortBy=LastSyncedAt&SortDir=desc`, 'GET')
                results = json?.data?.data ?? json?.data ?? []
                if (!results.length) {
                    dd.innerHTML = `<div class="loc-item" style="color:var(--t2);cursor:default"><i class="bi bi-search me-2"></i>${emptyText}</div>`
                    return
                }
                dd.innerHTML = results.map((x, i) => renderItem ? renderItem(x, i) : defaultRenderItem(x, i)).join('')
            } catch {
                dd.innerHTML = `<div class="loc-item" style="color:var(--red);cursor:default"><i class="bi bi-exclamation-circle me-2"></i>${errorText}</div>`
            }
        }, debounceMs)
    }

    function handleKey(e) {
        //toast("Before Enter")
        if (e.key !== 'Enter') return
        //toast("After Enter")
        e.preventDefault()
        //console.log("Result In WorkOrder : ", results)
        if (results.length) {
            commit(results[0])
            
        } else {
            const text = input().value.trim()
            if(text) commit(fromText(text))
        }

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
