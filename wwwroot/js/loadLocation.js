let _locNameMap = new Map()


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

      arr.forEach(loc => _locNameMap.set(loc.locationCode, loc))
  } catch (err) {
      console.error('loadLocation:', err)
  }
}

// Function แปลง Loc Code เป็น Loc Name
function locName(code) {
  if (!code) return '-'
  return _locNameMap.get(code)?.displayName || code
}

