// locationTypeMeta.js — icon + สีของแต่ละ Location Type ใช้ร่วมกันได้ทุกหน้า (ดูตัวอย่างใน Master/Locations.cshtml)
// ใช้ hand-drawn line SVG (24x24 viewbox, stroke-based, ไม่มี fill) ต่อ style เดิมของ 5 type แรก

/* ── SVG ตัวแรกสุด (เก็บไว้เผื่ออยากย้อนกลับไปแบบ keyword includes()) ──
function locHierTypeIcon(typeName) {
    const t = (typeName||'').toLowerCase()
    if (t.includes('plant'))    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>`
    if (t.includes('factory'))  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a6fff" stroke-width="2"><path d="M2 20V8l5-3 5 3V4l10 5v11H2z"/></svg>`
    if (t.includes('warehouse')||t.includes('wh')) return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
    if (t.includes('bus'))      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`
    if (t.includes('prod'))     return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0891b2" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`
}

function locTypeBadgeStyle(typeName) {
    const t = (typeName||'').toLowerCase()
    if (t.includes('plant'))    return 'background:#f1f5f9;color:#64748b'
    if (t.includes('factory'))  return 'background:var(--blue-lt);color:var(--blue)'
    if (t.includes('warehouse')||t.includes('wh')) return 'background:var(--amber-lt);color:var(--amber)'
    if (t.includes('bus'))      return 'background:#fff7ed;color:#ea580c'
    if (t.includes('prod'))     return 'background:#f5f3ff;color:#7c3aed'
    return 'background:#ecfeff;color:#0891b2'
}
── จบส่วน comment SVG ตัวแรกสุด ── */

/* ── เวอร์ชัน Bootstrap Icons (เก็บไว้เผื่ออยากสลับกลับ — เปลี่ยนเป็น custom SVG ด้านล่างแทนแล้ว) ──
const LOC_TYPE_META_BI = {
    warehouse:   { icon: 'bi-house-door',          color: '#d97706' },
    wip:         { icon: 'bi-arrow-repeat',        color: '#d97706' },
    fixture:     { icon: 'bi-wrench-adjustable',   color: '#d97706' },
    spare:       { icon: 'bi-archive',             color: '#d97706' },
    production:  { icon: 'bi-gear-wide-connected', color: '#7c3aed' },
    preassembly: { icon: 'bi-puzzle',              color: '#7c3aed' },
    smt:         { icon: 'bi-cpu',                 color: '#7c3aed' },
    busrun:      { icon: 'bi-bus-front',           color: '#7c3aed' },
    ptm:         { icon: 'bi-tools',                color: '#7c3aed' },
    label:       { icon: 'bi-tag',                  color: '#7c3aed' },
    coating:     { icon: 'bi-droplet',              color: '#7c3aed' },
    calibration: { icon: 'bi-rulers',               color: '#7c3aed' },
    qa:          { icon: 'bi-clipboard-check',      color: '#0891b2' },
    scrap:       { icon: 'bi-trash3',               color: '#dc2626' },
    fg:          { icon: 'bi-box-seam-fill',        color: '#059669' },
    plant:       { icon: 'bi-building',             color: '#1a6fff' },
    factory:     { icon: 'bi-buildings',            color: '#1a6fff' },
    other:       { icon: 'bi-three-dots',           color: '#64748b' },
}
function locHierTypeIcon_BI(typeName) {
    const m = LOC_TYPE_META_BI[(typeName||'').toLowerCase()] || { icon: 'bi-geo-alt-fill', color: '#0891b2' }
    return `<i class="bi ${m.icon}" style="font-size:13px;color:${m.color}"></i>`
}
── จบส่วน comment Bootstrap Icons ── */

// ── Active: custom line-SVG ต่อ style เดิม (Storage=amber, Process=purple, Inspection=cyan, Scrap=red, FinalGoods=green, Facility=blue, Other=slate) ──
const LOC_TYPE_META = {
    // ── Storage (amber) ──
    warehouse:   { color: '#d97706', svg: `<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>` },
    wip:         { color: '#d97706', svg: `<path d="M3 7h18l-2 13H5z"/><path d="M3 7l3-4h12l3 4"/><line x1="9" y1="11" x2="9" y2="17"/><line x1="15" y1="11" x2="15" y2="17"/>` },
    fixture:     { color: '#d97706', svg: `<path d="M7 4v6a3 3 0 003 3h4a3 3 0 003-3V4"/><path d="M7 20v-6a3 3 0 013-3h4a3 3 0 013 3v6"/>` },
    spare:       { color: '#d97706', svg: `<circle cx="12" cy="8" r="4"/><path d="M12 12v9M9 18h6M9 21h6"/>` },
    // ── Process (purple) ──
    production:  { color: '#7c3aed', svg: `<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>` },
    preassembly: { color: '#7c3aed', svg: `<rect x="3" y="3" width="10" height="10" rx="1"/><rect x="11" y="11" width="10" height="10" rx="1"/>` },
    smt:         { color: '#7c3aed', svg: `<rect x="7" y="7" width="10" height="10" rx="1"/><line x1="9" y1="2" x2="9" y2="7"/><line x1="15" y1="2" x2="15" y2="7"/><line x1="9" y1="17" x2="9" y2="22"/><line x1="15" y1="17" x2="15" y2="22"/><line x1="2" y1="9" x2="7" y2="9"/><line x1="2" y1="15" x2="7" y2="15"/><line x1="17" y1="9" x2="22" y2="9"/><line x1="17" y1="15" x2="22" y2="15"/>` },
    busrun:      { color: '#7c3aed', svg: `<circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/>` },
    //busrun:      { color: '#7c3aed', svg: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>` },
    ptm:         { color: '#7c3aed', svg: `<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>` },
    label:       { color: '#7c3aed', svg: `<path d="M3 11V3h8l10 10-8 8z"/><circle cx="7" cy="7" r="1.5"/>` },
    coating:     { color: '#7c3aed', svg: `<path d="M12 2C8 8 5 11.5 5 15a7 7 0 0014 0c0-3.5-3-7-7-13z"/>` },
    calibration: { color: '#7c3aed', svg: `<circle cx="12" cy="12" r="9"/><line x1="12" y1="12" x2="16" y2="8"/><circle cx="12" cy="12" r="1"/>` },
    // ── Inspection (cyan) ──
    qa:          { color: '#0891b2', svg: `<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><polyline points="9 12 11 14 15 10"/>` },
    // ── Scrap (red) ──
    scrap:       { color: '#dc2626', svg: `<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>` },
    // ── FinalGoods (green) ──
    fg:          { color: '#059669', svg: `<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><line x1="12" y1="13" x2="12" y2="21"/>` },
    // ── Facility (blue) ──
    plant:       { color: '#1a6fff', svg: `<rect x="2" y="7" width="20" height="15" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>` },
    factory:     { color: '#1a6fff', svg: `<path d="M2 20V8l5-3 5 3V4l10 5v11H2z"/>` },
    // ── Other (slate) ──
    other:       { color: '#64748b', svg: `<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>` },
}
const LOC_TYPE_DEFAULT = { color: '#0891b2', svg: `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>` }

function locTypeMeta(typeName) {
    return LOC_TYPE_META[(typeName || '').toLowerCase()] || LOC_TYPE_DEFAULT
}

function locHierTypeIcon(typeName) {
    const m = locTypeMeta(typeName)
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="2">${m.svg}</svg>`
}

function locTypeBadgeStyle(typeName) {
    const m = locTypeMeta(typeName)
    return `background:${m.color}1a;color:${m.color}`
}
