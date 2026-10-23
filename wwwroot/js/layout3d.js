// layout3d.js — 3D bubble map บนผัง "New layout_ BUSRUN(WMS_OMS)" ของ Dashboard (ES module, ใช้ three.js ที่ vendor ไว้ใน lib/three)
// หน่วยเป็นเมตร: แกน x = ซ้าย→ขวาของแบบ, แกน z = บน(PD Lines)→ล่าง(ถนน/WG2), y = ความสูง
// ขนาด zone เอาจากตัวเลขในแบบ PDF หน้า 1 (ภาพรวม) + หน้า 3 (ช่อง PR/RE) — ระยะห่างระหว่างก้อนใหญ่ๆ เป็นแบบ schematic
// ชื่อบนผัง (RE_00, PR_01, ...) คือ "ชื่อ" ของ location ใน master ไม่ใช่ locationCode (LOC-000246) — ต้อง map ชื่อ→code ก่อน
// โหลดแบบ on-demand: เปิดผังแสดงแค่แผนผัง zone — คลิก location (zone) ถึงยิง POST /inventory/lots { locationCode, lotStatus: 'Available' }
// ของ location นั้น (รวม location ลูก) แล้วเก็บไว้ (Refresh / SignalR → โหลดใหม่เฉพาะ zone ที่เปิดอยู่, zone อื่น mark stale)
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'

const L = {
    en: {
        title: '3D Layout', mapTitle: 'Select map',
        search: 'Find part / lot on map…', colorType: 'Color: Item type', colorAvail: 'Color: Availability',
        refresh: 'Refresh', overview: 'Overview', top: 'Top view', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fullscreen: 'Full screen',
        hint: 'Drag: rotate · Right-drag: pan · Wheel: zoom · Click a bubble to zoom in',
        loading: 'Loading stock on layout…', loadFail: 'Could not load stock data', retry: 'Retry', noWebgl: 'This browser cannot display 3D (WebGL is unavailable).',
        updated: 'Updated', lots: 'Lots', parts: 'Parts', onHand: 'On hand', available: 'Available', reserved: 'Reserved',
        locations: 'Locations with stock', back: 'Overview',
        drillHint: 'Each bubble = 1 Part No. · size = number of lots. Click a bubble to see its lots.',
        results: 'Locations containing', noMatch: 'No lot on this layout matches', lotNo: 'Lot No.', loc: 'Location',
        showInSummary: 'Show in Stock Summary', noLots: 'No lots in this location', size: 'Size', empty: 'empty',
        notMatched: 'Not found in Location master (by name)', loadErr: 'load failed',
        availFull: 'Fully available', availPartial: 'Partly reserved', availNone: 'Fully reserved',
        legendBubble: 'Bubble size = lots',
        groupPart: 'P/N', groupLine: 'Line', groupTip: 'Group bubbles by Part No. or by Line',
        ageBtn: '> 1 day', ageTip: 'Show only lots that have been in their location for more than 1 day (the longer, the redder)',
        lines: 'Lines', noLine: '(No Line)', part: 'Part No.', inLoc: 'In loc', ageLegend: 'Time in location',
        drillHintLine: '1 bubble = 1 Line · size = number of lots. Click a bubble to see its lots.',
        metaLoading: 'Loading line / time-in-location data…',
        clickHint: 'Click a location on the map (or in the list) to load its lots.', loadedLocs: 'Locations loaded', notLoaded: 'not loaded',
        zoneLoading: 'Loading lots in this location…',
        cat: { RE: 'Receive Material', PR: 'Prepare Material', BR: 'BUSRUN – wait to PD' },
        rooms: { maint: 'Busrun', office: 'ME/TE', fqc: 'FQC room / Lift / WIP room', pd: 'PD Lines', wg2: 'WG2', agvArea: 'AGV Area', walk: 'Walk', free: 'Free', stairs: 'Stairs' },
    },
    th: {
        title: '3D Layout', mapTitle: 'เลือกผัง',
        search: 'ค้นหา Part / Lot บนผัง…', colorType: 'สี: ตาม Item type', colorAvail: 'สี: ตามยอดคงเหลือ',
        refresh: 'รีเฟรช', overview: 'ภาพรวม', top: 'มุมมองด้านบน', zoomIn: 'ซูมเข้า', zoomOut: 'ซูมออก', fullscreen: 'เต็มจอ',
        hint: 'ลาก: หมุน · คลิกขวาลาก: เลื่อน · ล้อเมาส์: ซูม · คลิก bubble เพื่อซูมเข้า',
        loading: 'กำลังโหลดสต็อกบนผัง…', loadFail: 'โหลดข้อมูลสต็อกไม่สำเร็จ', retry: 'ลองใหม่', noWebgl: 'เบราว์เซอร์นี้แสดง 3D ไม่ได้ (ไม่รองรับ WebGL)',
        updated: 'อัปเดต', lots: 'Lot', parts: 'Part', onHand: 'คงคลัง', available: 'พร้อมใช้', reserved: 'จองแล้ว',
        locations: 'Location ที่มีของ', back: 'ภาพรวม',
        drillHint: '1 bubble = 1 Part No. · ขนาด = จำนวน lot · คลิก bubble เพื่อดู lot',
        results: 'Location ที่มี', noMatch: 'ไม่พบ lot บนผังที่ตรงกับ', lotNo: 'Lot No.', loc: 'Location',
        showInSummary: 'ดูใน Stock Summary', noLots: 'ไม่มี lot ใน location นี้', size: 'ขนาด', empty: 'ว่าง',
        notMatched: 'ไม่พบชื่อนี้ใน Location master', loadErr: 'โหลดไม่สำเร็จ',
        availFull: 'พร้อมใช้ทั้งหมด', availPartial: 'จองไปบางส่วน', availNone: 'จองหมดแล้ว',
        legendBubble: 'ขนาด bubble = จำนวน lot',
        groupPart: 'P/N', groupLine: 'Line', groupTip: 'จัดกลุ่ม bubble ตาม Part No. หรือตาม Line',
        ageBtn: '> 1 วัน', ageTip: 'แสดงเฉพาะ Lot ที่อยู่ใน Location เกิน 1 วัน (ยิ่งนานยิ่งแดง)',
        lines: 'Line', noLine: '(ไม่มี Line)', part: 'Part No.', inLoc: 'อยู่มา', ageLegend: 'เวลาที่อยู่ใน Location',
        drillHintLine: '1 bubble = 1 Line · ขนาด = จำนวน lot · คลิก bubble เพื่อดู lot',
        metaLoading: 'กำลังโหลดข้อมูล Line / เวลาที่อยู่ใน Location…',
        clickHint: 'คลิก location บนผัง (หรือในรายการ) เพื่อโหลด lot ของ location นั้น', loadedLocs: 'Location ที่โหลดแล้ว', notLoaded: 'ยังไม่โหลด',
        zoneLoading: 'กำลังโหลด lot ใน location นี้…',
        cat: { RE: 'รับวัสดุ (Receive)', PR: 'เตรียมวัสดุ (Prepare)', BR: 'BUSRUN – รอส่งเข้า PD' },
        rooms: { maint: 'Busrun', office: 'ME/TE', fqc: 'ห้อง FQC / ลิฟต์ / ห้อง WIP', pd: 'PD Lines', wg2: 'WG2', agvArea: 'พื้นที่ AGV', walk: 'ทางเดิน', free: 'ว่าง', stairs: 'บันได' },
    },
}
const tr = () => L[(typeof getCurrentLang === 'function' && getCurrentLang()) || 'en'] || L.en

const CAT = {
    RE: { pad: '#f7d3c3', edge: '#d9724a' },
    PR: { pad: '#c3ebce', edge: '#2e9b58' },
    BR: { pad: '#c6d9f5', edge: '#3a70c6' },
}
const AVAIL_COLORS = { full: '#10b981', partial: '#f59e0b', none: '#ef4444' }
const DIM = new THREE.Color('#cfd5de')
const DIM_PAD = new THREE.Color('#e4e7ec')
const SPHERE = new THREE.SphereGeometry(1, 36, 22)
const PAD_H = 0.06

// ── ผังที่เลือกได้ในหัวการ์ด (dropdown #l3dMap) — ตอนนี้มีแค่ Busrun (ผังด้านล่างทั้งหมด = PDF "New layout_ BUSRUN(WMS_OMS)")
// เพิ่มผังใหม่: เพิ่ม entry ที่นี่ + แยก buildZoneDefs()/buildStatic() ของผังนั้น แล้วสลับตาม id ตอนเปลี่ยน dropdown
const MAPS = [{ id: 'busrun', name: 'Busrun' }]
const currentMap = MAPS[0]

// ── Layout (เมตร) ──
const BLD_W = 98, BLD_D = 34.5
const STRIP_Z0 = 6.6, STRIP_Z1 = 7.6
const STRIP = [
    ['free', 2.42], ['col', 'C13'], ['br', 'BR_00', 6.3], ['door', 2.4],
    ['col', 'C12'], ['br', 'BR_01', 8.4], ['col', 'C11'], ['br', 'BR_02', 8.4], ['col', 'C10'], ['br', 'BR_03', 8.4], ['col', 'C9'], ['door', 3.0],
    ['free', 4.2], ['col', 'C8'], ['br', 'BR_04', 8.4], ['col', 'C7'], ['br', 'BR_05', 8.4], ['col', 'C6'], ['free', 2.1], ['door', 2.4],
    ['free', 4.2], ['col', 'C5'], ['br', 'BR_06', 8.4], ['col', 'C4'], ['br', 'BR_07', 8.4], ['col', 'C3'], ['br', 'BR_08', 6.3], ['door', 2.2],
]
const X0 = 29.3, Z0 = 20
const P = (x0, z0, x1, z1) => ({ x0: X0 + x0, z0: Z0 + z0, x1: X0 + x1, z1: Z0 + z1 })

function buildZoneDefs() {
    const zones = [], strip = []
    let x = 1.0
    for (const [kind, a, b] of STRIP) {
        const w = kind === 'col' ? 0.2 : (kind === 'br' ? b : a)
        const r = { x0: x, z0: STRIP_Z0, x1: x + w, z1: STRIP_Z1 }
        if (kind === 'br') zones.push({ code: a, cat: 'BR', dim: `${b} × 1 m`, rects: [r] })
        else strip.push({ kind, code: kind === 'col' ? a : null, w, ...r })
        x += w
    }
    zones.push(
        { code: 'PR_00', cat: 'PR', dim: '6.3 × 3.4 m', rects: [P(2.1, 2.7, 3.5, 4.7), P(4.2, 2.7, 5.6, 4.7), P(5.6, 2.7, 7.0, 4.7), P(7.0, 2.7, 8.4, 4.7)] },
        { code: 'PR_01', cat: 'PR', dim: '8.4 × 2 m', rects: [P(0, 0, 1.4, 2), P(2.1, 0, 3.5, 2), P(4.2, 0, 5.6, 2), P(5.6, 0, 7.0, 2), P(7.0, 0, 8.4, 2)] },
        { code: 'PR_02', cat: 'PR', dim: '4.15 × 3.4 m', rects: [P(12.5, 2.65, 15.5, 6.05), P(15.5, 2.65, 16.65, 6.05)] },
        { code: 'PR_03', cat: 'PR', dim: '9 × 1.15 m', rects: [P(13.0, 0, 22.0, 1.15)] },
        { code: 'RE_00', cat: 'RE', dim: '8.5 × 6 m + 1.3 × 6 m', rects: [P(0, 8.5, 1.3, 14.5), P(1.3, 8.5, 9.8, 14.5)] },
        { code: 'RE_01', cat: 'RE', dim: '8.5 × 6 m', rects: [P(10.0, 8.5, 18.5, 14.5)] },
        { code: 'RE_02', cat: 'RE', dim: '8 × 6 m', rects: [P(18.7, 8.5, 26.7, 14.5)] },
    )
    zones.forEach(z => {
        z.box = z.rects.reduce((b, r) => ({ x0: Math.min(b.x0, r.x0), z0: Math.min(b.z0, r.z0), x1: Math.max(b.x1, r.x1), z1: Math.max(b.z1, r.z1) }),
            { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity })
        z.cx = (z.box.x0 + z.box.x1) / 2
        z.cz = (z.box.z0 + z.box.z1) / 2
        z.norm = normCode(z.code)
        z.lots = []
        z.parts = new Map()
        z.status = 'idle'
        z.root = null
        z.locCodes = []
    })
    return { zones, strip }
}

function normCode(c) { return String(c || '').toUpperCase().replace(/[\s_\-.]/g, '') }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])) }
function num(n) { return Number(n || 0).toLocaleString() }
function typeColor(t) { return typeof itemTypeMeta === 'function' ? itemTypeMeta(t).color : '#475569' }

// ─────────────────────────────────────────────────────────────────────────────
const S = {
    zones: [], zoneByCode: new Map(), codeToZone: new Map(), locByCode: new Map(),
    filter: '', colorMode: 'type', selected: null, focusPart: null, focusLot: null,
    drill: [], loadedAt: null, loading: false,
    // groupBy: bubble ใน location จัดกลุ่มตาม 'part' (Part No.) หรือ 'line'; ageOnly: แสดงเฉพาะ lot ที่อยู่เกิน 1 วัน + สีตามอายุ
    // meta / metaLoading: เลิกใช้แล้ว — /inventory/lots ที่โหลดตอนคลิก location มี Line + เวลาใน location มาในตัว
    groupBy: 'part', ageOnly: false, meta: null, metaLoading: false,
}

// ── อายุของ lot ใน location (นาที) — ใช้กับ filter "> 1 day" และสีไล่ เหลือง (1 วัน) → ส้ม (3 วัน) → แดงเข้ม (7 วัน+) ──
const AGE_MIN = 1440
const AGE_STOPS = [[1440, [250, 204, 21]], [4320, [249, 115, 22]], [10080, [185, 28, 28]]]
function ageColor(min) {
    if (min == null) return '#94a3b8'
    if (min <= AGE_STOPS[0][0]) return `rgb(${AGE_STOPS[0][1].join(',')})`
    for (let i = 1; i < AGE_STOPS.length; i++) {
        if (min <= AGE_STOPS[i][0]) {
            const [m0, c0] = AGE_STOPS[i - 1], [m1, c1] = AGE_STOPS[i], k = (min - m0) / (m1 - m0)
            return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(',')})`
        }
    }
    return `rgb(${AGE_STOPS[AGE_STOPS.length - 1][1].join(',')})`
}
function fmtAge(min) {
    if (min == null) return '—'
    return min >= 1440 ? `${(min / 1440).toFixed(1)} d` : min >= 60 ? `${(min / 60).toFixed(1)} h` : `${Math.round(min)} m`
}
function lotVisible(l) { return !S.ageOnly || (l.inLoc ?? -1) >= AGE_MIN }
function zoneLots(z) { return S.ageOnly ? z.lots.filter(lotVisible) : z.lots }
function zoneMaxAge(z) { return zoneLots(z).reduce((m, l) => l.inLoc != null && l.inLoc > (m ?? -1) ? l.inLoc : m, null) }

// กลุ่มของ bubble ใน location: ตาม Part No. หรือตาม Line (lot ที่ไม่มี line → "(No Line)")
function zoneGroups(z) {
    const map = new Map(), noLine = tr().noLine
    zoneLots(z).forEach(l => {
        const key = S.groupBy === 'line' ? (l.line || noLine) : l.partNo
        let g = map.get(key)
        if (!g) map.set(key, g = { key, partNo: l.partNo, description: l.description, itemType: l.itemType, unit: l.unit,
            lots: [], onHand: 0, available: 0, reserved: 0, parts: new Set(), types: new Map(), maxAge: null })
        g.lots.push(l)
        g.onHand += l.onHandQty; g.available += l.available; g.reserved += l.reservedQty
        g.parts.add(l.partNo)
        if (l.itemType) g.types.set(l.itemType, (g.types.get(l.itemType) || 0) + 1)
        if (l.inLoc != null && l.inLoc > (g.maxAge ?? -1)) g.maxAge = l.inLoc
    })
    const groups = [...map.values()]
    // โหมด Line: สีตาม Item type ใช้ type ที่มีมากที่สุดในกลุ่ม
    if (S.groupBy === 'line') groups.forEach(g => { g.itemType = [...g.types.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''; g.description = '' })
    return groups.sort((a, b) => b.lots.length - a.lots.length || String(a.key).localeCompare(String(b.key)))
}
function groupColor(g) {
    if (S.ageOnly) return ageColor(g.maxAge)
    return S.colorMode === 'avail' ? AVAIL_COLORS[availKey(g.onHand, g.available)] : typeColor(g.itemType)
}
function groupMatches(g) {
    return !S.filter || g.lots.some(lotMatches) || (S.groupBy === 'line' && String(g.key).toLowerCase().includes(S.filter))
}
let zonesMapped
const zonesMappedPromise = new Promise(res => { zonesMapped = res })

const $ = id => document.getElementById(id)
let renderer, labelRenderer, scene, camera, controls, viewport, raycaster
const pointer = new THREE.Vector2()
let padMeshes = [], nearLabels = [], staticLabels = []
let hoverDirty = false, hoverHit = null, downAt = null, anim = null, running = false, rafId = 0

function init() {
    viewport = $('l3dViewport')
    if (!viewport) return
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch (e) {
        viewport.innerHTML = `<div class="l3d-msg">${esc(tr().noWebgl)}</div>`
        return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    viewport.prepend(renderer.domElement)
    renderer.domElement.classList.add('l3d-canvas')

    labelRenderer = new CSS2DRenderer()
    labelRenderer.domElement.className = 'l3d-labels'
    renderer.domElement.after(labelRenderer.domElement)

    scene = new THREE.Scene()
    scene.background = new THREE.Color('#e8edf4')
    camera = new THREE.PerspectiveCamera(42, 2, 0.1, 600)

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb6c2d4, 2.2))
    const sun = new THREE.DirectionalLight(0xffffff, 2.2)
    sun.position.set(30, 80, -10)
    sun.target.position.set(BLD_W / 2, 0, BLD_D / 2)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 50, bottom: -50, near: 10, far: 200 })
    sun.shadow.bias = -0.0005
    scene.add(sun, sun.target)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.09
    controls.screenSpacePanning = false
    controls.maxPolarAngle = Math.PI * 0.48
    controls.minDistance = 2.5
    controls.maxDistance = 190
    controls.addEventListener('start', () => { anim = null })

    raycaster = new THREE.Raycaster()
    const { zones, strip } = buildZoneDefs()
    S.zones = zones
    zones.forEach(z => S.zoneByCode.set(z.code, z))
    buildStatic(strip)
    buildZones()

    new ResizeObserver(resize).observe(viewport)
    resize()
    fit(areaBox('all'), false, true)
    introZoom()

    const el = renderer.domElement
    el.addEventListener('pointermove', e => { setPointer(e); hoverDirty = true })
    el.addEventListener('pointerleave', () => { setHover(null); hideTip() })
    el.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY } })
    el.addEventListener('pointerup', e => {
        if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return
        setPointer(e)
        const hit = pick()
        if (!hit) return
        if (hit.part) selectZone(hit.zone.code, { part: S.focusPart === hit.part.partNo ? null : hit.part.partNo })
        else if (S.selected !== hit.zone.code) selectZone(hit.zone.code, { fly: true })
    })

    new IntersectionObserver(entries => { onScreen = entries[0].isIntersecting; onVisibility() }).observe(viewport)
    document.addEventListener('visibilitychange', onVisibility)

    wireUi()
    applyLang()
    start()
    loadData()
}

// ── Static scene (พื้น ห้อง ถนน ป้าย) ──
function mat(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts }) }
function box(w, h, d, material, x, y, z, { cast = false, receive = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    m.position.set(x, y, z)
    m.castShadow = cast
    m.receiveShadow = receive
    scene.add(m)
    return m
}
function flat(r, color, y = 0.012) {
    return box(r.x1 - r.x0, 0.02, r.z1 - r.z0, mat(color), (r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2)
}
function edges(mesh, color, opacity = 1) {
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }))
    l.position.copy(mesh.position)
    scene.add(l)
    return l
}
function label(html, cls, x, y, z, near = false) {
    const div = document.createElement('div')
    div.className = cls
    div.innerHTML = html
    const o = new CSS2DObject(div)
    o.position.set(x, y, z)
    scene.add(o)
    if (near) nearLabels.push(o)
    return o
}
function roomLabel(key, x, y, z, cls = 'l3d-room', near = false) {
    const o = label('', cls, x, y, z, near)
    o.userData.key = key
    staticLabels.push(o)
    return o
}
function wall(x0, z0, x1, z1, h = 2.2, t = 0.15) {
    const w = Math.max(Math.abs(x1 - x0), t), d = Math.max(Math.abs(z1 - z0), t)
    return box(w, h, d, mat('#94a3b8', { transparent: true, opacity: 0.55 }), (x0 + x1) / 2, h / 2, (z0 + z1) / 2, { cast: true })
}
function room(r, key, h = 3.2) {
    const m = box(r.x1 - r.x0, h, r.z1 - r.z0, mat('#cbd5e1', { transparent: true, opacity: 0.28, depthWrite: false }),
        (r.x0 + r.x1) / 2, h / 2, (r.z0 + r.z1) / 2, { receive: false })
    edges(m, '#64748b', 0.8)
    flat(r, '#e2e8f0', 0.008)
    roomLabel(key, (r.x0 + r.x1) / 2, h + 0.4, (r.z0 + r.z1) / 2)
}

function buildStatic(strip) {
    box(420, 0.1, 420, mat('#dde3ec'), BLD_W / 2, -0.12, 30)
    box(BLD_W, 0.1, BLD_D, mat('#f7f8fa'), BLD_W / 2, -0.05, BLD_D / 2)

    flat({ x0: 0, z0: 0, x1: BLD_W, z1: 6 }, '#ebe7fb')
    const conv = mat('#a5b4fc'), leg = mat('#64748b')
    for (const z of [1.6, 3.6]) {
        for (let x = 3; x < BLD_W - 8; x += 24) {
            box(20, 0.12, 0.9, conv, x + 10, 0.85, z, { cast: true })
            for (let lx = x + 0.5; lx < x + 20; lx += 4.8) box(0.12, 0.8, 0.8, leg, lx, 0.4, z)
        }
    }
    roomLabel('pd', BLD_W / 2, 2.2, 3)

    let wx = 0
    strip.forEach(s => { if (s.kind === 'door') { wall(wx, 6.3, s.x0, 6.3); wx = s.x1 } })
    wall(wx, 6.3, BLD_W, 6.3)
    strip.forEach(s => {
        if (s.kind === 'col') {
            const c = box(0.2, 3.4, 0.6, mat('#94a3b8'), (s.x0 + s.x1) / 2, 1.7, (s.z0 + s.z1) / 2, { cast: true })
            label(esc(s.code), 'l3d-mini', c.position.x, 3.7, c.position.z, true)
        } else if (s.kind === 'free') {
            const m = box(s.w, 0.03, 1, mat('#fdf0c2'), (s.x0 + s.x1) / 2, 0.015, (s.z0 + s.z1) / 2)
            edges(m, '#e0b100', 0.8)
            roomLabel('free', (s.x0 + s.x1) / 2, 0.5, (s.z0 + s.z1) / 2, 'l3d-mini', true)
        }
    })

    flat({ x0: 0, z0: 7.6, x1: BLD_W, z1: 11 }, '#eef2f7')
    const dash = mat('#facc15')
    for (let x = 1; x < BLD_W - 1; x += 2.6) box(1.3, 0.03, 0.14, dash, x + 0.65, 0.03, 9.3)
    label('AGV', 'l3d-mini l3d-agv', 3, 0.4, 9.3, true)

    // ห้อง Busrun / ME-TE ติดกับแถว PR (z=20) — เตี้ยลง (1.8 m) + ถอยขอบหน้าเข้ามา 0.8 m ไม่ให้กล่องโปร่งบังป้าย/พื้น location PR สีเขียว
    room({ x0: 1, z0: 11, x1: 40.3, z1: 19.2 }, 'maint', 1.8)
    room({ x0: 42.1, z0: 11, x1: 63.5, z1: 19.2 }, 'office', 1.8)
    room({ x0: 69, z0: 11, x1: 97, z1: 19 }, 'fqc', 1.8)
    flat({ x0: 40.3, z0: 11, x1: 42.1, z1: 19.2 }, '#f1f5f9')
    roomLabel('walk', 41.2, 0.4, 15.5, 'l3d-mini', true)

    const agv = flat(P(22.0, 0, 34.2, 1.15), '#e2e8f0')
    edges(agv, '#94a3b8')
    roomLabel('agvArea', X0 + 28.1, 0.5, Z0 + 0.58, 'l3d-mini', true)

    flat(P(0, 6.6, 16.8, 8.5), '#f1f5f9')
    roomLabel('walk', X0 + 8.4, 0.4, Z0 + 7.55, 'l3d-mini', true)
    roomLabel('walk', X0 + 11.4, 0.4, Z0 + 1.9, 'l3d-mini', true)

    const stairMat = mat('#cbd5e1')
    for (let i = 0; i < 8; i++) {
        const h = 0.17 * (i + 1)
        box(2.0, h, 0.29, stairMat, X0 + 1.0, h / 2, Z0 + 2.9 + i * 0.29 + 0.145, { cast: true })
    }
    roomLabel('stairs', X0 + 1.0, 1.9, Z0 + 4.0, 'l3d-mini', true)

    wall(0, 0, BLD_W, 0, 1.2)
    wall(0, 0, 0, BLD_D, 1.2)
    wall(BLD_W, 0, BLD_W, BLD_D, 1.2)

    box(BLD_W, 0.06, 10, mat('#4b5563'), BLD_W / 2, 0, BLD_D + 5)   // ถนนกว้างเท่าอาคาร (เดิมยื่นเกินซ้าย-ขวาข้างละ 10 m)
    const white = mat('#f8fafc'), grey = mat('#9ca3af')
    for (let i = 0, x = 2; x < BLD_W; i++, x += 9) box(5.5, 0.03, 0.55, i % 2 ? grey : white, x + 2.75, 0.045, BLD_D + 4.6)
    const wg2 = box(BLD_W, 4, 10.5, mat('#cbd5e1', { transparent: true, opacity: 0.4, depthWrite: false }), BLD_W / 2, 2, BLD_D + 15.25, { receive: false })
    edges(wg2, '#64748b', 0.7)
    roomLabel('wg2', BLD_W / 2, 4.5, BLD_D + 15.25, 'l3d-room l3d-room-big')
}

// ── Zones: พื้น + bubble ใหญ่ (จำนวน lot ทั้ง location) + ป้าย ──
function buildZones() {
    S.zones.forEach(z => {
        const c = CAT[z.cat]
        z.mat = mat(c.pad, { emissive: new THREE.Color(0x000000) })
        z.baseColor = new THREE.Color(c.pad)
        z.rects.forEach(r => {
            const m = box(r.x1 - r.x0, PAD_H, r.z1 - r.z0, z.mat, (r.x0 + r.x1) / 2, PAD_H / 2, (r.z0 + r.z1) / 2)
            m.userData.zone = z
            edges(m, c.edge)
            padMeshes.push(m)
        })
        z.bubbleMat = new THREE.MeshStandardMaterial({ color: c.edge, transparent: true, opacity: 0.62, roughness: 0.3, metalness: 0.05, depthWrite: false })
        z.bubble = new THREE.Mesh(SPHERE, z.bubbleMat)
        z.bubble.userData.zone = z
        z.bubble.visible = false
        z.bubble.castShadow = true
        z.bubble.position.set(z.cx, 0, z.cz)
        scene.add(z.bubble)

        z.tag = label('', 'l3d-tag', z.cx, 1.2, z.cz)
        z.tag.element.dataset.cat = z.cat
        z.tag.element.addEventListener('click', e => { e.stopPropagation(); selectZone(z.code, { fly: true }) })
        z.tag.element.addEventListener('mouseenter', () => { setHover({ zone: z }); showTip(zoneTipHtml(z), z.tag.element) })
        z.tag.element.addEventListener('mouseleave', () => { setHover(null); hideTip() })
    })
    updateZoneVisuals()
}

// ยอดนับที่โหลดไว้ (ยังไม่ได้โหลด lot เต็มของ zone): ปกติ = z.count, โหมด > 1 day = z.countAge — null = ยังไม่รู้
function zoneCachedCount(z) { return S.ageOnly ? z.countAge : z.count }
function zoneCount(z) {
    if (!z.loadedOnce) return zoneCachedCount(z) ?? 0   // ยังไม่คลิกโหลด lot เต็ม → ใช้ยอด totalLot จาก countZones()
    const lots = zoneLots(z); return S.filter ? lots.filter(lotMatches).length : lots.length
}
function updateZoneVisuals() {
    const max = Math.max(1, ...S.zones.map(zoneCount))
    S.zones.forEach(z => {
        const n = zoneCount(z)
        const r = n ? 0.7 + 2.5 * Math.sqrt(n / max) : 0
        const drilled = S.selected === z.code
        z.bubble.visible = false   // ไม่ใช้ bubble ใหญ่ต่อ zone แล้ว — จำนวน lot อยู่บนป้ายแทน
        z.bubble.scale.setScalar(Math.max(r, 0.001))
        z.bubble.position.y = r + PAD_H
        const hov = hoverHit?.zone === z && !hoverHit.part
        z.bubbleMat.color.set(S.ageOnly ? ageColor(zoneMaxAge(z)) : CAT[z.cat].edge)
        z.bubbleMat.emissive.set(hov ? '#ffffff' : '#000000')
        z.bubbleMat.emissiveIntensity = hov ? 0.25 : 0
        z.tag.position.y = 1.0

        const el = z.tag.element
        // ยังไม่โหลด = โชว์แค่ชื่อ zone / กำลังโหลด = … / โหลดแล้ว = จำนวน lot
        const known = z.loadedOnce || zoneCachedCount(z) != null
        const txt = z.status === 'nomatch' ? '?' : z.status === 'err' ? '!' : known ? num(n) : z.root ? '…' : ''
        el.innerHTML = `<span class="c">${esc(z.code)}</span>${txt ? `<span class="n">${txt}</span>` : ''}`
        el.classList.toggle('empty', known && z.status !== 'loading' && n === 0)
        el.classList.toggle('sel', drilled)

        const miss = S.filter && z.loadedOnce && n === 0
        z.mat.color.copy(miss ? DIM_PAD : z.baseColor)
        z.mat.emissive.set(drilled ? CAT[z.cat].edge : '#000000')
        z.mat.emissiveIntensity = drilled ? 0.3 : 0
    })
}

// ── Drill-down: bubble เล็กใน location ที่เลือก — 1 bubble = 1 Part No., ขนาด = จำนวน lot ──
function clearDrill() {
    S.drill.forEach(b => { scene.remove(b.mesh, b.label); b.mesh.material.dispose() })
    S.drill = []
}
function packCircles(box, radii) {
    const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2
    const halfW = (box.x1 - box.x0) / 2, halfD = (box.z1 - box.z0) / 2
    const limit = Math.max(halfW, halfD) * 1.5
    for (let scale = 1, tries = 0; tries < 12; tries++, scale *= 0.86) {
        const placed = []
        let ok = true
        for (const r0 of radii) {
            const r = r0 * scale
            let pos = null
            for (let k = 0; k < 6000; k++) {
                const rad = 0.02 * k, ang = k * 0.5
                if (rad > limit) break
                const x = cx + rad * Math.cos(ang), z = cz + rad * Math.sin(ang)
                if (x - r < box.x0 - 0.05 || x + r > box.x1 + 0.05 || z - r < box.z0 - 0.05 || z + r > box.z1 + 0.05) continue
                if (placed.every(p => Math.hypot(p.x - x, p.z - z) >= p.r + r + 0.05)) { pos = { x, z, r }; break }
            }
            if (!pos) { ok = false; break }
            placed.push(pos)
        }
        if (ok) return placed
    }
    return radii.map((r, i) => ({ x: box.x0 + ((i + 0.5) / radii.length) * (box.x1 - box.x0), z: cz, r: Math.min(r * 0.3, halfD * 0.9) }))
}
function buildDrill() {
    clearDrill()
    const z = S.zoneByCode.get(S.selected)
    if (!z) return
    const parts = zoneGroups(z)   // 1 bubble = 1 กลุ่ม (Part No. หรือ Line ตาม S.groupBy)
    if (!parts.length) return
    const maxC = parts[0].lots.length
    const halfMin = Math.min(z.box.x1 - z.box.x0, z.box.z1 - z.box.z0) / 2
    const radii = parts.map(p => Math.min(halfMin * 0.95, 0.22 + 0.8 * Math.sqrt(p.lots.length / maxC)))
    const pos = packCircles(z.box, radii)
    parts.forEach((p, i) => {
        const { x, z: zz, r } = pos[i]
        const mesh = new THREE.Mesh(SPHERE, new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.85, roughness: 0.3, metalness: 0.05 }))
        mesh.scale.setScalar(r)
        mesh.position.set(x, r + PAD_H, zz)
        mesh.castShadow = true
        mesh.userData = { zone: z, part: p }
        scene.add(mesh)
        const lbl = label(`<b>${num(p.lots.length)}</b><span class="pn">${esc(p.key)}</span>`, 'l3d-bub', x, 2 * r + PAD_H + 0.12, zz)
        S.drill.push({ mesh, label: lbl, part: p })
    })
    recolorDrill()
}
function availKey(onHand, avail) { return avail >= onHand - 1e-9 ? 'full' : avail > 0 ? 'partial' : 'none' }
function recolorDrill() {
    S.drill.forEach(b => {
        const p = b.part
        const dim = !groupMatches(p) || (S.focusPart && S.focusPart !== p.key)
        const m = b.mesh.material
        if (dim) m.color.copy(DIM)
        else m.color.set(groupColor(p))
        const hov = hoverHit?.part === p, foc = S.focusPart === p.key
        m.emissive.set(hov || foc ? '#ffffff' : '#000000')
        m.emissiveIntensity = foc ? 0.28 : hov ? 0.2 : 0
        m.opacity = dim ? 0.45 : 0.88
        b.label.element.classList.toggle('dim', !!dim)
        b.label.element.classList.toggle('foc', foc)
        b.label.element.classList.toggle('hov', hov)
    })
}

// ── Data: map ชื่อ zone → location master (lot ของแต่ละ zone โหลดตอนคลิก — loadZone / fetchZone) ──
function mapZones(locs) {
    const nameKeys = l => [l.displayName, l.locationName, l.name, l.locationCode].filter(Boolean).map(normCode)
    const children = new Map()
    locs.forEach(l => {
        if (l.parentLocationId == null) return
        if (!children.has(l.parentLocationId)) children.set(l.parentLocationId, [])
        children.get(l.parentLocationId).push(l)
    })
    S.locByCode = new Map(locs.map(l => [l.locationCode, l]))
    S.codeToZone = new Map()
    S.zones.forEach(z => {
        const cands = locs.filter(l => nameKeys(l).includes(z.norm))
        z.root = cands.find(l => l.isActive !== false) || cands[0] || null
        z.locCodes = []
        if (!z.root) return
        const seen = new Set(), queue = [z.root]
        while (queue.length) {
            const l = queue.shift()
            if (seen.has(l.id)) continue
            seen.add(l.id)
            if (l.locationCode) z.locCodes.push(l.locationCode)
            ;(children.get(l.id) || []).forEach(ch => queue.push(ch))
        }
        z.locCodes.forEach(c => S.codeToZone.set(c, z))
    })
}
function limiter(n) {
    let active = 0
    const q = []
    const next = () => {
        if (active >= n || !q.length) return
        active++
        const { fn, res, rej } = q.shift()
        fn().then(res, rej).finally(() => { active--; next() })
    }
    return fn => new Promise((res, rej) => { q.push({ fn, res, rej }); next() })
}
// lot ทั้งหมด (Available) ใน location เดียว — POST /inventory/lots ไล่ทีละหน้า
async function fetchLotsByLocation(code, lim) {
    const rows = []
    for (let p = 1; p <= 100; p++) {
        const r = await lim(() => api('/inventory/lots', 'POST', { locationCode: code, lotStatus: 'Available', page: p, pageSize: 500 }))
        const data = r?.data || []
        rows.push(...data)
        const pages = r?.totalPages ?? Math.ceil((r?.totalLot ?? 0) / (data.length || 1))
        if (!data.length || p >= pages) break
    }
    return rows
}
// lot ของ zone (location หลัก + location ลูก) — มี Line / เวลาที่อยู่ใน location มาในตัว (lot ที่ไม่มี line → หาจาก W/O)
async function fetchZone(z, lim) {
    const allowed = new Set(z.locCodes), byLot = new Map()
    const results = await Promise.all(z.locCodes.map(code => fetchLotsByLocation(code, lim).then(rows => ({ code, rows }))))
    results.forEach(({ code, rows }) => rows.forEach(x => {
        if (!(Number(x.onHandQty) > 0)) return
        const lc = x.location || code
        if (!allowed.has(lc) && S.locByCode.has(lc)) return
        const key = x.lotNo ?? `${x.partNo}|${lc}|${byLot.size}`
        if (byLot.has(key)) return
        const entered = x.locationEnteredAt ? new Date(x.locationEnteredAt).getTime() : NaN
        byLot.set(key, {
            lotNo: x.lotNo, partNo: x.partNo || '', description: x.description || '', itemType: x.itemTypeName ?? x.itemType ?? '', unit: x.unit || '',
            location: lc, onHandQty: Number(x.onHandQty || 0), reservedQty: Number(x.reservedQty || 0),
            available: Number(x.available || 0), status: x.status || '',
            line: (x.lineName || '').trim(), wo: (x.workOrder || '').trim(),
            inLoc: x.inLocationDurationMinutes != null && !isNaN(Number(x.inLocationDurationMinutes)) ? Number(x.inLocationDurationMinutes)
                 : !isNaN(entered) ? (Date.now() - entered) / 60000 : null,
        })
    }))
    const lots = [...byLot.values()]
    await resolveLotLines(lots, lim)
    return lots
}
function setZoneLots(z, lots) {
    z.lots = lots.sort((a, b) => a.partNo.localeCompare(b.partNo) || String(a.lotNo).localeCompare(String(b.lotNo)))
    z.parts = new Map()
    lots.forEach(l => {
        let p = z.parts.get(l.partNo)
        if (!p) z.parts.set(l.partNo, p = { partNo: l.partNo, description: l.description, itemType: l.itemType, unit: l.unit, lots: [], onHand: 0, available: 0, reserved: 0 })
        p.lots.push(l)
        p.onHand += l.onHandQty
        p.available += l.available
        p.reserved += l.reservedQty
    })
}

let panelTmr
function schedulePanel() { clearTimeout(panelTmr); panelTmr = setTimeout(() => { renderPanel(); renderLegend() }, 120) }

// โหลดผัง: map ชื่อ zone → location master เท่านั้น (ไม่ยิงสต็อก) — zone ที่เคยโหลดแล้ว mark stale (โหลดใหม่ตอนเปิดอีกครั้ง)
// zone ที่เปิดดูอยู่ โหลดใหม่ทันที (ใช้ตอน init / ปุ่ม Refresh — ไม่มี real-time จาก SignalR แล้ว)
async function loadData() {
    if (S.loading) { stale = true; return }
    S.loading = true
    lastLoadStart = Date.now()
    $('l3dRefresh')?.classList.add('spin')
    showLoading(!S.loadedAt)
    try {
        // ใช้ location master ที่ Dashboard โหลดไว้แล้ว (_dashLocations) ถ้ามี ไม่ต้องยิงซ้ำ
        const dashLocs = typeof _dashLocations !== 'undefined' && Array.isArray(_dashLocations) ? _dashLocations : []
        mapZones(dashLocs.length ? dashLocs : await fetchLocations())
        zonesMapped()
        S.zones.forEach(z => {
            if (!z.root) { z.status = 'nomatch'; return }
            if (z.loadedOnce) z.stale = true
            else z.status = 'idle'
        })
        S.loadedAt = new Date()
        setUpdated()
        showLoading(false)
        updateZoneVisuals()
        countZones()
        S.zones.forEach(z => { z.countAge = null })
        if (S.ageOnly) countZones('age')
        const sel = S.selected && S.zoneByCode.get(S.selected)
        if (sel?.root) loadZone(sel)
    } catch (err) {
        console.error('[Layout3D] load failed', err)
        showLoading(false, true)
    } finally {
        S.loading = false
        $('l3dRefresh')?.classList.remove('spin')
        schedulePanel()
        if (stale) requestRefresh()
    }
}
// จำนวน lot (Available) ต่อ zone — POST /inventory/lots { locationCode, lotStatus, page:1, pageSize:1 } เอาแค่ totalLot
// ต่อ location (รวม location ลูก) ยิงพร้อมกันได้ครั้งละ 6 / zone ไหนพังปล่อยเป็น '…' (ไม่ทำให้ทั้งผังพัง)
const _countSeq = { all: 0, age: 0 }
async function countZones(kind = 'all') {
    const seq = ++_countSeq[kind], lim = limiter(6)
    const field = kind === 'age' ? 'countAge' : 'count'
    const extra = kind === 'age' ? { minInLocationDurationMinutes: AGE_MIN } : {}
    await Promise.all(S.zones.filter(z => z.root).map(async z => {
        try {
            const totals = await Promise.all(z.locCodes.map(code => lim(() =>
                api('/inventory/lots', 'POST', { locationCode: code, lotStatus: 'Available', page: 1, pageSize: 1, ...extra })
                    .then(r => Number(r?.totalLot ?? r?.totalItem ?? 0)))))
            if (seq !== _countSeq[kind]) return   // มีรอบนับใหม่แซงมาแล้ว
            z[field] = totals.reduce((a, b) => a + b, 0)
        } catch (err) {
            console.warn('[Layout3D] count failed', kind, z.code, err)
        }
        updateZoneVisuals()
        schedulePanel()
    }))
}
// โหลด lot ของ zone เดียว (ตอนคลิก location) — กันยิงซ้อนต่อ zone
async function loadZone(z) {
    if (!z?.root || z.fetching) return
    z.fetching = true
    z.status = 'loading'
    updateZoneVisuals()
    schedulePanel()
    try {
        setZoneLots(z, await fetchZone(z, limiter(4)))
        z.count = z.lots.length
        z.countAge = z.lots.filter(l => (l.inLoc ?? -1) >= AGE_MIN).length
        z.status = 'ok'
        z.stale = false
        z.loadedOnce = true
    } catch (err) {
        console.warn('[Layout3D] zone load failed', z.code, err)
        z.status = 'err'
    } finally {
        z.fetching = false
    }
    updateZoneVisuals()
    if (S.selected === z.code) { buildDrill(); recolorDrill() }
    renderPanel()
    renderLegend()
}
// lot ที่ไม่มี line → เอา workOrder ไปค้น GET /workorder?WorkOrder= (cache ต่อ W/O)
const woLineCache = new Map()
async function resolveLotLines(lots, lim) {
    const wos = [...new Set(lots.filter(l => !l.line && l.wo && !woLineCache.has(l.wo)).map(l => l.wo))]
    await Promise.all(wos.map(wo => lim(async () => {
        try {
            const res  = await api(`/workorder?Page=1&PageSize=20&WorkOrder=${encodeURIComponent(wo)}`, 'GET')
            const list = res?.data?.data ?? res?.data ?? []
            const hit  = Array.isArray(list) ? (list.find(w => String(w.moNumber) === wo) || list[0]) : null
            woLineCache.set(wo, (hit?.lineName || '').trim())
        } catch { woLineCache.set(wo, '') }
    })))
    lots.forEach(l => { if (!l.line && l.wo) l.line = woLineCache.get(l.wo) || '' })
}
function metaBusyHtml() { return '' }   // เลิกโหลด meta แยกแล้ว (คงชื่อไว้ — renderPanel/zonePanelHtml ยังเรียก)
// วาดใหม่ทุกส่วนที่ขึ้นกับ groupBy / ageOnly
function refreshAll() {
    updateZoneVisuals()
    if (S.selected) buildDrill()
    recolorDrill()
    renderPanel()
    renderLegend()
}
function ensureMeta() {}   // เลิกใช้ — Line / เวลาใน location มากับ /inventory/lots ตอนคลิก location อยู่แล้ว

async function fetchLocations() {
    const first = await api('/location?page=1&pageSize=500', 'GET')
    let arr = Array.isArray(first) ? first : (first?.data || [])
    const pages = Math.ceil((first?.total ?? arr.length) / 500)
    for (let p = 2; p <= pages; p++) {
        const r = await api(`/location?page=${p}&pageSize=500`, 'GET')
        arr = arr.concat(Array.isArray(r) ? r : (r?.data || []))
    }
    return arr
}

function lotMatches(l) {
    if (!S.filter) return true
    const q = S.filter
    return String(l.partNo).toLowerCase().includes(q) || String(l.lotNo).toLowerCase().includes(q) || l.description.toLowerCase().includes(q)
}
function locDisplay(code) { const l = S.locByCode.get(code); return l?.displayName || l?.locationName || code }

// ── Picking / hover ──
function setPointer(e) {
    const r = renderer.domElement.getBoundingClientRect()
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    const vr = viewport.getBoundingClientRect()
    pointer.clientX = e.clientX - vr.left
    pointer.clientY = e.clientY - vr.top
}
function pick() {
    raycaster.setFromCamera(pointer, camera)
    const targets = [...S.drill.map(b => b.mesh), ...S.zones.filter(z => z.bubble.visible).map(z => z.bubble), ...padMeshes]
    const hit = raycaster.intersectObjects(targets, false)[0]
    if (!hit) return null
    return { zone: hit.object.userData.zone, part: hit.object.userData.part || null }
}
function setHover(h) {
    if (h?.zone === hoverHit?.zone && h?.part === hoverHit?.part) return
    hoverHit = h
    renderer.domElement.style.cursor = h ? 'pointer' : ''
    updateZoneVisuals()
    recolorDrill()
}
function doHover() {
    hoverDirty = false
    const h = pick()
    setHover(h)
    if (!h) return hideTip()
    showTip(h.part ? partTipHtml(h.part) : zoneTipHtml(h.zone))
}
function zoneTipHtml(z) {
    const d = tr(), lots = zoneLots(z), onHand = lots.reduce((s, l) => s + l.onHandQty, 0), reserved = lots.reduce((s, l) => s + l.reservedQty, 0)
    const nGroups = zoneGroups(z).length, maxAge = zoneMaxAge(z)
    const status = z.status === 'nomatch' ? `<div class="l3d-tip-sub">${esc(d.notMatched)}</div>`
        : z.status === 'err' ? `<div class="l3d-tip-sub">${esc(d.loadErr)}</div>` : ''
    return `<b>${esc(z.code)}</b> <span class="l3d-tip-cat">${esc(d.cat[z.cat])}</span>
        ${z.root ? `<div class="l3d-tip-sub">${esc(z.root.locationCode)}</div>` : ''}${status}
        ${z.root && !z.loadedOnce ? `${zoneCachedCount(z) != null ? `<div class="l3d-tip-row"><b>${num(zoneCachedCount(z))}</b> ${esc(d.lots)}${S.ageOnly ? ` (${esc(d.ageBtn)})` : ''}</div>` : ''}<div class="l3d-tip-row">${esc(z.status === 'loading' ? d.zoneLoading : d.clickHint)}</div>` : `
        <div class="l3d-tip-row">${num(lots.length)} ${esc(d.lots)} · ${num(nGroups)} ${esc(S.groupBy === 'line' ? d.lines : d.parts)} · ${num(onHand)} ${esc(d.onHand)}</div>
        <div class="l3d-tip-row">${esc(d.reserved)} <b style="color:#fcd34d">${num(reserved)}</b>${maxAge != null ? ` · ${esc(d.inLoc)} max <b style="color:${ageColor(maxAge)}">${fmtAge(maxAge)}</b>` : ''}</div>`}`
}
function partTipHtml(p) {
    const d = tr()
    const line = S.groupBy === 'line'
    return `<div><b>${esc(p.key)}</b> ${!line && p.itemType ? `<span class="l3d-dot" style="background:${typeColor(p.itemType)}"></span>${esc(p.itemType)}` : ''}</div>
        ${line ? `<div class="l3d-tip-sub">${num(p.parts.size)} ${esc(d.parts)}</div>` : p.description ? `<div class="l3d-tip-sub">${esc(p.description)}</div>` : ''}
        <div class="l3d-tip-row"><b>${num(p.lots.length)}</b> ${esc(d.lots)} · ${esc(d.onHand)} <b>${num(p.onHand)}</b> ${line ? '' : esc(p.unit)}</div>
        <div class="l3d-tip-row">${esc(d.reserved)} <b style="color:#fcd34d">${num(p.reserved)}</b> · ${esc(d.available)} <b style="color:#6ee7b7">${num(p.available)}</b></div>
        ${p.maxAge != null ? `<div class="l3d-tip-row">${esc(d.inLoc)} max <b style="color:${ageColor(p.maxAge)}">${fmtAge(p.maxAge)}</b></div>` : ''}`
}
function showTip(html, anchorEl) {
    const tip = $('l3dTooltip')
    tip.innerHTML = html
    tip.style.display = 'block'
    const vr = viewport.getBoundingClientRect()
    let x = pointer.clientX, y = pointer.clientY
    if (anchorEl) { const r = anchorEl.getBoundingClientRect(); x = r.left - vr.left + r.width / 2; y = r.top - vr.top }
    tip.style.left = Math.max(6, Math.min(vr.width - tip.offsetWidth - 6, x + 14)) + 'px'
    tip.style.top = Math.max(6, Math.min(vr.height - tip.offsetHeight - 6, y + 14)) + 'px'
}
function hideTip() { const t = $('l3dTooltip'); if (t) t.style.display = 'none' }

// ── Camera ──
function areaBox(kind) {
    if (kind === 'RE' || kind === 'PR' || kind === 'BR') {
        return S.zones.filter(z => z.cat === kind).reduce((b, z) => ({ x0: Math.min(b.x0, z.box.x0), z0: Math.min(b.z0, z.box.z0), x1: Math.max(b.x1, z.box.x1), z1: Math.max(b.z1, z.box.z1) }),
            { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity })
    }
    // ภาพรวม = อาคาร + ถนนหน้าอาคาร (ถนนกว้าง 10 m ต่อจาก BLD_D) — เดิมนับแค่ตัวอาคาร ถนนเลยล้นลงล่าง ผังดูเยื้องลงไม่อยู่กลางกล่อง
    return { x0: 0, z0: -1, x1: BLD_W, z1: BLD_D + 10 }
}
function fit(b, top = false, instant = false) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2
    const w = (b.x1 - b.x0) + 2, d = (b.z1 - b.z0) + 2
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect)
    const dir = top ? new THREE.Vector3(0, 1, 0.0001) : new THREE.Vector3(0, 0.86, 0.5)
    const dist = Math.max((w / 2) / Math.tan(hf), (d / 2) / Math.tan(vf) * (top ? 1 : 0.9)) * 1.05 + (top ? 0 : 1)
    const target = new THREE.Vector3(cx, 0, cz + (top ? 0 : d * 0.04))
    flyTo(target.clone().add(dir.normalize().multiplyScalar(Math.max(dist, 4))), target, instant)
}
function flyTo(pos, target, instant = false, dur = 750) {
    if (instant) {
        camera.position.copy(pos)
        controls.target.copy(target)
        controls.update()
        return
    }
    anim = { t0: performance.now(), dur, p0: camera.position.clone(), q0: controls.target.clone(), p1: pos, q1: target }
}
// เปิดผังครั้งแรก: เริ่มจากมุมสูง-ไกล-เอียงข้าง แล้วบินเข้ามาที่มุม Home (= ปุ่ม Home) ให้รู้สึกว่ากล้องพาซูมเข้าไปในแผนที่
// ต้องเรียกหลัง fit(areaBox('all'), false, true) — ใช้ตำแหน่งกล้องตอนนั้นเป็นปลายทาง / ผู้ใช้ตั้ง reduce motion → ข้าม
function introZoom() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const homePos = camera.position.clone(), homeTarget = controls.target.clone()
    const off = homePos.clone().sub(homeTarget)
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-35))   // หมุนรอบแกนตั้ง ให้เห็นผังเอียงตอนเริ่ม
    off.y *= 1.5                                                                       // สูงขึ้น (มองลงมากขึ้น)
    off.setLength(Math.min(off.length() * 2.4, controls.maxDistance))                  // ไกลออกไป
    camera.position.copy(homeTarget.clone().add(off))
    controls.update()
    flyTo(homePos, homeTarget, false, 1800)
}
function flyToZone(z) {
    const b = z.box, m = Math.max(1.6, (b.x1 - b.x0) * 0.3, (b.z1 - b.z0) * 0.3)
    fit({ x0: b.x0 - m, z0: b.z0 - m, x1: b.x1 + m, z1: b.z1 + m })
}
function zoomBy(f) {
    const off = camera.position.clone().sub(controls.target)
    const len = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance)
    flyTo(controls.target.clone().add(off.setLength(len)), controls.target.clone())
}
function stepAnim() {
    if (!anim) return
    // ใช้ performance.now() เสมอ — timestamp ของ rAF อาจเก่ากว่า t0 ที่ตั้งกลางเฟรม ทำให้ k ติดลบ กล้องไม่ขยับ
    const k = THREE.MathUtils.clamp((performance.now() - anim.t0) / anim.dur, 0, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
    camera.position.lerpVectors(anim.p0, anim.p1, e)
    controls.target.lerpVectors(anim.q0, anim.q1, e)
    if (k >= 1) anim = null
}
function resize() {
    const w = viewport.clientWidth, h = viewport.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h)
    labelRenderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
}
function loop() {
    rafId = requestAnimationFrame(loop)
    stepAnim()
    controls.update()
    const dist = camera.position.distanceTo(controls.target)
    nearLabels.forEach(o => { o.visible = dist < 38 })
    labelRenderer.domElement.classList.toggle('far', dist > 55)
    if (hoverDirty) doHover()
    renderer.render(scene, camera)
    labelRenderer.render(scene, camera)
}
function start() { if (!running && renderer) { running = true; rafId = requestAnimationFrame(loop) } }
function stop() { running = false; cancelAnimationFrame(rafId) }

// ── Auto refresh จาก SignalR: ยิงเฉพาะตอนผังโชว์อยู่บนจอจริง และไม่ถี่กว่าทุก 30 วิ (ยิงทีละหลาย request ต่อ location)
// ตอนซ่อนอยู่ (แท็บอื่น / เลื่อนจอไป / สลับ browser tab) แค่ mark stale ไว้ แล้วโหลดใหม่ครั้งเดียวตอนกลับมาเห็น
const REFRESH_MIN_MS = 30000
let onScreen = false, stale = false, refreshTmr = null, lastLoadStart = 0
function isVisible() { return onScreen && !document.hidden }
function onVisibility() {
    if (!isVisible()) { stop(); return }
    start()
    if (stale) requestRefresh(300)
}
function requestRefresh(minDelay = 3000) {
    if (!isVisible()) { stale = true; return }
    if (refreshTmr) return
    const wait = Math.max(minDelay, lastLoadStart + REFRESH_MIN_MS - Date.now())
    refreshTmr = setTimeout(() => {
        refreshTmr = null
        if (!isVisible()) { stale = true; return }
        stale = false
        loadData()
    }, wait)
}

// ── Selection / panel ──
function selectZone(code, { part = null, lot = null, fly = false } = {}) {
    const z = S.zoneByCode.get(code)
    if (!z) return
    const changed = S.selected !== code
    S.selected = code
    S.focusPart = part
    S.focusLot = lot
    if (changed) buildDrill()
    updateZoneVisuals()
    recolorDrill()
    renderPanel()
    renderLegend()
    if (z.root && (!z.loadedOnce || z.stale) && !z.fetching) loadZone(z)   // โหลด lot ตอนคลิก (on-demand)
    if (fly) flyToZone(z)
    if (part) requestAnimationFrame(() => $('l3dPanel')?.querySelector('.l3d-part.open')?.scrollIntoView({ block: 'nearest' }))
}
function clearSelection() {
    S.selected = S.focusPart = S.focusLot = null
    clearDrill()
    updateZoneVisuals()
    renderPanel()
    renderLegend()
}

function renderPanel() {
    const el = $('l3dPanel')
    if (!el) return
    const d = tr()
    if (S.selected) { el.innerHTML = zonePanelHtml(S.zoneByCode.get(S.selected), d); return }

    if (S.filter) {
        const hits = S.zones.map(z => ({ z, n: zoneCount(z) })).filter(x => x.n).sort((a, b) => b.n - a.n)
        el.innerHTML = `<div class="l3d-p-title">${esc(d.results)} “${esc(S.filter)}”</div>` + (hits.length
            ? hits.map(({ z, n }) => zoneRowHtml(z, n, hits[0].n)).join('')
            : `<div class="l3d-p-empty">${esc(d.noMatch)} “${esc(S.filter)}”</div>`)
        return
    }

    const lots = S.zones.reduce((s, z) => s + zoneCount(z), 0)
    const onHand = S.zones.reduce((s, z) => s + zoneLots(z).reduce((a, l) => a + l.onHandQty, 0), 0)
    const reserved = S.zones.reduce((s, z) => s + zoneLots(z).reduce((a, l) => a + l.reservedQty, 0), 0)
    const max = Math.max(1, ...S.zones.map(zoneCount))
    const zones = [...S.zones].sort((a, b) => a.code.localeCompare(b.code))
    const noMatch = zones.filter(z => z.status === 'nomatch')
    const loaded = S.zones.filter(z => z.loadedOnce).length
    el.innerHTML = `<div class="l3d-p-hint" style="margin:0 0 10px"><i class="bi bi-hand-index"></i> ${esc(d.clickHint)}</div>
        <div class="l3d-stats">
            <div class="w"><span>${num(lots)}</span>${esc(d.lots)}</div>
            <div class="w"><span>${loaded}/${S.zones.filter(z => z.root).length}</span>${esc(d.loadedLocs)}</div>
            <div class="w"><span>${num(onHand)}</span>${esc(d.onHand)}</div>
            <div class="w l3d-st-res"><span>${num(reserved)}</span>${esc(d.reserved)}</div>
        </div>
        ${['RE', 'PR', 'BR'].map(cat => `
            <div class="l3d-p-group"><span class="l3d-sw" data-cat="${cat}"></span>${cat} · ${esc(d.cat[cat])}</div>
            ${zones.filter(z => z.cat === cat).map(z => zoneRowHtml(z, zoneCount(z), max)).join('')}`).join('')}
        ${noMatch.length ? `<div class="l3d-p-warn" style="margin-top:12px"><i class="bi bi-exclamation-triangle"></i> ${esc(d.notMatched)}: ${noMatch.map(z => esc(z.code)).join(', ')}</div>` : ''}`
}
function zoneRowHtml(z, n, max) {
    const d = tr()
    const right = z.status === 'nomatch' ? '?' : z.status === 'err' ? esc(d.loadErr) : (z.status === 'loading' && !z.loadedOnce) ? '…'
        : !z.loadedOnce && zoneCachedCount(z) == null ? '…' : n ? num(n) : esc(d.empty)
    return `<button class="l3d-zrow${n || (!z.loadedOnce && zoneCachedCount(z) == null) ? '' : ' empty'}" data-act="zone" data-code="${esc(z.code)}">
        <span class="l3d-zcode" data-cat="${z.cat}">${esc(z.code)}</span>
        <span class="l3d-zbar"><i style="width:${Math.round(n / max * 100)}%" data-cat="${z.cat}"></i></span>
        <span class="l3d-zn">${right}</span>
    </button>`
}
function zonePanelHtml(z, d) {
    const lots = zoneLots(z)
    const onHand = lots.reduce((s, l) => s + l.onHandQty, 0), avail = lots.reduce((s, l) => s + l.available, 0)
    const reserved = lots.reduce((s, l) => s + l.reservedQty, 0)
    const parts = zoneGroups(z)
    const body = z.status === 'nomatch' ? `<div class="l3d-p-warn">${esc(d.notMatched)}</div>`
        : z.status === 'err' ? `<div class="l3d-p-warn">${esc(d.loadErr)} <button class="l3d-link-btn" data-act="retry">${esc(d.retry)}</button></div>`
        : !z.loadedOnce ? `<div class="l3d-p-empty"><span class="spinner-border spinner-border-sm" style="width:12px;height:12px"></span> ${esc(d.zoneLoading)}</div>`
        : parts.length ? metaBusyHtml(d) + `<div class="l3d-p-hint" style="margin-top:0">${esc(S.groupBy === 'line' ? d.drillHintLine : d.drillHint)}</div>` + parts.map(p => partHtml(p, d)).join('')
        : `<div class="l3d-p-empty">${esc(d.noLots)}</div>`
    return `
        <div class="l3d-p-nav">
            <button class="l3d-back" data-act="back"><i class="bi bi-chevron-left"></i> ${esc(d.back)}</button>
            <button class="l3d-back" data-act="fly" data-code="${esc(z.code)}"><i class="bi bi-crosshair"></i></button>
        </div>
        <div class="l3d-zhead" data-cat="${z.cat}">
            <div class="l3d-zhead-code">${esc(z.code)}</div>
            ${z.root ? `<div class="l3d-zhead-name">${esc(z.root.locationCode)}${z.locCodes.length > 1 ? ` <span style="color:var(--t3)">+${z.locCodes.length - 1}</span>` : ''}</div>` : ''}
            <div class="l3d-zhead-meta">${esc(d.cat[z.cat])} · ${esc(d.size)} ${esc(z.dim)}</div>
        </div>
        <div class="l3d-stats">
            <div class="w"><span>${num(lots.length)}</span>${esc(d.lots)}</div>
            <div class="w"><span>${num(parts.length)}</span>${esc(S.groupBy === 'line' ? d.lines : d.parts)}</div>
            <div><span>${num(onHand)}</span>${esc(d.onHand)}</div>
            <div class="l3d-st-res"><span>${num(reserved)}</span>${esc(d.reserved)}</div>
            <div class="l3d-st-av"><span>${num(avail)}</span>${esc(d.available)}</div>
        </div>
        ${body}`
}
function partHtml(p, d) {
    const open = S.focusPart === p.key, line = S.groupBy === 'line', showAge = p.lots.some(l => l.inLoc != null)
    const color = groupColor(p)
    return `<div class="l3d-part${open ? ' open' : ''}${groupMatches(p) ? '' : ' miss'}">
        <button class="l3d-part-head" data-act="part" data-part="${esc(p.key)}">
            <span class="l3d-dot" style="background:${color}"></span>
            <span class="l3d-part-main">
                <span class="l3d-part-no">${esc(p.key)}</span>
                <span class="l3d-part-desc">${line ? `${num(p.parts.size)} ${esc(d.parts)}` : esc(p.description || '—')}${showAge && p.maxAge != null ? ` · <b style="color:${ageColor(p.maxAge)}">${fmtAge(p.maxAge)}</b>` : ''}</span>
            </span>
            <span class="l3d-part-qty"><b>${num(p.lots.length)}</b> ${esc(d.lots)}<small>${num(p.onHand)} ${line ? '' : esc(p.unit)}</small></span>
            <i class="bi bi-chevron-down l3d-chev"></i>
        </button>
        ${open ? `<div class="l3d-part-body">
            ${!line && p.itemType && typeof itemTypeBadge === 'function' ? `<div style="margin-bottom:6px">${itemTypeBadge(p.itemType)}</div>` : ''}
            <div class="l3d-lots-scroll"><table class="l3d-lots"><thead><tr><th>${esc(d.lotNo)}</th>${line ? `<th>${esc(d.part)}</th>` : ''}<th>${esc(d.onHand)}</th><th>${esc(d.reserved)}</th><th>${esc(d.available)}</th>${showAge ? `<th>${esc(d.inLoc)}</th>` : ''}<th>${esc(d.loc)}</th></tr></thead><tbody>
            ${[...p.lots].sort((a, b) => (b.inLoc ?? -1) - (a.inLoc ?? -1)).map(l => `<tr class="l3d-lot${S.focusLot === l.lotNo ? ' focus' : ''}${lotMatches(l) ? '' : ' miss'}" data-act="lot" data-lot="${esc(l.lotNo)}">
                <td class="mono">${esc(l.lotNo)}</td>${line ? `<td class="mono">${esc(l.partNo)}</td>` : ''}<td>${num(l.onHandQty)}</td>
                <td style="color:var(--amber);font-weight:600">${num(l.reservedQty)}</td>
                <td style="color:${AVAIL_COLORS[availKey(l.onHandQty, l.available)]};font-weight:700">${num(l.available)}</td>
                ${showAge ? `<td style="font-weight:700;white-space:nowrap;color:${l.inLoc != null && l.inLoc >= AGE_MIN ? ageColor(l.inLoc) : 'var(--t3)'}">${fmtAge(l.inLoc)}</td>` : ''}
                <td class="l3d-lot-loc">${esc(locDisplay(l.location))}</td></tr>`).join('')}
            </tbody></table></div>
            ${line ? '' : `<button class="l3d-link-btn" data-act="summary" data-part="${esc(p.partNo)}"><i class="bi bi-table"></i> ${esc(d.showInSummary)}</button>`}
        </div>` : ''}
    </div>`
}

function renderLegend() {
    const el = $('l3dLegend')
    if (!el) return
    const d = tr()
    let colors = ''
    if (S.ageOnly) {
        colors = `<span>${esc(d.ageLegend)}</span><span class="l3d-age-scale"><i style="background:linear-gradient(90deg,${ageColor(1440)},${ageColor(4320)},${ageColor(10080)})"></i><small>1d</small><small>3d</small><small>7d+</small></span>`
    } else if (S.selected) {
        if (S.colorMode === 'avail') {
            colors = [['full', d.availFull], ['partial', d.availPartial], ['none', d.availNone]]
                .map(([k, t]) => `<span><i class="l3d-dot" style="background:${AVAIL_COLORS[k]}"></i>${esc(t)}</span>`).join('')
        } else {
            const z = S.zoneByCode.get(S.selected)
            const types = [...new Set(zoneGroups(z).map(p => p.itemType).filter(Boolean))].sort()
            colors = types.map(t => `<span><i class="l3d-dot" style="background:${typeColor(t)}"></i>${esc(t)}</span>`).join('')
        }
    }
    el.innerHTML = `
        <div class="l3d-lg-row">${['RE', 'PR', 'BR'].map(c => `<span><i class="l3d-sw" data-cat="${c}"></i>${c}</span>`).join('')}
            <span><i class="l3d-bub-ico"></i>${esc(d.legendBubble)}</span></div>
        ${colors ? `<div class="l3d-lg-row">${colors}</div>` : ''}`
}

function showLoading(on, failed = false) {
    const el = $('l3dLoading')
    if (!el) return
    const d = tr()
    if (failed) {
        el.innerHTML = `<div class="l3d-msg">${esc(d.loadFail)} <button class="l3d-link-btn" data-act="retry">${esc(d.retry)}</button></div>`
        el.style.display = 'flex'
        return
    }
    el.innerHTML = `<div class="l3d-msg"><span class="spinner-border spinner-border-sm"></span> ${esc(d.loading)}</div>`
    el.style.display = on ? 'flex' : 'none'
}
function setUpdated() {
    const u = $('l3dUpdated')
    if (u && S.loadedAt) u.textContent = `${tr().updated} ${S.loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function wireUi() {
    const mapSel = $('l3dMap')
    if (mapSel) {
        mapSel.innerHTML = MAPS.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')
        mapSel.value = currentMap.id
    }
    $('l3dCard').addEventListener('click', e => {
        const b = e.target.closest('[data-act]')
        if (!b) return
        const a = b.dataset.act
        if (a === 'zone') selectZone(b.dataset.code, { fly: true })
        else if (a === 'back') { clearSelection(); fit(areaBox('all')) }
        else if (a === 'fly') flyToZone(S.zoneByCode.get(b.dataset.code))
        else if (a === 'part') selectZone(S.selected, { part: S.focusPart === b.dataset.part ? null : b.dataset.part })
        else if (a === 'lot') selectZone(S.selected, { part: S.focusPart, lot: S.focusLot === b.dataset.lot ? null : b.dataset.lot })
        else if (a === 'summary') showInSummary(b.dataset.part)
        else if (a === 'retry') {
            showLoading(false)
            const z = S.selected && S.zoneByCode.get(S.selected)
            if (z?.status === 'err') loadZone(z); else loadData()
        }
        else if (a === 'view') {
            const v = b.dataset.view
            if (v === 'in') zoomBy(0.7)
            else if (v === 'out') zoomBy(1.4)
            else if (v === 'top') fit(S.selected ? zoneBoxPadded(S.selected) : areaBox('all'), true)
            else if (v === 'all') { clearSelection(); fit(areaBox('all')) }
            else if (v === 'full') toggleFullscreen()
            else fit(areaBox(v))
        }
    })
    let tmr
    // ช่องค้นหา / P/N | Line เอาออกจากหัวการ์ดแล้ว (S.filter = '', S.groupBy = 'part' เสมอ) — อ้าง element แบบ optional
    $('l3dSearch')?.addEventListener('input', e => {
        clearTimeout(tmr)
        tmr = setTimeout(() => setFilter(e.target.value), 200)
    })
    // Color select / ปุ่ม Refresh เอาออกจากหัวการ์ดแล้ว — สีตาม Item type เสมอ (S.colorMode = 'type'), โหลดใหม่ = รีเฟรชหน้า
    $('l3dColorMode')?.addEventListener('change', e => { S.colorMode = e.target.value; recolorDrill(); renderPanel(); renderLegend() })
    // P/N | Line — จัดกลุ่ม bubble ใน location
    $('l3dGroupBy')?.addEventListener('click', e => {
        const b = e.target.closest('[data-group]')
        if (!b || S.groupBy === b.dataset.group) return
        S.groupBy = b.dataset.group
        S.focusPart = S.focusLot = null
        document.querySelectorAll('#l3dGroupBy [data-group]').forEach(x => x.classList.toggle('active', x.dataset.group === S.groupBy))
        refreshAll()
        ensureMeta()
    })
    // > 1 day — แสดงเฉพาะ lot ที่อยู่ใน location เกิน 1 วัน + สีตามอายุ
    $('l3dAgeBtn')?.addEventListener('click', () => {
        S.ageOnly = !S.ageOnly
        S.focusPart = S.focusLot = null
        $('l3dAgeBtn').classList.toggle('active', S.ageOnly)
        if ($('l3dColorMode')) $('l3dColorMode').disabled = S.ageOnly
        // ตัวเลขบนผังเปลี่ยนเป็นจำนวน lot ที่อยู่เกิน 1 วัน — zone ที่ยังไม่ได้คลิกโหลด ต้องนับใหม่ด้วย condition นี้ (ครั้งแรกครั้งเดียว)
        if (S.ageOnly && S.zones.some(z => z.root && !z.loadedOnce && z.countAge == null)) countZones('age')
        refreshAll()
    })
    $('l3dRefresh')?.addEventListener('click', () => loadData())
    document.addEventListener('fullscreenchange', () => requestAnimationFrame(resize))
    initPanelResizer()
}

// ลากเส้นแบ่งปรับความกว้างแผงขวา — จำไว้ใน localStorage ต่อเบราว์เซอร์, ดับเบิลคลิก = กลับค่าเริ่มต้น
const PANEL_W_KEY = 'sf_l3d_panel_w', PANEL_W_DEFAULT = 340, PANEL_W_MIN = 260
function initPanelResizer() {
    const bar = $('l3dResizer'), panel = $('l3dPanel'), body = $('l3dBody')
    if (!bar || !panel || !body) return
    const clampW = w => Math.round(Math.min(Math.max(w, PANEL_W_MIN), body.clientWidth * 0.7))
    try { const saved = +localStorage.getItem(PANEL_W_KEY); if (saved) panel.style.width = saved + 'px' } catch (_) { }

    bar.addEventListener('pointerdown', e => {
        e.preventDefault()
        bar.setPointerCapture(e.pointerId)
        bar.classList.add('drag')
        body.classList.add('resizing')
        const right = body.getBoundingClientRect().right
        const move = ev => { panel.style.width = clampW(right - ev.clientX) + 'px' }
        const up = () => {
            bar.removeEventListener('pointermove', move)
            bar.classList.remove('drag')
            body.classList.remove('resizing')
            try { localStorage.setItem(PANEL_W_KEY, parseInt(panel.style.width, 10)) } catch (_) { }
        }
        bar.addEventListener('pointermove', move)
        bar.addEventListener('pointerup', up, { once: true })
        bar.addEventListener('pointercancel', up, { once: true })
    })
    bar.addEventListener('dblclick', () => {
        panel.style.width = PANEL_W_DEFAULT + 'px'
        try { localStorage.removeItem(PANEL_W_KEY) } catch (_) { }
    })
}
function zoneBoxPadded(code) {
    const b = S.zoneByCode.get(code).box
    return { x0: b.x0 - 2, z0: b.z0 - 2, x1: b.x1 + 2, z1: b.z1 + 2 }
}
function setFilter(q) {
    S.filter = String(q || '').trim().toLowerCase()
    updateZoneVisuals()
    recolorDrill()
    renderPanel()
}
function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen()
    else $('l3dBody')?.requestFullscreen?.()
}
function showInSummary(partNo) {
    const input = $('filterPartNo')
    if (!input || typeof searchStock !== 'function') return
    if (document.fullscreenElement) document.exitFullscreen()
    input.value = partNo
    searchStock()
    input.closest('.section-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function applyLang() {
    const d = tr()
    const set = (id, prop, v) => { const e = $(id); if (e) e[prop] = v }
    set('l3dTitle', 'textContent', d.title)
    set('l3dMap', 'title', d.mapTitle)
    set('l3dSearch', 'placeholder', d.search)
    set('l3dHint', 'textContent', d.hint)
    set('l3dRefresh', 'title', d.refresh)
    const cm = $('l3dColorMode')
    if (cm) { cm.options[0].text = d.colorType; cm.options[1].text = d.colorAvail }
    const gb = $('l3dGroupBy')
    if (gb) {
        gb.title = d.groupTip
        gb.querySelector('[data-group="part"]').textContent = d.groupPart
        gb.querySelector('[data-group="line"]').textContent = d.groupLine
    }
    const ab = $('l3dAgeBtn')
    if (ab) { ab.title = d.ageTip; ab.querySelector('span').textContent = d.ageBtn }
    document.querySelectorAll('#l3dCard [data-view]').forEach(b => {
        const k = { all: 'overview', top: 'top', in: 'zoomIn', out: 'zoomOut', full: 'fullscreen' }[b.dataset.view]
        b.title = k ? d[k] : d.cat[b.dataset.view] || ''
    })
    staticLabels.forEach(o => { o.element.textContent = d.rooms[o.userData.key] || '' })
    setUpdated()
    renderLegend()
    renderPanel()
}

window.Layout3D = {
    // Stock Summary ส่ง locationCode ของ lot มา (LOC-xxxx) — รอ map ชื่อ zone→code เสร็จก่อน แล้วซูมไป zone นั้น (รวม location ลูก)
    async focus(code) {
        await zonesMappedPromise
        const z = S.codeToZone.get(code) || S.zoneByCode.get(code)
        if (!z) return
        $('l3dCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        selectZone(z.code, { fly: true })
    },
    refreshSoon() { },   // เลิก refresh อัตโนมัติจาก SignalR แล้ว — โหลดใหม่ผ่านปุ่ม Refresh เท่านั้น (คงไว้กันโค้ดเก่าเรียก)
    applyLang,
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
else init()
