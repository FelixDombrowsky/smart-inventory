// scanPipeline.js — ใช้ร่วมกันสำหรับ decode + cooldown + queue ของบาร์โค้ดที่สแกนได้ (กล้องหรือ HW scanner)
// แต่ละหน้าเรียก createScanPipeline({ mode, onResult }) ครั้งเดียว แล้วส่ง raw value ที่อ่านได้เข้า submit()
// mode: 'vendor' → ยิง /scan API ให้ backend ถอดบาร์โค้ด, 'ours' → parse JSON เอง (lotNo, uniqueId)
function createScanPipeline({ mode = 'ours', cooldownMs = 1800, onResult, onError }) {
    const _recent = new Map()   // raw → timestamp ล่าสุดที่อนุญาตให้ผ่าน (cooldown แยกตามค่า raw)
    let _queue = [], _draining = false

    async function decode(raw) {
        if (mode === 'vendor') {
            const res = await api('/scan', 'POST', { barcode: raw, mode: 0 })
            return Array.isArray(res) ? (res[0] ?? {}) : (res ?? {})
        }
        let lotNo = raw, uniqueId = null
        try {
            const obj = JSON.parse(raw)
            if (obj?.lotNo) lotNo = obj.lotNo
            if (obj?.uniqueId) uniqueId = obj.uniqueId
        } catch (_) {}
        return { lotNo, uniqueId }
    }

    async function _drain() {
        if (_draining) return       // มีคน drain คิวอยู่แล้ว ไม่ต้องเริ่มซ้ำ
        _draining = true
        try {
            while (_queue.length) {
                const raw = _queue.shift()
                try {
                    const data = await decode(raw)
                    await onResult?.(data, raw)
                } catch (err) {
                    onError ? onError(err, raw) : console.error(err)
                }
            }
        } finally {
            _draining = false
        }
    }

    function submit(raw) {
        raw = (raw || '').trim()
        if (!raw) return
        const now = Date.now()
        if (now - (_recent.get(raw) || 0) < cooldownMs) return
        _recent.set(raw, now)
        _queue.push(raw)
        _drain()
    }

    return { submit }
}
