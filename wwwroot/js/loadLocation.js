let _locNameMap = new Map()

async function loadLocation() {
  try {
    const res = await api('/location?pageSize=500', 'GET')
    const arr = Array.isArray(res) ? res : (res?.data || [])
    arr.forEach(loc => {
      _locNameMap.set(loc.locationCode, loc)
    })
  } catch (err) {
    console.error('loadLocation:', err)
  }
}

function locName(code) {
  if (!code) return '-'
  return _locNameMap.get(code)?.displayName || code
}