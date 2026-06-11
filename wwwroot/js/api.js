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
        if (err.name === 'AbortError') throw new Error('Connection Timed Out');
        throw err;
    } finally {
        if (timer) clearTimeout(timer);
    }

    // ตรวจสอบว่าถ้าหน้าบ้านดึงข้อมูลไม่สำเร็จ (เช่น 401 Unauthorized) ให้โยน Error ออกไป
    if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const msg = typeof errorData === 'string'
            ? errorData
            : (errorData?.detail || errorData?.message || errorData?.title || `HTTP ${res.status}`);
        throw new Error(msg);
    }

    // คืนค่าเป็น JSON ข้อมูลจริงๆ ออกไปเลย
    return await res.json();
}