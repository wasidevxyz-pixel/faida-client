# 🖐️ Biometric Attendance Desktop App (.NET WinForms)

> **Part of Bilal Accounting System (BAS)**  
> **Core Developers**: **Mr. Wasi** (Backend Attendance Engine & Sync API) & **Bilal Shah** (Biometric UI & Operations)

---

## 📌 Overview
This is a standalone C# (.NET 8.0-windows) Windows Forms desktop application that interfaces directly with physical fingerprint / biometric scanners at store and warehouse branches to log employee daily clock-in and clock-out attendance.

## 🛠️ Key Capabilities
- **Fingerprint Hardware Integration**: Native COM wrapper integration with DigitalPersona U.are.U SDK and compatible optical fingerprint readers.
- **Employee Biometric Enrollment**: Registers fingerprint biometric templates (`EnrollmentForm.cs`) and syncs them securely to the centralized BAS Backend.
- **Real-Time Punch Logging**: Captures employee finger scans, matches them locally, and pushes attendance punch events to `POST /api/attendance/punch` on the BAS Backend API.
- **Offline Resiliency**: Caches punches locally if the store network is temporarily offline and automatically synchronizes when reconnected.

## 📁 Key Files
- `Program.cs` - Hardware initialization and application entry point.
- `Form1.cs` / `MainForm.cs` - Real-time punch monitor and clock-in/out visual logger.
- `EnrollmentForm.cs` - Biometric template registration and fingerprint scanner UI.
- `LoginForm.cs` - Admin authentication screen.
- `Config.cs` & `appsettings.json` - Backend endpoint URL, branch ID, and device configs.
- `Models.cs` - Employee and attendance data models.
- `Lib/` - ⚠️ Native unmanaged and managed SDK DLLs (DigitalPersona `DPFPDevNET.dll`, etc.).

## ⚠️ Critical Rule: Preserve `Lib/` SDK DLLs
- **Do NOT delete, relocate, or overwrite the DLLs in `biometric-app/Lib/`**. They are required for communication with physical fingerprint scanners.
- Do not connect directly to MongoDB from this app; all data synchronization occurs via REST API.
- Build logs and compilation outputs (`bin/`, `obj/`, `publish_output/`) are excluded via `.gitignore`.

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
