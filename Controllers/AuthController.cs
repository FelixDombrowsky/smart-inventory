using Microsoft.AspNetCore.Mvc;

namespace SmartFactory.Inventory.Controllers;

public class AuthController : Controller
{

    [HttpGet("/login")]
    public IActionResult Login()
    {
        return View();
    }
    [HttpGet("/register")]
    public IActionResult Register()
    {
        return View();
    }

}

