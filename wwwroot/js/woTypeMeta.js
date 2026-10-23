// woTypeMeta.js — icon + สีของแต่ละ Work Order Type ใช้ร่วมกันได้ทุกหน้า (รูปแบบเดียวกับ woStatusTypeMeta.js / itemTypeMeta.js)
// รับ "ชื่อ type จริง" (จาก /workorder/types) ไม่ใช่ id — หน้าที่มีแค่ id เอง ต้อง map เป็นชื่อก่อนแล้วค่อยส่งเข้ามา
// ชื่อ type มาจากระบบต้นทาง ไม่ fix ตายตัว — เลย match ด้วย keyword ในชื่อ (เช่น "Rework Order" ก็ยังได้สีของ rework)
// ถ้าไม่ match keyword ไหนเลย เลือกสีจาก palette ด้วย hash ของชื่อ — type เดิมได้สีเดิมเสมอ และ type ต่างกันมักได้สีต่างกัน
// badge เป็นทรง tag (มุมโค้งน้อย + ขอบ) ให้แยกออกจาก badge Status ที่เป็นทรง pill ได้ทันทีเวลาวางคู่กัน
// ใช้ hand-drawn line SVG (24x24 viewbox, stroke-based, ไม่มี fill)

const WO_TYPE_META = [
    // Main — รูปกล่อง
    { keys: ['main'],
      color: '#2563eb', svg: `<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><polyline points="3 8 12 13 21 8"/><line x1="12" y1="13" x2="12" y2="21"/><line x1="7.5" y1="5.5" x2="16.5" y2="10.5"/>` },
    // SMT — รูปแผ่น PCB (บอร์ด + ลายวงจร + pad)
    { keys: ['smt'],
      color: '#15803d', svg: `<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="9" y="9" width="6" height="6" rx="0.5"/><path d="M9 11H6V7"/><path d="M15 13h3v4"/><path d="M11 9V6h3"/><path d="M13 15v3h-3"/><circle cx="6" cy="6" r="0.8"/><circle cx="18" cy="18" r="0.8"/>` },
    // งานผลิตปกติ
    { keys: ['standard', 'normal', 'production', 'mass', 'regular', 'make'],
      color: '#2563eb', svg: `<path d="M3 21V10l5 3V10l5 3V6l8 4v11z"/><line x1="3" y1="21" x2="21" y2="21"/>` },
    // งานแก้ไข / ซ่อม
    { keys: ['rework', 'repair', 're-work', 'fix'],
      color: '#ea580c', svg: `<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>` },
    // ตัวอย่าง / ทดลอง / งานวิศวกรรม
    { keys: ['sample', 'trial', 'prototype', 'proto', 'pilot', 'npi', 'engineer', 'test', 'eng'],
      color: '#7c3aed', svg: `<path d="M9 3h6"/><path d="M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><line x1="7.5" y1="15" x2="16.5" y2="15"/>` },
    // แยกชิ้นส่วน
    { keys: ['disassembl', 'teardown', 'dismantle'],
      color: '#0d9488', svg: `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M14 7h3a2 2 0 0 1 2 2v2"/><path d="M10 17H7a2 2 0 0 1-2-2v-2"/>` },
    // ประกอบ
    { keys: ['assembl', 'kitting', 'kit'],
      color: '#4f46e5', svg: `<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><polyline points="4 7.5 12 12 20 7.5"/><line x1="12" y1="12" x2="12" y2="21"/>` },
    // ซื้อ / จ้างภายนอก
    { keys: ['subcon', 'outsource', 'purchase', 'buy', 'external'],
      color: '#0891b2', svg: `<rect x="1" y="6" width="14" height="11" rx="1"/><path d="M15 10h4l3 3v4h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>` },
    // ทิ้ง / ทำลาย
    { keys: ['scrap', 'dispos', 'destroy'],
      color: '#dc2626', svg: `<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>` },
]

// สีสำรองสำหรับ type ที่ไม่ match keyword — เลือกให้ไม่ซ้ำกับสีของ keyword ด้านบน
const WO_TYPE_FALLBACK_COLORS = ['#db2777', '#65a30d', '#ca8a04', '#9333ea', '#0284c7', '#b45309']
const WO_TYPE_DEFAULT_SVG = `<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>`

function woTypeMeta(typeName) {
    const n = String(typeName ?? '').toLowerCase()
    const found = WO_TYPE_META.find(m => m.keys.some(k => n.includes(k)))
    if (found) return found
    let h = 0
    for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return { color: WO_TYPE_FALLBACK_COLORS[h % WO_TYPE_FALLBACK_COLORS.length], svg: WO_TYPE_DEFAULT_SVG }
}

function woTypeIcon(typeName, size = 13) {
    const m = woTypeMeta(typeName)
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${m.svg}</svg>`
}

function woTypeBadgeStyle(typeName) {
    const m = woTypeMeta(typeName)
    return `background:${m.color}14;color:${m.color};border:1px solid ${m.color}40`
}

// คืน <span> badge สำเร็จรูปพร้อม icon
function woTypeBadge(typeName) {
    if (typeName == null || typeName === '') return '<span style="color:var(--t3)">—</span>'
    const esc = String(typeName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    return `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;${woTypeBadgeStyle(typeName)};white-space:nowrap;display:inline-flex;align-items:center;gap:5px">${woTypeIcon(typeName)}${esc}</span>`
}
