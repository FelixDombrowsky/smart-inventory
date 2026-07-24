/*const CONFIG = {

AUTH_API : "http://10.204.32.135:15000",
INVENTORY_API : "https://10.204.32.135:5207"


// Deploy
// const CONFIG = {
//     AUTH_API : "",
//     INVENTORY_API : "/api"
// };

// New Deploy
// const CONFIG = {
//     AUTH_API : "auth",
//     INVENTORY_API : "inventory"
// };
}*/



// ข้อความ footer (ปีลิขสิทธิ์ + เวอร์ชัน) ใช้ร่วมกันทุกหน้า — _Layout.cshtml, Login.cshtml, Register.cshtml
// จุดเดียวที่ต้องแก้ตอน bump ปี/เวอร์ชัน แยกออกมานอก CONFIG เพราะไม่ผูกกับ environment (Test/Deploy)
const APP_FOOTER = "© 2026 WMS V1.0.2";

// For Deploy 24/07/26
const CONFIG = {
    AUTH_API : "/api/auth",
    USERS_API : "/api/users",
    SESSION_API: "/api/session",
    INVENTORY_API : "/api/wms",
    TOKEN_API: "/api/token"
}

// For Test
// const CONFIG = {
//     AUTH_API : "http://10.204.212.28:15000/auth",
//     USERS_API : "http://10.204.212.28:15000/users",
//     INVENTORY_API : "http://10.204.212.28:5207",
//     SESSION_API: "http://10.204.212.28:15000/session",
//     TOKEN_API: "http://10.204.212.28:15000/token",
//     // INVENTORY_API : "http://10.204.32.217:5207"
// };



