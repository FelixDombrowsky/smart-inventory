
let scannedTrace = new Set()

function removeRow(btn){
    let row = btn.closest("tr")
    let traceId = row.querySelector(".traceId")?.value
    if(traceId){
        scannedTrace.delete(traceId)
    }
    row.remove()
}

function showResult(message,isSuccess){
    let el = document.getElementById("scanResult")
    el.innerText = message
    el.className = "scan-result " + (isSuccess ? "success":"error")
    el.style.display="block"
    setTimeout(()=>{ el.style.display="none" },2000)
}

function beep(){
    new Audio("sounds/beep.mp3").play()
}
