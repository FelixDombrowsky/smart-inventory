// hwScanner.js — ใช้ร่วมกันสำหรับ Hardware Barcode Scanner (keyboard wedge)
// แต่ละหน้าเรียก createHwScanner(...) แล้วจัดการ section/ปุ่มของตัวเองผ่าน open()/close()/toggle()
function createHwScanner({ inputId, statusId, onScan, minLength = 3, idleText = 'พร้อมสแกน…', busyText = '⏳ กำลังค้นหา…', resetDelayMs = 1200 }) {
    let active = false, timer = null, busy = false

    const input  = () => document.getElementById(inputId)
    const status = () => statusId ? document.getElementById(statusId) : null

    async function commit(code) {
        const inp = input()
        if (inp) inp.value = ''
        if (!code || busy) return
        busy = true
        const st = status()
        if (st) st.textContent = busyText
        try {
            await onScan(code)
        } finally {
            busy = false
            setTimeout(() => {
                if (!active) return
                const st2 = status()
                if (st2) st2.textContent = idleText
                input()?.focus()
            }, resetDelayMs)
        }
    }

    function handleKey(e) {
        if (e.key !== 'Enter') return
        e.preventDefault()
        clearTimeout(timer)
        const val = e.target.value.trim()
        if (val) commit(val)
    }

    function handleInput(e) {
        clearTimeout(timer)
        timer = setTimeout(() => {
            const val = e.target.value.trim()
            if (val.length > minLength) commit(val)
        }, 300)
    }

    function open() {
        active = true
        const inp = input()
        if (inp) {
            inp.value = ''
            inp.addEventListener('keydown', handleKey)
            inp.addEventListener('input', handleInput)
            inp.focus()
        }
        const st = status()
        if (st) st.textContent = idleText
    }

    function close() {
        active = false
        clearTimeout(timer)
        const inp = input()
        if (inp) {
            inp.removeEventListener('keydown', handleKey)
            inp.removeEventListener('input', handleInput)
            inp.value = ''
        }
    }

    return {
        open, close,
        toggle() { active ? close() : open() },
        get active() { return active }
    }
}
