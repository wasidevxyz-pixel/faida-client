# BAS Monorepo - Master AI Agent & Developer Architecture Guide

> **CRITICAL FOR ALL AI AGENTS (Antigravity, Cursor, Claude, Copilot, ChatGPT, etc.)**:
> This repository is a **Monorepo** containing **four distinct primary codebases** and two auxiliary services.
> **DO NOT MIX UP THEIR TECH STACKS, DEPENDENCIES, OR CODE PATTERNS.**
> Always identify which codebase you are working in and strictly adhere to its specific guidelines and boundaries.
> 
> **Core Development Team**:
> - **Mr. Wasi** (`@wasidevxyz-pixel`) - Lead Backend Engineer & Systems Architect
> - **Bilal Shah** (`@bilalshah`) - Lead Frontend Engineer & UI/UX Architect

---

## 🗺️ Monorepo Codebase Matrix

| Codebase | Directory Path | Tech Stack | Type | Purpose & Target |
| :--- | :--- | :--- | :--- | :--- |
| **1. Main BAS ERP (Core)** | `/Backend` & `/Frontend` | Node.js, Express, MongoDB (Mongoose), EJS, Vanilla JS, CSS | Web App & API | Central ERP, POS, Accounting, Ledger, Inventory, Authentication & REST APIs |
| **2. Barcode Print App** | `/barcode-printing-app` | C# (.NET 8.0-windows), WinForms, Crystal Reports | Windows Desktop | Standalone desktop app for thermal label & A4 barcode sticker printing |
| **3. Biometric Attendance** | `/biometric-app` | C# (.NET 8.0-windows), WinForms, DigitalPersona SDK (`Lib/`) | Windows Desktop | Standalone desktop app for fingerprint device integration & attendance logging |
| **4. Mobile App** | `/mobile-app` | React Native, Expo SDK, React Navigation, Axios | Mobile (iOS / Android) | Companion mobile app for real-time sales dashboards, inventory & camera barcode scan |
| **5. AI Brain Service** | `/ai-brain` | Python (FastAPI, Uvicorn), Ollama / vLLM local LLM | Local Microservice | Isolated AI assistant for natural language accounting insights and screen navigation |
| **6. System Scripts** | `/scripts` | Node.js standalone scripts | CLI Utilities | Database audits, stock fixes, permission repairs, and backup utilities |

---

## 🚫 Cardinal Rules for AI Agents (Never Violate)

1. **Strict Stack Isolation**:
   - **C# / WinForms code** belongs ONLY in `/barcode-printing-app` and `/biometric-app`. Never put C# code in `/Backend`, `/Frontend`, or `/mobile-app`.
   - **React Native / Expo code** belongs ONLY in `/mobile-app`. Never import React or React Native into `/Frontend` (which is Vanilla JS + EJS).
   - **Node.js / Express / Mongoose code** belongs ONLY in `/Backend` (and standalone `/scripts`). Never import Mongoose or backend controllers into desktop or mobile apps.
   - **Python code** belongs ONLY in `/ai-brain`.

2. **Package Management & Dependencies**:
   - **Root `package.json`**: Only contains workspace-level tooling and main server startup.
   - **`Backend/package.json`**: Contains backend dependencies (Express, Mongoose, Socket.io, JWT, bcrypt, etc.). Always run `npm install` inside `/Backend` when modifying backend libraries.
   - **`mobile-app/package.json`**: Contains mobile dependencies. **ALWAYS** use `npx expo install <package>` or `npm install` inside `/mobile-app`. **NEVER** install mobile packages in the root or `/Backend`.
   - **C# .csproj files**: Manage .NET dependencies via NuGet in `BarcodePrintingApp.csproj` and `BiometricApp.csproj`.

3. **Data Access & Communication Architecture**:
   - **MongoDB is private to Backend**: Only `/Backend` (and `/scripts`) connects directly to MongoDB via Mongoose.
   - **Client Apps communicate via HTTP REST API**:
     - `barcode-printing-app` connects to `http://<server-ip>:5000/api/...`
     - `biometric-app` connects to `http://<server-ip>:5000/api/...`
     - `mobile-app` connects to `http://<server-ip>:5000/api/...`
     - `ai-brain` is an isolated HTTP service queried by `Backend/services/aiDataAgentService.js`.
   - **Never** add direct database connection strings to desktop or mobile apps.

4. **Hardware SDK Preservation**:
   - The directory `/biometric-app/Lib/` contains native unmanaged and managed SDK DLLs (`DPFPDevNET.dll`, `DPFPEngNET.dll`, etc.) necessary for physical fingerprint scanners. **Never delete, relocate, or overwrite these DLLs.**

5. **Build Outputs & Git Hygiene**:
   - All compilation artifacts (`bin/`, `obj/`, `publish_out*/`, `.expo/`, `dist/`, `build/`, `*.exe`, `*.pdb`) and build logs (`*build_error*.txt`, `*build_log*.txt`, `*.log`) are ignored by `.gitignore`.
   - Never commit build output logs, portable releases, or temporary debug files to Git.

---

## 📁 Detailed Codebase Breakdown

```
BAS-SOFTWARE/
├── Backend/                   # [Codebase 1 - Backend] Node.js Express REST API & Core ERP Logic
│   ├── config/                # DB connection, AI action catalog, roles & permissions
│   ├── controllers/           # HTTP Request & response handlers
│   ├── middleware/            # JWT Auth, Branch Filter, Error Handling
│   ├── models/                # Mongoose Database Models (Item, CashSale, Purchase, User, etc.)
│   ├── routes/                # Express API & Page Routes
│   ├── services/              # Business Logic (Ledger, Accounting, Inventory, AI)
│   ├── utils/                 # Helpers, formatters, calculators
│   ├── server.js              # Express app entry point
│   └── package.json           # Backend dependencies
│
├── Frontend/                  # [Codebase 1 - Frontend] Web UI (EJS + Vanilla JS + CSS)
│   ├── public/                # Static assets (css/, js/, images/)
│   │   ├── css/               # Modern desktop-style ERP theme & print stylesheets
│   │   └── js/                # Client-side controllers (pos.js, items.js, reports.js, etc.)
│   └── views/                 # EJS / HTML page templates (POS, Inventory, Ledgers, Reports)
│
├── barcode-printing-app/      # [Codebase 2] C# WinForms .NET 8 Desktop Barcode Print App
│   ├── BarcodePrintingApp.csproj
│   ├── Program.cs             # Application entry point
│   ├── MainForm.cs            # Barcode design, preview, and print workflow
│   ├── LoginForm.cs           # Desktop auth screen (calls BAS API)
│   ├── SearchForm.cs          # Fast item lookup dialog
│   ├── Models.cs              # C# DTOs (ItemDto, BarcodeItem, etc.)
│   ├── Config.cs              # API endpoints, printer configurations
│   ├── BarcodeReport.rpt      # Crystal Reports label template
│   └── appsettings.json       # App configuration settings
│
├── biometric-app/             # [Codebase 3] C# WinForms .NET 8 Desktop Biometric Attendance App
│   ├── BiometricApp.csproj
│   ├── Lib/                   # ⚠️ CRITICAL: DigitalPersona & Fingerprint SDK DLLs
│   ├── Program.cs             # Application entry point & hardware initialization
│   ├── Form1.cs / MainForm.cs # Real-time attendance punch monitoring screen
│   ├── EnrollmentForm.cs      # Biometric fingerprint enrollment screen
│   ├── LoginForm.cs           # Desktop authentication screen
│   ├── Models.cs              # Employee and Attendance DTOs
│   ├── Config.cs              # API endpoint and branch settings
│   └── appsettings.json       # App configuration settings
│
├── mobile-app/                # [Codebase 4] React Native / Expo Companion Mobile App
│   ├── src/
│   │   ├── api/               # Axios client for BAS Backend API
│   │   ├── components/        # Reusable UI components
│   │   ├── navigation/        # React Navigation stacks & tabs
│   │   ├── screens/           # Dashboard, Inventory, Scanner, Sales, Settings
│   │   └── utils/             # Mobile utilities and storage
│   ├── App.js                 # Root mobile component & providers
│   ├── app.json               # Expo configuration (camera permissions, bundle ID)
│   ├── eas.json               # Expo Application Services build configuration
│   └── package.json           # React Native / Expo dependencies
│
├── ai-brain/                  # [Codebase 5] Python FastAPI AI Analytics Microservice
│   ├── app/                   # FastAPI routes, models, LLM prompts
│   ├── requirements.txt       # Python dependencies (fastapi, uvicorn, pydantic)
│   └── README.md              # Local AI setup guide
│
├── scripts/                   # [Codebase 6] Standalone Database Maintenance & Migration Scripts
│   ├── fix-permissions.js
│   ├── audit-permissions.js
│   └── check_stock.js
│
├── AGENTS.md                  # 📖 Master AI agent instruction & boundary guide (THIS FILE)
├── PROJECT_STRUCTURE.md       # 🗺️ Architectural map and data flow diagrams
├── README.md                  # Project overview documentation
└── .gitignore                 # Monorepo-wide Git ignore rules
```

---

## 🛠️ Developer & Agent Workflow Protocols

### 1. Working on Main BAS Web ERP (`Backend/` & `Frontend/`)
- **Backend API Development**:
  - Always validate request input using standard controllers in `Backend/controllers/`.
  - Enforce branch-level isolation using `middleware/auth.js` (`applyBranchFilter`).
  - Perform double-entry ledger bookkeeping transactions through `Backend/services/`.
  - Database schema changes require updating files in `Backend/models/`.
- **Frontend UI Development**:
  - Frontend uses Vanilla JavaScript (in `Frontend/public/js/`) and EJS templates (in `Frontend/views/`).
  - Maintain the professional grayish-blue desktop-style theme in `Frontend/public/css/`.
  - Real-time updates utilize Socket.io (`Frontend/public/js/socket.js`).

### 2. Working on Barcode Printing App (`barcode-printing-app/`)
- **Language**: C# 12 / .NET 8.0 Windows Forms.
- **Key Flow**:
  1. User authenticates via `LoginForm.cs` -> calls `POST /api/users/login` on BAS Backend.
  2. Main screen fetches item pricing, SKU, barcodes from `GET /api/items` or `GET /api/items/search`.
  3. Form generates barcode sticker parameters (Code 128, EAN-13, QR) and sends print job to thermal/label printer or Crystal Reports.
- **Build / Run**:
  ```bash
  cd barcode-printing-app
  dotnet build
  dotnet run
  ```

### 3. Working on Biometric Attendance App (`biometric-app/`)
- **Language**: C# 12 / .NET 8.0 Windows Forms + Native Hardware Driver integration.
- **Key Flow**:
  1. Device scanner initializes through DigitalPersona SDK COM wrappers in `Lib/`.
  2. Employee places finger on physical scanner -> SDK extracts biometric feature template.
  3. `EnrollmentForm.cs` registers new fingerprint template and syncs to backend: `POST /api/attendance/enroll`.
  4. `Form1.cs` / `MainForm.cs` verifies punch against local cache/device and pushes punch to backend: `POST /api/attendance/punch`.
- **Build / Run**:
  ```bash
  cd biometric-app
  dotnet build
  dotnet run
  ```

### 4. Working on Mobile App (`mobile-app/`)
- **Framework**: Expo (SDK 50+ / 57), React Native.
- **Rules**:
  - Follow the latest Expo documentation.
  - Install packages using `npx expo install <pkg>` inside `/mobile-app`.
  - Use `src/api/` Axios instance configured with dynamic backend base URL.
  - Barcode scanning uses `expo-barcode-scanner` / `expo-camera`.
- **Development**:
  ```bash
  cd mobile-app
  npm install
  npx expo start
  ```

---

## 🔐 API & Authentication Reference Between Codebases

All satellite apps (`barcode-printing-app`, `biometric-app`, `mobile-app`) interface with the `Backend` through standard JSON REST APIs:

```
[ Barcode Printing Desktop App ] ───┐
                                    │
[ Biometric Attendance App ]    ────┼── HTTP REST / JSON ──► [ BAS Backend (Node.js/Express) ] ◄──► [ MongoDB ]
                                    │                            ▲
[ Mobile App (iOS / Android) ]  ────┘                            │
                                                                 ▼
                                                        [ AI Brain (FastAPI) ]
```

### Key API Endpoints:
- `POST /api/users/login` - Authenticate user, returns JWT token & user branch details.
- `GET /api/items` / `GET /api/items/search` - Retrieve inventory items, barcodes, sale rates, and stock levels.
- `POST /api/attendance/punch` - Record biometric clock-in / clock-out event from desktop hardware.
- `POST /api/attendance/sync` - Bulk synchronize offline attendance punches.
- `GET /api/sales/today-summary` - Summary metrics for mobile dashboard.
- `POST /api/ai/query` - Authenticated AI chat proxy forwarding requests to `ai-brain`.

---

## ✅ Checklist Before Committing Changes
- [ ] Are all edits placed in the correct codebase folder (`Backend`, `Frontend`, `barcode-printing-app`, `biometric-app`, or `mobile-app`)?
- [ ] Have you verified that no build logs (`*.log`, `build_error.txt`, etc.) or binaries (`bin/`, `obj/`, `.expo/`) are staged in Git?
- [ ] Did you install dependencies in the appropriate sub-directory `package.json`?
- [ ] Is `git status` clean with only intended source files modified?
