// barcodeScanner.js — ใช้ร่วมกันสำหรับเปิดกล้องสแกน barcode (BarcodeDetector + canvas overlay)
// แต่ละหน้าเรียก createBarcodeScanner(...) แล้วจัดการ UI (section/ปุ่ม) ของตัวเองผ่าน start()/stop()/switchCamera()
function createBarcodeScanner({ videoId, canvasId, labelId, onDetect, idleText = '— กำลังค้นหา barcode —' }) {
    let stream = null, rafId = null, detector = null, running = false, facingMode = 'environment';
    let _cropCanvas = null  // reuse across frames — ไม่ต้อง new ทุก frame
    let torchOn = false

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
        if (!('BarcodeDetector' in window)) throw new Error('เบราว์เซอร์นี้ไม่รองรับ BarcodeDetector');

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
        running = false; cancelAnimationFrame(rafId);
        torchOn = false;
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        await start();
    }

    // แฟลชใช้ได้เฉพาะกล้องหลัง (environment) และเบราว์เซอร์ที่รองรับ torch capability (ส่วนใหญ่คือ Chrome/Android — iOS Safari ไม่รองรับ)
    function hasTorch() {
        const track = stream?.getVideoTracks?.()[0];
        return !!track?.getCapabilities?.().torch;
    }

    async function toggleTorch(force) {
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
        const video  = document.getElementById(videoId)
        const canvas = document.getElementById(canvasId)
        if (!video || !running || video.readyState < 2) return null
        const dw = canvas ? canvas.offsetWidth  : video.videoWidth
        const dh = canvas ? canvas.offsetHeight : video.videoHeight
        if (!dw || !dh) return null
        const { sx, sy, sw, sh } = _getVisibleCrop(video, dw, dh)
        const scale = Math.min(1, maxDimension / Math.max(sw, sh))
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
