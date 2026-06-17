// apiForm.js — เหมือน api.js แต่ส่งแบบ multipart/form-data (requestJson + files)
async function apiForm(url, requestJson, files, timeoutMs, method = "POST", fieldName = "images") {
    let token = localStorage.getItem("token");

    let finalUrl = url.startsWith("http") ? url : (CONFIG.INVENTORY_API + url);
    finalUrl += "?requestJson=" + encodeURIComponent(JSON.stringify(requestJson));

    const formData = new FormData();
    files.forEach(blob => formData.append(fieldName, blob, "photo.jpg"));

    const controller = timeoutMs ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    let res;
    try {
        res = await fetch(finalUrl, {
            method: method,
            headers: {
                "Authorization": "Bearer " + token
            },
            body: formData,
            signal: controller ? controller.signal : undefined
        });
    } catch (err) {
        if (err.name === 'AbortError') throw new Error('Connection Timed Out');
        throw err;
    } finally {
        if (timer) clearTimeout(timer);
    }

    if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const msg = typeof errorData === 'string'
            ? errorData
            : (errorData?.detail || errorData?.message || errorData?.title || `HTTP ${res.status}`);
        throw new Error(msg);
    }

    return await res.json();
}
