using Microsoft.AspNetCore.Mvc;

namespace SmartFactory.Inventory.UI.Controllers;

[ApiController]
[Route("api/zpl")]
public class ZplController : ControllerBase
{
    private static readonly HttpClient _http = new();

    [HttpPost("preview")]
    public async Task<IActionResult> Preview([FromBody] ZplPreviewRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Zpl))
            return BadRequest("zpl is required");

        var dpi    = req.Dpi ?? "8dpmm";
        var width  = req.Width  > 0 ? req.Width  : 4;
        var height = req.Height > 0 ? req.Height : 3;

        var url  = $"https://api.labelary.com/v1/printers/{dpi}/labels/{width}x{height}/0/";
        var form = new MultipartFormDataContent();
        form.Add(new StringContent(req.Zpl), "file", "label.zpl");

        using var labelaryRes = await _http.PostAsync(url, form);
        if (!labelaryRes.IsSuccessStatusCode)
            return StatusCode((int)labelaryRes.StatusCode, "Labelary error");

        var bytes       = await labelaryRes.Content.ReadAsByteArrayAsync();
        var contentType = labelaryRes.Content.Headers.ContentType?.MediaType ?? "image/png";
        return File(bytes, contentType);
    }
}

public class ZplPreviewRequest
{
    public string  Zpl    { get; set; } = "";
    public string? Dpi    { get; set; }
    public double  Width  { get; set; }
    public double  Height { get; set; }
}
