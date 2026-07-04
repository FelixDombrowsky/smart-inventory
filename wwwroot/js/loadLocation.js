// All Location
let Locations = []
let _locNameMap = new Map()
let _locIdMap = new Map()

// Permission Location
let myLocations = []


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

        let locationItemsToMerge = [];

        // /location/{id}/tree -> Parent + Child
        // length = 3    1, 2 , 3
        for (let i = 0; i < myLocation.length; i++){
            let locId = myLocation[i].locationId

            const locTree = await api(`/location/${locId}/tree`, 'GET')

            if(myLocation[i].canRead) {

                if(myLocation[i].includeChildren) {
                // มีลูก
                    console.log("Loc Tree : ", locTree)
                //console.log("Parent : ", locTree[0])
                    locationItemsToMerge.push(locTree)
                }else {
                // ไม่มีลูก
                //const locTree = await api(`/location/${locId}/tree`, 'GET')                
                    if (Array.isArray(locTree) && locTree.length > 0){
                         locationItemsToMerge.push(locTree[0])
                    }    
                }

            }

        }
        //const findLocationTree = await api(`/location/${myLocation.id}`)
        // /location/{id}/children -> Only Child

        const totalArr = mergeUniqueById(...locationItemsToMerge)
        //console.log("All Location after Merge : ", totalArr)
        myLocations = totalArr;
        console.log("My Locations : ", myLocations)
        // return totalArr

    } catch(err) {
        console.error('loadPerLocation:', err)
    }
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





