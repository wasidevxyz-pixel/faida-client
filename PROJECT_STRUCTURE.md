# 🏗️ Bilal Accounting System (BAS) - Project Structure & Architecture

Welcome to the **Bilal Accounting System (BAS)** codebase map. This repository contains the complete ecosystem of software supporting pharmacy, retail, inventory, POS, accounting, barcode generation, biometric employee attendance, and mobile management.

**Core Development Team**:
- **Mr. Wasi** (`@wasidevxyz-pixel`) - Lead Backend Engineer & Systems Architect
- **Bilal Shah** (`@bilalshah`) - Lead Frontend Engineer & UI/UX Architect

---

## 🧭 High-Level Architecture

```mermaid
graph TD
    subgraph "Clients Layer"
        WebClient["🌐 Web Browser Client<br/>(POS, Invoicing, Ledgers, Reports)<br/><i>Frontend/</i>"]
        BarcodeDesktop["🖨️ Barcode Desktop App<br/>(Sticker Printing, Crystal Reports)<br/><i>barcode-printing-app/ (.NET C#)</i>"]
        BiometricDesktop["🖐️ Biometric Attendance App<br/>(Fingerprint SDK, Time & Attendance)<br/><i>biometric-app/ (.NET C#)</i>"]
        MobileApp["📱 Mobile Companion App<br/>(Dashboard, Quick Stock, Scanner)<br/><i>mobile-app/ (React Native / Expo)</i>"]
    end

    subgraph "Core Backend Layer"
        Backend["⚙️ BAS Core Backend API<br/>(Express.js, JWT, Socket.io, Business Logic)<br/><i>Backend/</i>"]
    end

    subgraph "Database & Microservices"
        Mongo[("🍃 MongoDB Database<br/>(Items, Sales, Ledgers, Users)")]
        AIBrain["🧠 AI Brain Service<br/>(FastAPI, Ollama / vLLM)<br/><i>ai-brain/ (Python)</i>"]
    end

    WebClient -->|HTTP / EJS / WebSockets| Backend
    BarcodeDesktop -->|HTTP REST API| Backend
    BiometricDesktop -->|HTTP REST API| Backend
    MobileApp -->|HTTP REST API| Backend

    Backend -->|Mongoose ORM| Mongo
    Backend <-->|Authenticated Gateway| AIBrain
```

---

## 📦 Directory Structure & Component Matrix

```
BAS-SOFTWARE/
│
├── 📁 Backend/                   # Core Web Server & REST API
│   ├── config/                   # MongoDB connection & AI catalog configurations
│   ├── controllers/              # REST API controllers (Sales, Items, Accounts, Users)
│   ├── middleware/               # Auth, role check, branch isolation, error handling
│   ├── models/                   # Mongoose Schemas (Item, Purchase, CashSale, Ledger, etc.)
│   ├── routes/                   # HTTP routing definitions (API & Web views)
│   ├── services/                 # Business logic (Double-entry accounting, banking, inventory)
│   ├── utils/                    # Common helper utilities
│   ├── server.js                 # Express application entry point
│   └── package.json              # Backend npm dependencies
│
├── 📁 Frontend/                  # Web ERP User Interface
│   ├── public/                   # Client-side static assets
│   │   ├── css/                  # Desktop-style UI stylesheets and print formats
│   │   ├── js/                   # Vanilla JavaScript view controllers (pos.js, items.js)
│   │   └── images/               # Logos and icons
│   └── views/                    # EJS & HTML page templates (POS, Reports, Ledgers, Inventory)
│
├── 📁 barcode-printing-app/      # .NET C# Desktop Barcode Printing Software
│   ├── BarcodePrintingApp.csproj # .NET project file
│   ├── Program.cs                # Entry point
│   ├── LoginForm.cs              # Authentication form (calls BAS Backend)
│   ├── MainForm.cs               # Barcode designer & printer controller
│   ├── SearchForm.cs             # Fast item search popup
│   ├── Models.cs                 # C# data transfer models
│   ├── Config.cs                 # API host & printer configuration
│   ├── BarcodeReport.rpt         # Crystal Reports barcode sticker layout
│   └── appsettings.json          # App configuration
│
├── 📁 biometric-app/             # .NET C# Desktop Fingerprint & Attendance Software
│   ├── BiometricApp.csproj       # .NET project file
│   ├── Lib/                      # ⚠️ Fingerprint SDK & DigitalPersona DLLs (Must be preserved)
│   ├── Program.cs                # Hardware initialization & entry point
│   ├── Form1.cs / MainForm.cs    # Real-time attendance logging UI
│   ├── EnrollmentForm.cs         # Biometric fingerprint enrollment screen
│   ├── LoginForm.cs              # Admin authentication screen
│   ├── Models.cs                 # Employee & attendance models
│   ├── Config.cs                 # API endpoints & branch settings
│   └── appsettings.json          # App configuration
│
├── 📁 mobile-app/                # React Native / Expo Cross-Platform Mobile Application
│   ├── src/
│   │   ├── api/                  # Axios HTTP client for BAS Backend
│   │   ├── components/           # Reusable UI components
│   │   ├── navigation/           # Tab & Stack navigators
│   │   ├── screens/              # Dashboard, Stock, Camera Scanner, Sales screens
│   │   └── utils/                # Mobile helper functions
│   ├── App.js                    # Mobile application root
│   ├── app.json                  # Expo app configuration
│   ├── eas.json                  # EAS build profiles
│   └── package.json              # Mobile npm dependencies
│
├── 📁 ai-brain/                  # Isolated Python FastAPI AI Assistant
│   ├── app/                      # FastAPI application & LLM reasoning engine
│   ├── requirements.txt          # Python dependencies
│   └── README.md                 # Setup & configuration guide
│
├── 📁 scripts/                   # System Maintenance & Database Migration Tools
│   ├── audit-permissions.js      # User role & permission verification
│   ├── fix-permissions.js        # Permission repair script
│   └── check_stock.js            # Stock discrepancy validation
│
├── 📄 AGENTS.md                  # 🤖 Master instruction manual for AI agents
├── 📄 PROJECT_STRUCTURE.md       # 🗺️ System architectural reference (THIS FILE)
├── 📄 README.md                  # Human developer overview & quick start
└── 📄 .gitignore                 # Monorepo-wide Git exclusion rules
```

---

## 🔄 Core Workflows & Data Flows

### 1. Barcode Sticker Printing Workflow
```mermaid
sequenceDiagram
    autonumber
    actor User as Store Cashier / Clerk
    participant App as Barcode Printing App (.NET)
    participant API as BAS Backend API
    participant DB as MongoDB
    participant Printer as Thermal / Label Printer

    User->>App: Launch & Enter Credentials
    App->>API: POST /api/users/login
    API-->>App: Return JWT Token & Branch ID
    User->>App: Search Item by Name / SKU
    App->>API: GET /api/items/search?query=...
    API->>DB: Query Item Details & Sale Rate
    DB-->>API: Item Record
    API-->>App: JSON Item Data
    User->>App: Set Sticker Quantity & Layout
    App->>Printer: Send Raw TSPL / ZPL / Crystal Report Print Job
    Printer-->>User: Physical Barcode Stickers Output
```

### 2. Biometric Attendance Logging Workflow
```mermaid
sequenceDiagram
    autonumber
    actor Emp as Employee
    participant Hardware as Fingerprint Scanner
    participant BioApp as Biometric App (.NET)
    participant API as BAS Backend API
    participant DB as MongoDB

    Emp->>Hardware: Place Finger on Scanner
    Hardware->>BioApp: Emit Raw Biometric Template
    BioApp->>BioApp: Match Template against Local Cache
    BioApp->>API: POST /api/attendance/punch (EmployeeId, Timestamp, BranchId)
    API->>DB: Insert Attendance Record
    DB-->>API: Saved Confirmation
    API-->>BioApp: 200 OK (Punch Verified)
    BioApp-->>Emp: Visual & Audio Confirmation ("Check-in Recorded")
```

### 3. Mobile Companion Workflow
```mermaid
sequenceDiagram
    autonumber
    actor Owner as Business Owner / Manager
    participant Mobile as Mobile App (Expo)
    participant API as BAS Backend API
    participant DB as MongoDB

    Owner->>Mobile: Open App & View Dashboard
    Mobile->>API: GET /api/sales/today-summary (Bearer Token)
    API->>DB: Aggregate Cash Sales & Purchases
    DB-->>API: Summary Totals
    API-->>Mobile: JSON Dashboard Metrics
    Mobile-->>Owner: Display Revenue, Profit, and Low Stock Alerts
```

---

## ⚙️ Environment Configuration Quick Reference

| Application | Configuration Location | Key Settings |
| :--- | :--- | :--- |
| **Backend** | `Backend/.env` | `PORT=5000`, `MONGODB_URI=...`, `JWT_SECRET=...`, `AI_BRAIN_URL=http://127.0.0.1:8001` |
| **Barcode App** | `barcode-printing-app/appsettings.json` | `ApiBaseUrl`, `DefaultPrinter`, `LabelWidth`, `LabelHeight` |
| **Biometric App**| `biometric-app/appsettings.json` | `ApiBaseUrl`, `BranchId`, `DeviceType`, `AutoSyncInterval` |
| **Mobile App** | `mobile-app/src/api/config.js` | `API_BASE_URL` (development/production endpoint) |
| **AI Brain** | `ai-brain/.env` | `MODEL_PROVIDER=ollama`, `LOCAL_MODEL=qwen2.5:7b-instruct`, `AI_BRAIN_SHARED_SECRET=...` |

---

## 🔒 Security & Git Policies

- **No Secrets in Repo**: Keep `.env` and `appsettings.json` local. Use `.env.example` templates.
- **No Compiled Binaries**: All `.exe`, `.dll` (except vendor SDKs in `biometric-app/Lib/`), `.pdb`, `.apk`, and build outputs are excluded via `.gitignore`.
- **No Build Logs**: Error logs (`*build_error*.txt`), compile logs, and terminal redirects are excluded.
