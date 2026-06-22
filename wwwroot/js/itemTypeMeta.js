// itemTypeMeta.js — icon + สีของแต่ละ Item Type ใช้ร่วมกันได้ทุกหน้า (รูปแบบเดียวกับ locationTypeMeta.js)
// ใช้ hand-drawn line SVG (24x24 viewbox, stroke-based, ไม่มี fill)

const ITEM_TYPE_META = {
    material:    { color: '#1a6fff', svg: `<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>` },
    subassembly:    { color: '#7c3aed', svg: `<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>` },
    finishedgood:      { color: '#059669', svg: `<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>` },
    consumable:       { color: '#d97706', svg: `<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9"/>` },
    tool: { color: '#dc2626', svg: `<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>` },
    sparepart:     { color: '#0891b2', svg: `<rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>` },
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
