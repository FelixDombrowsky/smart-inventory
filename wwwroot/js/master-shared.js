// master-shared.js — ฟังก์ชันกลางที่ใช้ร่วมกันในหน้า Master Management ทุกแท็บ/ทุกหน้า

// ── Modal ──
function openModal(id)  { document.getElementById(id).classList.add("show") }
function closeModal(id) { document.getElementById(id).classList.remove("show") }

// ── Toast ──
function showToast(message, type = "success", opts = {}) {
    const { duration = 2800, wide = false } = opts
    const stack = document.getElementById("toastStack")
    const t = document.createElement("div")
    t.className = `nx-toast nx-toast-${type}${wide ? ' nx-toast-wide' : ''}`
    t.innerHTML = `<span>${type === "success" ? "✓" : "✕"}</span><span>${message}</span>`
    stack.appendChild(t)
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(28px)"; t.style.transition = ".2s" }, duration)
    setTimeout(() => t.remove(), duration + 300)
}

// ── Modal Error ──
function showModalError(id, msg) {
    const el = document.getElementById(id)
    if (!el) return
    el.textContent = msg
    el.classList.add("show")
}
function clearModalError(id) {
    const el = document.getElementById(id)
    if (!el) return
    el.textContent = ""
    el.classList.remove("show")
}

// ── HTML Escape ──
function locEsc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ── Image Lightbox ──
function escJs(s) { return String(s).replace(/\\/g,"\\\\").replace(/'/g,"\\'") }
function bomOpenImg(src, caption) {
    const overlay = document.getElementById('bomImgOverlay')
    document.getElementById('bomImgEl').src = src
    document.getElementById('bomImgCaption').textContent = caption || ''
    overlay.classList.add('show')
}
function bomCloseImg() {
    document.getElementById('bomImgOverlay').classList.remove('show')
    document.getElementById('bomImgEl').src = ''
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') bomCloseImg() })

// ── Pagination ──
function renderPagination(containerId, infoId, currentPage, totalPages, loadFn) {
    const info = document.getElementById(infoId)
    const container = document.getElementById(containerId)
    if (info) info.textContent = `Page ${currentPage} / ${totalPages}`
    if (!container) return
    let html = `<button class="pag-btn" onclick="${loadFn}(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>← Prev</button>`
    for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
        html += `<button class="pag-btn ${i === currentPage ? 'active' : ''}" onclick="${loadFn}(${i})">${i}</button>`
    }
    html += `<button class="pag-btn" onclick="${loadFn}(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next →</button>`
    container.innerHTML = html
}
