// itemTypeMeta.js — icon + สีของแต่ละ Item Type ใช้ร่วมกันได้ทุกหน้า (รูปแบบเดียวกับ locationTypeMeta.js)
// ใช้ hand-drawn line SVG (24x24 viewbox, stroke-based, ไม่มี fill)

const ITEM_TYPE_META = {
    material:    { color: '#1a6fff', svg: `<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>` },
    subassembly:    { color: '#7c3aed', svg: `<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>` },
    finishedgood:      { color: '#059669', svg: `<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>` },
    consumable:       { color: '#d97706', svg: `<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9"/>` },
    tool: { color: '#dc2626', svg: `<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>` },
    sparepart:     { color: '#0891b2', svg: `<rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>` },
    // ── Logistics unit — Pallet=ไม้/สีน้ำตาล (deck board + ขา), Package=indigo (กล่อง+เทป) ──
    pallet:      { color: '#92400e', svg: `<line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="11" x2="21" y2="11"/><line x1="3" y1="15" x2="21" y2="15"/><path d="M5 15v5M19 15v5"/>` },
    package:     { color: '#4f46e5', svg: `<path d="M3 8l9-5 9 5"/><rect x="3" y="8" width="18" height="13" rx="1.2"/><line x1="12" y1="3" x2="12" y2="8"/><line x1="8" y1="14" x2="16" y2="14"/>` },
    // ── Electronics — PWBA=เขียวอมฟ้า(แผงวงจร+จุดบัดกรี), Injection=ส้ม(หยดพลาสติกหลอมในโมลด์) ──
    pwba:        { color: '#0d9488', svg: `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><circle cx="16" cy="16" r="1.5"/><path d="M8 9.5v3a2 2 0 002 2h2"/><path d="M16 14.5v-3a2 2 0 00-2-2h-2"/>` },
    injection:   { color: '#ea580c', svg: `<path d="M12 3c3 4 6 7.5 6 11a6 6 0 01-12 0c0-3.5 3-7 6-11z"/><path d="M9 21h6"/>` },
    // ── PSD (sensor / photo-sensitive device) — rose, ไอคอนเลนส์/เซนเซอร์ตรวจจับสัญญาณ ──
    psd:         { color: '#be185d', svg: `<circle cx="12" cy="14" r="3"/><path d="M12 11V7"/><path d="M7 9a7 7 0 0110 0"/><path d="M4.5 6.5a10.5 10.5 0 0115 0"/>` },
}
const ITEM_TYPE_DEFAULT = { color: '#475569', svg: `<rect x="4" y="4" width="16" height="16" rx="2"/>` }

function itemTypeMeta(typeName) {
    return ITEM_TYPE_META[(typeName || '').toLowerCase()] || ITEM_TYPE_DEFAULT
}

function itemTypeIcon(typeName, size = 14) {
    const m = itemTypeMeta(typeName)
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="2">${m.svg}</svg>`
}

function itemTypeBadgeStyle(typeName) {
    const m = itemTypeMeta(typeName)
    return `background:${m.color}1a;color:${m.color}`
}

// คง itemTypeBadge() ไว้ให้ใช้แบบเดิมได้ (คืน <span> badge สำเร็จรูปพร้อม icon) — เผื่อหน้าเดิมเรียกตรงๆ
function itemTypeBadge(t) {
    if (!t) return '<span style="color:var(--t3)">—</span>'
    const m = itemTypeMeta(t)
    return `<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;${itemTypeBadgeStyle(t)};white-space:nowrap;display:inline-flex;align-items:center;gap:5px">${itemTypeIcon(t)}${t}</span>`
}
