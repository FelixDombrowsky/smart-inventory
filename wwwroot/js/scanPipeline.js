// scanPipeline.js — ใช้ร่วมกันสำหรับ decode + cooldown + queue ของบาร์โค้ดที่สแกนได้ (กล้องหรือ HW scanner)
// แต่ละหน้าเรียก createScanPipeline({ mode, onResult }) ครั้งเดียว แล้วส่ง raw value ที่อ่านได้เข้า submit()
// mode: 'vendor' → ยิง /scan API ให้ backend ถอดบาร์โค้ด, 'ours' → parse JSON เอง (lotNo, uniqueId)
function createScanPipeline({ mode = 'ours', cooldownMs = 1800, onResult, onError, onDuplicate, barcodeFilter }) {
    const _recent = new Map()   // raw → timestamp ล่าสุดที่อนุญาตให้ผ่าน (cooldown แยกตามค่า raw)
    let _queue = [], _draining = false

    async function decode(raw) {
        // 1. Vendor Barcode
        if (mode === 'vendor') {
            // เช็คก่อนว่า raw เป็น Our Barcode (JSON ที่มี lotNo/uniqueId) หรือไม่ — ถ้าใช่ไม่ต้อง Receive
            // (ของที่มี Our Barcode แปลว่าเคย Receive ไปแล้ว) กันไว้ตั้งแต่ก่อนยิง /label/parse เลย
            // เพราะเจอจริงว่า backend เดา format ผิดเป็น vendor แล้ว parse ได้ค่าขยะออกมาแทนที่จะรู้ว่าไม่ใช่ vendor barcode
            let looksLikeOurFormat = false
            try {
                const probe = JSON.parse(raw)
                looksLikeOurFormat = !!(probe?.lotNo || probe?.uniqueId)
            } catch (_) {}
            if (looksLikeOurFormat) return { ourBarcode: true }

            try {
                //console.log("Raw : ", raw)
                const res = await api('/label/parse', 'POST', { rawData: raw})
                //console.log("Res Data : ")
                //return Array.isArray(res) ? (res[0] ?? {}) : (res ?? {})
                
                // Validate Receive Duplicate 
                if (res.data.rawData){
                    isReceive = await api(`/scan/seach-raw-barcode?rawbarcode=${res.data.rawData}`, 'POST')
                    console.log("Res Data RawData : ", isReceive)
                    if (isReceive.length > 0){
                        console.log("Lot Duplicate")
                        const allow = onDuplicate ? await onDuplicate(raw) : false
                        if (!allow) return null
                    }
                }
                console.log("Vendor Format Type :", res)
                
                // Unknown Barcode Validate
                if(res.data.formatType === "UNKNOWN") {
                    console.log("Unknown Trigger")
                    return null
                }

                return res?.data
                
            } catch(err) {
                if (err.status === 400) return null
                console.log("Error Scan [vendor] : ", err)
            }

        } else if (mode === 'ours') {

             // 2. Our Barcode
            let lotNo = raw, uniqueId = null
            let obj = null
            // filter: 'our' → อ่านเฉพาะ Our Barcode ห้าม fallback ไป vendor
            //         'vendor' → ข้ามการลอง parse Our ไป vendor lookup เลย
            //         undefined → พฤติกรรมเดิม (auto: ลอง our ก่อน ไม่ผ่านค่อย fallback vendor)
            const filter = typeof barcodeFilter === 'function' ? barcodeFilter() : barcodeFilter

            // เช็คก่อนว่า raw หน้าตาเป็น Our Barcode (มี lotNo/uniqueId) หรือไม่ — เอาไว้กันเคสตั้ง filter ผิดโหมด
            // ถ้าปล่อยให้วิ่งเข้า vendor lookup ตามปกติ จะหา raw barcode นี้ไม่เจอ (เพราะตอน Receive เก็บ raw ของ vendor ตัวจริง ไม่ใช่ JSON นี้)
            // แล้วขึ้น "No Lot, Please Receive first." ซึ่งเข้าใจผิดว่า lot ไม่มีอยู่จริง ทั้งที่จริงแค่สแกนผิดโหมด
            if (filter === 'vendor') {
                let looksLikeOurFormat = false
                try {
                    const probe = JSON.parse(raw)
                    looksLikeOurFormat = !!(probe?.lotNo || probe?.uniqueId)
                } catch (_) {}
                if (looksLikeOurFormat) return { lotNo: null, uniqueId: null, wrongModeOur: true }
            }

            try {
                 if (filter === 'vendor') throw new Error('force-vendor-scan')
                 console.log("Scan [ours] : step 1")
                 console.log("Raw Type : ", typeof(raw))

                 // typeof(raw) === 'string' -> 
                obj = JSON.parse(raw)
                console.log("Scan [ours] : step 1.5")
                if (obj?.lotNo) lotNo = obj.lotNo
                if (obj?.uniqueId) uniqueId = obj.uniqueId
                console.log("Lot No : ", lotNo)
                console.log("UniqueId : ", uniqueId)

                //console.log("Scan [ours] : step 1.5")
            } catch (err) {
                if (filter === 'our') return { lotNo: null, uniqueId: null, notOurFormat: true }
                console.log("Scan [ours] : step 1.5 err")
                 // อ่าน lot กับ unique ไม่ได้ -> ใช้ /label/parse
                
                    console.log("Scan [ours] : step 2")
                    try {
                        // 200 : succes : true
                         const res = await api('/label/parse', 'POST', { rawData: raw})
                        console.log("Res from /label/parse : ", res)
                         // เอา rawData มาใช้เพราะ trim แล้ว
                         const rawBarcode = res.data.rawData
                         let resScan;
                         try {
                            // เอา rawData ส่งไปยัง /scan/seach-raw-barcode 
                            resScan = await api(`/scan/seach-raw-barcode?rawbarcode=${rawBarcode}`, 'POST')
                            console.log("Res Scan Ja : ", resScan)
                        } catch (err) {
                            console.log("Error Scan [ours], scan/search-rawbarcode : ", err) 
                         }

                         // กรณีที่ เคยรับแล้ว แต่ยังเป็น barcode ของ vendor อยู่
                         if(resScan.length > 1) {
                            // raw barcode เดียวกันผูกกับหลาย lot — คืน matches ทั้งหมดดิบๆ ให้ผู้เรียกเลือกเอง
                            // (ไม่ยิง /inventory/lots ซ้ำที่นี่ เผื่อมีหลายสิบ lot — ให้หน้าที่เรียกไปดึงทีละตัวตอนเลือก)
                            console.log("Res Scan length > 1")
                            return { lotNo: null, uniqueId: null, matches: resScan }
                         } else if (resScan.length > 0) {
                            console.log("Res Scan length > 0")
                            lotNo = resScan[0].lotNo
                            uniqueId = resScan[0].uniqueId
                         } else {
                            // ยังไม่มี lot (ยังไม่เคย Receive)
                            lotNo = null
                            uniqueId = null
                         }

            
                    } catch (err) {
                        if (err.status === 400) {
                            lotNo = null
                            uniqueId = null
                        } else {
                            console.log("Error Scan [ours], label/parse : ", err)
                        }
                    }

            }
            
               
            
            return { lotNo, uniqueId }

        } else if (mode === 'check') {
            let object   = null
            let lotNo    = null
            let uniqueId = null
            let status   = null
            let qrType   = null
            let data     = null

            // filter: 'our' → อ่านเฉพาะ Our Barcode ห้าม fallback ไป vendor
            //         'vendor' → ข้ามการลอง parse Our ไป vendor lookup เลย (เจอ lot ก็คืน lot ไม่เจอก็คืน raw data ดิบ)
            //         undefined → พฤติกรรมเดิม (auto: ลอง our ก่อน ไม่ผ่านค่อย fallback vendor)
            const filter = typeof barcodeFilter === 'function' ? barcodeFilter() : barcodeFilter

            // เช็คก่อนว่า raw หน้าตาเป็น Our Barcode หรือไม่ — กันเคสตั้ง filter เป็น vendor แต่ดันสแกน QR ของเราเข้ามา (เหมือน mode 'ours')
            if (filter === 'vendor') {
                let looksLikeOurFormat = false
                try {
                    const probe = JSON.parse(raw)
                    looksLikeOurFormat = !!(probe?.lotNo || probe?.uniqueId)
                } catch (_) {}
                if (looksLikeOurFormat) return { status: 'wrongModeOur' }
            }

            try {
                if (filter === 'vendor') throw new Error('force-vendor-scan')
                // ลอง parse เป็น barcode ของเรา
                console.log("Qrmode : Our1")
                qrType = 'our'
                object = JSON.parse(raw)

                // ถ้า Parse ไม่ผ่านจะวิ่งไป Catch Error เลย
                console.log("Qrmode : Our2")
                if (object?.lotNo)    lotNo    = object.lotNo
                if (object?.uniqueId) uniqueId = object.uniqueId

                if (lotNo) {
                    status = !uniqueId ? 'NoPrint' : 'Print'
                    const res = await api('/inventory/lots', 'POST', { lotNo, page: 1, pageSize: 1 })
                    if (res.data?.length > 0) {
                        data = res.data[0]
                        return { status, qrType, lotNo, uniqueId, lot: data }
                    } else {
                        return { status: 'noLot', qrType, lotNo }
                    }
                }



            } catch (_) {
                if (filter === 'our') return { status: 'notOurFormat' }
                console.log("Qrmode : Vendor")
                // ไม่ใช่ barcode เรา (หรือถูกบังคับให้เป็น vendor) → ลอง vendor parse
                qrType = 'vendor'
                try {
                    const parsed  = await api('/label/parse', 'POST', { rawData: raw })

                    console.log("Parsed : ", parsed)
                    //console.log("Error : ", err)

                    //if (err?.status === 400) return { status: 'unknown' }
                    console.log("Before Error")

                    const rawBarcode = parsed.data?.rawData
                    if (!rawBarcode) return { status: 'unknown' }
                    console.log("Raw Barcode : ", rawBarcode)
                    const resScan = await api(`/scan/seach-raw-barcode?rawbarcode=${rawBarcode}`, 'POST')
                    if (resScan?.length > 0) {
                        // raw barcode เดียวกันอาจผูกกับหลาย lot (รับหลายรอบ) — คืน matches ทั้งหมดดิบๆ
                        // ให้ UI ดึง /inventory/lots ทีละตัวตามที่กำลังแสดง (lazy) ไม่ต้องยิงรวดเดียวทุกตัว
                        return { status: 'match', qrType, matches: resScan }
                    } else {
                        // ยังไม่เคย Receive — ไม่มี lot ให้โชว์ คืน raw data ดิบที่ /label/parse อ่านได้แทน
                        return { status: 'rawOnly', qrType, raw: parsed.data }
                    }
                } catch (_) {
                    console.log("Catch Error")
                    return { status: 'unknown' }
                }
            }
        }
       
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
