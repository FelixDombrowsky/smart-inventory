// ── ปุ่มเลขหน้า (1 2 3 4 5) แบบเดียวกับตาราง Stock Summary ใน Dashboard — CSS .pag-num-btn อยู่ที่ site.css ──
// ใช้: renderPageNumbers('pageNumberBtns', page, totalPages, 'goToPage') → ปุ่มเรียก goToPage(n) ของหน้านั้นเอง
function renderPageNumbers(containerId, page, totalPages, goFn, maxVisible = 5) {
    const el = document.getElementById(containerId)
    if (!el) return
    let start = Math.max(1, page - Math.floor(maxVisible / 2))
    const end = Math.min(totalPages, start + maxVisible - 1)
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1)
    let html = ''
    for (let p = start; p <= end; p++)
        html += `<button type="button" class="pag-num-btn${p === page ? ' active' : ''}"${p === page ? ' aria-current="page"' : ` onclick="${goFn}(${p})"`}>${p}</button>`
    el.innerHTML = html
}
