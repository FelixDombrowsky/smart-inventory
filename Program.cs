var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();

// 🔥 dynamic service URL
// var inventoryUrl = builder.Configuration["Services:Inventory"]
//                     ?? "http://inventory:5207";

// builder.Services.AddHttpClient("inventory", client =>
// {
//     client.BaseAddress = new Uri(inventoryUrl);
// });

var app = builder.Build();
app.UsePathBase("/wms");
app.UseRouting();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

// ❌ ไม่ใช้ HTTPS ใน container
// app.UseHttpsRedirection();

app.UseRouting();
app.UseAuthorization();


app.MapStaticAssets();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

app.MapGet("/", () => Results.Redirect("wms/login"));


app.Run();