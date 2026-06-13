// photoCapture.js — ใช้ร่วมกันสำหรับถ่ายรูปยืนยันก่อน Receive/Move
// แต่ละหน้าเรียก createPhotoCapture({ prefix: 'xx' }) ครั้งเดียว โดยต้องมี partial _PhotoCapture (prefix เดียวกัน) อยู่ใน DOM แล้ว
// open()  เปิด modal + กล้อง (เคลียร์รูปเดิมทุกครั้ง) เรียกหลัง validate ผ่านแล้ว
// close() ปิด modal + กล้อง + เคลียร์รูปที่ถ่ายไว้ (เรียกหลังส่งเสร็จ ไม่ว่าสำเร็จหรือ error)
function createPhotoCapture({ prefix, minPhotos = 3, maxPhotos = 10, maxDimension = 1280, jpegQuality = 0.85, onChange }) {
    let blobs    = []
    let stream   = null
    let cameraOk = false

    const $ = id => document.getElementById(prefix + id)

    function resizeToBlob(source, srcW, srcH) {
        return new Promise(resolve => {
            const canvas = $('PcCanvas')
            const scale  = Math.min(1, maxDimension / Math.max(srcW, srcH))
            canvas.width  = Math.round(srcW * scale)
            canvas.height = Math.round(srcH * scale)
            canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
            canvas.toBlob(resolve, 'image/jpeg', jpegQuality)
        })
    }

    function renderThumbs() {
        const wrap = $('PcThumbs')
        wrap.innerHTML = blobs.map((b, i) => `
            <div class="pc-thumb" data-i="${i}">
                <img src="${URL.createObjectURL(b)}">
                <button type="button" class="pc-thumb-del" data-i="${i}">&times;</button>
            </div>`).join('')

        const atMax = blobs.length >= maxPhotos
        $('PcCount').textContent  = `${blobs.length}/${maxPhotos}`
        $('PcSendBtn').disabled   = blobs.length < minPhotos
        $('PcShotBtn').disabled   = atMax || !cameraOk
        $('PcFileInput').disabled = atMax

        onChange?.(blobs)
    }

    async function openCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            $('PcVideo').srcObject = stream
            cameraOk = true
        } catch (err) {
            cameraOk = false
            console.warn('[photoCapture] เปิดกล้องไม่ได้:', err)
        }
        renderThumbs()
    }

    function closeCamera() {
        stream?.getTracks().forEach(t => t.stop())
        stream = null
        $('PcVideo').srcObject = null
    }

    async function shoot() {
        if (blobs.length >= maxPhotos || !cameraOk) return
        const video = $('PcVideo')
        blobs.push(await resizeToBlob(video, video.videoWidth, video.videoHeight))
        renderThumbs()
    }

    function addFiles(fileList) {
        ;[...fileList].forEach(file => {
            if (blobs.length >= maxPhotos) return
            const img = new Image()
            img.onload = async () => {
                if (blobs.length < maxPhotos) {
                    blobs.push(await resizeToBlob(img, img.width, img.height))
                    renderThumbs()
                }
                URL.revokeObjectURL(img.src)
            }
            img.src = URL.createObjectURL(file)
        })
    }

    function removeAt(i) {
        blobs.splice(i, 1)
        renderThumbs()
    }

    let previewIndex = 0

    function showPreview() {
        $('PcPreviewImg').src = URL.createObjectURL(blobs[previewIndex])
        const showNav = blobs.length > 1 ? 'flex' : 'none'
        $('PcPreviewPrev').style.display = showNav
        $('PcPreviewNext').style.display = showNav
    }

    function openPreview(i) {
        previewIndex = i
        showPreview()
        $('PcPreview').style.display = 'flex'
    }

    function closePreview() {
        $('PcPreview').style.display = 'none'
    }

    function stepPreview(delta) {
        if (!blobs.length) return
        previewIndex = (previewIndex + delta + blobs.length) % blobs.length
        showPreview()
    }

    async function open() {
        blobs = []
        renderThumbs()
        $('PcModal').style.display = 'flex'
        await openCamera()
    }

    function close() {
        closeCamera()
        $('PcModal').style.display = 'none'
        closePreview()
        blobs = []
        renderThumbs()
    }

    $('PcShotBtn').addEventListener('click', shoot)
    $('PcFileInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = '' })
    $('PcThumbs').addEventListener('click', e => {
        const delBtn = e.target.closest('.pc-thumb-del')
        if (delBtn) { removeAt(+delBtn.dataset.i); return }
        const thumb = e.target.closest('.pc-thumb')
        if (thumb) openPreview(+thumb.dataset.i)
    })
    $('PcPreviewClose').addEventListener('click', closePreview)
    $('PcPreviewPrev').addEventListener('click', () => stepPreview(-1))
    $('PcPreviewNext').addEventListener('click', () => stepPreview(1))
    $('PcPreview').addEventListener('click', e => {
        if (e.target === e.currentTarget) closePreview()
    })

    renderThumbs()

    return {
        open, close,
        getBlobs:     () => blobs,
        hasMinPhotos: () => blobs.length >= minPhotos,
    }
}
