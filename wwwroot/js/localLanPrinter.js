// localLanPrinter.js — โหมดเครื่องพิมพ์ "LocalLan" (mode = 3 ใน /printer/all): Chrome ของเครื่อง client ส่ง ZPL ตรงไปที่
// http://<printerIp>:<printerPort>/ เอง ไม่ผ่าน backend (/printer/send) — ใช้กับเครื่องพิมพ์ที่อยู่วง LAN เดียวกับ client แต่ backend ยิงไปไม่ถึง
// ต้องโหลดหลัง js/api.js (ใช้ api), js/printerCache.js (ใช้ getPrinterCache/isLocalLanPrinter) และ js/bluetoothPrinter.js
// (printerSend() ในไฟล์นั้นเป็นคนแยกทางมาเรียก localLanPrinterSend() ของไฟล์นี้ และใช้ recordClientPrintHistory() ร่วมกัน)
//
// วิธีส่ง: POST แบบ no-cors ไปที่พอร์ต raw ของเครื่อง — เครื่องอ่าน HTTP request ทั้งก้อนเป็นข้อมูลพิมพ์ ZPL ข้ามทุกอย่างนอก ^XA...^XZ
// วิธีรู้ผล: ต่อท้ายด้วย ~HS (ถามสถานะ อ่านอย่างเดียว ไม่เปลี่ยนค่าเครื่อง) เครื่องจะตอบเป็น byte ดิบกลับมา browser อ่านไม่ได้
// แต่จะ fail เร็วด้วย "invalid HTTP response" = เครื่องได้รับงานแล้ว, ไม่มีอะไรตอบจนหมดเวลา = IP ผิด / เครื่องปิด / สาย LAN หลุด
//
// ข้อจำกัด: หน้าเว็บที่เปิดด้วย https จะโดน browser บล็อก (Mixed Content) เพราะเครื่องพิมพ์เป็น http — ต้องตั้ง Insecure content = Allow
// ให้ origin ของเว็บ หรือใช้ Chrome/Edge ที่รองรับ Local Network Access (จะถามสิทธิ์ครั้งแรก)

const LOCAL_LAN_REPLY_TIMEOUT_MS = 4000
const LOCAL_LAN_STATUS_QUERY     = '~HS'

// งานที่ไปเครื่องเดียวกันต้องส่งทีละงาน — เครื่องพิมพ์รับ raw connection ได้ทีละอัน
const _localLanQueues = new Map()

// หาเครื่อง LocalLan จาก printerIp ใน cache กลาง (printerCache.js) — คืน null ถ้าไม่ใช่เครื่อง mode = 3
function findLocalLanPrinter(printerIp) {
    if (!printerIp) return null
    const cached = typeof getPrinterCache === 'function' ? getPrinterCache() : null
    const p = cached?.printers?.find(x => x.printerIp === printerIp)
    return p && isLocalLanPrinter(p) ? p : null
}

function _localLanEnqueue(key, job) {
    const run = (_localLanQueues.get(key) || Promise.resolve()).then(job)
    _localLanQueues.set(key, run.catch(() => {}))
    return run
}

// ส่ง ZPL + ~HS แล้วแปลผลจากพฤติกรรมของ browser — สำเร็จคืน { ms }, ไม่สำเร็จ throw พร้อมข้อความบอกสาเหตุ
async function localLanPrint(ip, port, zpl) {
    const url  = `http://${ip}:${port || 9100}/`
    const body = `${zpl}\r\n${LOCAL_LAN_STATUS_QUERY}\r\n`
    return _localLanEnqueue(url, async () => {
        const started = performance.now()
        let errorName = null
        try {
            await fetch(url, {
                method:  'POST',
                mode:    'no-cors',
                cache:   'no-store',
                headers: { 'Content-Type': 'text/plain' },
                body,
                targetAddressSpace: 'local',   // Chrome/Edge ที่มี Local Network Access ยอมให้หน้า https ยิงได้ (หลังถามสิทธิ์)
                signal:  AbortSignal.timeout(LOCAL_LAN_REPLY_TIMEOUT_MS),
            })
        } catch (err) {
            errorName = err?.name || 'Error'
        }
        const ms = Math.round(performance.now() - started)

        if (errorName === 'TimeoutError') {
            throw new Error(`Printer ${ip} did not respond within ${LOCAL_LAN_REPLY_TIMEOUT_MS / 1000}s — check IP, power and LAN cable (the label may not have printed)`)
        }
        if (errorName === null) {
            throw new Error(`${ip}:${port || 9100} answered as a web server — this IP is not a printer`)
        }
        if (window.location.protocol === 'https:' && ms < 15) {
            throw new Error('Blocked by the browser: this page is https but the printer is http (Mixed Content) — allow Insecure content for this site')
        }
        return { ms }
    })
}

// ใช้แทน api('/printer/send') สำหรับเครื่อง LocalLan (printerSend() ใน bluetoothPrinter.js เรียกให้)
// สำเร็จคืน null (ผู้เรียกเดิมเช็ค res?.problemDetails/statusCode อยู่แล้ว เลยผ่านเป็น success), ไม่สำเร็จ throw
// และบันทึกประวัติผ่าน POST /printer/histories ให้เองทั้งสองกรณี (แบบเดียวกับโหมด Bluetooth)
async function localLanPrinterSend(payload, printer) {
    const ip   = printer.printerIp
    const name = (printer.printerName || ip).replace(/[\r\n]+/g, ' ').trim()
    let errorMessage = null
    try {
        await localLanPrint(ip, printer.printerPort, payload.zpl ?? '')
    } catch (err) {
        errorMessage = `LocalLan: ${err?.message || err}`
    }
    try {
        await recordClientPrintHistory({ payload, printerIp: ip, printerName: name, mode: PRINT_MODE_LOCAL_LAN, success: !errorMessage, errorMessage })
    } catch (err) {
        // บันทึกประวัติไม่ได้ ไม่ควรทำให้ผลการพิมพ์เปลี่ยน — ทิ้งร่องรอยไว้ใน console
        console.warn('[LocalLan] POST /printer/histories failed', { lotNo: payload.lotNo, error: err })
    }

    if (errorMessage) throw new Error(errorMessage)
    return null
}
