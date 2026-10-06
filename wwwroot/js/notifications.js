// notifications.js — กระดิ่งแจ้งเตือนบน header (_Layout.cshtml)
//   SignalR NotificationHub (CONFIG.NOTIFICATION_HUB) — ต่อตั้งแต่โหลดหน้า (เฉพาะคนที่มีสิทธิ์เห็นกระดิ่ง):
//     invoke GetNotifications(query) → NotificationData      (รายการทีละหน้า)
//     push   NotificationCreated(n) / NotificationRead(id) / AllNotificationsRead() / NotificationDeleted(id) / UnreadCountChanged(count)
//   ไม่มี polling รายคาบ — ตัวเลขบนกระดิ่งมาทาง UnreadCountChanged; ดึง GET /notifications/unread-count ครั้งเดียวตอนโหลดหน้า / hub ต่อติด-ต่อกลับ /
//   เปิดกระดิ่ง / กลับมาที่ tab (ข้ามถ้า hub ต่ออยู่) — hub ใช้ไม่ได้/หลุด → โหลดรายการทาง REST และลองต่อ hub ใหม่ทุก 60 วิ
//   อ่าน/อ่านทั้งหมด/ลบ ยังใช้ REST (บอกได้ว่าสำเร็จไหม — Read/ReadAll/Delete ของ hub ไม่ตอบอะไรกลับมา) ส่วน push event ช่วย sync ข้าม tab/เครื่อง
//     PUT /notifications/{userNotificationId}/read   PUT /notifications/read-all   DELETE /notifications/{userNotificationId}
(function () {
    const PAGE_SIZE = 10
 
 
    const TYPE_META = {
        warning: { color: '#d97706', icon: 'bi-exclamation-triangle-fill' },
        error:   { color: '#dc2626', icon: 'bi-x-octagon-fill' },
        danger:  { color: '#dc2626', icon: 'bi-x-octagon-fill' },
        success: { color: '#059669', icon: 'bi-check-circle-fill' },
        info:    { color: '#1a6fff', icon: 'bi-info-circle-fill' },
    }
    // icon เฉพาะ eventType (สียังตาม type) — เพิ่มได้เรื่อยๆ เมื่อมี event ใหม่
    const EVENT_ICON = { lotlocationtimeout: 'bi-hourglass-split' }
 
    const S = { tab: 'all', items: [], page: 0, totalPages: 1, loading: false, error: false, unread: 0, open: false, seq: 0 }
 
    const $ = id => document.getElementById(id)
    const dict = () => (typeof NAV_LABELS !== 'undefined' && NAV_LABELS[getLang()]) || (typeof NAV_LABELS !== 'undefined' ? NAV_LABELS.en : {})
    const getLang = () => { try { return localStorage.getItem('sf_lang') || 'en' } catch (_) { return 'en' } }
    const hasToken = () => { try { return !!localStorage.getItem('token') } catch (_) { return false } }
    // เห็นกระดิ่งได้เฉพาะ role "Admin" (เป๊ะๆ เหมือน FULL_ACCESS_ROLES ใน _Layout) หรือมี permission WMS.UI.Notification
    const NOTIF_PERMISSION = 'WMS.UI.Notification'
    function canSeeNotifications() {
        if (!hasToken()) return false
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}')
            const roles = Array.isArray(user.roles) ? user.roles : []
            const perms = Array.isArray(user.permissions) ? user.permissions : []
            return roles.includes('Admin') || perms.includes(NOTIF_PERMISSION)
        } catch (_) { return false }
    }
    // เช็คซ้ำตอน refreshUnread/เปิดกระดิ่ง/กลับมาที่ tab ด้วย — user/สิทธิ์ใน localStorage เปลี่ยนได้ระหว่างเปิดหน้า (เช่น autoRelogin ของจอ dashboard)
    function syncAccess() {
        const ok = canSeeNotifications()
        const wrap = $('notifBtn')?.closest('.notif-wrap')
        if (wrap) wrap.hidden = !ok
        if (!ok && S.open) closePanel()
        if (!ok && hub) hub.stop().catch(() => {})   // เสียสิทธิ์ระหว่างเปิดหน้า → เลิกรับ push
        return ok
    }
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
 
    function meta(n) {
        const m = TYPE_META[String(n.type || '').toLowerCase()] || TYPE_META.info
        return { ...m, icon: EVENT_ICON[String(n.eventType || '').toLowerCase()] || m.icon }
    }
    function timeAgo(iso) {
        const t = new Date(iso).getTime()
        if (!t) return ''
        const sec = Math.round((t - Date.now()) / 1000)
        const rtf = new Intl.RelativeTimeFormat(getLang() === 'th' ? 'th' : 'en', { numeric: 'auto', style: 'short' })
        const abs = Math.abs(sec)
        if (abs < 45) return rtf.format(0, 'second')
        if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute')
        if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour')
        if (abs < 86400 * 7) return rtf.format(Math.round(sec / 86400), 'day')
        return new Date(t).toLocaleDateString(getLang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short' })
    }
    function dayLabel(iso) {
        const d = new Date(iso), today = new Date()
        const key = x => x.getFullYear() * 10000 + x.getMonth() * 100 + x.getDate()
        const y = new Date(today); y.setDate(today.getDate() - 1)
        if (key(d) === key(today)) return dict().notifToday || 'Today'
        if (key(d) === key(y)) return dict().notifYesterday || 'Yesterday'
        return d.toLocaleDateString(getLang() === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    }
    // แปล title/message ตาม eventType จาก NOTIF_EVENT_LABELS (i18n.js) — ไม่มีคำแปล หรือ template อ้าง field ที่ไม่มีค่า → ใช้ของ API
    function localized(n, key) {
        const tpl = typeof NOTIF_EVENT_LABELS !== 'undefined' ? NOTIF_EVENT_LABELS[getLang()]?.[n.eventType]?.[key] : null
        if (!tpl) return n[key] ?? ''
        let missing = false
        const out = tpl.replace(/\{(\w+)\}/g, (_, f) => (n[f] == null || n[f] === '') ? (missing = true, '') : String(n[f]))
        return missing ? (n[key] ?? '') : out
    }
    // ไฮไลต์ lotNo ในข้อความ (เป็น chip ตัว mono) — escape ก่อนแล้วค่อยแทน ปลอดภัยจาก HTML ใน message
    function messageHtml(n) {
        const msg = esc(localized(n, 'message'))
        if (!n.lotNo) return msg
        const lot = esc(n.lotNo)
        return msg.split(lot).join(`<span class="notif-lot">${lot}</span>`)
    }
    // url จาก API (/inventory/lots/{id}) เป็น path ของ API ไม่ใช่หน้าเว็บ — ลิงก์ไปหน้า LotDetail ของ UI ด้วย lotNo แทน
    function targetUrl(n) {
        return n.lotNo ? `Inventory/LotDetail?lot=${encodeURIComponent(n.lotNo)}` : null
    }
 
    // ── Badge / unread count ──
    function setUnread(n) {
        const prev = S.unread
        S.unread = Math.max(0, n | 0)
        const b = $('notifBadge')
        if (b) {
            b.textContent = S.unread > 99 ? '99+' : String(S.unread)
            b.hidden = S.unread === 0
        }
        const chip = $('notifHeadCount')
        if (chip) { chip.textContent = S.unread > 999 ? '999+' : S.unread; chip.hidden = S.unread === 0 }
        $('notifMarkAllBtn')?.toggleAttribute('disabled', S.unread === 0)
        if (S.unread > prev && prev >= 0 && S._init) {
            const bell = $('notifBtn')
            bell?.classList.remove('ring'); void bell?.offsetWidth; bell?.classList.add('ring')
        }
        S._init = true
    }
    // force = เรียกแม้ hub ต่ออยู่ (ตอนเปิด panel / ต่อ hub ใหม่ได้) — ปกติระหว่าง hub ต่ออยู่ จำนวนมาทาง UnreadCountChanged อยู่แล้ว ไม่ต้องดึงเอง
    async function refreshUnread(force = false) {
        if (!syncAccess() || document.hidden) return
        if (!force && hubConnected()) return
        try {
            const r = await api('/notifications/unread-count', 'GET')
            const n = typeof r === 'number' ? r : Number(r?.count ?? r?.unreadCount ?? r?.total ?? r?.data ?? 0)
            const grew = n > S.unread && S._init
            setUnread(n)
            // มีของใหม่ระหว่างเปิด panel ค้างไว้ → ดึงหน้าแรกใหม่ให้เห็นเลย (ถ้ายังอยู่บนสุดของลิสต์ ไม่ไปรบกวนตอนเลื่อนอ่านอยู่)
            if (grew && S.open && ($('notifList')?.scrollTop ?? 0) < 40) reload()
        } catch (err) {
            if (err?.status === 401) return
            console.warn('[notif] unread-count failed', err)
        }
    }
 
    // ── SignalR NotificationHub ──
    // GetNotifications ไม่มี request id ให้จับคู่ request/response — แต่ server ประมวลผล invocation ของแต่ละ connection ทีละตัวตามลำดับ
    // และส่ง NotificationData ก่อน completion ของ invoke เสมอ → จับคู่แบบ FIFO: response แรกที่เข้ามา = ของ request ที่ยังรออยู่ตัวแรก
    const HUB_RETRY_MS = 60000
    let hub = null, hubReady = null, hubRetryAt = 0, hubRetryTimer = null, lastCountPushAt = 0
    const hubPending = []
 
    const hubConnected = () => !!hub && !!window.signalR && hub.state === signalR.HubConnectionState.Connected
 
    // ต่อไม่ติด/โดนปิด → พัก 60 วิ ค่อยลองใหม่ (กัน error ซ้ำทุกครั้งที่เปิดกระดิ่ง) ระหว่างนี้โหลดรายการทาง REST ไปก่อน
    function scheduleHubRetry() {
        hubRetryAt = Date.now() + HUB_RETRY_MS
        clearTimeout(hubRetryTimer)
        hubRetryTimer = setTimeout(() => {
            if (canSeeNotifications() && !document.hidden) ensureHub().catch(() => {})
        }, HUB_RETRY_MS)
    }
    // ต่อติด/ต่อกลับมาได้ → sync จำนวนกับรายการครั้งเดียว (อาจพลาด push ไปช่วงที่ยังไม่ต่อ/หลุด)
    function onHubBack() {
        refreshUnread(true)
        if (S.open) reload()
    }
 
    // ── push event จาก server ──
    function registerHubHandlers(h) {
        // log ทุกข้อความที่ server ส่งมา (ชื่อ event + payload) แล้วค่อยเรียก handler จริง
        const on = (name, fn) => h.on(name, (...args) => { console.log(`[notif] ← ${name}`, ...args); fn(...args) })
        on('NotificationData', result => {
            const entry = hubPending.find(e => !e.filled)
            if (entry) { entry.filled = true; entry.data = result }
        })
        on('UnreadCountChanged', count => {
            lastCountPushAt = Date.now()
            setUnread(Number(count) || 0)
        })
        on('NotificationCreated', n => {
            if (!n || n.id == null) return
            // เพิ่มเข้าลิสต์บนสุดถ้าเปิด panel อยู่และลิสต์โหลดแล้ว (แท็บ "ยังไม่อ่าน" รับเฉพาะที่ยังไม่อ่าน) — ปิดอยู่ไม่ต้องทำ เพราะเปิดครั้งหน้าโหลดใหม่เอง
            if (S.open && S.page > 0 && !S.items.some(x => x.id === n.id) && (S.tab !== 'unread' || !n.isRead)) {
                S.items.unshift(n)
                renderList()
            }
            // จำนวนควรมาทาง UnreadCountChanged — ถ้า 1.5 วิแล้วยังไม่มาก็ดึงเองจาก REST กันตัวเลขค้าง
            setTimeout(() => { if (Date.now() - lastCountPushAt > 1500) refreshUnread(true) }, 1500)
        })
        on('NotificationRead', id => {
            const n = S.items.find(x => x.id === Number(id))
            if (!n || n.isRead) return
            n.isRead = true
            if (S.tab === 'unread') S.items = S.items.filter(x => x.id !== n.id)
            renderList()
        })
        on('AllNotificationsRead', () => {
            S.items.forEach(n => { n.isRead = true })
            if (S.tab === 'unread') S.items = []
            renderList()
        })
        on('NotificationDeleted', id => {
            const before = S.items.length
            S.items = S.items.filter(x => x.id !== Number(id))
            if (S.items.length !== before) renderList()
        })
    }
    function loadSignalR() {
        if (window.signalR) return Promise.resolve()
        return new Promise((resolve, reject) => {
            const s = document.createElement('script')
            s.src = new URL('lib/signalr/dist/browser/signalr.min.js', document.baseURI).href
            s.onload = resolve
            s.onerror = () => reject(new Error('signalr.min.js load failed'))
            document.head.appendChild(s)
        })
    }
 
 
    // สร้างการเชื่อมต่อ
    function ensureHub() {
        if (hubReady) return hubReady
        if (Date.now() < hubRetryAt) return Promise.reject(new Error('hub unavailable — retrying later'))
        const url = typeof CONFIG !== 'undefined' ? CONFIG.NOTIFICATION_HUB : null
        if (!url) return Promise.reject(new Error('CONFIG.NOTIFICATION_HUB is not set'))
        hubReady = loadSignalR().then(async () => {
            const h = new signalR.HubConnectionBuilder()
                .withUrl(
                    url,
                    {
                        accessTokenFactory: () => localStorage.getItem('token'),
                        transport: signalR.HttpTransportType.WebSockets,
                        withCredentials: false
                    })
                .withAutomaticReconnect()
                .configureLogging(signalR.LogLevel.Warning)
                .build()
            registerHubHandlers(h)
            h.onreconnecting(err => console.warn('[notif] hub reconnecting', err?.message))
            h.onreconnected(id => { console.log('[notif] hub reconnected', id); onHubBack() })
            h.onclose(err => {
                console.warn('[notif] hub closed', err?.message)
                hub = null
                hubReady = null
                scheduleHubRetry()
            })
            try {
                await h.start()   // ← Connect (server รัน OnConnectedAsync)
            } catch (err) {
                // รายละเอียด error ตอนเชื่อมต่อ: negotiate ล้มเหลว → HttpError มี statusCode (เช่น 401) / WebSocket เปิดไม่ได้ → ไม่มี statusCode
                // แล้วโยนต่อให้ .catch ด้านล่างจัดการ (reset สถานะ + ตั้งเวลาลองใหม่) — ไม่กลืน error
                console.error('[notif] hub start() failed', { name: err?.name, message: err?.message, statusCode: err?.statusCode })
                throw err
            }
            hub = h
            // start() ไม่คืนค่า — สิ่งที่ server ตอบหลังเชื่อมต่อ = connectionId (จาก negotiate) + handshake {} ซึ่งไลบรารีจัดการเอง
            // ข้อมูลที่ server ส่งต่อจากนี้ดูได้จาก log "[notif] ← <EventName>" ใน registerHubHandlers
            console.log('[notif] hub connected', { connectionId: h.connectionId, state: h.state, baseUrl: h.baseUrl })
            onHubBack()
            return h
        }).catch(err => {
            console.warn('[notif] hub connect failed', err?.message || err)
            hub = null
            hubReady = null
            scheduleHubRetry()
            throw err
        })
        return hubReady
    }
    async function hubGetNotifications(query) {
        const h = await ensureHub()
        if (h.state !== signalR.HubConnectionState.Connected) throw new Error('hub not connected')
        const entry = { filled: false, data: null }
        hubPending.push(entry)
        try {
            await h.invoke('GetNotifications', query)
        } finally {
           
            const i = hubPending.indexOf(entry)
            if (i >= 0) hubPending.splice(i, 1)
        }
        if (!entry.filled) throw new Error('no NotificationData received')
        return entry.data
    }
    // query ตาม QueryNotification { IsRead, Page, PageSize } — EmployeeNo ไม่ต้องส่ง (hub ดึงตัวตนจาก token เอง เหมือนตัว tester ของ backend)
    // isRead ไม่ส่ง = ทั้งหมด
    async function fetchNotificationPage(page, unreadOnly) {
        try {
            const query = {
                IsRead: unreadOnly ? false : null,
                Page: page,
                PageSize: PAGE_SIZE
            }
            return await hubGetNotifications(query)
        } catch (err) {
            console.warn('[notif] hub GetNotifications failed → fallback REST', err?.message || err)
            const q = new URLSearchParams({ page, pageSize: PAGE_SIZE })
            if (unreadOnly) q.set('isRead', 'false')
            return api(`/notifications?${q}`, 'GET')
        }
    }
 
    // ── List ──
    async function loadPage() {
        if (S.loading || S.page >= S.totalPages) return
        S.loading = true
        S.error = false
        const my = S.seq
        renderList()
        try {
            const r = await fetchNotificationPage(S.page + 1, S.tab === 'unread')
            if (my !== S.seq) return
            const data = Array.isArray(r) ? r : (r?.data || [])
            const seen = new Set(S.items.map(x => x.id))
            S.items.push(...data.filter(x => !seen.has(x.id)))
            S.page = r?.page ?? S.page + 1
            S.totalPages = r?.totalPages ?? (data.length < PAGE_SIZE ? S.page : S.page + 1)
        } catch (err) {
            if (my !== S.seq) return
            console.warn('[notif] list failed', err)
            S.error = true
        } finally {
            if (my === S.seq) { S.loading = false; renderList() }
        }
    }
    function reload() {
        S.seq++
        S.items = []
        S.page = 0
        S.totalPages = 1
        S.loading = false
        const list = $('notifList')
        if (list) list.scrollTop = 0
        loadPage()
    }
 
    function itemHtml(n) {
        const m = meta(n), url = targetUrl(n), d = dict()
        return `<div class="notif-item${n.isRead ? '' : ' unread'}${url ? ' link' : ''}" data-id="${n.id}" role="button" tabindex="0">
            <span class="notif-ico" style="background:${m.color}1f;color:${m.color}"><i class="bi ${m.icon}"></i></span>
            <div class="notif-body">
                <div class="notif-row">
                    <span class="notif-ttl">${esc(localized(n, 'title') || n.eventType || '')}</span>
                    <span class="notif-time" title="${esc(new Date(n.createdAt).toLocaleString())}">${esc(timeAgo(n.createdAt))}</span>
                </div>
                <div class="notif-msg">${messageHtml(n)}</div>
            </div>
            <div class="notif-acts">
                ${n.isRead ? '' : `<button class="notif-act" data-act="read" title="${esc(d.notifMarkRead)}"><i class="bi bi-check2"></i></button>`}
                <button class="notif-act del" data-act="del" title="${esc(d.notifDelete)}"><i class="bi bi-trash3"></i></button>
            </div>
            ${n.isRead ? '' : '<span class="notif-dot"></span>'}
        </div>`
    }
    function renderList() {
        const list = $('notifList')
        if (!list) return
        const d = dict()
        let html = '', lastDay = null
        S.items.forEach(n => {
            const day = dayLabel(n.createdAt)
            if (day !== lastDay) { html += `<div class="notif-day">${esc(day)}</div>`; lastDay = day }
            html += itemHtml(n)
        })
        if (S.loading) {
            html += S.items.length
                ? '<div class="notif-more"><span class="spinner-border spinner-border-sm"></span></div>'
                : Array.from({ length: 4 }, () => '<div class="notif-skel"><span></span><div><i></i><i></i></div></div>').join('')
        } else if (S.error) {
            html += `<div class="notif-state"><i class="bi bi-wifi-off"></i><div>${esc(d.notifLoadFail)}</div><button class="notif-retry" data-act="retry">${esc(d.notifRetry)}</button></div>`
        } else if (!S.items.length) {
            html += `<div class="notif-state"><i class="bi bi-bell-slash"></i><b>${esc(d.notifEmpty)}</b><div>${esc(S.tab === 'unread' ? d.notifEmptyUnread : d.notifEmptySub)}</div></div>`
        } else if (S.page < S.totalPages) {
            html += '<div class="notif-sentinel"></div>'
        }
        list.innerHTML = html
        const sentinel = list.querySelector('.notif-sentinel')
        if (sentinel) S.io.observe(sentinel)
    }
 
    // ── Actions (optimistic — ถ้า API พังค่อยย้อนกลับ) ──
    async function markRead(id) {
        const n = S.items.find(x => x.id === id)
        if (!n || n.isRead) return
        n.isRead = true
        setUnread(S.unread - 1)
        if (S.tab === 'unread') S.items = S.items.filter(x => x.id !== id)
        renderList()
        try { await api(`/notifications/${id}/read`, 'PUT') }
        catch (err) { console.warn('[notif] read failed', err); refreshUnread(); reload() }
    }
    async function remove(id) {
        const idx = S.items.findIndex(x => x.id === id)
        if (idx < 0) return
        const [n] = S.items.splice(idx, 1)
        if (!n.isRead) setUnread(S.unread - 1)
        renderList()
        try { await api(`/notifications/${id}`, 'DELETE') }
        catch (err) { console.warn('[notif] delete failed', err); refreshUnread(); reload() }
    }
    async function markAll() {
        if (!S.unread) return
        S.items.forEach(n => { n.isRead = true })
        if (S.tab === 'unread') S.items = []
        setUnread(0)
        renderList()
        try { await api('/notifications/read-all', 'PUT') }
        catch (err) { console.warn('[notif] read-all failed', err); refreshUnread(); reload() }
    }
 
    // ── Panel open/close ──
    function openPanel() {
        if (!syncAccess()) return
        S.open = true
        $('notifPanel').hidden = false
        $('notifBtn').setAttribute('aria-expanded', 'true')
        $('notifBtn').classList.remove('ring')
        applyLang()
        reload()
        refreshUnread(true)
    }
    function closePanel() {
        S.open = false
        $('notifPanel').hidden = true
        $('notifBtn').setAttribute('aria-expanded', 'false')
    }
    function setTab(tab) {
        if (S.tab === tab) return
        S.tab = tab
        document.querySelectorAll('#notifPanel .notif-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
        reload()
    }
 
    function applyLang() {
        const d = dict()
        const set = (id, v) => { const e = $(id); if (e) e.textContent = v }
        set('notifTitleText', d.notifTitle)
        set('notifTabAll', d.notifAll)
        set('notifTabUnread', d.notifUnread)
        set('notifMarkAllText', d.notifMarkAll)
        $('notifBtn')?.setAttribute('title', d.notifTitle || 'Notifications')
        if (S.open) renderList()
    }
 
    function init() {
        const btn = $('notifBtn'), panel = $('notifPanel')
        if (!btn || !panel) return
        syncAccess()
 
        S.io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) loadPage() }, { root: $('notifList'), rootMargin: '120px' })
 
        btn.addEventListener('click', e => { e.stopPropagation(); S.open ? closePanel() : openPanel() })
        document.addEventListener('click', e => { if (S.open && !e.target.closest('.notif-wrap')) closePanel() })
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.open) { closePanel(); btn.focus() } })
 
        panel.addEventListener('click', async e => {
            e.stopPropagation()   // กันตัวปิด panel ของ document มองว่าคลิกนอก (element ที่คลิกหลุดจาก DOM หลัง re-render)
            const actEl = e.target.closest('[data-act]')
            const item = e.target.closest('.notif-item')
            const id = item ? Number(item.dataset.id) : null
            if (actEl) {
                const a = actEl.dataset.act
                if (a === 'read') markRead(id)
                else if (a === 'del') remove(id)
                else if (a === 'retry') loadPage()
                else if (a === 'markall') markAll()
                else if (a === 'tab') setTab(actEl.dataset.tab)
                return
            }
            if (!item) return
            const n = S.items.find(x => x.id === id)
            if (!n) return
            const url = targetUrl(n)
            // รอ PUT /read จบก่อนค่อยเปลี่ยนหน้า (สูงสุด 1.5 วิ) — ถ้าเปลี่ยนหน้าทันที browser จะยกเลิก request ที่ค้างอยู่ ทำให้ไม่ถูกมาร์คว่าอ่านแล้ว
            if (!n.isRead) {
                const p = markRead(id)
                if (url) await Promise.race([p, new Promise(r => setTimeout(r, 1500))])
            }
            if (url) window.location.href = url
        })
        panel.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return
            const item = e.target.closest('.notif-item')
            if (item && e.target === item) item.click()
        })
 
        applyLang()
        refreshUnread(true)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) return
            refreshUnread()
            if (!hubReady && canSeeNotifications()) ensureHub().catch(() => {})
        })
        // ต่อ hub ตั้งแต่โหลดหน้า (ไม่รอเปิดกระดิ่ง) เพื่อรับแจ้งเตือนใหม่แบบ real-time
        if (canSeeNotifications()) ensureHub().catch(() => {})
    }
 
    window.notifApplyLang = applyLang
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
    else init()
})()
 
 