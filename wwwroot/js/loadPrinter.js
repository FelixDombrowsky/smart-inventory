// loadPrinter.js — จุดเดียวที่กรอง printer list ตามสิทธิ์ของ user (ใช้ร่วมกันได้ทุกหน้า)
// แทนที่ระบบเดิม (filterPrintersByPermission ใน zplBuilder.js / _rpFilterPrintersByPermission ใน PrintQR.cshtml)
// ที่เทียบ permission string ชื่อ WMS.UI.Printer.<PREFIX> กับ prefix ของชื่อเครื่องพิมพ์
//
// แนวคิดใหม่: เทียบ printer.locationId กับ location ที่ user มีสิทธิ์เข้าถึงจริง (canRead) แทน
// โดยอิง myLocations ที่โหลดไว้แล้วจาก loadPerLocation() ใน loadLocation.js (ซึ่งดึงจาก
// GET /users/{id}/location-permissions แล้ว expand เป็น tree ให้ครบ รวม location ลูกถ้า includeChildren)
//
// ต้องเรียก await loadPerLocation() ให้เสร็จก่อนเสมอ ไม่งั้น myLocations จะว่าง แล้ว user ทั่วไปจะไม่เห็น printer เลยสักเครื่อง
// isAdmin เห็นทุกเครื่องเสมอ (พฤติกรรมเดิมไม่เปลี่ยน) — ยกเว้นเครื่องที่ location type = Warehouse ต้องผ่าน permission
// WMS.UI.Printer.CH เพิ่มอีกชั้นเสมอ (ดูฟังก์ชัน _printerHasWarehousePermission ด้านล่าง)
function filterPrintersByLocation(printers, isAdmin) {
    // ── ชั้นกรองเพิ่ม: WMS.UI.Printer.CH คุมเฉพาะเครื่องที่ location type = Warehouse — Admin เคยมองเห็นทุกเครื่องเสมอ แต่
    // เครื่อง Warehouse ทำให้เกิดปัญหา Admin เผลอลั่นปริ้นท์ผิดเครื่องข้ามแผนกได้ เลยต้องกันไว้อีกชั้น: ไม่มี permission นี้ = มองไม่
    // เห็นเครื่อง Warehouse เลย ไม่ว่าจะเป็น Admin หรือมี myLocations ตรงกับ location ของเครื่องนั้นพอดีก็ตาม (คุมก่อน location filter
    // ปกติเสมอ เพราะปกติ Admin จะ return printers ดิบทั้งหมดไปเลยโดยไม่ผ่าน location filter ด้านล่าง)
    let list = printers
    if (!_printerHasWarehousePermission()) {
        list = list.filter(p => {
            const loc = typeof _locIdMap !== 'undefined' ? _locIdMap.get(p.locationId) : null
            return (loc?.typeName || '').toLowerCase() !== 'warehouse'
        })
    }

    if (isAdmin) return list

    // ใช้ myPrinterLocationIds (รวม Parent ที่ได้สิทธิ์ + ลูกทุกชั้น) ไม่ใช่ myLocations (ไม่มี Parent ตั้งแต่ V1.0.11) — ไม่งั้น printer
    // ที่ผูกกับ location Parent (เช่น Busrun/WIP) จะหายไปหมด ขึ้น "No printers found" ทั้งที่ user มีสิทธิ์ location นั้น
    const allowedLocIds = typeof myPrinterLocationIds !== 'undefined' && myPrinterLocationIds.size
        ? myPrinterLocationIds
        : new Set((typeof myLocations !== 'undefined' ? myLocations : []).map(l => l.id))
    return list.filter(p => allowedLocIds.has(p.locationId))
}

function _printerHasWarehousePermission() {
    try {
        const user  = JSON.parse(localStorage.getItem('user') || '{}')
        const perms = Array.isArray(user.permissions) ? user.permissions : []
        return perms.includes('WMS.UI.Printer.CH')
    } catch (_) { return false }
}
