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

async function api(url, method = "GET", body){
    let token = localStorage.getItem("token");

    // 🔥 เช็กว่าถ้า url มี http อยู่แล้ว ให้ใช้ url นั้นตรงๆ เลย
    // แต่ถ้าไม่มี (เป็นแค่ path สั้นๆ) ค่อยเติม CONFIG.INVENTORY_API เข้าไป
    let finalUrl = url.startsWith("http") ? url : (CONFIG.INVENTORY_API + url);

    let res = await fetch(finalUrl, { // ใช้ finalUrl แทน
        method: method,
        headers: {
            "Content-Type":"application/json",
            "Authorization":"Bearer " + token
        },
        body: body ? JSON.stringify(body) : null
    });

    return res;
}