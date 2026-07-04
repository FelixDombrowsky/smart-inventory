// scanPipeline.js — ใช้ร่วมกันสำหรับ decode + cooldown + queue ของบาร์โค้ดที่สแกนได้ (กล้องหรือ HW scanner)
// แต่ละหน้าเรียก createScanPipeline({ mode, onResult }) ครั้งเดียว แล้วส่ง raw value ที่อ่านได้เข้า submit()
// mode: 'vendor' → ยิง /scan API ให้ backend ถอดบาร์โค้ด, 'ours' → parse JSON เอง (lotNo, uniqueId)
function createScanPipeline({ mode = 'ours', cooldownMs = 1800, onResult, onError, onDuplicate }) {
    const _recent = new Map()   // raw → timestamp ล่าสุดที่อนุญาตให้ผ่าน (cooldown แยกตามค่า raw)
    let _queue = [], _draining = false

    async function decode(raw) {
        // 1. Vendor Barcode
        if (mode === 'vendor') {
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
                console.log("Vendor Format Type :", res.data.formatType)
                
                // Unknown Barcode Validate
                if(res.data.formatType === "UNKNOWN") {
                    console.log("Unknown Trigger")
                    return null
                }

                // Validate Our Barcode (Can't Receive)
                // let jsonData = JSON.parse(raw) 
                // if(jsonData.lotNo || jsonData.uniqueId) {
                //     console.log("Our Barcode")
                //     return null
                // }
                

                // Validate Receive Duplicate
                //console.log("Valdate Receive : ", res)


                //if (obj?.lotNo) lotNo = obj.lotNo

                
                
                
                return res?.data
                
            } catch(err) {
                if (err.status === 400) return null
                console.log("Error Scan [vendor] : ", err)
            }

        } else if (mode === 'ours') {

             // 2. Our Barcode
            let lotNo = raw, uniqueId = null
            let obj = null
            try {
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
                         if(resScan.length > 0) {
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

            try {
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
                console.log("Qrmode : Vendor")
                // ไม่ใช่ barcode เรา → ลอง vendor parse
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
                        lotNo = resScan[0].lotNo
                        uniqueId = resScan[0].uniqueId
                        const res = await api('/inventory/lots', 'POST', { lotNo, page: 1, pageSize: 1 })
                        data = res.data?.[0] ?? null
                        return { status: data ? 'Print' : 'noLot', qrType, lotNo, uniqueId, lot: data }
                    } else {
                        return { status: 'notReceived', qrType }
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
