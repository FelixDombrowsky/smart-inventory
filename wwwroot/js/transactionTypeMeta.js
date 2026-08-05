// transactionTypeMeta.js — icon + สีของแต่ละ Transaction Type ใช้ร่วมกันได้ทุกหน้า (รูปแบบเดียวกับ locationTypeMeta.js / itemTypeMeta.js)
// ใช้ hand-drawn line SVG (24x24 viewbox, stroke-based, ไม่มี fill)

const TX_TYPE_META = {
    // ── Inbound (green) ──
    receive:         { color: '#059669', svg: `<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>` },
    // ── Movement (cyan / blue) ──
    move:            { color: '#0891b2', svg: `<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><line x1="12" y1="13" x2="12" y2="21"/>` },
    transfer:        { color: '#1a6fff', svg: `<rect x="1" y="7" width="13" height="10" rx="1"/><path d="M14 10h3l3 3v4h-6"/><circle cx="6" cy="19" r="1.7"/><circle cx="17" cy="19" r="1.7"/>` },
    // ── Outbound (orange / red) ──
    issue:           { color: '#ea580c', svg: `<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M3 9l2-6h14l2 6"/><path d="M12 17V7m0 0l-3 3m3-3l3 3"/>` },
    consumption:     { color: '#dc2626', svg: `<path d="M13 2L3 14h8l-2 8L21 10h-8l0-8z"/>` },
    // ── Correction / Cancellation ──
    adjust:          { color: '#7c3aed', svg: `<path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7l-2 6a3 3 0 006 0z"/><path d="M19 7l-2 6a3 3 0 006 0z"/>` },
    void:            { color: '#991b1b', svg: `<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>` },
    // ── Split (lot แตกออกเป็นหลาย lot) — สีตระกูล indigo, In เข้มกว่า Out ──
    splitout:        { color: '#818cf8', svg: `<circle cx="12" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M12 7v4M12 11l-6 6M12 11l6 6"/>` },
    splitin:         { color: '#4f46e5', svg: `<circle cx="12" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M12 7v4M12 11l-6 6M12 11l6 6"/>` },
    // ── Merge (หลาย lot รวมเป็นหนึ่ง) — สีตระกูล rose, In เข้มกว่า Out ──
    mergeout:        { color: '#f472b6', svg: `<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M12 17v-4M12 13L6 7M12 13l6-6"/>` },
    mergein:         { color: '#be185d', svg: `<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M12 17v-4M12 13L6 7M12 13l6-6"/>` },
    // ── Assembly (ใช้ใน/ผลิตจาก BOM) — Consume=น้ำตาล(box-minus), Output=เขียวอมฟ้า(box-plus) ──
    assemblyconsume: { color: '#92400e', svg: `<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/>` },
    assemblyoutput:  { color: '#0d9488', svg: `<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>` },
    // ── Reservation — Reserve=amber(lock), Unreserve=slate(unlock) ──
    reserve:         { color: '#d97706', svg: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>` },
    unreserve:       { color: '#94a3b8', svg: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.75-1.5"/>` },
    // ── Assignment — Assign=dark cyan(tag), Unassign=slate(tag-slash) ──
    assign:          { color: '#0e7490', svg: `<path d="M3 11V3h8l10 10-8 8z"/><circle cx="7" cy="7" r="1.5"/>` },
    unassign:        { color: '#94a3b8', svg: `<path d="M3 11V3h8l10 10-8 8z"/><circle cx="7" cy="7" r="1.5"/><line x1="2" y1="22" x2="22" y2="2"/>` },
    // ── Print History — Print=blue, Re-Print=amber (สีเดียวกับ badge ในตาราง Print History) ──
    print:           { color: '#1a6fff', svg: `<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="9" rx="1.5"/><path d="M6 14h12v7H6z"/>` },
    're-print':      { color: '#d97706', svg: `<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="9" rx="1.5"/><path d="M6 14h12v7H6z"/>` },
    // ── Carton Handling (AMR) — เขียว=เพิ่มเข้าระบบ, ฟ้าอ่อน=ยกขึ้น, ฟ้าเข้ม=วางลง (อยู่ตระกูล Movement เดียวกัน) ──
    addcarton:       { color: '#16a34a', svg: `<path d="M3 8l6-4 6 4"/><rect x="3" y="8" width="12" height="12" rx="1.2"/><line x1="19" y1="13" x2="19" y2="19"/><line x1="16" y1="16" x2="22" y2="16"/>` },
    pickupcarton:    { color: '#0284c7', svg: `<path d="M4 12l6-4 6 4"/><rect x="4" y="12" width="12" height="9" rx="1.2"/><path d="M10 8V2m0 0l-3 3m3-3l3 3"/>` },
    dropoffcarton:   { color: '#0369a1', svg: `<path d="M4 13l6-4 6 4"/><rect x="4" y="13" width="12" height="8" rx="1.2"/><path d="M10 2v6m0 0l-3-3m3 3l3-3"/>` },
    // ── Scrap Lifecycle — amber=จองรอพิจารณา, ส้ม=ปฏิเสธ/ตัดสินสแครป, แดงเข้ม=ทำลายแล้ว (ถาวร) ──
    scrapreserve:    { color: '#b45309', svg: `<path d="M2 7h13"/><path d="M6.5 7V5a1 1 0 011-1h3a1 1 0 011 1v2"/><path d="M4 7l1 12a2 2 0 002 2h5a2 2 0 002-2l1-12"/><circle cx="19" cy="6" r="4"/><path d="M19 4v2l1.5 1"/>` },
    scrapreject:     { color: '#c2410c', svg: `<path d="M2 7h13"/><path d="M6.5 7V5a1 1 0 011-1h3a1 1 0 011 1v2"/><path d="M4 7l1 12a2 2 0 002 2h5a2 2 0 002-2l1-12"/><path d="M17 3l5 5M22 3l-5 5"/>` },
    scraped:         { color: '#7f1d1d', svg: `<path d="M2 7h13"/><path d="M6.5 7V5a1 1 0 011-1h3a1 1 0 011 1v2"/><path d="M4 7l1 12a2 2 0 002 2h5a2 2 0 002-2l1-12"/><path d="M16.5 6.5l1.8 1.8L22 4.5"/>` },
}
const TX_TYPE_DEFAULT = { color: '#475569', svg: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>` }

function txTypeMeta(typeName) {
    return TX_TYPE_META[(typeName || '').toLowerCase()] || TX_TYPE_DEFAULT
}

function txTypeIcon(typeName, size = 14) {
    const m = txTypeMeta(typeName)
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="2">${m.svg}</svg>`
}

function txTypeBadgeStyle(typeName) {
    const m = txTypeMeta(typeName)
    return `background:${m.color}1a;color:${m.color}`
}

// คืน <span> badge สำเร็จรูปพร้อม icon — เผื่อหน้าเดิมเรียกตรงๆ
function txTypeBadge(t) {
    if (!t) return '<span style="color:var(--t3)">—</span>'
    return `<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;${txTypeBadgeStyle(t)};white-space:nowrap;display:inline-flex;align-items:center;gap:5px">${txTypeIcon(t)}${t}</span>`
}
