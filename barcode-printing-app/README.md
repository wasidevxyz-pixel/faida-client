# 🖨️ Barcode Printing Desktop App (.NET WinForms)

> **Part of Bilal Accounting System (BAS)**  
> **Core Developers**: **Mr. Wasi** (Backend API & Data Contracts) & **Bilal Shah** (UI/UX & Workflow Design)

---

## 📌 Overview
This is a standalone C# (.NET 8.0-windows) Windows Forms desktop application designed for high-speed thermal label and A4 barcode sticker printing for retail and pharmacy branches.

## 🛠️ Key Capabilities
- **Live Inventory Sync**: Connects to the BAS Backend REST API to fetch live item details, pricing, SKUs, and barcodes.
- **Thermal & Sheet Printing**: Generates barcode stickers (Code 128, EAN-13, QR codes) formatted for thermal sticker printers (Zebra, TSC, Xprinter) and standard A4 sheet reports via Crystal Reports (`BarcodeReport.rpt`).
- **Fast Search**: Keyboard-driven item lookup dialog (`SearchForm.cs`).

## 📁 Key Files
- `Program.cs` - WinForms application entry point.
- `LoginForm.cs` - Desktop authentication with JWT session storage.
- `MainForm.cs` - Label designer, sticker layout, preview, and print execution.
- `SearchForm.cs` - Fast autocomplete item search dialog.
- `Config.cs` & `appsettings.json` - Backend endpoint URL and printer configurations.
- `Models.cs` - C# DTOs for items, auth, and printer settings.
- `BarcodeReport.rpt` - Crystal Reports label layout template.

## 🚀 Building & Running
Requires .NET 8 SDK on Windows.

```powershell
# Restore & Build
dotnet build

# Run in Development
dotnet run

# Publish Standalone Portable Executable
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
```

## ⚠️ Developer & AI Agent Notes
- All source files in this folder are strictly C#.
- Do not add direct MongoDB connection strings; all data is fetched via REST API endpoints.
- Build logs and compilation outputs (`bin/`, `obj/`, `publish_output/`) are excluded via `.gitignore`.
