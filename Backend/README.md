# ⚙️ BAS Backend - Core REST API & Business Logic Server

> **Part of Bilal Accounting System (BAS)**  
> **Core Developers**: **Mr. Wasi** (Backend Lead & Architecture) & **Bilal Shah** (Frontend Lead)

---

## 📌 Overview
The BAS Backend is a robust, production-ready Node.js and Express.js REST API server connected to MongoDB. It is responsible for all transaction processing, double-entry ledger calculations, real-time inventory management, authentication, multi-branch isolation, and satellite application synchronization.

---

## 🛠️ Tech Stack & Key Modules
- **Runtime:** Node.js 18+
- **Framework:** Express.js 4.x
- **Database:** MongoDB 6.0+ with Mongoose ODM
- **Authentication:** JSON Web Tokens (JWT) & bcrypt
- **Real-Time:** Socket.io
- **AI Gateway:** Forwarding gateway to `ai-brain` service with permission validation (`Backend/config/aiActionCatalog.js`)

---

## 📁 Architecture & Directory Layout

```
Backend/
├── config/                # Database connection (db.js) & AI action catalogs
├── controllers/           # HTTP controllers for all domain entities:
│   ├── authController.js         # User login, registration, token refresh
│   ├── salesController.js        # Cash and credit sale processing
│   ├── purchaseController.js     # Purchase invoices and supplier accounting
│   ├── itemController.js         # Inventory, batches, SKU & barcode management
│   ├── closingSheetController.js # Daily cash and bank closings
│   ├── incomeStatementController.js # Profit & loss calculation
│   ├── attendanceController.js   # Biometric clock punch ingestion & sync
│   └── ...
├── middleware/            # Security, JWT auth, role validation & branch filtering
│   ├── auth.js                   # JWT token verify & branch filtering (`applyBranchFilter`)
│   └── errorHandler.js           # Central error handler
├── models/                # Mongoose Database Schemas:
│   ├── Item.js, CashSale.js, Purchase.js, User.js, Branch.js,
│   ├── Supplier.js, Customer.js, Bank.js, Transaction.js, Attendance.js, etc.
├── routes/                # Express API & Page view route declarations
├── services/              # Core business logic:
│   ├── aiBusinessSummaryService.js # Fast KPI aggregation for AI
│   ├── aiDataAgentService.js       # AI Brain microservice proxy
│   └── ...
├── utils/                 # Number formatters, date utilities, validators
├── server.js              # Main application entry point & Express setup
└── package.json           # Backend npm dependencies
```

---

## ⚙️ Environment Variables (`.env`)

Create a `.env` file in `/Backend`:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/bas_database

# Security
JWT_SECRET=your_secure_jwt_secret_key_here
JWT_EXPIRE=30d

# CORS
CORS_ORIGIN=*

# AI Brain Microservice Integration
AI_BRAIN_URL=http://127.0.0.1:8001
AI_BRAIN_SHARED_SECRET=your_ai_brain_shared_secret
```

---

## 🚀 Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Run in development with Nodemon (auto-reload)
npm run dev

# 3. Run in production
npm start
```

---

## 🔒 Security & Multi-Branch Rules
- All requests requiring branch scoping must use `applyBranchFilter(req, query, Model)` to ensure strict store branch isolation.
- API endpoints are protected via JWT tokens provided in the `Authorization: Bearer <token>` header.
- The MongoDB instance is private to the Backend; desktop and mobile apps interface exclusively via REST endpoints.

---

## 👥 Core Development Team
- **Mr. Wasi** (`Lead Backend Engineer & Systems Architect`)
- **Bilal Shah** (`Lead Frontend Engineer & UI/UX Architect`)
