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
        return View();
    }

    public IActionResult OpDashboard()
    {
        return View();
    }


}