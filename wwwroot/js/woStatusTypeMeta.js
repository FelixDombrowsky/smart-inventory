// woStatusTypeMeta.js — icon + สีของแต่ละ Work Order Status ใช้ร่วมกันได้ทุกหน้า (รูปแบบเดียวกับ lotStatusTypeMeta.js / itemTypeMeta.js)
// รับ "ชื่อ status จริง" (เช่นจาก /workorder/wo-status-types) ไม่ใช่ id — หน้าที่มีแค่ id เอง ต้อง map เป็นชื่อก่อนแล้วค่อยส่งเข้ามา
// ใช้ hand-drawn line SVG (24x24 viewbox, stroke-based, ไม่มี fill)

const WO_STATUS_META = {
    active:     { color: '#059669', svg: `<circle cx="12" cy="12" r="9"/><polygon points="10 8 16 12 10 16"/>` },
    unproduced: { color: '#64748b', svg: `<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>` },
    closed:     { color: '#475569', svg: `<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 8l2-4h14l2 4"/><line x1="10" y1="13" x2="14" y2="13"/>` },
    paused:     { color: '#d97706', svg: `<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>` },
}
const WO_STATUS_DEFAULT = { color: '#475569', svg: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>` }

function woStatusMeta(statusName) {
    return WO_STATUS_META[(statusName || '').toLowerCase()] || WO_STATUS_DEFAULT
}

function woStatusIcon(statusName, size = 14) {
    const m = woStatusMeta(statusName)
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="2">${m.svg}</svg>`
}

function woStatusBadgeStyle(statusName) {
    const m = woStatusMeta(statusName)
    return `background:${m.color}1a;color:${m.color}`
}

// คืน <span> badge สำเร็จรูปพร้อม icon
function woStatusBadge(statusName) {
    if (!statusName) return '<span style="color:var(--t3)">—</span>'
    return `<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;${woStatusBadgeStyle(statusName)};white-space:nowrap;display:inline-flex;align-items:center;gap:5px">${woStatusIcon(statusName)}${statusName}</span>`
}
