async function api(url, method = "GET", body){

    let token = localStorage.getItem("token")

    let res = await fetch(`/api${url}`, {
        method: method,
        headers: {
            "Content-Type":"application/json",
            "Authorization":"Bearer " + token
        },
        body: body ? JSON.stringify(body) : null
    })

    return res
}