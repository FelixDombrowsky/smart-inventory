// lotsRangeFilter.js — ปุ่ม filter ช่วงเวลาของหน้า Lots (Delay / In Location) แทนช่องพิมพ์นาที 4 ช่องแบบเดิม
//   กดปุ่ม → popover: ตัวเลือกสำเร็จรูป (คลิกเดียวใช้เลย) + กำหนดเอง "ตั้งแต่ / ถึง" พร้อมเลือกหน่วย นาที/ชั่วโมง/วัน
//   ค่าที่ใช้จริงยังเก็บเป็น "นาที" ใน hidden input เดิม (filterDelayMin/Max, filterInLocMin/Max) — _buildLotsFilterBody()
//   ใน Lots.cshtml อ่านจากตรงนั้นเหมือนเดิม ไม่ต้องแก้ API
// ต้องโหลดหลัง i18n.js (getCurrentLang) และใช้ searchLots() ของหน้า Lots

const RNG_UNITS = { m: 1, h: 60, d: 1440 }

const RNG_TEXT = {
    en: {
        delay: 'Delay', inloc: 'In Location', any: 'Any',
        quick: 'Quick select', custom: 'Custom range', from: 'From', to: 'To', apply: 'Apply', clear: 'Clear',
        unit_m: 'minutes', unit_h: 'hours', unit_d: 'days',
        delayHint: 'Compared with PD Deadline — positive = late, negative = before the deadline',
        inlocHint: 'How long the lot has been in its current location',
        rangeErr: '"From" must be less than or equal to "To"',
        p_notLate: 'Not late', p_late: 'Late', p_late1d: 'Late > 1 day', p_late3d: 'Late > 3 days', p_due1d: 'Due within 1 day',
        p_lt1d: '< 1 day', p_gt1d: '> 1 day', p_gt3d: '> 3 days', p_gt7d: '> 7 days',
    },
    th: {
        delay: 'ความล่าช้า', inloc: 'อยู่ใน Location', any: 'ทั้งหมด',
        quick: 'เลือกด่วน', custom: 'กำหนดเอง', from: 'ตั้งแต่', to: 'ถึง', apply: 'ใช้', clear: 'ล้าง',
        unit_m: 'นาที', unit_h: 'ชั่วโมง', unit_d: 'วัน',
        delayHint: 'เทียบกับ PD Deadline — ค่าบวก = ล่าช้า, ค่าลบ = ยังไม่ถึงกำหนด',
        inlocHint: 'ระยะเวลาที่ Lot อยู่ใน Location ปัจจุบัน',
        rangeErr: '"ตั้งแต่" ต้องน้อยกว่าหรือเท่ากับ "ถึง"',
        p_notLate: 'ยังไม่ล่าช้า', p_late: 'ล่าช้า', p_late1d: 'ล่าช้า > 1 วัน', p_late3d: 'ล่าช้า > 3 วัน', p_due1d: 'ใกล้ครบกำหนด (≤ 1 วัน)',
        p_lt1d: '< 1 วัน', p_gt1d: '> 1 วัน', p_gt3d: '> 3 วัน', p_gt7d: '> 7 วัน',
    },
}

// min/max เป็นนาที (null = ไม่จำกัด)
const RNG_CFG = {
    delay: {
        minId: 'filterDelayMin', maxId: 'filterDelayMax', icon: 'bi-alarm', allowNeg: true,
        presets: [
            { k: 'notLate', min: null, max: 0 },
            { k: 'late',    min: 1,    max: null },
            { k: 'late1d',  min: 1440, max: null },
            { k: 'late3d',  min: 4320, max: null },
            { k: 'due1d',   min: -1440, max: 0 },
        ],
    },
    inloc: {
        minId: 'filterInLocMin', maxId: 'filterInLocMax', icon: 'bi-hourglass-split', allowNeg: false,
        presets: [
            { k: 'lt1d', min: null,  max: 1440 },
            { k: 'gt1d', min: 1440,  max: null },
            { k: 'gt3d', min: 4320,  max: null },
            { k: 'gt7d', min: 10080, max: null },
        ],
    },
}

const _rngT = k => (RNG_TEXT[typeof getCurrentLang === 'function' ? getCurrentLang() : 'en'] || RNG_TEXT.en)[k] ?? RNG_TEXT.en[k] ?? k

function _rngGet(kind) {
    const c = RNG_CFG[kind]
    const n = id => { const v = document.getElementById(id)?.value?.trim(); return v === '' || v == null || isNaN(Number(v)) ? null : Number(v) }
    return { min: n(c.minId), max: n(c.maxId) }
}
function _rngSet(kind, min, max) {
    const c = RNG_CFG[kind]
    document.getElementById(c.minId).value = min ?? ''
    document.getElementById(c.maxId).value = max ?? ''
}
// นาที → ข้อความสั้น เลือกหน่วยที่ลงตัว: 1440 → "1 d", 90 → "1.5 h", 45 → "45 m"
function _rngFmt(min) {
    const a = Math.abs(min), sign = min < 0 ? '-' : ''
    if (a >= 1440) return `${sign}${+(a / 1440).toFixed(1)} d`
    if (a >= 60)   return `${sign}${+(a / 60).toFixed(1)} h`
    return `${sign}${a} m`
}
// ค่าในหน่วยที่อ่านง่ายที่สุด (ใช้เติมช่องกำหนดเองตอนเปิด popover)
function _rngSplit(min) {
    if (min == null) return { v: '', u: 'd' }
    if (min % 1440 === 0) return { v: min / 1440, u: 'd' }
    if (min % 60 === 0)   return { v: min / 60, u: 'h' }
    return { v: min, u: 'm' }
}

function _rngSummary(kind) {
    const { min, max } = _rngGet(kind)
    if (min == null && max == null) return null
    const p = RNG_CFG[kind].presets.find(x => x.min === min && x.max === max)
    if (p) return _rngT('p_' + p.k)
    if (min != null && max != null) return `${_rngFmt(min)} – ${_rngFmt(max)}`
    return min != null ? `≥ ${_rngFmt(min)}` : `≤ ${_rngFmt(max)}`
}

function rngSyncAll() {
    Object.keys(RNG_CFG).forEach(kind => {
        const btn = document.getElementById(`rngBtn_${kind}`)
        if (!btn) return
        const sum = _rngSummary(kind)
        btn.classList.toggle('active', !!sum)
        btn.querySelector('.rng-lbl').innerHTML = sum
            ? `${_rngT(kind)}: <b>${sum}</b>`
            : _rngT(kind)
    })
}

function rngClose() {
    document.querySelectorAll('.rng-pop').forEach(p => p.style.display = 'none')
    document.querySelectorAll('.rng-btn.open').forEach(b => b.classList.remove('open'))
}

function rngToggle(kind, e) {
    e?.stopPropagation()
    const pop = document.getElementById(`rngPop_${kind}`)
    const opening = pop.style.display === 'none'
    rngClose()
    if (!opening) return
    _rngRenderPop(kind)
    pop.style.display = 'block'
    document.getElementById(`rngBtn_${kind}`).classList.add('open')
    _rngPlace(kind)
}
// วาง popover ใต้ปุ่ม ชิดซ้าย แต่ไม่ให้ล้นขอบขวาจอ
function _rngPlace(kind) {
    const pop = document.getElementById(`rngPop_${kind}`)
    const r   = document.getElementById(`rngBtn_${kind}`).getBoundingClientRect()
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px'
    pop.style.top  = (r.bottom + 6) + 'px'
}

function _rngRenderPop(kind) {
    const c = RNG_CFG[kind], cur = _rngGet(kind)
    const a = _rngSplit(cur.min), b = _rngSplit(cur.max)
    const unitSel = (id, u) => `<select id="${id}" class="rng-unit">${Object.keys(RNG_UNITS).map(k =>
        `<option value="${k}"${k === u ? ' selected' : ''}>${_rngT('unit_' + k)}</option>`).join('')}</select>`
    document.getElementById(`rngPop_${kind}`).innerHTML = `
        <div class="rng-sec">${_rngT('quick')}</div>
        <div class="rng-presets">
            ${c.presets.map(p => `<button type="button" class="rng-chip${p.min === cur.min && p.max === cur.max ? ' on' : ''}"
                onclick="rngPick('${kind}','${p.k}')">${_rngT('p_' + p.k)}</button>`).join('')}
        </div>
        <div class="rng-sec">${_rngT('custom')}</div>
        <div class="rng-row"><span>${_rngT('from')}</span>
            <input type="number" step="any" ${c.allowNeg ? '' : 'min="0"'} id="rngMin_${kind}" class="rng-num" value="${a.v}" placeholder="—">
            ${unitSel(`rngMinU_${kind}`, a.u)}</div>
        <div class="rng-row"><span>${_rngT('to')}</span>
            <input type="number" step="any" ${c.allowNeg ? '' : 'min="0"'} id="rngMax_${kind}" class="rng-num" value="${b.v}" placeholder="—">
            ${unitSel(`rngMaxU_${kind}`, b.u)}</div>
        <div class="rng-hint">${_rngT(kind + 'Hint')}</div>
        <div class="rng-err" id="rngErr_${kind}"></div>
        <div class="rng-actions">
            <button type="button" class="rng-clear" onclick="rngClear('${kind}')">${_rngT('clear')}</button>
            <button type="button" class="rng-apply" onclick="rngApplyCustom('${kind}')">${_rngT('apply')}</button>
        </div>`
    document.getElementById(`rngPop_${kind}`).querySelectorAll('.rng-num').forEach(inp =>
        inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') rngApplyCustom(kind) }))
}

function _rngCommit(kind, min, max) {
    _rngSet(kind, min, max)
    rngSyncAll()
    rngClose()
    searchLots()
}

function rngPick(kind, key) {
    const p = RNG_CFG[kind].presets.find(x => x.k === key)
    if (p) _rngCommit(kind, p.min, p.max)
}

function rngApplyCustom(kind) {
    const read = (inId, uId) => {
        const v = document.getElementById(inId).value.trim()
        if (v === '' || isNaN(Number(v))) return null
        let m = Math.round(Number(v) * RNG_UNITS[document.getElementById(uId).value])
        if (!RNG_CFG[kind].allowNeg) m = Math.max(0, m)
        return m
    }
    const min = read(`rngMin_${kind}`, `rngMinU_${kind}`), max = read(`rngMax_${kind}`, `rngMaxU_${kind}`)
    if (min != null && max != null && min > max) {
        document.getElementById(`rngErr_${kind}`).textContent = _rngT('rangeErr')
        return
    }
    _rngCommit(kind, min, max)
}

function rngClear(kind) { _rngCommit(kind, null, null) }

document.addEventListener('click', e => { if (!e.target.closest('.rng-pop, .rng-btn')) rngClose() })
// resize / scroll = ขยับตามปุ่ม (ไม่ปิด) — บนแท็บเล็ตการแตะช่องตัวเลขจะเด้งคีย์บอร์ดซึ่งทำให้เกิด resize/scroll
const _rngFollow = () => Object.keys(RNG_CFG).forEach(k => {
    if (document.getElementById(`rngPop_${k}`)?.style.display === 'block') _rngPlace(k)
})
window.addEventListener('resize', _rngFollow)
window.addEventListener('scroll', _rngFollow, true)
