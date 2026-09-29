// barcodeScanner.js — ใช้ร่วมกันสำหรับเปิดกล้องสแกน barcode (BarcodeDetector + canvas overlay)
// แต่ละหน้าเรียก createBarcodeScanner(...) แล้วจัดการ UI (section/ปุ่ม) ของตัวเองผ่าน start()/stop()/switchCamera()
//
// Fallback: BarcodeDetector เป็น Shape Detection API ที่ Chromium implement เฉพาะบน Android/ChromeOS เท่านั้น
// (Desktop Chrome/Edge ไม่มี platform backend ให้เลย ไม่ว่าเวอร์ชันจะใหม่แค่ไหน, Firefox/Safari ไม่ทำเลย) — เครื่องที่ไม่มี
// BarcodeDetector จะสลับไปใช้ library "html5-qrcode" (โหลดไว้อยู่แล้วทุกหน้าที่มีสแกนเนอร์ แต่เดิมไม่เคยถูกเรียกใช้จริง) แทน
// html5-qrcode ต้องคุม <video>/<canvas> ของตัวเองในนั้น จึงต้องสร้าง container แยกแล้วซ่อน video/canvas เดิมไปตอน fallback
function createBarcodeScanner({ videoId, canvasId, labelId, onDetect, idleText = '— กำลังค้นหา barcode —' }) {
    let stream = null, rafId = null, detector = null, running = false, facingMode = 'environment';
    let _cropCanvas = null  // reuse across frames — ไม่ต้อง new ทุก frame
    let torchOn = false

    const useNativeDetector = 'BarcodeDetector' in window
    let html5Qr = null            // instance ของ Html5Qrcode ตอนใช้ fallback
    let html5QrContainerId = null // id ของ div ที่สร้างขึ้นให้ html5-qrcode คุมเอง

    // คำนวณพื้นที่ที่ user เห็นจริงๆ ใน display (object-fit: cover)
    function _getVisibleCrop(video, displayW, displayH) {
        const videoAR   = video.videoWidth  / video.videoHeight
        const displayAR = displayW / displayH
        let sx, sy, sw, sh
        if (videoAR > displayAR) {
            // video กว้างกว่า → ตัดซ้ายขวา
            sh = video.videoHeight
            sw = Math.round(sh * displayAR)
            sx = Math.round((video.videoWidth - sw) / 2)
            sy = 0
        } else {
            // video สูงกว่า → ตัดบนล่าง
            sw = video.videoWidth
            sh = Math.round(sw / displayAR)
            sx = 0
            sy = Math.round((video.videoHeight - sh) / 2)
        }
        return { sx, sy, sw, sh }
    }

    async function start() {
        if (!useNativeDetector) return _startFallback();

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
            });
        } catch {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            facingMode = 'user';
        }

        const video = document.getElementById(videoId);
        video.srcObject = stream;
        await video.play();

        const formats = await BarcodeDetector.getSupportedFormats();
        detector = new BarcodeDetector({ formats });
        running = true;
        detectLoop();
    }

    // ── Fallback ด้วย html5-qrcode (ใช้ตอนเครื่องไม่มี BarcodeDetector เช่น Desktop Chrome/Edge, Firefox, Safari) ──
    // html5-qrcode คุม <video>/<canvas> ของตัวเองในตัว ไม่รองรับให้เรายัด element เดิมเข้าไป จึงต้องซ่อน #bcVideo/#bcCanvas
    // เดิม แล้วสร้าง container ใหม่ใส่ไว้ใน .bc-scanner-box เดียวกัน (CSS ที่มีอยู่แล้วสำหรับ video/canvas ในนั้นจะ apply ให้เองอัตโนมัติ)
    let _h5Video = null   // อ้างอิง <video> ที่ html5-qrcode สร้างขึ้นเอง — ใช้ตอน snapshot()

    function _h5ContainerId() { return canvasId + '_h5qr' }

    function _h5ContainerEl() {
        let el = document.getElementById(_h5ContainerId())
        if (!el) {
            const canvas = document.getElementById(canvasId)
            el = document.createElement('div')
            el.id = _h5ContainerId()
            el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
            canvas.insertAdjacentElement('afterend', el)
        }
        return el
    }

    async function _startFallback() {
        if (typeof Html5Qrcode === 'undefined') {
            throw new Error('เบราว์เซอร์นี้ไม่รองรับ BarcodeDetector และไม่พบ library สำรอง (html5-qrcode)')
        }
        const video  = document.getElementById(videoId)
        const canvas = document.getElementById(canvasId)
        const label  = labelId ? document.getElementById(labelId) : null
        if (video)  video.style.display  = 'none'
        if (canvas) canvas.style.display = 'none'
        const container = _h5ContainerEl()
        container.style.display = 'block'

        html5Qr = new Html5Qrcode(_h5ContainerId(), {
            verbose: false,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39, Html5QrcodeSupportedFormats.CODE_93,
                Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.ITF, Html5QrcodeSupportedFormats.CODABAR,
                Html5QrcodeSupportedFormats.DATA_MATRIX, Html5QrcodeSupportedFormats.PDF_417,
                Html5QrcodeSupportedFormats.AZTEC
            ]
        })
        running = true
        const onScan = decodedText => { if (label) label.textContent = decodedText; onDetect(decodedText) }
        const onMiss = () => { if (label) label.textContent = idleText }   // ไม่เจอโค้ดในเฟรมนี้ — ปกติ ไม่ต้องแจ้งเตือน
        try {
            await html5Qr.start({ facingMode }, { fps: 10 }, onScan, onMiss)
        } catch (err) {
            // โน๊ตบุ๊คส่วนใหญ่ไม่มีกล้องหลัง (environment) — ลองกล้อง user แทนเหมือน path native ก่อนค่อยยอมแพ้
            try {
                facingMode = 'user'
                await html5Qr.start({ facingMode }, { fps: 10 }, onScan, onMiss)
            } catch (err2) {
                running = false
                container.style.display = 'none'
                if (video)  video.style.display  = ''
                if (canvas) canvas.style.display = ''
                throw err2
            }
        }
        _h5Video = container.querySelector('video')
        if (label) label.textContent = idleText
    }

    async function _stopFallback() {
        running = false
        torchOn = false
        if (html5Qr) {
            try { await html5Qr.stop() } catch (_) { /* อาจหยุดไปแล้วจาก switchCamera */ }
            try { html5Qr.clear() } catch (_) { }
            html5Qr = null
        }
        _h5Video = null
        const video     = document.getElementById(videoId)
        const canvas    = document.getElementById(canvasId)
        const container = document.getElementById(_h5ContainerId())
        const label     = labelId ? document.getElementById(labelId) : null
        if (video)     video.style.display     = ''
        if (canvas)    canvas.style.display    = ''
        if (container) container.style.display = 'none'
        if (label)     label.textContent = idleText
    }

    function _hasTorchFallback() {
        if (!html5Qr || !running) return false
        try { return !!html5Qr.getRunningTrackCameraCapabilities()?.torchFeature?.()?.isSupported?.() }
        catch (_) { return false }
    }

    async function _toggleTorchFallback(force) {
        if (!_hasTorchFallback()) return false
        const next = force ?? !torchOn
        try {
            await html5Qr.getRunningTrackCameraCapabilities().torchFeature().apply(next)
            torchOn = next
        } catch (_) {
            torchOn = false
        }
        return torchOn
    }

    // snapshot fallback: crop เหมือนโหมด native แต่ใช้ <video> ที่ html5-qrcode สร้างขึ้นเองแทน #bcVideo
    async function _snapshotFallback(maxDimension = 1280, quality = 0.85) {
        const video = _h5Video
        if (!video || !running || video.readyState < 2) return null
        const host = document.getElementById(_h5ContainerId())
        const dw = host ? host.offsetWidth  : video.videoWidth
        const dh = host ? host.offsetHeight : video.videoHeight
        if (!dw || !dh) return null
        const { sx, sy, sw, sh } = _getVisibleCrop(video, dw, dh)
        const targetArea = maxDimension * Math.round(maxDimension * 9 / 16)
        const scale = Math.min(1, Math.sqrt(targetArea / (sw * sh)))
        return new Promise(resolve => {
            const out = document.createElement('canvas')
            out.width  = Math.round(sw * scale)
            out.height = Math.round(sh * scale)
            out.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, out.width, out.height)
            out.toBlob(resolve, 'image/jpeg', quality)
        })
    }

    function detectLoop() {
        if (!running) return;
        const video  = document.getElementById(videoId);
        const canvas = document.getElementById(canvasId);
        const label  = labelId ? document.getElementById(labelId) : null;
        const ctx    = canvas.getContext('2d');
        const dw = canvas.offsetWidth, dh = canvas.offsetHeight;
        if (canvas.width !== dw || canvas.height !== dh) { canvas.width = dw; canvas.height = dh; }
        if (video.readyState < 2) { rafId = requestAnimationFrame(detectLoop); return; }

        // crop video ให้เหลือแค่พื้นที่ที่ user เห็น
        const { sx, sy, sw, sh } = _getVisibleCrop(video, dw, dh)
        if (!_cropCanvas) _cropCanvas = document.createElement('canvas')
        if (_cropCanvas.width !== dw || _cropCanvas.height !== dh) {
            _cropCanvas.width  = dw
            _cropCanvas.height = dh
        }
        _cropCanvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh)

        detector.detect(_cropCanvas).then(results => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (results.length > 0) {
                // bounding box อยู่ใน display coords แล้ว (ไม่ต้อง scale)
                results.forEach(b => {
                    const x = b.boundingBox.x, y = b.boundingBox.y;
                    const w = b.boundingBox.width, h = b.boundingBox.height;
                    ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
                    const ty = y > 24 ? y - 4 : y + h + 16;
                    ctx.fillStyle = 'rgba(26,111,255,.88)'; ctx.fillRect(x, ty - 16, Math.min(w, 180), 18);
                    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif';
                    ctx.fillText(b.format.replace('_', ' ').toUpperCase(), x + 4, ty);
                });
                const first = results[0];
                if (label) label.textContent = results.length > 1
                    ? `เจอ ${results.length} โค้ด`
                    : `${first.format}: ${first.rawValue}`;
                results.forEach(b => onDetect(b.rawValue));
            } else {
                if (label) label.textContent = idleText;
            }
            if (running) rafId = requestAnimationFrame(detectLoop);
        }).catch(() => { if (running) rafId = requestAnimationFrame(detectLoop); });
    }

    function stop() {
        if (!useNativeDetector) { _stopFallback(); return; }
        running = false;
        cancelAnimationFrame(rafId);
        torchOn = false;
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        const video  = document.getElementById(videoId);
        const canvas = document.getElementById(canvasId);
        const label  = labelId ? document.getElementById(labelId) : null;
        if (video)  video.srcObject = null;
        if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width || 9999, canvas.height || 9999);
        if (label)  label.textContent = idleText;
    }

    async function switchCamera() {
        if (!running) return;
        facingMode = facingMode === 'environment' ? 'user' : 'environment';
        if (!useNativeDetector) { await _stopFallback(); await _startFallback(); return; }
        running = false; cancelAnimationFrame(rafId);
        torchOn = false;
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        await start();
    }

    // แฟลชใช้ได้เฉพาะกล้องหลัง (environment) และเบราว์เซอร์ที่รองรับ torch capability (ส่วนใหญ่คือ Chrome/Android — iOS Safari ไม่รองรับ)
    function hasTorch() {
        if (!useNativeDetector) return _hasTorchFallback();
        const track = stream?.getVideoTracks?.()[0];
        return !!track?.getCapabilities?.().torch;
    }

    async function toggleTorch(force) {
        if (!useNativeDetector) return _toggleTorchFallback(force);
        const track = stream?.getVideoTracks?.()[0];
        if (!track || !hasTorch()) return false;
        const next = force ?? !torchOn;
        try {
            await track.applyConstraints({ advanced: [{ torch: next }] });
            torchOn = next;
        } catch {
            torchOn = false;
        }
        return torchOn;
    }

    // snapshot: จับเฉพาะพื้นที่ที่ user เห็น (visible crop เดียวกับ detectLoop)
    async function snapshot(maxDimension = 1280, quality = 0.85) {
        if (!useNativeDetector) return _snapshotFallback(maxDimension, quality);
        const video  = document.getElementById(videoId)
        const canvas = document.getElementById(canvasId)
        if (!video || !running || video.readyState < 2) return null
        const dw = canvas ? canvas.offsetWidth  : video.videoWidth
        const dh = canvas ? canvas.offsetHeight : video.videoHeight
        if (!dw || !dh) return null
        const { sx, sy, sw, sh } = _getVisibleCrop(video, dw, dh)
        // คุมด้วยพื้นที่รวม (ไม่ใช่แค่ด้านยาว) — ตอนถือแนวนอน กล่องแสดงผลใกล้เคียงสัดส่วนวิดีโอเดิมมากกว่า
        // ทำให้ crop เสียพื้นที่น้อยกว่าแนวตั้ง ถ้าคุมแค่ด้านยาวเท่ากัน พื้นที่รวม (และขนาดไฟล์) จะยังใหญ่กว่าแนวตั้งเกือบ 2 เท่า
        const targetArea = maxDimension * Math.round(maxDimension * 9 / 16)
        const scale = Math.min(1, Math.sqrt(targetArea / (sw * sh)))
        return new Promise(resolve => {
            const out = document.createElement('canvas')
            out.width  = Math.round(sw * scale)
            out.height = Math.round(sh * scale)
            out.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, out.width, out.height)
            out.toBlob(resolve, 'image/jpeg', quality)
        })
    }

    return {
        start, stop, switchCamera, snapshot, hasTorch, toggleTorch,
        get running() { return running; },
        get torchOn() { return torchOn; }
    };
}
