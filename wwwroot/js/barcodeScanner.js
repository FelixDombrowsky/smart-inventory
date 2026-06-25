// barcodeScanner.js — ใช้ร่วมกันสำหรับเปิดกล้องสแกน barcode (BarcodeDetector + canvas overlay)
// แต่ละหน้าเรียก createBarcodeScanner(...) แล้วจัดการ UI (section/ปุ่ม) ของตัวเองผ่าน start()/stop()/switchCamera()
function createBarcodeScanner({ videoId, canvasId, labelId, onDetect, idleText = '— กำลังค้นหา barcode —' }) {
    let stream = null, rafId = null, detector = null, running = false, facingMode = 'environment';

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

        detector.detect(video).then(results => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (results.length > 0) {
                const sx = canvas.width  / (video.videoWidth  || canvas.width);
                const sy = canvas.height / (video.videoHeight || canvas.height);
                results.forEach(b => {
                    const x = b.boundingBox.x * sx, y = b.boundingBox.y * sy;
                    const w = b.boundingBox.width * sx, h = b.boundingBox.height * sy;
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
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        await start();
    }

    return {
        start, stop, switchCamera,
        get running() { return running; }
    };
}
