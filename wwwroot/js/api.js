// async function api(url, method = "GET", body){

//     let token = localStorage.getItem("token")

//     let res = await fetch(`/api${url}`, {
//         method: method,
//         headers: {
//             "Content-Type":"application/json",
//             "Authorization":"Bearer " + token
//         },
//         body: body ? JSON.stringify(body) : null
//     })

//     return res
// }

// async function api(url, method = "GET", body){
//     let token = localStorage.getItem("token");

//     // 🔥 เช็กว่าถ้า url มี http อยู่แล้ว ให้ใช้ url นั้นตรงๆ เลย
//     // แต่ถ้าไม่มี (เป็นแค่ path สั้นๆ) ค่อยเติม CONFIG.INVENTORY_API เข้าไป
//     let finalUrl = url.startsWith("http") ? url : (CONFIG.INVENTORY_API + url);

//     let res = await fetch(finalUrl, { // ใช้ finalUrl แทน
//         method: method,
//         headers: {
//             "Content-Type":"application/json",
//             "Authorization":"Bearer " + token
//         },
//         body: body ? JSON.stringify(body) : null
//     });

//     return res;
// }

// controller.signal -> ส่งให้ fetch ดักฟัง
// controller.abort() -> method ที่เรียกแล้วจะสั่ง "ยกเลิก" สัญญาณ

// ดึงข้อความ error จาก response ที่ res.ok เป็น false — ใช้ร่วมกับ apiForm.js ด้วย
// พยายามอ่านเป็น JSON ก่อน ถ้า response ไม่ใช่ JSON (เช่น 403 จาก auth middleware ที่ไม่มี body
// หรือคืนเป็น text/html เปล่าๆ) ให้ fallback ไปโชว์ raw text แทน "HTTP {status}" เฉยๆ ที่ไม่บอกอะไรเลย
//
// รูปแบบ permission-denied เฉพาะของ backend นี้ (PascalCase, ไม่ใช่ ProblemDetails ปกติ):
//   { "Message": "Permission denied", "RequiredPermissions": ["WMS.Lot.Split"], "UserPermissions": [...] }
// ดึงมาโชว์แค่ Message + RequiredPermissions (UserPermissions ยาวเกินไป ไม่มีประโยชน์กับ user ปลายทาง)
async function _extractErrorMessage(res) {
    const raw = await res.text().catch(() => '');
    if (!raw) return `HTTP ${res.status}`;
    try {
        const errorData = JSON.parse(raw);
        if (typeof errorData === 'string') return errorData;

        const requiredPerms = errorData?.RequiredPermissions ?? errorData?.requiredPermissions;
        if (Array.isArray(requiredPerms) && requiredPerms.length) {
            const msg = errorData?.Message ?? errorData?.message ?? 'Permission denied';
            return `${msg} — Required: ${requiredPerms.join(', ')}`;
        }

        return errorData?.detail ?? errorData?.message ?? errorData?.title
            ?? errorData?.Message ?? `HTTP ${res.status}`;
    } catch {
        return raw.length <= 300 ? raw : `HTTP ${res.status}`;
    }
}

// api.js
async function api(url, method = "GET", body, timeoutMs) {
    let token = localStorage.getItem("token");
    let finalUrl = url.startsWith("http") ? url : (CONFIG.INVENTORY_API + url);

    const controller = timeoutMs ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    let res;
    try {
        res = await fetch(finalUrl, {
            method: method,
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: body ? JSON.stringify(body) : null,
            signal: controller ? controller.signal : undefined
        });
    } catch (err) {
        // กรณีที่ Server ยังไม่ตอบกลับมาภายใน 10 วินาที เช่น เครื่องปริ้น offline จะตัดการรอทิ้ง
        if (err.name === 'AbortError') throw new Error('Connection Timed Out');
        throw err;
    } finally {
        if (timer) clearTimeout(timer);
    }

    // ตรวจสอบว่าถ้าหน้าบ้านดึงข้อมูลไม่สำเร็จ (เช่น 401 Unauthorized) ให้โยน Error ออกไป
    if (!res.ok) {
        const error = new Error(await _extractErrorMessage(res));
        error.status = res.status;
        throw error;
    }

    // คืนค่าเป็น JSON ข้อมูลจริงๆ ออกไปเลย
    // เช็ค body ว่าง (เช่น 200/204 ที่ไม่ส่ง body มา — พบบ่อยใน PUT/DELETE) ก่อน parse
    // ไม่งั้น res.json() จะ throw "Unexpected end of JSON input" ทั้งที่ request สำเร็จจริง
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}