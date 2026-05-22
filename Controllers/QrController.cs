using Microsoft.AspNetCore.Mvc;
using QRCoder;

namespace SmartFactory.Inventory.UI.Controllers;

[ApiController]
[Route("api/qr")]
public class QrController : ControllerBase
{
    [HttpGet("image")]
    public IActionResult Image([FromQuery] string data, [FromQuery] int scale = 5, [FromQuery] string ecl = "M")
    {
        if (string.IsNullOrWhiteSpace(data))
            return BadRequest("data is required");

        scale = Math.Clamp(scale, 1, 20);

        var eccLevel = ecl.ToUpperInvariant() switch
        {
            "L" => QRCodeGenerator.ECCLevel.L,
            "Q" => QRCodeGenerator.ECCLevel.Q,
            "H" => QRCodeGenerator.ECCLevel.H,
            _   => QRCodeGenerator.ECCLevel.M
        };

        using var gen    = new QRCodeGenerator();
        var qrData       = gen.CreateQrCode(data, eccLevel);
        using var qrCode = new PngByteQRCode(qrData);
        var bytes        = qrCode.GetGraphic(scale);

        return File(bytes, "image/png");
    }
}
