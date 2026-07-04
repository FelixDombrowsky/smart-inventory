// locationAutocomplete.js — location picker จาก permitted locations ของ user
function createLocationAutocomplete({
    inputId, dropdownId,
    locations = [],
    getLocations = null,
    renderItem = null,
    onSelect,
    onClear,
    maxItems = 30,
    emptyText = 'ไม่พบ Location'
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
        dd.innerHTML = items.slice(0, maxItems).map((loc, i) =>
            renderItem
                ? renderItem(loc, i)
                : `<div class="loc-item" data-idx="${i}">
                <i class="bi bi-geo-alt-fill" style="color:var(--blue);flex-shrink:0"></i>
                <span style="min-width:0">
                    <strong>${esc(loc.displayName || '')}</strong>
                    <span style="color:var(--t2);font-size:12px;margin-left:6px">${esc(loc.locationCode)}</span>
                </span>
                <span style="font-size:11px;padding:2px 7px;border-radius:4px;background:var(--blue-lt);color:var(--blue);margin-left:auto;white-space:nowrap;flex-shrink:0">${esc(loc.typeName || '')}</span>
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

    inp.addEventListener('focus', function() {
        const filtered = filter(this.value.trim().toLowerCase())
        if (filtered.length) render(filtered)
    })

    inp.addEventListener('input', function() {
        onClear?.()
        const q = this.value.trim().toLowerCase()
        if (!q) { hide(); return }
        render(filter(q))
    })

    inp.addEventListener('keydown', function(e) {
        //toast("Before Enter")
        if (e.key !== 'Enter') return
        //toast("After Enter")
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

    return { hide }
}
