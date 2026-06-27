using Microsoft.AspNetCore.Mvc;

namespace SmartFactory.Inventory.UI.Controllers;

public class InventoryController : Controller
{


    public IActionResult Dashboard()
    {
        return View();
    }

    public IActionResult Lots()
    {
        return View();
    }

    public IActionResult Receive()
    {
        return View();
    }

    public IActionResult Move()
    {
        return View();
    }

    public IActionResult Reserve()
    {
        return View();
    }

    public IActionResult Transfer()
    {
        return View();
    }

    public IActionResult Transactions()
    {
        return View();
    }
    public IActionResult WorkOrders()
    {
        return View();
    }

    public IActionResult WorkOrderLots()
    {
        return View();
    }

    public IActionResult MasterManagement()
    {
        return RedirectToAction("MasterLocations");
    }

    public IActionResult MasterLocations()
    {
        return View("Master/Locations");
    }

    public IActionResult MasterItems()
    {
        return View("Master/Items");
    }

    public IActionResult MasterWorkOrders()
    {
        return View("Master/WorkOrders");
    }

    public IActionResult MasterBomProfiles()
    {
        return View("Master/BomProfiles");
    }

    public IActionResult MasterAmrLocations()
    {
        return View("Master/AmrLocations");
    }

    public IActionResult MasterPackages()
    {
        return View("Master/Packages");
    }

    public IActionResult MasterPrinters()
    {
        return View("Master/Printers");
    }

    public IActionResult MasterUsers()
    {
        return View("Master/Users");
    }

    public IActionResult OpDashboard()
    {
        return View();
    }

    public IActionResult PrintQR()
    {
        return View();
    }

    public IActionResult LotDetail()
    {
        return View();
    }

    // เพิ่ม Action นี้เข้าไปในไฟล์ InventoryController
    [HttpGet]
    public IActionResult GetOnlineStatus()
    {
        // คืนค่าตัวเลข 1 ไปก่อนให้หน้าจอหายแดง
        return Ok(1);
    }


}