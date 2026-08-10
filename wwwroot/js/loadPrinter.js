// loadPrinter.js — จุดเดียวที่กรอง printer list ตามสิทธิ์ของ user (ใช้ร่วมกันได้ทุกหน้า)
// แทนที่ระบบเดิม (filterPrintersByPermission ใน zplBuilder.js / _rpFilterPrintersByPermission ใน PrintQR.cshtml)
// ที่เทียบ permission string ชื่อ WMS.UI.Printer.<PREFIX> กับ prefix ของชื่อเครื่องพิมพ์
//
// แนวคิดใหม่: เทียบ printer.locationId กับ location ที่ user มีสิทธิ์เข้าถึงจริง (canRead) แทน
// โดยอิง myLocations ที่โหลดไว้แล้วจาก loadPerLocation() ใน loadLocation.js (ซึ่งดึงจาก
// GET /users/{id}/location-permissions แล้ว expand เป็น tree ให้ครบ รวม location ลูกถ้า includeChildren)
//
// ต้องเรียก await loadPerLocation() ให้เสร็จก่อนเสมอ ไม่งั้น myLocations จะว่าง แล้ว user ทั่วไปจะไม่เห็น printer เลยสักเครื่อง
// isAdmin เห็นทุกเครื่องเสมอ (พฤติกรรมเดิมไม่เปลี่ยน)
function filterPrintersByLocation(printers, isAdmin) {
    if (isAdmin) return printers

    const allowedLocIds = new Set((typeof myLocations !== 'undefined' ? myLocations : []).map(l => l.id))
    return printers.filter(p => allowedLocIds.has(p.locationId))
}
