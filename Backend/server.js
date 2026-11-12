const path = require('path');
const fs = require('fs');
const backendEnvPath = path.join(__dirname, '.env');
const rootEnvPath = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: fs.existsSync(backendEnvPath) ? backendEnvPath : rootEnvPath });
// All AI provider keys are loaded from the main .env file above.
const express = require('express');

console.log('Server starting...');
console.log('__dirname:', __dirname);
console.log('Public Static Path:', path.join(__dirname, '../public'));
console.log('Views Static Path:', path.join(__dirname, '../public'));

const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const { wasiPerformanceBooster, wasiApiHealthMonitor, wasiSystemHealthCheck } = require('./middleware/wasiPerformance');
const cookieParser = require('cookie-parser');
const fileupload = require('express-fileupload');
const morgan = require('morgan');

const rateLimit = require('express-rate-limit');
const xssClean = require('./middleware/xss');
const hpp = require('hpp');

// Route files some miners changes made by mr wasi
const authRoutes = require('./routes/auth');
const aiBrainRoutes = require('./routes/aiBrain');
const aiProviderManager = require('./ai/provider/providerManager');

// Swagger Documentation config
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const itemRoutes = require('./routes/items');
const partyRoutes = require('./routes/parties');
const saleRoutes = require('./routes/sales');
const purchaseRoutes = require('./routes/purchases');
const paymentRoutes = require('./routes/payments');
const receiptRoutes = require('./routes/receipts');
const expenseRoutes = require('./routes/expenses');
const stockAdjustmentRoutes = require('./routes/stockAdjustments');
const stockAuditRoutes = require('./routes/stockAudits');
const whStockAuditRoutes = require('./routes/whStockAuditRoutes');
const voucherRoutes = require('./routes/vouchers');
const supplierPaymentRoutes = require('./routes/supplierPayments');
const customerPaymentRoutes = require('./routes/customerPayments');
const salesReturnRoutes = require('./routes/salesReturns');
const purchaseReturnRoutes = require('./routes/purchaseReturns');
const payrollRoutes = require('./routes/payrolls');
const cashTransactionRoutes = require('./routes/cashTransactions');
const bankTransactionRoutes = require('./routes/bankTransactions');
const bankTransferRoutes = require('./routes/bankTransfers');
const bankRoutes = require('./routes/banks');
const dayBookRoutes = require('./routes/dayBook');
const unitRoutes = require('./routes/units');
const taxRoutes = require('./routes/taxes');
const reportRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');
const itemCategoryRoutes = require('./routes/itemCategories');
const customerCategoryRoutes = require('./routes/customerCategories');
const supplierCategoryRoutes = require('./routes/supplierCategories');
const companyRoutes = require('./routes/companies');
const classRoutes = require('./routes/classes');
const subclassRoutes = require('./routes/subclasses');
const storeRoutes = require('./routes/stores');
const departmentRoutes = require('./routes/departments');
const closingSheetRoutes = require('./routes/closingSheets');
const dailyCashRoutes = require('./routes/dailyCash');
const cashSaleRoutes = require('./routes/cashSales');
const healthRoutes = require('./routes/health');
const expenseHeadRoutes = require('./routes/expenseHeads');
const diagnosticRoutes = require('./routes/diagnostic');
const supplierTaxRoutes = require('./routes/supplierTaxes');
const accountRoutes = require('./routes/accounts');
const attendanceRoutes = require('./routes/attendance');
const advanceAttendanceReconciliationRoutes = require('./routes/advanceAttendanceReconciliationRoutes');
const customerDemandRoutes = require('./routes/customerDemands');
const employeeRoutes = require('./routes/employees');
const employeeAdjustmentRoutes = require('./routes/employeeAdjustments');
const supplierRoutes = require('./routes/suppliers');
const employeeAdvanceRoutes = require('./routes/employeeAdvances');
const employeeClearanceRoutes = require('./routes/employeeClearances');
const employeeCommissionRoutes = require('./routes/employeeCommissions');
const employeePenaltyRoutes = require('./routes/employeePenalties');
const holyDayRoutes = require('./routes/holyDays');
const supplierTaxCPRRoutes = require('./routes/supplierTaxCPRs');
const groupRoutes = require('./routes/groups');
const backupRoutes = require('./routes/backup');
const mongoBackupRoutes = require('./routes/mongoBackup');
const exemptionInvoiceRoutes = require('./routes/exemptionInvoices');
const zakatRoutes = require('./routes/zakats');
const pendingChequeRoutes = require('./routes/pendingCheques');
const pendingChequeDetailRoutes = require('./routes/pendingChequeDetails');
const incomeStatementRoutes = require('./routes/incomeStatement');
const whSupplierRoutes = require('./routes/whSuppliers');
const whCustomerRoutes = require('./routes/whCustomers');
const whSupplierCategoryRoutes = require('./routes/whSupplierCategories');
const whCustomerCategoryRoutes = require('./routes/whCustomerCategories');
const whCityRoutes = require('./routes/whCities');
const whCustomerTypeRoutes = require('./routes/whCustomerTypes');
const whItemCompanyRoutes = require('./routes/whItemCompanies');
const whItemCategoryRoutes = require('./routes/whItemCategories');
const whItemClassRoutes = require('./routes/whItemClasses');
const whItemSubClassRoutes = require('./routes/whItemSubClasses');
const whItemRoutes = require('./routes/whItems');
const whPurchaseRoutes = require('./routes/whPurchaseRoutes');
const whPurchaseReturnRoutes = require('./routes/whPurchaseReturnRoutes');
const whSaleRoutes = require('./routes/whSaleRoutes');
const whSaleReturnRoutes = require('./routes/whSaleReturnRoutes');
const whCustomerPaymentRoutes = require('./routes/whCustomerPaymentRoutes');
const whLedgerRoutes = require('./routes/whLedgerRoutes');
const commissionItemRoutes = require('./routes/commissionItemRoutes');
const designationRoutes = require('./routes/designations');
const employeeDepartmentRoutes = require('./routes/employeeDepartments');
const commissionBranchRoutes = require('./routes/commissionBranchRoutes');
const subBranchRoutes = require('./routes/subBranchRoutes');
const employeeLedgerRoutes = require('./routes/employeeLedgerRoutes');
const biometricRoutes = require('./routes/biometric');
const mobileRoutes = require('./routes/mobile');
const employeeSalaryDetailRoutes = require('./routes/employeeSalaryDetailRoutes');
const bankPaidSalaryReportRoutes = require('./routes/bankPaidSalaryReportRoutes');
const cashPaidSalaryReportRoutes = require('./routes/cashPaidSalaryReportRoutes');
const empPayrollStatusRoutes = require('./routes/empPayrollStatusRoutes');
// systemLogsRoutes removed — logging disabled for performance
const hrDashboardRoutes = require('./routes/hrDashboard');
const foodInvoiceRoutes = require('./routes/foodInvoices');
const legacyPayrollRoutes = require('./routes/legacyPayrollRoutes');
const overtimeReportRoutes = require('./routes/overtimeReport');
const shortWeekReportRoutes = require('./routes/shortWeekReport');
const downloadCenterRoutes = require('./routes/downloadCenter');
const notificationRoutes = require('./routes/notifications');
const easypaisaSettlementRoutes = require('./routes/easypaisaSettlementRoutes');






// Error handler
const errorHandler = require('./middleware/errorHandler');

const app = express();

// WASI Health Monitor (Before other middleware to capture all requests)
app.use(wasiApiHealthMonitor);

// Request Logger removed — was writing MongoDB document on every request (major slowdown)

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Swagger Documentation Route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Set security headers
// Using a PERMISSIVE CSP to allow inline scripts and prevent breaking the live site
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://static.cloudflareinsights.com", "https://code.jquery.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cloudflareinsights.com", "https://cdnjs.cloudflare.com"],
    },
  },
}));

// Trust proxy (required for correct IP detection behind Nginx/Cloudflare)
app.set('trust proxy', 1);

// Strict limiter for Login (Brute Force Protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 login attempts per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again after 15 minutes" } // Return JSON error
});
app.use('/api/v1/auth/login', authLimiter);

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many registration attempts, please try again later' }
});
app.use('/api/v1/auth/register', registerLimiter);

// General limiter for API (Anti-DDoS / Abuse)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50000, // limit each IP to 50000 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use('/api/', limiter);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Log request body for POST/PUT requests (Development Only - not production)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT') {
      console.log('📦 Request Body:', JSON.stringify(req.body, null, 2));
    }
    next();
  });
}

// Cookie parser
app.use(cookieParser());

// Data sanitization against NoSQL injection
const nosqlSanitizer = require('./middleware/nosqlSanitizer');
app.use(nosqlSanitizer);

// Data sanitization against XSS
app.use(xssClean);

// Prevent parameter pollution
app.use(hpp());

// File upload middleware temporarily disabled
app.use(fileupload({
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB limit for Excel imports
  abortOnLimit: true
}));

// Compression middleware
// Compression middleware (Replaced by WASI Booster)
// app.use(compression());
wasiPerformanceBooster(app);

// CORS
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// PERF FIX: Only disable caching for API routes — NOT for static files
// Previously ALL routes (including JS/CSS/images) had no-cache,
// forcing slow-branch users to re-download everything on every page load.
app.use('/api/', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Global Redirection Middleware for Clean URLs
app.use((req, res, next) => {
  // If request ends with .html, redirect to extensionless version
  if (req.path.endsWith('.html') && req.method === 'GET') {
    const cleanPath = req.path.slice(0, -5);
    const query = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
    return res.redirect(301, cleanPath + query);
  }
  next();
});

// Set static folder for public assets
// PERF FIX: JS, CSS, images cached for 1 hour — only HTML/API stay no-cache
// Branches with slow internet no longer re-download these on every page load

// PERMISSION GUARD INJECTION MIDDLEWARE
// Automatically injects permission guard script into ALL HTML file responses
const htmlCache = new Map(); // In-memory cache for injected HTML

app.use(async (req, res, next) => {
  const baseUrl = req.url.split('?')[0]; // Remove query params

  // Skip API routes, well-known routes, and public assets
  if (baseUrl === '/' || baseUrl === '/login' || baseUrl === '/login.html' ||
    baseUrl.startsWith('/api/') ||
    baseUrl.startsWith('/.well-known/') ||
    baseUrl.startsWith('/js/') ||
    baseUrl.startsWith('/css/') ||
    baseUrl.startsWith('/images/') ||
    baseUrl.includes('.') && !baseUrl.endsWith('.html')) {
    return next();
  }

  // Handle both .html requests and extensionless requests (like /dashboard)
  let htmlFilePath;

  if (!baseUrl.includes('..') && !baseUrl.includes('\\') && baseUrl.startsWith('/')) {
    // Try direct .html file first
    if (baseUrl.endsWith('.html')) {
      htmlFilePath = path.join(__dirname, '../Frontend/views', baseUrl);
    } else {
      // Try adding .html extension for extensionless URLs
      htmlFilePath = path.join(__dirname, '../Frontend/views', baseUrl + '.html');
    }

    // 100% SAFE ASYNC CHECK: This replaces the blocking existsSync/readFileSync
    try {
      const stat = await fs.promises.stat(htmlFilePath);
      if (stat.isFile()) {
        // Check cache — serve directly if cached and file mtime has not changed
        if (htmlCache.has(htmlFilePath)) {
          const cached = htmlCache.get(htmlFilePath);
          if (cached.mtimeMs === stat.mtimeMs) {
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.set('Pragma', 'no-cache');
            return res.send(cached.html);
          }
        }

        let html = await fs.promises.readFile(htmlFilePath, 'utf8');

        // Inject shared guards, but keep AI assistant tooling off print pages.
        const { SERVER_BOOT_ID } = require('./utils/bootId');
        const cacheVersion = SERVER_BOOT_ID || Date.now();
        const isPrintRoute = baseUrl === '/wh-print' || baseUrl.startsWith('/print-');
        const guardScriptParts = [
          `<script src="/js/permissionMaps.js?v=${cacheVersion}"><\/script>`,
          `<script src="/js/routePermissionGuard.js?v=${cacheVersion}"><\/script>`,
          `<script src="/js/ai-report-filters.js?v=${cacheVersion}"><\/script>`,
          `<script src="/js/download-center-sender.js?v=${cacheVersion}_dc5"><\/script>`
        ];

        // AI Assistant disabled per user request
        // if (!isPrintRoute) {
        //   guardScriptParts.unshift(`<link rel="stylesheet" href="/css/ai-assistant.css?v=${cacheVersion}">`);
        //   guardScriptParts.push(`<script src="/js/ai-assistant.js?v=${cacheVersion}"><\/script>`);
        // }

        const guardScript = guardScriptParts.join('\n    ') + '\n    ';

        // Find <head> tag and inject scripts right after it opens
        if (html.includes('<head>')) {
          html = html.replace('<head>', '<head>\n    ' + guardScript);
        } else if (html.includes('<head ')) {
          // Handle <head with attributes
          const headMatch = html.match(/<head[^>]*/);
          if (headMatch) {
            html = html.replace(headMatch[0], headMatch[0] + '>\n    ' + guardScript);
          }
        }

        // Dynamic Asset Cache-Buster: Ensure all client systems immediately get latest CSS & JS
        html = html.replace(/\/js\/sidebar\.js(\?v=[^"'\s>]+)?/g, `/js/sidebar.js?v=${cacheVersion}`);
        html = html.replace(/\/css\/sidebar\.css(\?v=[^"'\s>]+)?/g, `/css/sidebar.css?v=${cacheVersion}`);
        html = html.replace(/\/css\/desktop-style\.css(\?v=[^"'\s>]+)?/g, `/css/desktop-style.css?v=${cacheVersion}`);
        html = html.replace(/\/css\/dashboard-modern\.css(\?v=[^"'\s>]+)?/g, `/css/dashboard-modern.css?v=${cacheVersion}`);
        html = html.replace(/\/js\/dashboard-modern\.js(\?v=[^"'\s>]+)?/g, `/js/dashboard-modern.js?v=${cacheVersion}`);
        html = html.replace(/\/css\/login-modern\.css(\?v=[^"'\s>]+)?/g, `/css/login-modern.css?v=${cacheVersion}`);
        html = html.replace(/\/js\/login-modern\.js(\?v=[^"'\s>]+)?/g, `/js/login-modern.js?v=${cacheVersion}`);

        // Save to cache (invalidated automatically when file mtime changes)
        htmlCache.set(htmlFilePath, { html, mtimeMs: stat.mtimeMs });

        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        return res.send(html);
      }
    } catch (err) {
      // If file is not found or error reading, safely ignore and fall through to static middleware
      if (err.code !== 'ENOENT') {
        console.error('[GUARD-INJECT ERROR]', baseUrl, err.message);
      }
    }
  }
  next();
});

app.use(express.static(path.join(__dirname, '../Frontend/public'), {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    const ext = require('path').extname(filePath).toLowerCase();
    const cacheableExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot'];
    if (cacheableExts.includes(ext)) {
      // Cache images/fonts for 1 hour
      res.set('Cache-Control', 'public, max-age=3600');
    } else if (ext === '.js' || ext === '.css') {
      // No cache for JS/CSS — ensures browsers always get latest version after deployments
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    } else {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
    }
  }
}));

// Serve static files from views directory with NO CACHE
app.use(express.static(path.join(__dirname, '../Frontend/views'), {
  etag: false,
  lastModified: false,
  index: false,
  extensions: ['html'], // Phase 1: Enable extensionless URLs
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// Serve EXPORT folder for legacy payroll PDFs
app.use('/EXPORT', express.static(path.join(__dirname, '../EXPORT')));

// ... [skipping db connection] ...

// Database connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/BAS-SOFTWARE')
  .then(async () => {
    console.log('Connected to MongoDB');
    await aiProviderManager.ensureDefaults();
    aiProviderManager.startHealthChecks();
    aiProviderManager.healthCheck().catch(err => console.error('[AI PROVIDERS] initial health check failed:', err.message));

    // Automatic Index Cleanup for EmployeeCommission
    try {
      const db = mongoose.connection.db;
      const collection = db.collection('employeecommissions');

      // List of possible old index names to clean up (including the ones causing the live error)
      const oldIndexes = [
        "monthYear_1_branch_1_department_1_subbranch_1_type_1",
        "monthYear_1_branch_1_department_1_subBranch_1_type_1",
        "monthYear_1_branch_1_department_1_subBranch_1_type_1_whCategory_1_commissionCategory_1",
        "monthYear_1_branch_1_commissionBranch_1_department_1_subBranch_1_type_1_whCategory_1_commissionCategory_1",
        "monthYear_1_commissionBranch_1_department_1_subBranch_1_type_1_whCategory_1_commissionCategory_1"
      ];

      for (const indexName of oldIndexes) {
        await collection.dropIndex(indexName).catch(e => { /* Silently ignore if index not found */ });
      }

      console.log('EmployeeCommission indexes cleaned successfully.');
    } catch (err) {
      console.error('Index cleanup failed:', err.message);
    }

    // ─── MIGRATION: Drop old pendingchequedetails unique index ────────────────
    // The old index was { date, branch } (unique).
    // The new index is { date, branch, type } (unique) to allow cheque + cash
    // records to coexist for the same branch+date as separate documents.
    try {
      const db = mongoose.connection.db;
      const pcdCollection = db.collection('pendingchequedetails');
      const oldPcdIndexes = [
        'date_-1_branch_1',   // Old unique index — must be dropped
      ];
      for (const indexName of oldPcdIndexes) {
        await pcdCollection.dropIndex(indexName).catch(() => { /* Already gone — ignore */ });
      }
      console.log('[PendingChequeDetail] Old index migration complete.');
    } catch (err) {
      console.error('[PendingChequeDetail] Index migration failed:', err.message);
    }

    // ─── MIGRATION: Backfill `type` field on old PendingChequeDetail records ──
    // Any records created before the type field was added default to 'cheque'.
    try {
      const PendingChequeDetail = require('./models/PendingChequeDetail');
      const backfillResult = await PendingChequeDetail.updateMany(
        { type: { $exists: false } },
        { $set: { type: 'cheque' } }
      );
      if (backfillResult.modifiedCount > 0) {
        console.log(`[PendingChequeDetail] Backfilled type='cheque' on ${backfillResult.modifiedCount} legacy records.`);
      }
    } catch (err) {
      console.error('[PendingChequeDetail] Type backfill migration failed:', err.message);
    }

    // ─── MIGRATION: Mark all IMP- employees as payrollImportOnly ─────────────
    // Runs on every startup — safe/idempotent. Catches any employees imported
    // via Excel payroll import that don't yet have the payrollImportOnly flag.
    try {
      const Employee = require('./models/Employee');
      const impResult = await Employee.updateMany(
        { code: /^IMP-/i, payrollImportOnly: { $ne: true } },
        { $set: { payrollImportOnly: true } }
      );
      if (impResult.modifiedCount > 0) {
        console.log(`[IMP Migration] Marked ${impResult.modifiedCount} IMP- employees as payrollImportOnly=true`);
      } else {
        console.log('[IMP Migration] All IMP- employees already correctly flagged.');
      }
    } catch (err) {
      console.error('[IMP Migration] Failed:', err.message);
    }

    try {
      // Migration: Generate codes for parties that don't have one
      const Party = require('./models/Party');
      const partiesWithoutCode = await Party.find({ code: { $exists: false } });

      if (partiesWithoutCode.length > 0) {
        console.log(`Found ${partiesWithoutCode.length} parties without code. Generating codes...`);
        let nextCode = 1;

        // Find highest existing code to start from
        const lastParty = await Party.findOne({ code: { $exists: true } }).sort({ code: -1 });
        if (lastParty && lastParty.code) {
          const parts = lastParty.code.split('-');
          if (parts.length > 1 && !isNaN(parts[1])) {
            nextCode = parseInt(parts[1]) + 1;
          }
        }

        for (const party of partiesWithoutCode) {
          let newCode = '';
          let isUnique = false;
          while (!isUnique) {
            newCode = `CUST-${String(nextCode).padStart(3, '0')}`;
            const exists = await Party.findOne({ code: newCode });
            if (!exists) {
              isUnique = true;
            } else {
              nextCode++;
            }
          }
          party.code = newCode;
          await party.save();
          console.log(`Assigned code ${newCode} to party ${party.name}`);
          nextCode++;
        }
        console.log('Party code migration completed.');
      }
    } catch (err) {
      console.error('Migration error:', err);
    }

    // Initialize backup scheduler after database connection
    try {
      const cronService = require('./services/cronService');
      await cronService.init();
      console.log('[AUTO-BACKUP] CronService initialized after DB connection.');
    } catch (error) {
      console.error('[AUTO-BACKUP] Failed to initialize scheduler:', error.message);
    }

    // Initialize Download Center cleanup scheduler (12-hour auto-purge)
    try {
      const downloadCenterCleanup = require('./services/downloadCenterCleanupService');
      await downloadCenterCleanup.init();
      console.log('[DOWNLOAD-CENTER] Cleanup scheduler initialized.');
    } catch (error) {
      console.error('[DOWNLOAD-CENTER] Failed to initialize cleanup scheduler:', error.message);
    }
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Health check
app.get('/api/v1/ping', (req, res) => {
  res.json({ status: 'ok' });
});

// WASI System Health Check
app.get('/api/v1/wasi-health', wasiSystemHealthCheck);

// Mount routers
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/ai', aiBrainRoutes);
app.use('/api/v1/items', itemRoutes);
app.use('/api/v1/parties', partyRoutes);
app.use('/api/v1/sales', saleRoutes);
app.use('/api/v1/purchases', purchaseRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/receipts', receiptRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/stock-adjustments', stockAdjustmentRoutes);
app.use('/api/v1/stock-audits', stockAuditRoutes);
app.use('/api/v1/wh-stock-audits', whStockAuditRoutes);
app.use('/api/v1/vouchers', voucherRoutes);
app.use('/api/v1/supplier-payments', supplierPaymentRoutes);
app.use('/api/v1/customer-payments', customerPaymentRoutes);
app.use('/api/v1/sales-returns', salesReturnRoutes);
app.use('/api/v1/purchase-returns', purchaseReturnRoutes);
app.use('/api/v1/payrolls', payrollRoutes);
app.use('/api/v1/cash-transactions', cashTransactionRoutes);
app.use('/api/v1/bank-transactions', bankTransactionRoutes);
app.use('/api/v1/bank-transfers', bankTransferRoutes);
app.use('/api/v1/banks', bankRoutes);
app.use('/api/v1/daybook', dayBookRoutes);
app.use('/api/v1/units', unitRoutes);
app.use('/api/v1/taxes', taxRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/suppliers', supplierRoutes);
app.use('/api/v1/item-categories', itemCategoryRoutes);
app.use('/api/v1/customer-categories', customerCategoryRoutes);
app.use('/api/v1/supplier-categories', supplierCategoryRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/classes', classRoutes);
app.use('/api/v1/subclasses', subclassRoutes);
app.use('/api/v1/stores', storeRoutes);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1/closing-sheets', closingSheetRoutes);
app.use('/api/v1/daily-cash', dailyCashRoutes);
app.use('/api/v1/cash-sales', cashSaleRoutes);
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/expense-heads', expenseHeadRoutes);
app.use('/api/v1/diagnostic', diagnosticRoutes);
app.use('/api/v1/supplier-taxes', supplierTaxRoutes);
app.use('/api/v1/accounts', accountRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/attendance-reconciliation', advanceAttendanceReconciliationRoutes);
app.use('/api/v1/customer-demands', customerDemandRoutes);
app.use('/api/v1/employees', employeeRoutes);
app.use('/api/v1/employee-adjustments', employeeAdjustmentRoutes);
app.use('/api/v1/employee-advances', employeeAdvanceRoutes);
app.use('/api/v1/employee-clearances', employeeClearanceRoutes);
app.use('/api/v1/employee-commissions', employeeCommissionRoutes);
app.use('/api/v1/employee-ledger', employeeLedgerRoutes);
app.use('/api/v1/employee-penalties', employeePenaltyRoutes);
app.use('/api/v1/holy-days', holyDayRoutes);
app.use('/api/v1/supplier-tax-cprs', supplierTaxCPRRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/backup', backupRoutes);
app.use('/api/v1/mongodb-backup', mongoBackupRoutes);
app.use('/api/v1/exemption-invoices', exemptionInvoiceRoutes);
app.use('/api/v1/zakats', zakatRoutes);
app.use('/api/v1/pending-cheques', pendingChequeRoutes);
app.use('/api/v1/pending-cheque-details', pendingChequeDetailRoutes);
app.use('/api/v1/income-statement', incomeStatementRoutes);
app.use('/api/v1/wh-suppliers', whSupplierRoutes);
app.use('/api/v1/wh-customers', whCustomerRoutes);
app.use('/api/v1/wh-supplier-categories', whSupplierCategoryRoutes);
app.use('/api/v1/wh-customer-categories', whCustomerCategoryRoutes);
app.use('/api/v1/wh-cities', whCityRoutes);
app.use('/api/v1/wh-customer-types', whCustomerTypeRoutes);
app.use('/api/v1/wh-item-companies', whItemCompanyRoutes);
app.use('/api/v1/wh-item-categories', whItemCategoryRoutes);
app.use('/api/v1/wh-item-classes', whItemClassRoutes);
app.use('/api/v1/wh-item-subclasses', whItemSubClassRoutes);

app.use('/api/v1/wh-items', whItemRoutes);
app.use('/api/v1/wh-purchases', whPurchaseRoutes);
app.use('/api/v1/wh-purchase-returns', whPurchaseReturnRoutes);
app.use('/api/v1/wh-sales', whSaleRoutes);
app.use('/api/v1/wh-sale-returns', whSaleReturnRoutes);
app.use('/api/v1/wh-customer-payments', whCustomerPaymentRoutes);
app.use('/api/v1/wh-ledger', whLedgerRoutes);
app.use('/api/v1/commission-items', commissionItemRoutes);
app.use('/api/v1/commission-categories', require('./routes/commissionCategoryRoutes'));
app.use('/api/v1/commission-suppliers', require('./routes/commissionSupplierRoutes'));
app.use('/api/v1/designations', designationRoutes);
app.use('/api/v1/employee-departments', employeeDepartmentRoutes);
app.use('/api/v1/commission-branches', commissionBranchRoutes);
app.use('/api/v1/sub-branches', subBranchRoutes);
app.use('/api/v1/attendance/biometric', biometricRoutes);
app.use('/api/v1/mobile', mobileRoutes);
app.use('/api/v1/employee-salary-detail', employeeSalaryDetailRoutes);
app.use('/api/v1/salary-reports', bankPaidSalaryReportRoutes);
app.use('/api/v1/salary-reports', cashPaidSalaryReportRoutes);
app.use('/api/v1/salary-reports', empPayrollStatusRoutes);
// app.use('/api/v1/system-logs', systemLogsRoutes); // removed — logging disabled for performance
app.use('/api/v1/audit-logs', require('./routes/auditLogs'));
app.use('/api/v1/hr-dashboard', hrDashboardRoutes);
app.use('/api/v1/food-invoices', foodInvoiceRoutes);
app.use('/api/v1/legacy-payroll', legacyPayrollRoutes);
app.use('/api/v1/reports', overtimeReportRoutes);
app.use('/api/v1/reports/short-week', shortWeekReportRoutes);
app.use('/api/v1/download-center', downloadCenterRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/easypaisa-settlement', easypaisaSettlementRoutes);
// app.post('/api/v1/log-client-error', logClientError); // removed — logging disabled for performance






// Serve login page at root
app.get('/', (req, res) => {
  const loginPath = path.join(__dirname, '../Frontend/views', 'login.html');
  console.log('Attempting to serve login from (fs):', loginPath);
  require('fs').readFile(loginPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading login.html:', err);
      res.status(500).send(`Error reading login page: ${err.message}`);
    } else {
      res.send(data);
    }
  });
});

// Serve login page specific route
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'login.html'));
});

// Serve main page
app.get('/main', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'main.html'));
});

// Serve food invoice page
app.get('/food-invoice', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'food-invoice.html'));
});

// Serve dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'dashboard.html'));
});

// Map routes that don't match filenames exactly
app.get('/sales-returns', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'sale-returns.html'));
});

app.get('/EmployeeInfo/Import_Attendance', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'import-attendance.html'));
});

app.get('/payroll-report', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'payroll-report.html'));
});

app.get('/employees-info-report', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'employees-info-report.html'));
});

app.get('/short-week-report', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'employee-short-week-report.html'));
});

app.get('/employee-short-week-report', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'employee-short-week-report.html'));
});

app.get('/print-employee-short-week-report', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'print-employee-short-week-report.html'));
});

app.get('/distribute-employee-commission', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'distribute-employee-commission.html'));
});

// Serve download center page
app.get('/download-center', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'download-center.html'));
});

// Serve Advance Attendance Reconciliation page
app.get('/advance-attendance-reconciliation', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'advance-attendance-reconciliation.html'));
});

// Serve Print Advance Attendance Reconciliation page
app.get('/print-advance-attendance-reconciliation', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'print-advance-attendance-reconciliation.html'));
});

// Serve EasyPaisa Settlement page
app.get('/easypaisa-settlement', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/views', 'easypaisa-settlement.html'));
});

// Note: Other pages (like /items, /parties, /reports, etc.) are handled 
// automatically by express.static with extensions: ['html'] configured above.

// Serve the main HTML file for all other routes (catch-all)
app.use((req, res, next) => {
  // Skip API routes and static files
  if (req.path.startsWith('/api/') || req.path.startsWith('/js/') || req.path.startsWith('/css/') || req.path.includes('.')) {
    return next();
  }

  // Serve dashboard.html for all other routes
  const indexPath = path.join(__dirname, '../Frontend/views', 'dashboard.html');
  if (req.path === '/' || !req.path.includes('.')) {
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('Error serving dashboard.html:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });
  } else {
    next();
  }
});

// Handle 404 for API routes
app.use('/api', (req, res, next) => {
  res.status(404).json({ success: false, message: `API Route not found: ${req.originalUrl}` });
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5001;
const HOST = '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`Server is running on ${HOST}:${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
});

// ─── Timeout & Keep-Alive Optimization ─────────────────────────────────────────
// Standardized timeouts to prevent ghost connections from exhausting server resources
server.timeout = 60000;            // 60 seconds (1 minute)
server.keepAliveTimeout = 30000;   // 30 seconds
server.headersTimeout = 65000;   // Must be > keepAliveTimeout & server.timeout

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  // Suppress transient network errors from AI provider health checks / completions.
  // These are non-fatal and should not restart the server.
  const isFetchNetworkError = err instanceof TypeError && /fetch failed|network|econnrefused|enotfound|econnreset|socket hang up|aborted/i.test(err.message);
  if (isFetchNetworkError) {
    console.warn(`⚠️  Suppressed transient fetch rejection (non-fatal): ${err.message}`);
    return;
  }
  console.error(`🛑 Unhandled Rejection: ${err.message}`);
  if (err.stack) console.error(err.stack);
  // In production with PM2, we exit so PM2 can restart the process fresh
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions (sync errors)
process.on('uncaughtException', (err) => {
  console.error(`💥 Uncaught Exception: ${err.message}`);
  if (err.stack) console.error(err.stack);
  server.close(() => process.exit(1));
});
// Forced restart — global IMP employee pre-find hook added to Employee model

// trigger nodemon restart — live telemetry engine enabled
