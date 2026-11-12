# 🏢 BAS - Bilal Accounting System

> **Enterprise-Grade Retail, Pharmacy & Multi-Branch Accounting, POS, and Inventory Ecosystem.**
> A unified monorepo featuring central Web ERP, Windows Desktop Barcode & Biometric software, Mobile app, and Local AI microservice.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.0%2B-green.svg)](https://www.mongodb.com/)
[![.NET](https://img.shields.io/badge/.NET-8.0--windows-purple.svg)](https://dotnet.microsoft.com/)
[![Expo](https://img.shields.io/badge/Expo-React%20Native-black.svg)](https://expo.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.10%2B-teal.svg)](https://fastapi.tiangolo.com/)

---

## 👥 Core Development Team & Authors

The **Bilal Accounting System (BAS)** is engineered and maintained by a dedicated core team of **two developers**:

| Developer | Role & Responsibilities | Focus Areas |
| :--- | :--- | :--- |
| **Mr. Wasi**<br/>`@wasidevxyz-pixel` | **Lead Backend Engineer & Systems Architect** | Core Node.js/Express APIs, MongoDB Database Schemas, Double-Entry Accounting Engine, Ledgers, Authentication, AI Brain Gateway & System Maintenance |
| **Bilal Shah**<br/>`@bilalshah` | **Lead Frontend Engineer & UI/UX Architect** | Desktop-Style Web UI (EJS/Vanilla JS/CSS), POS Invoicing, Reports & Dashboards, Multi-Branch UI, Mobile Experience & Print Formats |

---

## 🗺️ Monorepo Ecosystem Matrix

BAS is organized as a unified monorepo containing 4 primary applications and 2 auxiliary services:

| Component | Codebase Path | Tech Stack | Description |
| :--- | :--- | :--- | :--- |
| **1. Web ERP & Core API** | [`/Backend`](Backend/) & [`/Frontend`](Frontend/) | Node.js, Express, MongoDB (Mongoose), EJS, Vanilla JS/CSS | Central ERP, POS Invoicing, Double-Entry Ledgers, Stock, Multi-Branch & REST APIs |
| **2. Barcode Print App** | [`/barcode-printing-app`](barcode-printing-app/) | C# (.NET 8.0 WinForms), Crystal Reports | Windows desktop app for high-speed thermal label and A4 barcode sticker printing |
| **3. Biometric Attendance** | [`/biometric-app`](biometric-app/) | C# (.NET 8.0 WinForms), DigitalPersona SDK | Windows desktop app for employee fingerprint enrollment & live clock-in/out attendance |
| **4. Mobile Companion App**| [`/mobile-app`](mobile-app/) | React Native, Expo SDK, Axios | Cross-platform mobile app for real-time sales dashboards, inventory lookups & camera scanner |
| **5. AI Brain Microservice**| [`/ai-brain`](ai-brain/) | Python (FastAPI, Uvicorn), Ollama / vLLM | Isolated AI assistant for natural language financial queries and ERP navigation |
| **6. System Scripts** | [`/scripts`](scripts/) | Node.js Standalone Scripts | Database maintenance, permission repairs, and stock audit utilities |

> 📖 **Architectural Guides**:
> - 🤖 **[AGENTS.md](AGENTS.md)** - Master rules and stack boundary instructions for AI coding agents.
> - 🗺️ **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** - Detailed system diagrams and data flow blueprints.

---

## ✨ Features & Capabilities

### 🛒 Point of Sale (POS) & Invoicing
- **Fast Cash Sales** - Instant barcode scanning, keyboard-driven UI (Alt+S to save), pack-size calculations.
- **Purchase Management** - Supplier purchase orders, batch tracking, cost rate calculations.
- **Returns & Exchanges** - Full support for customer sales returns and vendor purchase returns.
- **Flexible Printing** - Thermal receipts (80mm), standard A4/A3 invoices, packing slips, and Crystal Reports label sheets.

### 📦 Inventory & Stock Management
- **Multi-Branch Stock Tracking** - Real-time item balances separated across branches and warehouses.
- **Category & Department Hierarchy** - Organize products by department, sub-department, and group.
- **Multi-Unit Conversions** - Automatic unit to pack-size math with custom pricing per unit.
- **Automated Reorder Alerts** - Notification triggers when stock falls below minimum threshold.

### 💼 Accounting & Financial Engine
- **Double-Entry General Ledger** - Automated journal entries for all sales, purchases, bank transfers, and expenses.
- **Bank Reconciliation & Management** - Multi-bank accounts, voucher tracking, cheque clearing.
- **Closing Sheet System** - Multi-stage daily closing (`Closing 01` cash count, `Closing 02` reconciliation, daily income statement).
- **Comprehensive Financial Reports** - Profit & Loss (Income Statement), Trial Balance, Balance Sheet, Party Ledgers.

### 🖐️ Biometric Attendance & Staff
- **Hardware Scanner Integration** - Live capture with DigitalPersona U.are.U fingerprint readers.
- **Automatic Attendance Sync** - Push clock-in/clock-out events to backend API with offline punch caching.
- **Payroll Preparation** - Attendance records, shifts, overtime, and salary slip generation.

### 🧠 AI-Powered Insights
- **Natural Language ERP Queries** - Ask questions like *"What were today's total sales?"* or *"Show me last purchase of Panadol"*.
- **Screen Navigation** - Direct voice/chat navigation to specific invoices and reports.
- **Isolated & Safe** - AI Brain runs in a sandboxed microservice with zero direct database write permissions.

---

## 🛠️ Technology Stack

```
Frontend Clients:       Vanilla JS (ES6+), EJS Templates, Custom CSS Theme, Bootstrap 5.3
Desktop Apps:           C# 12, .NET 8.0-windows, Windows Forms, Crystal Reports, DigitalPersona SDK
Mobile App:             React Native, Expo SDK, React Navigation, Axios
Core Backend:           Node.js 18+, Express.js, Socket.io, JWT Authentication
Database:               MongoDB 6.0+ (Mongoose ODM)
AI Microservice:        Python 3.10+, FastAPI, Uvicorn, Ollama / vLLM
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18.0.0 or higher) & **npm**
- **MongoDB** (v6.0 or higher, local or MongoDB Atlas)
- **.NET 8.0 Windows SDK** (for desktop apps on Windows)
- **Expo CLI** (for mobile development)
- **Python 3.10+** (optional, for local AI Brain)

### 2. Setting Up Main BAS Server

```bash
# 1. Clone repository
git clone https://github.com/wasidevxyz-pixel/BAS-SOFTWARE.git
cd BAS-SOFTWARE

# 2. Install backend dependencies
cd Backend
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit Backend/.env with your MongoDB URI, JWT Secret, and PORT (default: 5000)

# 4. Start backend server
npm start
```

Open your browser at `http://localhost:5000` to access the Web ERP.

### 3. Running Barcode Printing App (Windows)
```powershell
cd barcode-printing-app
dotnet build
dotnet run
```

### 4. Running Biometric Attendance App (Windows)
```powershell
cd biometric-app
dotnet build
dotnet run
```

### 5. Running Mobile App
```bash
cd mobile-app
npm install
npx expo start
```

---

## 🔌 Core API Endpoints

All satellite clients (Barcode, Biometric, Mobile) communicate via standard REST APIs:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/users/login` | Authenticate user, return JWT token & branch info |
| `GET` | `/api/items` | Retrieve inventory list with prices & barcodes |
| `GET` | `/api/items/search` | Fast autocomplete search by name, SKU, barcode |
| `POST` | `/api/attendance/punch` | Record employee biometric clock-in / clock-out |
| `POST` | `/api/attendance/sync` | Bulk synchronize offline attendance punches |
| `GET` | `/api/sales/today-summary` | Live summary metrics for mobile dashboard |
| `POST` | `/api/ai/query` | Forward NLP query to AI Brain microservice |

---

## 🤝 Contributing

Contributions and modifications are managed exclusively by the core developers:
- **Mr. Wasi** (`Backend Lead & Architecture`)
- **Bilal Shah** (`Frontend Lead & UI/UX`)

Please coordinate all feature branches, architecture proposals, and pull requests directly with the team.

---

## 📊 Project Statistics

- **Repository Architecture:** Monorepo (Web, Desktop, Mobile, AI)
- **Core Developers:** 2 (Mr. Wasi, Bilal Shah)
- **Primary Languages:** JavaScript, C#, Python
- **Database Engine:** MongoDB

---

## 📝 License

This software is licensed under the MIT License. See [LICENSE](LICENSE) for details.

<div align="center">

**BAS (Bilal Accounting System) © 2026**
*Engineered with precision by Mr. Wasi & Bilal Shah*

[⬆ Back to Top](#-bas---bilal-accounting-system)

</div>
