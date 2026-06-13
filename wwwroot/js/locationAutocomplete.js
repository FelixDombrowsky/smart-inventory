// locationAutocomplete.js — ใช้ร่วมกันสำหรับช่อง autocomplete ค้นหา Location
// แต่ละหน้าเรียก createLocationAutocomplete(...) ครั้งเดียว ฟังก์ชันจะผูก event ของ input/dropdown ให้เอง
function createLocationAutocomplete({
    inputId, dropdownId, hiddenId,
    endpoint = '/location', extraQuery = '', pageSize = 20, minLength = 1,
    getDisplay = loc => loc.displayName || loc.locationCode,
    getValue   = loc => loc?.id ?? '',
    fromText   = text => ({ displayName: text, locationCode: text, id: text }),
    renderItem,
    onSelect,
    emptyText = 'ไม่พบ Location',
    loadingText = 'กำลังค้นหา…',
    errorText = 'โหลดไม่สำเร็จ',
    debounceMs = 300
}) {
    let results = [], timer = null

    const input    = () => document.getElementById(inputId)
    const dropdown = () => document.getElementById(dropdownId)
    const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

    function defaultRenderItem(loc, i) {
        return `<div class="loc-item" style="justify-content:space-between" data-idx="${i}">
            <span style="display:flex;align-items:center;gap:10px;min-width:0">
                <i class="bi bi-geo-alt-fill" style="color:var(--blue);flex-shrink:0"></i>
                <strong>${esc(getDisplay(loc))}</strong>
                ${loc.description ? `<span style="color:var(--t2);font-size:12px">${esc(loc.description)}</span>` : ''}
            </span>
            ${loc.typeName ? `<span style="color:var(--t2);font-size:12px;flex-shrink:0">${esc(loc.typeName)}</span>` : ''}
        </div>`
    }

    function hide() {
        const dd = dropdown()
        if (dd) dd.style.display = 'none'
    }

    function commit(item) {
        const inp = input()
        if (inp) inp.value = getDisplay(item)
        if (hiddenId) document.getElementById(hiddenId).value = getValue(item)
        hide()
        onSelect?.(item)
    }

    function search() {
        const text = input().value.trim()
        if (hiddenId) document.getElementById(hiddenId).value = ''
        results = []
        onSelect?.(null)

        const dd = dropdown()
        if (text.length < minLength) { hide(); return }

        dd.innerHTML = `<div class="loc-item" style="color:var(--t2);cursor:default">
            <span class="spinner-border spinner-border-sm me-2" style="width:14px;height:14px;border-width:2px"></span>${loadingText}
        </div>`
        dd.style.display = 'block'

        clearTimeout(timer)
        timer = setTimeout(async () => {
            try {
                const json = await api(`${endpoint}?search=${encodeURIComponent(text)}${extraQuery}&page=1&pageSize=${pageSize}`, 'GET')
                results = json?.data?.data ?? json?.data ?? []
                if (!results.length) {
                    dd.innerHTML = `<div class="loc-item" style="color:var(--t2);cursor:default"><i class="bi bi-search me-2"></i>${emptyText}</div>`
                    return
                }
                dd.innerHTML = results.map((loc, i) => renderItem ? renderItem(loc, i) : defaultRenderItem(loc, i)).join('')
            } catch {
                dd.innerHTML = `<div class="loc-item" style="color:var(--red);cursor:default"><i class="bi bi-exclamation-circle me-2"></i>${errorText}</div>`
            }
        }, debounceMs)
    }

    function handleKey(e) {
        if (e.key !== 'Enter') return
        e.preventDefault()
        const text = input().value.trim()
        if (text) commit(fromText(text))
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
