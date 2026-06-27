// dateRangePicker.js — Date Range Picker แบบ reusable ใช้ร่วมกันได้หลายหน้า/หลาย instance ในหน้าเดียวกัน
// แต่ละหน้าเรียก createDateRangePicker({ prefix: 'xx', onApply }) ครั้งเดียว โดยต้องมี partial _DateRangePicker (prefix เดียวกัน) อยู่ใน DOM แล้ว
// onApply(fromIso, toIso) ถูกเรียกทุกครั้งที่กด Apply หรือ Clear/Reset (ค่าจะเป็น '' ถ้าไม่ได้เลือกช่วงวันที่)
function createDateRangePicker({ prefix, onApply }) {
    const $ = id => document.getElementById(prefix + id)

    let start = null, end = null                 // ค่าที่กำลังเลือก (ระหว่างเปิด panel ยังไม่ apply)
    let appliedStart = null, appliedEnd = null    // ค่าที่ apply แล้วจริง
    let viewDate = new Date()                     // เดือนที่กำลังโชว์ในปฏิทิน

    function fmt(d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
    function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
    function sameDay(a, b) { return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }

    function closePanel() {
        $('DrPanel').style.display = 'none'
        $('DrTrigger').classList.remove('open')
    }

    function positionPanel() {
        const panel = $('DrPanel'), trigger = $('DrTrigger')
        const r = trigger.getBoundingClientRect()
        const panelWidth = panel.offsetWidth || 296
        const left = Math.min(Math.max(8, r.left), window.innerWidth - panelWidth - 8)
        panel.style.left = left + 'px'
        panel.style.top  = (r.bottom + 6) + 'px'
    }

    function toggle() {
        const opening = $('DrPanel').style.display === 'none'
        if (!opening) { closePanel(); return }
        start    = appliedStart
        end      = appliedEnd
        viewDate = new Date(start || new Date())
        $('DrPanel').style.display = ''
        $('DrTrigger').classList.add('open')
        positionPanel()
        renderCalendar()
    }

    // panel เป็น position:fixed ไม่ตามหน้า scroll เอง — ปิดไปเลยเมื่อ scroll/resize (เหมือน loc-filter-dd-menu)
    window.addEventListener('scroll', () => {
        if ($('DrPanel').style.display !== 'none') closePanel()
    }, true)
    window.addEventListener('resize', () => {
        if ($('DrPanel').style.display !== 'none') closePanel()
    })

    function changeMonth(delta) {
        viewDate.setMonth(viewDate.getMonth() + delta)
        renderCalendar()
    }

    function renderCalendar() {
        const y = viewDate.getFullYear(), m = viewDate.getMonth()
        $('DrCalLabel').textContent = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

        const firstDow = new Date(y, m, 1).getDay()
        const daysInMo = new Date(y, m + 1, 0).getDate()
        const today    = new Date(); today.setHours(0, 0, 0, 0)

        let html = ''
        for (let i = 0; i < firstDow; i++) html += `<div class="drp-day-wrap"></div>`
        for (let day = 1; day <= daysInMo; day++) {
            const d       = new Date(y, m, day)
            const isStart = sameDay(d, start)
            const isEnd   = sameDay(d, end)
            const inRange = start && end && d > start && d < end
            const isToday = sameDay(d, today)
            const wrapCls = ['drp-day-wrap']; if (inRange) wrapCls.push('in-range')
            const btnCls  = ['drp-day']; if (isStart || isEnd) btnCls.push('selected'); if (isToday) btnCls.push('today')
            html += `<div class="${wrapCls.join(' ')}"><button type="button" class="${btnCls.join(' ')}" data-day="${day}">${day}</button></div>`
        }
        $('DrCalGrid').innerHTML = html
    }

    function pickDay(day) {
        const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day)
        if (!start || (start && end)) { start = d; end = null }
        else if (d < start)           { start = d; end = null }
        else                          { end = d }
        renderCalendar()
    }

    function preset(key) {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        let s = new Date(today)
        const e = new Date(today)
        if (key === '7d')         s.setDate(s.getDate() - 6)
        else if (key === '30d')   s.setDate(s.getDate() - 29)
        else if (key === 'month') s = new Date(today.getFullYear(), today.getMonth(), 1)
        start = s; end = e; viewDate = new Date(s)
        renderCalendar()
    }

    function clear() { start = null; end = null; renderCalendar() }

    function updateTriggerLabel() {
        const label = $('DrLabel'), trigger = $('DrTrigger')
        if (!appliedStart) {
            label.textContent = 'All Dates'
            trigger.classList.remove('has-value')
        } else if (sameDay(appliedStart, appliedEnd)) {
            label.textContent = fmt(appliedStart)
            trigger.classList.add('has-value')
        } else {
            label.textContent = `${fmt(appliedStart)} → ${fmt(appliedEnd)}`
            trigger.classList.add('has-value')
        }
    }

    function apply() {
        appliedStart = start
        appliedEnd   = start ? (end || start) : null
        $('DrFrom').value = appliedStart ? iso(appliedStart) : ''
        $('DrTo').value   = appliedEnd   ? iso(appliedEnd)   : ''
        updateTriggerLabel()
        closePanel()
        onApply?.($('DrFrom').value, $('DrTo').value)
    }

    function reset() {
        start = end = appliedStart = appliedEnd = null
        $('DrFrom').value = ''
        $('DrTo').value   = ''
        updateTriggerLabel()
        onApply?.('', '')
    }

    // ── ผูก event ครั้งเดียวตอนสร้าง instance (ใช้ data-attribute + delegation แทน inline onclick
    //    เพื่อให้รองรับหลาย instance ในหน้าเดียวกันได้โดยไม่ชนกัน) ──
    $('DrTrigger').addEventListener('click', toggle)
    $('DrPrev').addEventListener('click', () => changeMonth(-1))
    $('DrNext').addEventListener('click', () => changeMonth(1))
    $('DrCalGrid').addEventListener('click', e => {
        const btn = e.target.closest('.drp-day')
        if (btn) pickDay(+btn.dataset.day)
    })
    $('DrPresets').querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => preset(btn.dataset.preset))
    })
    $('DrClear').addEventListener('click', clear)
    $('DrApply').addEventListener('click', apply)

    // ปิด panel เมื่อคลิกข้างนอก — ใช้ composedPath (path ของ event ตอน dispatch) แทน e.target.closest()
    // เพราะคลิกวันที่จะ re-render กริดทันที ทำให้ปุ่มที่ถูกคลิกหลุดจาก DOM ก่อน event bubble มาถึง document
    document.addEventListener('click', e => {
        const path = e.composedPath ? e.composedPath() : []
        if (!path.includes($('DrWrap'))) closePanel()
    })
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closePanel()
    })

    return {
        reset,
        getFrom: () => $('DrFrom').value,
        getTo:   () => $('DrTo').value,
    }
}
