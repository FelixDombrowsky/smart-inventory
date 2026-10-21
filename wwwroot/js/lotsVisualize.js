// lotsVisualize.js — ปุ่ม Visualize ของหน้า Lots (Views/Inventory/Lots.cshtml)
//   1) vizOpenConfirm() — สรุป filter ปัจจุบัน + จำนวน lot ให้ user ยืนยันก่อน (ข้อมูลอาจเยอะ)
//   2) vizStart()       — โหลด /inventory/lots "ทีละหน้า" (ไม่ยิงพร้อมกัน) จำกัดสูงสุด VIZ_MAX_ROWS แถว พร้อม progress + ยกเลิกได้
//   3) vizRender()      — modal ใหญ่: KPI + กราฟแท่ง (stack ตามระยะเวลาที่อยู่ใน Location) + ตาราง drill-down Line → W/O → Lot
// ใช้ของจากหน้า Lots: _buildLotsFilterBody, sortBy, desc, _lastTotalLot, lotsDict, locName, locBadgeForCode, lotStatusBadge,
// fmtDate, lateMs, openModal/closeModal, showToast, _locFilterCode

const VIZ_PAGE_SIZE = 500
const VIZ_MAX_ROWS  = 15000  // = 75 หน้า (backend ให้หน้าละ 200) — เกินนี้ไม่โหลด กันยิง API หนักเกินไป (บอก user ให้ไปแคบ filter ลงแทน)
const VIZ_MAX_PAGES = 400    // กันวนไม่จบกรณี API ตอบผิดปกติ (30,000 ÷ หน้าละ 100 = 300 หน้า)
const VIZ_PAGE_GAP  = 150    // ms เว้นระหว่างหน้า ไม่ให้ยิงถี่เกินไป
const VIZ_MAX_BARS  = 25     // กราฟโชว์สูงสุดกี่แท่ง — กด "+N more" ใต้กราฟเพื่อกางแท่งที่เหลือ (VZ.showAll)
const _vzBarLimit = () => VZ.showAll ? Infinity : VIZ_MAX_BARS

// ช่วงระยะเวลาที่อยู่ใน Location ปัจจุบัน (นาที) — ใช้ระบายสีแท่งกราฟ เขียว → แดง
const VIZ_BUCKETS = [
    { key: 'b1', max: 1440,     color: '#22c55e' },   // < 1 วัน
    { key: 'b2', max: 4320,     color: '#eab308' },   // 1–3 วัน
    { key: 'b3', max: 10080,    color: '#f97316' },   // 3–7 วัน
    { key: 'b4', max: Infinity, color: '#ef4444' },   // > 7 วัน
]
// ช่วงความล่าช้าเทียบ PD Deadline (นาที) — ใช้เมื่อ user เลือก "สีตาม Delay"
const VIZ_DELAY_BUCKETS = [
    { key: 'd1', max: 0,        color: '#22c55e' },   // ยังไม่ล่าช้า (≤ 0)
    { key: 'd2', max: 1440,     color: '#eab308' },   // ล่าช้า < 1 วัน
    { key: 'd3', max: 4320,     color: '#f97316' },   // ล่าช้า 1–3 วัน
    { key: 'd4', max: Infinity, color: '#ef4444' },   // ล่าช้า > 3 วัน
]
const VIZ_UNKNOWN = { key: 'bu', color: '#cbd5e1' }

const VZ = { rows: [], total: 0, truncated: false, cancelled: false, filters: [], metric: 'lots', colorBy: 'inloc', pareto: false, showAll: false, line: null, wo: null, part: null, open: new Set() }

const _vzT = (k, vars) => {
    let s = (lotsDict()[k] ?? LOTS_LABELS.en[k] ?? k)
    if (vars) Object.entries(vars).forEach(([n, v]) => { s = s.replace(`{${n}}`, v) })
    return s
}
const _vzEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const _vzNum = n => Number(n || 0).toLocaleString()

// ระยะเวลาที่อยู่ใน Location (นาที) — ใช้ค่าจาก API ก่อน ถ้าไม่มีคำนวณจาก locationEnteredAt
function _vzInLoc(x) {
    if (x.inLocationDurationMinutes != null && !isNaN(Number(x.inLocationDurationMinutes))) return Number(x.inLocationDurationMinutes)
    if (!x.locationEnteredAt) return null
    const t = new Date(x.locationEnteredAt).getTime()
    return isNaN(t) ? null : (Date.now() - t) / 60000
}
function _vzBucket(min) { return min == null ? VIZ_UNKNOWN : VIZ_BUCKETS.find(b => min < b.max) }
// ความล่าช้า (นาที, บวก = ล่าช้า / ลบ = ยังไม่ล่าช้า) — ใช้ delayTimeMinutes จาก API ก่อน ถ้าไม่มีใช้สูตรฝั่งหน้าเว็บ (lateMs)
// ซึ่งบอกได้แค่ "ล่าช้าเท่าไหร่" — ไม่ล่าช้าจะได้ 0 (นับเป็นกลุ่มยังไม่ล่าช้า); ไม่มี PD Deadline = ไม่ทราบ
function _vzDelayMin(x) {
    if (x.delayTimeMinutes != null && !isNaN(Number(x.delayTimeMinutes))) return Number(x.delayTimeMinutes)
    if (!x.productionDeadlineAt || typeof lateMs !== 'function') return null
    return lateMs(x) / 60000
}
function _vzDelayBucket(min) {
    if (min == null) return VIZ_UNKNOWN
    return min <= 0 ? VIZ_DELAY_BUCKETS[0] : VIZ_DELAY_BUCKETS.slice(1).find(b => min < b.max)
}
// กลุ่มสีของ Lot ตามโหมดที่ user เลือก (เวลาใน Location / Delay)
function _vzColorBucket(x) { return VZ.colorBy === 'delay' ? _vzDelayBucket(_vzDelayMin(x)) : _vzBucket(_vzInLoc(x)) }
function _vzIsLate(x) {
    if (x.delayTimeMinutes != null && !isNaN(Number(x.delayTimeMinutes))) return Number(x.delayTimeMinutes) > 0
    return typeof lateMs === 'function' && lateMs(x) > 0
}
// "45 m" / "5.2 h" / "12.3 d"
function _vzDur(min) {
    if (min == null) return '—'
    const a = Math.abs(min), sign = min < 0 ? '-' : ''
    if (a >= 1440) return `${sign}${(a / 1440).toLocaleString(undefined, { maximumFractionDigits: 1 })} d`
    if (a >= 60)   return `${sign}${(a / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} h`
    return `${sign}${Math.round(a)} m`
}
const _vzLineKey = x => (x.lineName || '').trim() || _vzT('vizNoLine')
const _vzWoKey   = x => (x.workOrder || '').trim() || _vzT('vizNoWo')
const _vzPartKey = x => (x.partNo || '').trim() || _vzT('vizNoPart')

// ── 1) Confirm ──────────────────────────────────────────────────────────────
// สรุป filter ที่ใช้อยู่เป็น chip ให้ user เห็นก่อนว่าจะ visualize อะไร
function _vzFilterChips() {
    const b = _buildLotsFilterBody(), out = []
    const add = (label, val) => out.push({ label, val })
    const lbl = id => document.getElementById(id)?.textContent?.trim() || ''
    if (b.locationType) add('Location Type', lbl('filterLocationTypeLabel') || b.locationType)
    if (b.locationCode) add('Location', typeof locName === 'function' ? locName(b.locationCode) : b.locationCode)
    if (b.itemType)     add('Item Type', b.itemType)
    if (b.lotStatus)    add('Status', b.lotStatus)
    if (b.partNo)       add('Part No.', b.partNo)
    if (b.workOrder)    add('W/O', b.workOrder)
    if (b.lotNo)        add('Lot No.', b.lotNo)
    if (b.line)         add('Line', b.line)
    if (b.availableOnly) add('Available', '✓')
    if (b.minInLocationDurationMinutes != null) add('In Loc ≥', _vzDur(b.minInLocationDurationMinutes))
    if (b.maxInLocationDurationMinutes != null) add('In Loc ≤', _vzDur(b.maxInLocationDurationMinutes))
    if (b.minDelayMinutes != null) add('Delay ≥', _vzDur(b.minDelayMinutes))
    if (b.maxDelayMinutes != null) add('Delay ≤', _vzDur(b.maxDelayMinutes))
    if (b.createdAfter || b.createdBefore) add('Created', `${b.createdAfter ? fmtDate(b.createdAfter).slice(0, 10) : '…'} → ${b.createdBefore ? fmtDate(b.createdBefore).slice(0, 10) : '…'}`)
    return out
}
function _vzChipsHtml(chips) {
    return chips.length
        ? chips.map(c => `<span class="viz-chip">${_vzEsc(c.label)}: <b>${_vzEsc(c.val)}</b></span>`).join('')
        : `<span class="viz-chip">${_vzEsc(_vzT('vizNoFilter'))}</span>`
}

// ── Recommended filters (macro) — badge เล็กๆ ในหน้ายืนยัน; กด badge → เปิดตัวแก้ค่า (เช่น In Loc > 3 วัน) → Apply ─────────
// locationType / lotStatus อ้างตาม "ชื่อ" ใน dropdown ของหน้า (ไม่สนตัวพิมพ์) — ถ้าระบบไม่มีชื่อนั้น ช่องนั้นจะเป็น "ทั้งหมด"
// เพิ่ม filter แนะนำตัวใหม่: เพิ่มรายการใน VIZ_PRESETS + ข้อความ vizMacro_<key> ใน i18n.js
const VIZ_PRESETS = [
    { key: 'busrun1d', locationType: 'busrun', lotStatus: 'available', minInLocMinutes: 1440, availableOnly: false },
]
let _vzEditKey = null   // badge ที่กำลังเปิดตัวแก้ค่าอยู่

// "โล่ง" = ไม่มี filter อะไรเลย (นับ Available checkbox ที่ติ๊กไว้เป็นค่าเริ่มต้นว่าไม่ใช่ filter)
// Status = Available เป็นค่าเริ่มต้นของหน้า Lots — ไม่นับว่าเป็น filter
function _vzIsBlank() {
    const b = { ..._buildLotsFilterBody() }
    delete b.availableOnly
    if ((b.lotStatus || '').toLowerCase() === 'available') delete b.lotStatus
    return Object.keys(b).length === 0
}
// รายการใน custom dropdown ของหน้า Lots — [{ val, label }] (ไม่รวม "ทั้งหมด")
function _vzDdItems(menuId) {
    return [...document.querySelectorAll(`#${menuId} .loc-filter-dd-item`)]
        .filter(el => el.dataset.val)
        .map(el => ({ val: el.dataset.val, label: el.textContent.trim() || el.dataset.val }))
}
function _vzFindDdItem(menuId, name) {
    return name ? _vzDdItems(menuId).find(x => x.val.toLowerCase() === String(name).toLowerCase()) || null : null
}
// filter ปัจจุบันของหน้าตรงกับ preset นี้อยู่ไหม (ไว้ไฮไลต์ badge)
function _vzPresetActive(p) {
    const b = _buildLotsFilterBody()
    return (b.locationType || '').toLowerCase() === (p.locationType || '') &&
        (b.lotStatus || '').toLowerCase() === (p.lotStatus || '') &&
        (b.minInLocationDurationMinutes ?? null) === (p.minInLocMinutes ?? null)
}

function _vzRecoHtml() {
    const editing = VIZ_PRESETS.find(p => p.key === _vzEditKey)
    return `<div class="viz-reco">
        <span class="viz-reco-lbl"><i class="bi bi-stars"></i> ${_vzEsc(_vzT('vizRecommended'))}</span>
        ${VIZ_PRESETS.map(p => `<button type="button" class="viz-reco-badge${_vzPresetActive(p) ? ' on' : ''}${p.key === _vzEditKey ? ' open' : ''}"
            onclick="vizPresetEdit('${p.key}')">${_vzEsc(_vzT('vizMacro_' + p.key))} <i class="bi bi-sliders2"></i></button>`).join('')}
    </div>${editing ? _vzPresetEditorHtml(editing) : ''}`
}

// ตัวแก้ค่าของ preset — เติมค่าเริ่มต้นจาก preset ให้ user ปรับก่อนกด Apply
function _vzPresetEditorHtml(p) {
    const lts = _vzDdItems('filterLocationTypeMenu'), sts = _vzDdItems('filterLotStatusMenu')
    const lt  = _vzFindDdItem('filterLocationTypeMenu', p.locationType), st = _vzFindDdItem('filterLotStatusMenu', p.lotStatus)
    const m   = p.minInLocMinutes
    const [num, unit] = m == null ? ['', 'd'] : m % 1440 === 0 ? [m / 1440, 'd'] : m % 60 === 0 ? [m / 60, 'h'] : [m, 'm']
    const opt = (items, sel, allLbl) => `<option value="">${_vzEsc(allLbl)}</option>` +
        items.map(x => `<option value="${_vzEsc(x.val)}"${sel && x.val === sel.val ? ' selected' : ''}>${_vzEsc(x.label)}</option>`).join('')
    const units = ['m', 'h', 'd'].map(u => `<option value="${u}"${u === unit ? ' selected' : ''}>${_vzEsc(_vzT('vizUnit_' + u))}</option>`).join('')
    return `<div class="viz-reco-edit">
        <label><span>${_vzEsc(_vzT('vizPresetLocType'))}</span>
            <select id="vzPeLocType">${opt(lts, lt, lotsDict().allLocations || 'All')}</select></label>
        <label><span>${_vzEsc(_vzT('vizPresetInLoc'))}</span>
            <span class="viz-reco-num"><input id="vzPeInLoc" type="number" min="0" step="any" value="${num}" placeholder="—"><select id="vzPeInLocU">${units}</select></span></label>
        <label><span>${_vzEsc(_vzT('vizPresetStatus'))}</span>
            <select id="vzPeStatus">${opt(sts, st, lotsDict().allStatus || 'All')}</select></label>
        <div class="viz-reco-actions">
            <button type="button" class="viz-reco-cancel" onclick="vizPresetEdit(null)">${_vzEsc(lotsDict().cancel || 'Cancel')}</button>
            <button type="button" class="viz-reco-apply" onclick="vizApplyPreset('${p.key}', this)">${_vzEsc(_vzT('vizMacroApply'))}</button>
        </div>
    </div>`
}

function vizPresetEdit(key) {
    _vzEditKey = _vzEditKey === key ? null : key
    document.getElementById('vizMacroBox').innerHTML = _vzRecoHtml()
}

// ตั้ง filter ของหน้าตามค่าในตัวแก้ (ช่องที่ preset ไม่ได้กำหนดถูกล้างให้ว่าง) → โหลดตารางครั้งเดียว → อัปเดตหน้ายืนยันด้วยจำนวนใหม่
async function vizApplyPreset(key, btn) {
    const p = VIZ_PRESETS.find(x => x.key === key)
    if (!p) return
    const ltVal = document.getElementById('vzPeLocType')?.value ?? (_vzFindDdItem('filterLocationTypeMenu', p.locationType)?.val || '')
    const stVal = document.getElementById('vzPeStatus')?.value ?? (_vzFindDdItem('filterLotStatusMenu', p.lotStatus)?.val || '')
    const numEl = document.getElementById('vzPeInLoc')
    let inLoc = p.minInLocMinutes ?? null
    if (numEl) {
        const v = numEl.value.trim()
        inLoc = v === '' || isNaN(Number(v)) ? null
            : Math.max(0, Math.round(Number(v) * ({ m: 1, h: 60, d: 1440 }[document.getElementById('vzPeInLocU').value] || 1)))
    }
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>' }

    ;['filterPartNo', 'filterWO', 'filterLotNo', 'filterLine', 'filterDelayMin', 'filterDelayMax', 'filterInLocMax']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
    document.getElementById('filterInLocMin').value = inLoc ?? ''
    document.getElementById('filterAvailable').checked = !!p.availableOnly
    if (typeof _locFilterCode !== 'undefined') { _locFilterCode = ''; _locFilterLabel = ''; document.getElementById('filterLocation').value = '' }
    const lt = _vzDdItems('filterLocationTypeMenu').find(x => x.val === ltVal)
    const st = _vzDdItems('filterLotStatusMenu').find(x => x.val === stVal)
    filterLocationTypeDdPick(lt ? lt.val : '', lt ? lt.label : '', true)
    filterLotStatusDdPick(st ? st.val : '', st ? st.label : '', true)
    if (typeof filterItemTypeDdPick === 'function') {
        // filterItemTypeDdPick ไม่มีโหมด silent — ตั้งค่าตรงๆ แทน
        document.getElementById('filterItemType').value = ''
        document.getElementById('filterItemTypeLabel').textContent = lotsDict().allItemTypes
        document.querySelectorAll('#filterItemTypeMenu .loc-filter-dd-item').forEach(it => it.classList.toggle('active', it.dataset.val === ''))
    }
    if (typeof rngSyncAll === 'function') rngSyncAll()   // อัปเดตป้ายปุ่ม Delay / In Location
    page = 1
    await loadLots()
    _vzEditKey = null
    showToast(_vzT('vizMacroApplied'))
    vizOpenConfirm()   // แสดงหน้า confirm ใหม่ด้วย filter + จำนวน Lot ล่าสุด
}

function vizOpenConfirm() {
    // badge filter แนะนำแสดงเสมอ — ตัวแก้ค่าซ่อนไว้ก่อน user ต้องกด badge เองถึงจะกางออก
    const macro = document.getElementById('vizMacroBox')
    _vzEditKey = null
    macro.style.display = VIZ_PRESETS.length ? '' : 'none'
    macro.innerHTML     = _vzRecoHtml()
    const total = _lastTotalLot || 0
    // ยังไม่ได้เลือก filter อะไรเลย = ข้อมูลทั้งระบบ → ปุ่ม Visualize ปิดไว้จนกว่าจะเลือก filter / Apply filter แนะนำ
    const blank = _vzIsBlank()
    const go = document.getElementById('vizGoBtn')
    go.disabled = blank
    go.style.opacity = blank ? '.45' : ''
    go.style.cursor  = blank ? 'not-allowed' : ''
    const hint = document.getElementById('vizBlankHint')
    hint.style.display = blank ? '' : 'none'
    hint.innerHTML = blank ? `<i class="bi bi-info-circle"></i> ${_vzEsc(_vzT('vizBlankHint'))}` : ''
    document.getElementById('vizConfirmFilters').innerHTML = _vzChipsHtml(_vzFilterChips())
    document.getElementById('vizRowCountVal').textContent  = _vzNum(total)
    const warn = document.getElementById('vizConfirmWarn')
    warn.style.display = total > VIZ_MAX_ROWS ? '' : 'none'
    warn.textContent   = _vzT('vizCapWarn', { n: _vzNum(VIZ_MAX_ROWS) })
    openModal('vizConfirmModal')
}

// ── Line จาก Work Order ── Lot ที่ไม่มี lineName → เอา workOrder ไปค้น GET /workorder?Page=1&PageSize=20&WorkOrder=<mo>
// แล้วใช้ lineName ของ W/O นั้นแทน (เติมลง row.lineName + ติด row._lineFromWo = true ไว้บอกว่าได้มาจาก W/O)
// cache ต่อ W/O ตลอดอายุหน้า (ค่า '' = ค้นแล้วไม่เจอ/ไม่มี line) — ใช้ร่วมกันทั้งตาราง Lots / Visualize / Export
const _woLineCache = new Map()
async function resolveLotLines(rows, onProgress, isCancelled) {
    const need = [...new Set(rows.filter(x => !(x.lineName || '').trim() && (x.workOrder || '').trim()).map(x => x.workOrder.trim()))]
        .filter(wo => !_woLineCache.has(wo))
    let done = 0
    for (let i = 0; i < need.length; i += 4) {   // ทีละ 4 W/O ไม่ยิงถี่เกินไป
        if (isCancelled?.()) return false
        await Promise.all(need.slice(i, i + 4).map(async wo => {
            try {
                const res  = await api(`/workorder?Page=1&PageSize=20&WorkOrder=${encodeURIComponent(wo)}`, 'GET')
                const list = res?.data?.data ?? res?.data ?? []
                const hit  = (Array.isArray(list) ? list : []).find(w => String(w.moNumber) === wo) || (Array.isArray(list) ? list[0] : null)
                _woLineCache.set(wo, (hit?.lineName || '').trim())
            } catch { _woLineCache.set(wo, '') }
            done++
        }))
        onProgress?.(done, need.length)
    }
    rows.forEach(x => {
        if ((x.lineName || '').trim()) return
        const ln = _woLineCache.get((x.workOrder || '').trim())
        if (ln) { x.lineName = ln; x._lineFromWo = true }
    })
    return true
}

// ── 2) Load (ทีละหน้า) ──────────────────────────────────────────────────────
function vizCancel() {
    VZ.cancelled = true
    closeModal('vizLoadingModal')
    showToast(_vzT('vizCancelled'), 'error')
}
function _vzProgress(loaded, total, page, pages) {
    const pct = total ? Math.min(100, loaded / total * 100) : 0
    document.getElementById('vizLoadingBar').style.width = pct + '%'
    document.getElementById('vizLoadingText').textContent = _vzT('vizLoadingProgress', { p: page, t: pages, n: _vzNum(loaded), total: _vzNum(total) })
}
const _vzSleep = ms => new Promise(r => setTimeout(r, ms))

async function vizStart() {
    if (_vzIsBlank()) return   // กันกรณีปุ่มถูกเปิดใช้ทั้งที่ยังไม่มี filter
    closeModal('vizConfirmModal')
    VZ.cancelled = false
    VZ.filters   = _vzFilterChips()
    const body   = _buildLotsFilterBody()
    _vzProgress(0, _lastTotalLot || 0, 0, '?')
    openModal('vizLoadingModal')

    let rows = [], total = 0, pages = 1
    try {
        // backend อาจจำกัด pageSize ให้น้อยกว่าที่ขอ (เช่นขอ 500 ได้มา 200) — ห้ามคำนวณจำนวนหน้าจาก VIZ_PAGE_SIZE
        // ใช้ขนาดหน้าจริงจากหน้าแรกแทน แล้ววนจนได้ครบ target / หน้าว่าง / ชนเพดานจำนวนหน้า
        let target = 0
        for (let p = 1; ; p++) {
            const r = await api('/inventory/lots', 'POST', { ...body, page: p, pageSize: VIZ_PAGE_SIZE, sortBy, desc })
            if (VZ.cancelled) return
            const data = r?.data || []
            rows = rows.concat(data)
            if (p === 1) {
                total  = r?.totalLot ?? data.length
                target = Math.min(total, VIZ_MAX_ROWS)
                const per = data.length || VIZ_PAGE_SIZE
                pages = Math.max(1, Math.ceil(target / per))
            }
            _vzProgress(Math.min(rows.length, target), target, Math.min(p, pages), pages)
            if (!data.length || rows.length >= target || p >= VIZ_MAX_PAGES) break
            await _vzSleep(VIZ_PAGE_GAP)
        }
    } catch (err) {
        if (VZ.cancelled) return
        closeModal('vizLoadingModal')
        showToast(`${_vzT('vizLoadFail')}: ${err.message}`, 'error')
        return
    }
    if (VZ.cancelled) return
    // Lot ที่ไม่มี Line → หา Line จาก W/O ก่อนจัดกลุ่ม (ไม่งั้นไปกองอยู่ที่ "(No Line)")
    await resolveLotLines(rows, (d, n) => {
        document.getElementById('vizLoadingBar').style.width = (d / n * 100) + '%'
        document.getElementById('vizLoadingText').textContent = _vzT('vizResolvingLines', { n: _vzNum(d), t: _vzNum(n) })
    }, () => VZ.cancelled)
    if (VZ.cancelled) return
    closeModal('vizLoadingModal')

    VZ.rows      = rows.slice(0, VIZ_MAX_ROWS)
    VZ.total     = total
    VZ.truncated = total > VZ.rows.length
    VZ.line = null; VZ.wo = null; VZ.open = new Set()
    vizRender()
    openModal('vizModal')
}

// ── 3) Render ───────────────────────────────────────────────────────────────
function _vzAgg(rows) {
    const mix = {}
    let qty = 0, maxIn = null, sumIn = 0, nIn = 0, late = 0
    rows.forEach(x => {
        const m = _vzInLoc(x), b = _vzColorBucket(x), q = Number(x.onHandQty || 0)
        qty += q
        if (!mix[b.key]) mix[b.key] = { lots: 0, qty: 0 }
        mix[b.key].lots++; mix[b.key].qty += q
        if (m != null) { sumIn += m; nIn++; if (maxIn == null || m > maxIn) maxIn = m }
        if (_vzIsLate(x)) late++
    })
    return { lots: rows.length, qty, mix, maxIn, avgIn: nIn ? sumIn / nIn : null, late }
}
function _vzGroup(rows, keyFn) {
    const map = new Map()
    rows.forEach(x => { const k = keyFn(x); if (!map.has(k)) map.set(k, []); map.get(k).push(x) })
    return [...map.entries()].map(([key, rs]) => ({ key, rows: rs, agg: _vzAgg(rs) }))
}
const _vzMetricVal = a => VZ.metric === 'qty' ? a.qty : a.lots
const _vzSegs = () => [...(VZ.colorBy === 'delay' ? VIZ_DELAY_BUCKETS : VIZ_BUCKETS), VIZ_UNKNOWN]

function vizSetColorBy(v) {
    VZ.colorBy = v === 'delay' ? 'delay' : 'inloc'
    vizRender()
}

// แท่ง stack ตามช่วงเวลาใน Location — width เทียบกับแท่งที่ยาวที่สุดในกราฟ
function _vzStackHtml(agg, maxVal) {
    const total = _vzMetricVal(agg)
    if (!total || !maxVal) return ''
    return _vzSegs().map(b => {
        const v = agg.mix[b.key] ? (VZ.metric === 'qty' ? agg.mix[b.key].qty : agg.mix[b.key].lots) : 0
        return v ? `<span style="width:${v / maxVal * 100}%;background:${b.color}" title="${_vzEsc(_vzT('vizB_' + b.key))}: ${_vzNum(v)}"></span>` : ''
    }).join('')
}
// แถบสัดส่วนเล็กในตาราง (เต็มความกว้างเสมอ)
function _vzMixHtml(agg) {
    const total = _vzMetricVal(agg)
    return `<div class="viz-mix">${_vzSegs().map(b => {
        const v = agg.mix[b.key] ? (VZ.metric === 'qty' ? agg.mix[b.key].qty : agg.mix[b.key].lots) : 0
        return v ? `<span style="width:${v / total * 100}%;background:${b.color}" title="${_vzEsc(_vzT('vizB_' + b.key))}: ${_vzNum(v)}"></span>` : ''
    }).join('')}</div>`
}
function _vzLegendHtml() {
    return _vzSegs().map(b => `<span><i style="background:${b.color}"></i>${_vzEsc(_vzT('vizB_' + b.key))}</span>`).join('')
}

function vizSetMetric(m) {
    VZ.metric = m
    document.querySelectorAll('#vizMetricToggle button').forEach(b => b.classList.toggle('active', b.dataset.metric === m))
    vizRender()
}
// ระดับ drill-down: All Lines → Line → W/O (สรุปตาม Part No.) → Part (รายการ Lot = หน่วยเล็กสุด)
function vizGo(line, wo, part) {
    VZ.line = line ?? null
    VZ.wo   = wo ?? null
    VZ.part = part ?? null
    VZ.showAll = false
    VZ.open = new Set()
    vizRender()
    document.querySelector('#vizModal .viz-body')?.scrollTo({ top: 0 })
}
// ปุ่ม Back — ขึ้นไป 1 ระดับ: Part → W/O → Line → All Lines
function vizBack() {
    if (VZ.part != null)      vizGo(VZ.line, VZ.wo)
    else if (VZ.wo != null)   vizGo(VZ.line)
    else if (VZ.line != null) vizGo()
}
function vizToggleRow(key) {
    VZ.open.has(key) ? VZ.open.delete(key) : VZ.open.add(key)
    vizRender()
}

function vizRender() {
    const level = VZ.part != null ? 'part' : VZ.wo != null ? 'wo' : VZ.line != null ? 'line' : 'all'
    const scope = VZ.rows.filter(x => (VZ.line == null || _vzLineKey(x) === VZ.line) && (VZ.wo == null || _vzWoKey(x) === VZ.wo)
        && (VZ.part == null || _vzPartKey(x) === VZ.part))
    const agg   = _vzAgg(scope)

    // breadcrumb: All Lines › Line › W/O › Part
    const crumbs = [`<a onclick="vizGo()">${_vzEsc(_vzT('vizAllLines'))}</a>`]
    if (VZ.line != null) crumbs.push(VZ.wo != null ? `<a onclick="vizGo(${_vzArg(VZ.line)})">${_vzEsc(VZ.line)}</a>` : `<span class="cur">${_vzEsc(VZ.line)}</span>`)
    if (VZ.wo != null)   crumbs.push(VZ.part != null ? `<a onclick="vizGo(${_vzArg(VZ.line)}, ${_vzArg(VZ.wo)})">W/O ${_vzEsc(VZ.wo)}</a>` : `<span class="cur">W/O ${_vzEsc(VZ.wo)}</span>`)
    if (VZ.part != null) crumbs.push(`<span class="cur">${_vzEsc(VZ.part)}</span>`)
    document.getElementById('vizBackBtn').style.display = level === 'all' ? 'none' : ''
    document.getElementById('vizCrumbs').innerHTML = crumbs.join('<i class="bi bi-chevron-right" style="font-size:10px"></i>')

    document.getElementById('vizFilterNote').innerHTML = _vzChipsHtml(VZ.filters) +
        (VZ.truncated ? `<span class="viz-chip" style="background:#fffbeb;color:#b45309">${_vzEsc(_vzT('vizTruncated', { n: _vzNum(VZ.rows.length), t: _vzNum(VZ.total) }))}</span>` : '')

    // KPI
    const lines = new Set(scope.map(_vzLineKey)).size, wos = new Set(scope.map(_vzWoKey)).size
    const kpi = (l, v, sub) => `<div class="viz-kpi"><div class="viz-kpi-lbl">${_vzEsc(l)}</div><div class="viz-kpi-val">${v}</div>${sub ? `<div class="viz-kpi-sub">${sub}</div>` : ''}</div>`
    const over1d = scope.filter(x => (_vzInLoc(x) ?? -1) >= 1440).length
    const lotsSub = `${_vzNum(over1d)} ${_vzEsc(_vzT('vizOver1d'))}` +
        (VZ.truncated && level === 'all' ? `<br><span style="color:#b45309;font-weight:700">${_vzEsc(_vzT('vizKpiTruncated', { t: _vzNum(VZ.total) }))}</span>` : '')
    document.getElementById('vizKpis').innerHTML = [
        kpi(_vzT('vizLots'), _vzNum(agg.lots), lotsSub),
        kpi(_vzT('vizOnHand'), _vzNum(agg.qty)),
        level === 'all' ? kpi(_vzT('vizLines'), _vzNum(lines)) : '',
        level === 'all' || level === 'line' ? kpi(_vzT('vizWos'), _vzNum(wos)) : '',
        level === 'wo' ? kpi(_vzT('vizParts'), _vzNum(new Set(scope.map(_vzPartKey)).size)) : '',
        kpi(_vzT('vizAvgInLoc'), _vzDur(agg.avgIn)),
        kpi(_vzT('vizMaxInLoc'), _vzDur(agg.maxIn)),
        kpi(_vzT('vizLate'), `<span style="color:${agg.late ? 'var(--red)' : 'var(--navy)'}">${_vzNum(agg.late)}</span>`),
    ].join('')

    document.getElementById('vizLegend').innerHTML = _vzLegendHtml()
    document.getElementById('vizParetoBtn')?.classList.toggle('on', VZ.pareto)
    document.getElementById('vizLegend').style.display = VZ.pareto ? 'none' : ''
    document.getElementById('vizColorBy')?.closest('label')?.style.setProperty('visibility', VZ.pareto ? 'hidden' : '')

    if (!scope.length) {
        document.getElementById('vizChartTitle').textContent = ''
        document.getElementById('vizChart').innerHTML = `<div class="viz-more" style="text-align:center;padding:30px">${_vzEsc(_vzT('vizNoData'))}</div>`
        document.getElementById('vizTableTitle').textContent = ''
        document.getElementById('vizTable').innerHTML = ''
        return
    }
    if (level === 'part') return _vzRenderLots(scope)

    // all → กลุ่มตาม Line / line → กลุ่มตาม W/O / wo → กลุ่มตาม Part No.
    const keyFn  = level === 'all' ? _vzLineKey : level === 'line' ? _vzWoKey : _vzPartKey
    const groups = _vzGroup(scope, keyFn)
        .sort((a, b) => _vzMetricVal(b.agg) - _vzMetricVal(a.agg) || (b.agg.maxIn ?? 0) - (a.agg.maxIn ?? 0))
    const maxVal = Math.max(...groups.map(g => _vzMetricVal(g.agg)), 1)
    document.getElementById('vizChartTitle').textContent = _vzT(level === 'all' ? 'vizByLine' : level === 'line' ? 'vizByWo' : 'vizByPart')
    const pinfo = _vzPareto(groups.map(g => _vzMetricVal(g.agg)))
    if (pinfo) {
        document.getElementById('vizChart').innerHTML = _vzParetoSvg(groups.slice(0, _vzBarLimit()).map(g => ({
            label: level === 'line' ? 'W/O ' + g.key : g.key,
            val:   _vzMetricVal(g.agg),
            onclick: level === 'all'  ? `vizGo(${_vzArg(g.key)})`
                   : level === 'line' ? `vizGo(${_vzArg(VZ.line)}, ${_vzArg(g.key)})`
                   :                    `vizGo(${_vzArg(VZ.line)}, ${_vzArg(VZ.wo)}, ${_vzArg(g.key)})`,
        })), pinfo, v => _vzNum(Math.round(v))) +
            _vzMoreBtn(groups.length)
        return level === 'all' ? _vzRenderLineTable(groups) : level === 'line' ? _vzRenderWoTable(groups) : _vzRenderPartTable(groups)
    }
    document.getElementById('vizChart').innerHTML = groups.slice(0, _vzBarLimit()).map((g, i) => {
        const pr = _vzParetoRow(pinfo, i)
        const go = level === 'all'  ? `vizGo(${_vzArg(g.key)})`
                 : level === 'line' ? `vizGo(${_vzArg(VZ.line)}, ${_vzArg(g.key)})`
                 :                    `vizGo(${_vzArg(VZ.line)}, ${_vzArg(VZ.wo)}, ${_vzArg(g.key)})`
        return `<div class="viz-bar-row${pr.cls}" onclick="${go}" title="${_vzEsc(g.key)}">
            ${level === 'wo'
                ? `<div class="viz-bar-lbl"><span style="font-family:ui-monospace,monospace">${_vzEsc(g.key)}</span><div class="viz-bar-sub" title="${_vzEsc(g.rows[0]?.description)}">${_vzEsc(g.rows[0]?.description || '')}</div></div>`
                : `<div class="viz-bar-lbl">${_vzEsc(level === 'line' ? 'W/O ' + g.key : g.key)}</div>`}
            <div class="viz-bar-track">${_vzStackHtml(g.agg, maxVal)}</div>
            <div class="viz-bar-val">${_vzNum(_vzMetricVal(g.agg))}${pr.cum}</div>
        </div>${pr.after}`
    }).join('') + _vzParetoBeyond(pinfo) + _vzMoreBtn(groups.length)

    level === 'all' ? _vzRenderLineTable(groups) : level === 'line' ? _vzRenderWoTable(groups) : _vzRenderPartTable(groups)
}
// ── Pareto 80/20 ── values เรียงมากไปน้อยแล้ว → cutIdx = แท่งสุดท้ายที่ทำให้ยอดสะสมถึง 80% (แท่ง 0..cutIdx = "vital few")
function _vzPareto(values) {
    const total = values.reduce((s, v) => s + (v > 0 ? v : 0), 0)
    if (!VZ.pareto || !total || values.length < 2) return null
    let cum = 0, cutIdx = values.length - 1
    const cumPct = values.map((v, i) => { cum += v > 0 ? v : 0; return cum / total * 100 })
    cutIdx = cumPct.findIndex(p => p >= 80 - 1e-9)
    return { total, cutIdx, cumPct, n: values.length }
}
// class ของแท่งที่ i + เส้นตัด (ต่อท้ายแท่ง cutIdx) + ข้อความ % สะสม
function _vzParetoRow(info, i) {
    if (!info) return { cls: '', after: '', cum: '' }
    return {
        cls:   i <= info.cutIdx ? ' pv' : ' pf',
        cum:   `<span class="viz-pareto-cum">${info.cumPct[i].toFixed(0)}%</span>`,
        after: i === info.cutIdx ? _vzParetoCutHtml(info) : '',
    }
}
function _vzParetoCutHtml(info) {
    const n = info.cutIdx + 1
    return `<div class="viz-pareto-cut"><span>${_vzEsc(_vzT('vizParetoCut', {
        n: _vzNum(n), m: _vzNum(info.n), p: (n / info.n * 100).toFixed(0), c: info.cumPct[info.cutIdx].toFixed(0) }))}</span></div>`
}
// เส้นตัดอยู่เลยแท่งที่แสดงในกราฟ (เกิน VIZ_MAX_BARS) → บอกไว้ใต้กราฟแทน
function _vzParetoBeyond(info) {
    return info && info.cutIdx >= _vzBarLimit() ? _vzParetoCutHtml(info) : ''
}
// ── Pareto chart (กราฟแท่งแนวตั้ง + เส้น % สะสม แบบมาตรฐาน) — แสดงแทนกราฟแท่งแนวนอนเมื่อเปิด 80/20 ──
// items: [{ label, val, onclick }] เรียงมากไปน้อยแล้ว; info จาก _vzPareto (คิด % เทียบยอดรวมของ "ทุก" รายการ ไม่ใช่แค่ที่แสดง)
// แกนซ้าย = ความถี่ (0 → ผลรวมทั้งหมด), แกนขวา = 0–100% สะสม (สเกลเดียวกัน); เส้นตัดแนวนอนที่ 80% + แนวตั้งตรงแท่งที่ทำให้สะสมถึง 80%
// แท่งในกลุ่ม 80% สีเข้ม / นอกกลุ่มสีจาง
function _vzParetoSvg(items, info, fmtVal) {
    const W = Math.max(560, document.getElementById('vizChart').clientWidth - 28 || 1000), H = 380
    const L = 64, R = 56, T = 18, B = 96, pw = W - L - R, ph = H - T - B
    const n = items.length, bw = pw / n, gap = Math.min(10, bw * 0.12)
    // แกนซ้ายสูงสุด = ผลรวมของทุกรายการ (ไม่ใช่แค่แท่งที่แสดง) → แกนซ้ายกับแกนขวา (0–100%) ตรงกันทุกเส้น grid ตามหลัก Pareto
    const yMax = info.total
    const yL = v => T + ph - v / yMax * ph, yR = pct => T + ph - pct / 100 * ph
    const cutX = info.cutIdx < n ? L + (info.cutIdx + 1) * bw : null
    let g = ''
    // grid + แกนซ้าย (ความถี่) / ขวา (%)
    for (let k = 0; k <= 5; k++) {
        const y = T + ph - k / 5 * ph
        g += `<line x1="${L}" x2="${L + pw}" y1="${y}" y2="${y}" class="pz-grid"/>
              <text x="${L - 8}" y="${y + 4}" text-anchor="end" class="pz-tick">${_vzEsc(fmtVal(yMax * k / 5))}</text>
              <text x="${L + pw + 8}" y="${y + 4}" class="pz-tick">${k * 20}%</text>`
    }
    // แท่ง
    items.forEach((it, i) => {
        const x = L + i * bw + gap / 2, y = yL(it.val), vital = i <= info.cutIdx
        g += `<g class="pz-bar${vital ? ' pv' : ' pf'}"${it.onclick ? ` onclick="${it.onclick}" style="cursor:pointer"` : ''}>
            <title>${_vzEsc(it.label)}: ${_vzEsc(fmtVal(it.val))} · ${info.cumPct[i].toFixed(1)}%</title>
            <rect x="${x}" y="${y}" width="${Math.max(1, bw - gap)}" height="${T + ph - y}" rx="2"/>
            <text x="${x + (bw - gap) / 2}" y="${y - 5}" text-anchor="middle" class="pz-val">${_vzEsc(fmtVal(it.val))}</text>
        </g>
        <text transform="translate(${L + i * bw + bw / 2},${T + ph + 12}) rotate(-40)" text-anchor="end" class="pz-xlbl${vital ? '' : ' pf'}">${_vzEsc(it.label.length > 16 ? it.label.slice(0, 15) + '…' : it.label)}</text>`
    })
    // เส้นตัด 80%
    g += `<line x1="${L}" x2="${L + pw}" y1="${yR(80)}" y2="${yR(80)}" class="pz-cut"/>`
    if (cutX != null) g += `<line x1="${cutX}" x2="${cutX}" y1="${T}" y2="${T + ph}" class="pz-cut"/>`
    // เส้นสะสม: เริ่ม 0% ที่มุมซ้ายล่าง แล้วจุดละแท่งที่ขอบขวาของแท่ง
    const pts = [[L, yR(0)], ...items.map((_, i) => [L + (i + 1) * bw, yR(info.cumPct[i])])]
    g += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" class="pz-line"/>`
    g += pts.slice(1).map(([x, y], i) => `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" class="pz-dot"><title>${info.cumPct[i].toFixed(1)}%</title></rect>`).join('')
    if (cutX != null) g += `<circle cx="${cutX}" cy="${yR(info.cumPct[info.cutIdx])}" r="5.5" class="pz-hit"/>`
    // กรอบแกน
    g += `<line x1="${L}" x2="${L}" y1="${T}" y2="${T + ph}" class="pz-axis"/><line x1="${L + pw}" x2="${L + pw}" y1="${T}" y2="${T + ph}" class="pz-axis"/>
          <line x1="${L}" x2="${L + pw}" y1="${T + ph}" y2="${T + ph}" class="pz-axis"/>`
    return `<svg class="pz-svg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">${g}</svg>` +
        `<div class="viz-pareto-cut-note">${_vzParetoCutHtml(info)}</div>`
}

// ปุ่มใต้กราฟ: "+N more" = กางแท่งที่เหลือทั้งหมด / "Show less" = หุบกลับเหลือ VIZ_MAX_BARS
function _vzMoreBtn(total) {
    if (total <= VIZ_MAX_BARS) return ''
    return VZ.showAll
        ? `<button type="button" class="viz-more-btn" onclick="vizToggleShowAll()"><i class="bi bi-chevron-up"></i> ${_vzEsc(_vzT('vizShowLess'))}</button>`
        : `<button type="button" class="viz-more-btn" onclick="vizToggleShowAll()"><i class="bi bi-chevron-down"></i> ${_vzEsc(_vzT('vizMoreBars', { n: total - VIZ_MAX_BARS }))}</button>`
}
function vizToggleShowAll() {
    VZ.showAll = !VZ.showAll
    vizRender()
}

// ── Export PDF ──
// เนื้อหารายงาน = scope ที่ดูอยู่ (breadcrumb / filter / KPI) + กราฟแท่งแนวนอน "ทุกแถว" + กราฟ Pareto 80/20 ทุกแถว
// ใช้วิธี render กราฟจริงชั่วคราว 2 แบบ (ปิด/เปิด Pareto, แสดงทุกแท่ง) แล้วเก็บ HTML ไป จากนั้นคืนสถานะเดิม — กราฟใน PDF จึงหน้าตาเดียวกับบนจอ
// vizExportPdf() = ดาวน์โหลดไฟล์ .pdf ลงเครื่อง (html2canvas + jsPDF ใน wwwroot/lib — โหลดตอนกดครั้งแรก ใช้ได้แม้ไม่มีอินเทอร์เน็ต)
const VIZ_REPORT_CSS = `
  .pdf-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; border-bottom:2px solid #0f172a; padding-bottom:8px; margin-bottom:10px; }
  .pdf-title { font-size:18px; font-weight:800; color:#0f172a; }
  .pdf-scope { font-size:13px; font-weight:700; color:#1a6fff; margin-top:2px; }
  .pdf-meta  { font-size:11px; color:#64748b; text-align:right; line-height:1.5; }
  .viz-card  { break-inside: avoid; page-break-inside: avoid; }
  .viz-kpis  { grid-template-columns: repeat(7, 1fr); }
  .viz-bar-row { cursor: default !important; padding: 2px 6px; }
  .viz-bar-track { height: 14px; }
  .pz-svg { max-height: none; }`

function _vzBuildReport() {
    const saved = { pareto: VZ.pareto, showAll: VZ.showAll }
    const grab  = id => document.getElementById(id).innerHTML
    const clean = html => html.replace(/<button[^>]*class="viz-more-btn"[\s\S]*?<\/button>/g, '').replace(/\sonclick="[^"]*"/g, '')
    try {
        VZ.showAll = true
        VZ.pareto = false; vizRender()
        const r = {
            // breadcrumb จากสถานะ drill-down ตรงๆ (textContent ของ #vizCrumbs ไม่มีตัวคั่น — ลูกศรเป็นไอคอน) → "All Lines › STF_14 › W/O …"
            crumbs: [_vzT('vizAllLines'), VZ.line, VZ.wo != null ? `W/O ${VZ.wo}` : null, VZ.part].filter(x => x != null).join(' › '),
            title:  document.getElementById('vizChartTitle').textContent,
            filters: grab('vizFilterNote'), kpis: grab('vizKpis'), legend: grab('vizLegend'), bars: clean(grab('vizChart')),
        }
        VZ.pareto = true; vizRender()
        r.pareto = document.querySelector('#vizChart .pz-svg') ? clean(grab('vizChart')) : ''
        r.metric  = VZ.metric === 'qty' ? _vzT('vizMetricQty') : _vzT('vizMetricLots')
        r.colorBy = VZ.colorBy === 'delay' ? _vzT('vizColorDelay') : _vzT('vizColorInLoc')
        r.now     = typeof fmtDate === 'function' ? fmtDate(new Date().toISOString()) : new Date().toLocaleString()
        // หน้า 1 = หัวรายงาน + filter + KPI + กราฟแท่ง / หน้า 2 = Pareto
        r.page1 = `<div class="pdf-head">
                <div><div class="pdf-title">${_vzEsc(_vzT('vizTitle'))}</div><div class="pdf-scope">${_vzEsc(r.crumbs)}</div></div>
                <div class="pdf-meta">${_vzEsc(r.metric)} · ${_vzEsc(r.colorBy)}<br>${_vzEsc(r.now)}</div>
            </div>
            <div class="viz-chips" style="margin:0 0 8px">${r.filters}</div>
            <div class="viz-kpis">${r.kpis}</div>
            <div class="viz-card">
                <div class="viz-card-head"><span>${_vzEsc(r.title)}</span><span class="viz-legend">${r.legend}</span></div>
                <div class="viz-chart">${r.bars}</div>
            </div>`
        r.page2 = r.pareto ? `<div class="viz-card">
                <div class="viz-card-head"><span>${_vzEsc(r.title)} · Pareto 80/20</span></div>
                <div class="viz-chart">${r.pareto}</div>
            </div>` : ''
        return r
    } finally {
        VZ.pareto = saved.pareto; VZ.showAll = saved.showAll; vizRender()
    }
}

// ชื่อไฟล์: Lots_Visualization_All-Lines_STF_14_20261020_1415.pdf
function _vzPdfFileName(crumbs) {
    const d = new Date(), pad = n => String(n).padStart(2, '0')
    const scope = crumbs.replace(/[›>]/g, '_').replace(/[^\w\u0E00-\u0E7F-]+/g, '-').replace(/[-_]{2,}/g, '_').replace(/^[-_]+|[-_]+$/g, '')
    return `Lots_Visualization_${scope || 'All'}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.pdf`
}

// โหลด script ทีละตัวตอนต้องใช้ (ไม่โหลดทุกครั้งที่เปิดหน้า Lots)
function _vzLoadScript(src) {
    return new Promise((res, rej) => {
        if (document.querySelector(`script[data-viz-lib="${src}"]`)) return res()
        const el = document.createElement('script')
        el.src = src; el.dataset.vizLib = src
        el.onload = res; el.onerror = () => rej(new Error('Cannot load ' + src))
        document.head.appendChild(el)
    })
}

// html2canvas วาด SVG ผ่าน image → class CSS ใน lots.css ไม่ติดไปด้วย (แท่ง/เส้นกลายเป็นสีดำ) ต้องฝังสไตล์ลงใน element ก่อนถ่าย
function _vzInlineSvgStyles(root) {
    const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linejoin', 'opacity', 'font-size', 'font-weight', 'font-family']
    root.querySelectorAll('svg, svg *').forEach(el => {
        const cs = getComputedStyle(el)
        props.forEach(p => { const v = cs.getPropertyValue(p); if (v) el.style.setProperty(p, v) })
    })
}

async function vizExportPdf(btn) {
    btn = btn || document.querySelector('.viz-pdf-btn')
    const label = btn?.innerHTML
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width:12px;height:12px"></span> PDF' }
    let stage
    try {
        await _vzLoadScript('lib/html2canvas/html2canvas.min.js')
        await _vzLoadScript('lib/jspdf/jspdf.umd.min.js')
        const r = _vzBuildReport()

        // วางรายงานไว้นอกจอ (กว้างคงที่ ~A4 แนวนอน) แล้วถ่ายทีละหน้า
        stage = document.createElement('div')
        stage.style.cssText = 'position:fixed;left:-12000px;top:0;width:1120px;background:#fff;z-index:-1'
        stage.innerHTML = `<style>${VIZ_REPORT_CSS}</style>
            <div class="vz-pdf-page" style="padding:16px;background:#fff">${r.page1}</div>
            ${r.page2 ? `<div class="vz-pdf-page" style="padding:16px;background:#fff">${r.page2}</div>` : ''}`
        document.body.appendChild(stage)
        _vzInlineSvgStyles(stage)

        const { jsPDF } = window.jspdf
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
        const PW = 297, PH = 210, M = 8, W = PW - M * 2, H = PH - M * 2
        let first = true
        for (const page of stage.querySelectorAll('.vz-pdf-page')) {
            const canvas = await html2canvas(page, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
            const pxPerMm = canvas.width / W, sliceH = Math.floor(H * pxPerMm)
            // หน้าเนื้อหายาวเกิน 1 หน้ากระดาษ (เช่นกราฟแท่งหลายสิบแถว) → ตัดภาพเป็นหลายหน้า
            for (let y = 0; y < canvas.height; y += sliceH) {
                const h = Math.min(sliceH, canvas.height - y)
                const part = document.createElement('canvas')
                part.width = canvas.width; part.height = h
                part.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
                if (!first) pdf.addPage()
                first = false
                pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', M, M, W, h / pxPerMm)
            }
        }
        if (vizExportPdf.returnPdf) return pdf   // ใช้ตอนทดสอบเท่านั้น
        pdf.save(_vzPdfFileName(r.crumbs))
    } catch (err) {
        console.error('vizExportPdf:', err)
        showToast(`${_vzT('vizPdfFailed')}: ${err.message}`, 'error')
    } finally {
        stage?.remove()
        if (btn) { btn.disabled = false; btn.innerHTML = label }
    }
}

function vizTogglePareto() {
    VZ.pareto = !VZ.pareto
    vizRender()
}

// ส่งค่า string เข้า onclick ได้ปลอดภัย (escape ทั้ง quote และ HTML)
function _vzArg(v) { return _vzEsc(JSON.stringify(String(v))) }

// ตารางระดับ All: แถว = Line, กดแถว = กางดู W/O ข้างใน, ปุ่ม Open = ซูมเข้า Line นั้น
function _vzRenderLineTable(groups) {
    document.getElementById('vizTableTitle').textContent = _vzT('vizLineSummary')
    const head = `<tr><th></th><th>${_vzT('vizColLine')}</th><th>${_vzT('vizColWos')}</th><th>${_vzT('vizColLots')}</th><th>${_vzT('vizColOnHand')}</th>
        <th>${_vzT('vizColMaxInLoc')}</th><th>${_vzT('vizColLate')}</th><th style="width:160px">${_vzT('vizColAgeMix')}</th><th></th></tr>`
    const body = groups.map(g => {
        const open = VZ.open.has(g.key)
        const wos  = _vzGroup(g.rows, _vzWoKey).sort((a, b) => _vzMetricVal(b.agg) - _vzMetricVal(a.agg))
        const sub  = open ? wos.map(w => `<tr class="sub">
                <td></td>
                <td style="padding-left:28px;color:var(--t2)">↳ W/O <b style="color:var(--navy);font-family:ui-monospace,monospace">${_vzEsc(w.key)}</b></td>
                <td></td><td>${_vzNum(w.agg.lots)}</td><td>${_vzNum(w.agg.qty)}</td><td>${_vzDur(w.agg.maxIn)}</td>
                <td style="color:${w.agg.late ? 'var(--red)' : 'var(--t3)'};font-weight:700">${_vzNum(w.agg.late)}</td>
                <td>${_vzMixHtml(w.agg)}</td>
                <td><button class="viz-zoom" onclick="vizGo(${_vzArg(g.key)}, ${_vzArg(w.key)})">${_vzT('vizZoom')} <i class="bi bi-zoom-in"></i></button></td>
            </tr>`).join('') : ''
        return `<tr class="grp${open ? ' open' : ''}" onclick="vizToggleRow(${_vzArg(g.key)})">
                <td><span class="caret"><i class="bi bi-chevron-right"></i></span></td>
                <td><b style="color:var(--navy)">${_vzEsc(g.key)}</b></td>
                <td>${_vzNum(wos.length)}</td><td>${_vzNum(g.agg.lots)}</td><td>${_vzNum(g.agg.qty)}</td><td>${_vzDur(g.agg.maxIn)}</td>
                <td style="color:${g.agg.late ? 'var(--red)' : 'var(--t3)'};font-weight:700">${_vzNum(g.agg.late)}</td>
                <td>${_vzMixHtml(g.agg)}</td>
                <td onclick="event.stopPropagation()"><button class="viz-zoom" onclick="vizGo(${_vzArg(g.key)})">${_vzT('vizZoom')} <i class="bi bi-zoom-in"></i></button></td>
            </tr>${sub}`
    }).join('')
    document.getElementById('vizTable').innerHTML = `<table class="viz-tbl"><thead>${head}</thead><tbody>${body}</tbody></table>`
}

// ตารางระดับ Line: แถว = W/O, กดแถว = กางดู Lot ข้างใน (สูงสุด 50), ปุ่ม Open = ซูมเข้า W/O นั้น
function _vzRenderWoTable(groups) {
    document.getElementById('vizTableTitle').textContent = _vzT('vizWoSummary', { line: VZ.line })
    const head = `<tr><th></th><th>W/O</th><th>${_vzT('vizColParts')}</th><th>${_vzT('vizColLots')}</th><th>${_vzT('vizColOnHand')}</th>
        <th>${_vzT('vizColMaxInLoc')}</th><th>${_vzT('vizColLate')}</th><th style="width:160px">${_vzT('vizColAgeMix')}</th><th></th></tr>`
    const body = groups.map(g => {
        const open  = VZ.open.has(g.key)
        const parts = new Set(g.rows.map(x => x.partNo)).size
        const lots  = [...g.rows].sort((a, b) => (_vzInLoc(b) ?? -1) - (_vzInLoc(a) ?? -1))
        const sub   = open ? lots.slice(0, 50).map(x => `<tr class="sub">
                <td></td>
                <td colspan="2" style="padding-left:28px">↳ <a href="Inventory/LotDetail?lot=${encodeURIComponent(x.lotNo ?? '')}" target="_blank" class="mono" style="font-size:12px;text-decoration:none;color:var(--blue)">${_vzEsc(x.lotNo)}</a>
                    <span style="color:var(--t2);margin-left:6px">${_vzEsc(x.partNo)}</span></td>
                <td>${locBadgeForCode(x.location)}</td><td>${_vzNum(x.onHandQty)}</td>
                <td style="color:${_vzBucket(_vzInLoc(x)).color};font-weight:700">${_vzDur(_vzInLoc(x))}</td>
                <td>${_vzIsLate(x) ? '<span style="color:var(--red);font-weight:700">Late</span>' : '<span style="color:var(--t3)">—</span>'}</td>
                <td colspan="2"></td>
            </tr>`).join('') + (lots.length > 50 ? `<tr class="sub"><td></td><td colspan="8" style="padding-left:28px;color:var(--t3)">${_vzEsc(_vzT('vizMoreLots', { n: lots.length - 50 }))}</td></tr>` : '') : ''
        return `<tr class="grp${open ? ' open' : ''}" onclick="vizToggleRow(${_vzArg(g.key)})">
                <td><span class="caret"><i class="bi bi-chevron-right"></i></span></td>
                <td><b style="color:var(--navy);font-family:ui-monospace,monospace">${_vzEsc(g.key)}</b></td>
                <td>${_vzNum(parts)}</td><td>${_vzNum(g.agg.lots)}</td><td>${_vzNum(g.agg.qty)}</td><td>${_vzDur(g.agg.maxIn)}</td>
                <td style="color:${g.agg.late ? 'var(--red)' : 'var(--t3)'};font-weight:700">${_vzNum(g.agg.late)}</td>
                <td>${_vzMixHtml(g.agg)}</td>
                <td onclick="event.stopPropagation()"><button class="viz-zoom" onclick="vizGo(${_vzArg(VZ.line)}, ${_vzArg(g.key)})">${_vzT('vizZoom')} <i class="bi bi-zoom-in"></i></button></td>
            </tr>${sub}`
    }).join('')
    document.getElementById('vizTable').innerHTML = `<table class="viz-tbl"><thead>${head}</thead><tbody>${body}</tbody></table>`
}

// ตารางระดับ W/O: แถว = Part No. (+ Item Type / Description), กดแถว = กางดู Lot (สูงสุด 50), ปุ่ม Open = เจาะลงไปดู Lot ทั้งหมดของ Part นั้น
function _vzRenderPartTable(groups) {
    document.getElementById('vizTableTitle').textContent = _vzT('vizPartSummary', { wo: VZ.wo })
    const head = `<tr><th></th><th>${_vzT('vizColPart')}</th><th>${_vzT('vizColDesc')}</th><th>${_vzT('vizColLots')}</th><th>${_vzT('vizColOnHand')}</th>
        <th>${_vzT('vizColMaxInLoc')}</th><th>${_vzT('vizColLate')}</th><th style="width:160px">${_vzT('vizColAgeMix')}</th><th></th></tr>`
    const body = groups.map(g => {
        const open = VZ.open.has(g.key)
        const x0   = g.rows[0] || {}
        const type = x0.itemTypeName ?? x0.itemType ?? (typeof _partTypeCache !== 'undefined' ? _partTypeCache[x0.partNo] : '')
        const lots = [...g.rows].sort((a, b) => (_vzInLoc(b) ?? -1) - (_vzInLoc(a) ?? -1))
        const sub  = open ? lots.slice(0, 50).map(x => `<tr class="sub">
                <td></td>
                <td colspan="2" style="padding-left:28px">↳ <a href="Inventory/LotDetail?lot=${encodeURIComponent(x.lotNo ?? '')}" target="_blank" class="mono" style="font-size:12px;text-decoration:none;color:var(--blue)">${_vzEsc(x.lotNo)}</a>
                    <span style="margin-left:6px">${locBadgeForCode(x.location)}</span></td>
                <td></td><td>${_vzNum(x.onHandQty)}</td>
                <td style="color:${_vzBucket(_vzInLoc(x)).color};font-weight:700">${_vzDur(_vzInLoc(x))}</td>
                <td>${_vzIsLate(x) ? '<span style="color:var(--red);font-weight:700">Late</span>' : '<span style="color:var(--t3)">—</span>'}</td>
                <td colspan="2"></td>
            </tr>`).join('') + (lots.length > 50 ? `<tr class="sub"><td></td><td colspan="8" style="padding-left:28px;color:var(--t3)">${_vzEsc(_vzT('vizMoreLotsPart', { n: lots.length - 50 }))}</td></tr>` : '') : ''
        return `<tr class="grp${open ? ' open' : ''}" onclick="vizToggleRow(${_vzArg(g.key)})">
                <td><span class="caret"><i class="bi bi-chevron-right"></i></span></td>
                <td style="white-space:nowrap"><b style="color:var(--navy);font-family:ui-monospace,monospace">${_vzEsc(g.key)}</b>
                    ${type && typeof itemTypeBadge === 'function' ? `<span style="margin-left:6px">${itemTypeBadge(_vzEsc(type))}</span>` : ''}</td>
                <td style="color:var(--t2);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_vzEsc(x0.description)}">${_vzEsc(x0.description || '—')}</td>
                <td>${_vzNum(g.agg.lots)}</td><td>${_vzNum(g.agg.qty)}</td><td>${_vzDur(g.agg.maxIn)}</td>
                <td style="color:${g.agg.late ? 'var(--red)' : 'var(--t3)'};font-weight:700">${_vzNum(g.agg.late)}</td>
                <td>${_vzMixHtml(g.agg)}</td>
                <td onclick="event.stopPropagation()"><button class="viz-zoom" onclick="vizGo(${_vzArg(VZ.line)}, ${_vzArg(VZ.wo)}, ${_vzArg(g.key)})">${_vzT('vizZoom')} <i class="bi bi-zoom-in"></i></button></td>
            </tr>${sub}`
    }).join('')
    document.getElementById('vizTable').innerHTML = `<table class="viz-tbl"><thead>${head}</thead><tbody>${body}</tbody></table>`
}

// ระดับ Part: กราฟ = แต่ละ Lot (ความยาวแท่ง = เวลาที่อยู่ใน Location) + ตาราง Lot ทั้งหมด เรียงจากค้างนานสุด
function _vzRenderLots(rows) {
    const lots   = [...rows].sort((a, b) => (_vzInLoc(b) ?? -1) - (_vzInLoc(a) ?? -1))
    const maxMin = Math.max(...lots.map(x => _vzInLoc(x) ?? 0), 1)
    document.getElementById('vizChartTitle').textContent = _vzT('vizByLot')
    const pinfo = _vzPareto(lots.map(x => _vzInLoc(x) ?? 0))   // ระดับ Lot: 80/20 ตามเวลาที่อยู่ใน Location
    if (pinfo) document.getElementById('vizChart').innerHTML = _vzParetoSvg(
        lots.slice(0, _vzBarLimit()).map(x => ({ label: x.lotNo || '—', val: _vzInLoc(x) ?? 0 })), pinfo, v => _vzDur(v)) +
        _vzMoreBtn(lots.length)
    else document.getElementById('vizChart').innerHTML = lots.slice(0, _vzBarLimit()).map((x, i) => {
        const m = _vzInLoc(x), b = _vzColorBucket(x), pr = _vzParetoRow(pinfo, i)
        return `<div class="viz-bar-row static${pr.cls}" title="${_vzEsc(x.lotNo)} · ${_vzEsc(x.partNo)}">
            <div class="viz-bar-lbl" style="font-family:ui-monospace,monospace">${_vzEsc(x.lotNo)}</div>
            <div class="viz-bar-track"><span style="width:${(m ?? 0) / maxMin * 100}%;background:${b.color}"></span></div>
            <div class="viz-bar-val">${_vzDur(m)}${pr.cum}</div>
        </div>${pr.after}`
    }).join('') + _vzParetoBeyond(pinfo) + _vzMoreBtn(lots.length)

    const desc = rows[0]?.description
    document.getElementById('vizTableTitle').textContent = _vzT('vizLotList', { wo: VZ.wo, part: desc ? `${VZ.part} (${desc})` : VZ.part })
    const head = `<tr><th>${_vzT('vizColLot')}</th><th>${_vzT('vizColPart')}</th><th>${_vzT('vizColDesc')}</th><th>${_vzT('vizColLocation')}</th><th>${_vzT('vizColStatus')}</th>
        <th>${_vzT('vizColOnHand')}</th><th>${_vzT('vizColInLoc')}</th><th>${_vzT('vizColDelay')}</th><th>${_vzT('vizColEntered')}</th><th>PD Deadline</th></tr>`
    const body = lots.map(x => {
        const m = _vzInLoc(x), dl = x.delayTimeMinutes
        return `<tr>
            <td><a href="Inventory/LotDetail?lot=${encodeURIComponent(x.lotNo ?? '')}" target="_blank" class="mono" style="font-size:12px;text-decoration:none;color:var(--blue)">${_vzEsc(x.lotNo)}</a></td>
            <td style="font-weight:600;color:var(--navy)">${_vzEsc(x.partNo)}</td>
            <td style="color:var(--t2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_vzEsc(x.description)}">${_vzEsc(x.description || '—')}</td>
            <td>${locBadgeForCode(x.location)}</td>
            <td>${lotStatusBadge(x.status)}</td>
            <td>${_vzNum(x.onHandQty)}</td>
            <td style="color:${_vzBucket(m).color};font-weight:700;white-space:nowrap">${_vzDur(m)}</td>
            <td style="white-space:nowrap;font-weight:700;color:${dl > 0 ? 'var(--red)' : dl < 0 ? 'var(--green)' : 'var(--t3)'}">${dl == null ? '—' : (dl > 0 ? '+' : '') + _vzDur(Number(dl))}</td>
            <td style="color:var(--t2);white-space:nowrap">${x.locationEnteredAt ? fmtDate(x.locationEnteredAt) : '—'}</td>
            <td style="color:${_vzIsLate(x) ? 'var(--red)' : 'var(--t2)'};font-weight:${_vzIsLate(x) ? 700 : 400};white-space:nowrap">${x.productionDeadlineAt ? fmtDate(x.productionDeadlineAt) : '—'}</td>
        </tr>`
    }).join('')
    document.getElementById('vizTable').innerHTML = `<table class="viz-tbl"><thead>${head}</thead><tbody>${body}</tbody></table>`
}
