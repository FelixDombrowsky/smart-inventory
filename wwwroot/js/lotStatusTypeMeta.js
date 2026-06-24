// lotStatusTypeMeta.js — icon + สีของแต่ละ Lot Status ใช้ร่วมกันได้ทุกหน้า (รูปแบบเดียวกับ locationTypeMeta.js / itemTypeMeta.js / transactionTypeMeta.js)
// ใช้ hand-drawn line SVG (24x24 viewbox, stroke-based, ไม่มี fill)

const LOT_STATUS_META = {
    available: { color: '#059669', svg: `<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9"/>` },
    reserved:  { color: '#d97706', svg: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>` },
    qahold:    { color: '#ea580c', svg: `<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>` },
    scrap:     { color: '#dc2626', svg: `<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>` },
    closed:    { color: '#64748b', svg: `<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 8l2-4h14l2 4"/><line x1="10" y1="13" x2="14" y2="13"/>` },
    rejected:  { color: '#be123c', svg: `<circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>` },
    void:      { color: '#991b1b', svg: `<circle cx="12" cy="12" r="9"/><line x1="5.5" y1="5.5" x2="18.5" y2="18.5"/>` },
}
const LOT_STATUS_DEFAULT = { color: '#475569', svg: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>` }

function lotStatusMeta(statusName) {
    return LOT_STATUS_META[(statusName || '').toLowerCase()] || LOT_STATUS_DEFAULT
}

function lotStatusIcon(statusName, size = 14) {
    const m = lotStatusMeta(statusName)
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="2">${m.svg}</svg>`
}

function lotStatusBadgeStyle(statusName) {
    const m = lotStatusMeta(statusName)
    return `background:${m.color}1a;color:${m.color}`
}

// คืน <span> badge สำเร็จรูปพร้อม icon — เผื่อหน้าเดิมเรียกตรงๆ
function lotStatusBadge(statusName) {
    if (!statusName) return '<span style="color:var(--t3)">—</span>'
    return `<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;${lotStatusBadgeStyle(statusName)};white-space:nowrap;display:inline-flex;align-items:center;gap:5px">${lotStatusIcon(statusName)}${statusName}</span>`
}
