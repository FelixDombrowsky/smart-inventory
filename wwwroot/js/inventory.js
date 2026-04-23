async function receiveMaterial(){

let data = {

itemCode: document.getElementById("itemCode").value,
locationCode: document.getElementById("locationCode").value,
quantity: parseInt(document.getElementById("qty").value)

}

await fetch("/api/inventory/receive",{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify(data)

})

alert("Receive Success")

}