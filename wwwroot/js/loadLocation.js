// All Location
let Locations = []
let locations = []   // ตัวจริงที่ loadLocation() ใช้ (Locations ด้านบนเป็นตัวที่ไม่มีใครใช้) — ต้อง declare ไว้ก่อน ไม่งั้นหน้าไหนที่ไม่เคย
                      // เรียก loadLocation() มาก่อนเลย (เช่น Receive.cshtml ที่เรียกแต่ loadPerLocation()) จะอ่าน locations.length ไม่ได้ (ReferenceError)
let _locNameMap = new Map()
let _locIdMap = new Map()

// เก็บ id ของ location ที่ isActive = true ไว้ (เติมตอน loadLocation()) — ใช้กรอง myLocations ใน loadPerLocation()
// เพราะ /location/{id}/tree (ที่ loadPerLocation ใช้) ไม่มี field isActive ติดมาด้วยเลย ต่างจาก /location เต็มๆ ที่ loadLocation() ใช้
let ActiveLocation = new Set()

// Permission Location
let myLocations = []
// id ของ location ที่ใช้กรอง printer (loadPrinter.js) — ต่างจาก myLocations ตรงที่ "รวม Parent ที่ได้สิทธิ์ด้วยเสมอ" + ลูกทุกชั้นถ้าติ๊ก Children
// (myLocations ตั้งใจไม่เอา Parent ไว้ให้ dropdown เลือก location แต่ printer มักผูกกับ location Parent เช่น Busrun/WIP)
let myPrinterLocationIds = new Set()


// โหลดทุก location มาเก็บไว้ใน Map
async function loadLocation() {
  const PAGE_SIZE = 500
  try {
      // 1) หน้าแรก — เอาทั้ง data และ total เพื่อคำนวณจำนวนหน้า
      const first = await api(`/location?page=1&pageSize=${PAGE_SIZE}`, 'GET')
      let arr     = Array.isArray(first) ? first : (first?.data || [])
      const total = first?.total ?? arr.length
      const pages = Math.ceil(total / PAGE_SIZE)   // ceil ไม่ใช่ round — กันตกหน้าสุดท้าย

      // 2) หน้า 2..pages ยิงพร้อมกันทีเดียว (เร็วกว่า await ทีละหน้า)
      if (pages > 1) {
          const rest = await Promise.all(
              Array.from({ length: pages - 1 }, (_, i) =>
                  api(`/location?page=${i + 2}&pageSize=${PAGE_SIZE}`, 'GET')
              )
          )
          rest.forEach(r => {
              const part = Array.isArray(r) ? r : (r?.data || [])
              arr = arr.concat(part)
          })
      }

      locations = arr
      console.log("Location Arrs : ", locations)


      arr.forEach(loc => _locNameMap.set(loc.locationCode, loc))
      console.log("_locNameMap : ", _locNameMap)
      arr.forEach(loc => _locIdMap.set(loc.id, loc))
      ActiveLocation = new Set(arr.filter(loc => loc.isActive !== false).map(loc => loc.id))
  } catch (err) {
      console.error('loadLocation:', err)
  }
}

// โหลด location ที่ user ใช้ได้
async function loadPerLocation() {
    try {
        // Get User employeeId
        let userInfo = JSON.parse(localStorage.getItem('user'))
        console.log("User Info : ", userInfo)
        
        // เอาไปเช็คว่า User Register App นี้หรือยัง

        const users = await api(`/users`,'GET')
        console.log("Users : ", users)
        //let allUsers =  usersisArray(users)? users : []
        const user = users.find(user => user.employeeId === userInfo.employeeCode)
        console.log("User : ", user)
        // if (!user) return 

        const myLocation = await api(`/users/${user.id}/location-permissions`, 'GET')
        console.log("My Location : ", myLocation)

        // ActiveLocation/_locIdMap เติมตอน loadLocation() — ต้องมีก่อนใช้ _locIdMap หา Parent ตัวเองด้านล่าง (กรณี includeChildren = false)
        if (!locations.length) await loadLocation()

        let locationItemsToMerge = [];

        // includeChildren = true  -> เอาแค่ลูก (ไม่เอา Parent) จาก /location/{id}/children
        // includeChildren = false -> เอาแค่ Parent (location ที่ถูกเลือกไว้ตัวเดียว) จาก _locIdMap ที่โหลดไว้แล้ว ไม่ต้องยิง API ซ้ำ
        for (let i = 0; i < myLocation.length; i++){
            if (!myLocation[i].canRead) continue
            let locId = myLocation[i].locationId

            if (myLocation[i].includeChildren) {
                const children = await api(`/location/${locId}/children`, 'GET')
                console.log("Loc Children : ", children)
                if (Array.isArray(children)) locationItemsToMerge.push(children)
            } else {
                const parent = _locIdMap.get(locId)
                if (parent) locationItemsToMerge.push(parent)
            }
        }

        const totalArr = mergeUniqueById(...locationItemsToMerge)
        //console.log("All Location after Merge : ", totalArr)

        myLocations = totalArr.filter(loc => ActiveLocation.has(loc.id));
        console.log("My Locations : ", myLocations)

        myPrinterLocationIds = _buildPrinterLocationIds(myLocation, totalArr)
        console.log("My Printer Location Ids : ", myPrinterLocationIds)
        // return totalArr

    } catch(err) {
        console.error('loadPerLocation:', err)
    }
}

// Parent ที่ได้สิทธิ์ (canRead) ทุกตัว + ถ้า includeChildren ให้รวมลูกทุกชั้นด้วย (ไล่ parentLocationId จาก location master ที่ loadLocation()
// โหลดไว้แล้ว — /location/{id}/children อาจให้แค่ลูกชั้นเดียว) + ลูกที่ได้จาก API มารวมด้วยกันพลาด — เก็บเฉพาะ location ที่ active
function _buildPrinterLocationIds(permissions, childrenFromApi) {
    const childrenOf = new Map()
    locations.forEach(l => {
        if (l.parentLocationId == null) return
        if (!childrenOf.has(l.parentLocationId)) childrenOf.set(l.parentLocationId, [])
        childrenOf.get(l.parentLocationId).push(l.id)
    })
    const ids = new Set(childrenFromApi.map(l => l.id))
    const visited = new Set()   // แยกจาก ids — ลูกที่ได้จาก API อยู่ใน ids แล้ว แต่ยังต้องไล่ลงไปหาหลานของมันต่อ
    permissions.filter(p => p.canRead).forEach(p => {
        ids.add(p.locationId)
        if (!p.includeChildren) return
        const queue = [p.locationId]
        while (queue.length) {
            const id = queue.shift()
            if (visited.has(id)) continue
            visited.add(id)
            ids.add(id)
            queue.push(...(childrenOf.get(id) || []))
        }
    })
    return new Set([...ids].filter(id => ActiveLocation.has(id)))
}

function mergeUniqueById(...inputs) {
    const flatArray = inputs.flatMap(item => 
        Array.isArray(item) ? item : [item]
    );

    const uniqueMap = new Map(flatArray.map(item => [item.id, {...item}]))
    
    return Array.from(uniqueMap.values());
}

// Function แปลง Loc Code เป็น Loc Name
function locName(code) {
  if (!code) return '-'
  return _locNameMap.get(code)?.displayName || code
}





