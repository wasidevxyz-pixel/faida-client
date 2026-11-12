const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const EmployeeDepartment = require('../models/EmployeeDepartment');
const Designation = require('../models/Designation');
const asyncHandler = require('../middleware/async');
const AuditLog = require('../models/AuditLog');
const { employeeCache, branchStatusCache } = require('../utils/memoryCache');
const { applyBranchFilter } = require('../middleware/auth');

// @desc    Get all employees
// @route   GET /api/v1/employees
exports.getEmployees = asyncHandler(async (req, res, next) => {
    let query = {};
    const isLightMode = req.query.light === 'true';
    const basSecret = req.headers['bas-secret-key'] || req.query.basSecret;
    if (req.query.branch && basSecret) { branchStatusCache.set('lastSeen_' + req.query.branch, Date.now(), 3600000); }

    // 1. Parallelize Dependency Resolution (Depts, Desigs, etc.)
    const resolveDeptId = async (name) => {
        if (!name || name === 'Select Department' || name === 'All Depts') return undefined;
        if (mongoose.Types.ObjectId.isValid(name)) return name;
        const doc = await EmployeeDepartment.findOne({ name }).select('_id').lean();
        return doc ? doc._id : null;
    };

    const resolveDesigId = async (name) => {
        if (!name || name === 'Select Designation' || name === 'All') return undefined;
        if (mongoose.Types.ObjectId.isValid(name)) return name;
        const doc = await Designation.findOne({ name }).select('_id').lean();
        return doc ? doc._id : null;
    };

    // Prepare Query Filters
    if (req.query.id) query._id = req.query.id;
    if (req.query.code) query.code = { $regex: req.query.code, $options: 'i' };
    if (req.query.name) query.name = { $regex: req.query.name, $options: 'i' };

    // Filter by Branch (Allow filtering for biometric sync apps to prevent huge payload timeouts on Windows 10 clients)
    const isBiometricSync = req.get('bas-secret-key') || req.query.basSecret;
    const rawBranch = req.query.branch;
    if (rawBranch && rawBranch !== 'null' && rawBranch !== 'undefined' && rawBranch !== '' && rawBranch !== 'all') {
        // EXACT MATCH: Extremely fast and allows MongoDB to use indexes instantly.
        query.branch = String(rawBranch).trim();
    }

    // Apply branch level restriction to respect user access permissions
    if (!isBiometricSync) {
        query = await applyBranchFilter(req, query, Employee);
    }
    if (req.query.religion) query.religion = req.query.religion;
    if (req.query.maritalStatus) query.maritalStatus = req.query.maritalStatus;

    if (req.query.isActive === 'false') query.isActive = false;
    else if (req.query.isActive === 'true') query.isActive = true;
    else if (req.query.isActive === 'all' || req.query.isActive === '') { /* Show both */ }
    else { query.isActive = true; } // Default to active for normal business views

    // HIDDEN EMPLOYEES: Only show if explicitly requested (e.g. for Payroll List filtering)
    // The Mongoose pre-hook on Employee already excludes payrollImportOnly employees globally.
    // This controller guard is a redundant safety net — we keep the boolean but drop the
    // regex code filter (it can't use indexes and slows down every list query).
    if (req.query.includeImportOnly !== 'true') {
        query.payrollImportOnly = { $ne: true };
    }


    if (req.query.type === 'commission') query.commEmp = true;
    else if (req.query.type === 'bank') {
        query.$or = [{ bankCash: { $regex: '^Bank$', $options: 'i' } }, { payFullSalaryThroughBank: true }, { selectBank: { $nin: ['', null, 'Select Bank'] } }];
    } else if (req.query.type === 'cash') {
        query.bankCash = { $regex: '^Cash$', $options: 'i' };
        query.payFullSalaryThroughBank = { $ne: true };
        query.selectBank = { $in: ['', null, 'Select Bank'] };
    }

    // 2. Resolve IDs and handle Cache Check (Bypass for biometric syncs to ensure full list)
    const [dId, dgId] = await Promise.all([
        resolveDeptId(req.query.department),
        resolveDesigId(req.query.designation)
    ]);
    if (dId !== undefined) query.department = dId;
    if (dgId !== undefined) query.designation = dgId;

    // PERF FIX: Removed in-memory caching of dynamic queries to prevent massive memory leaks.
    // Memory caching of JSON.stringify(req.query) causes RAM exhaustion. We now rely on DB indexes.

    // ── BIOMETRIC FAST PATH ───────────────────────────────────────────────────
    // Biometric app only needs name/code/branch/fingerprintTemplate for its dropdown.
    // photo, idCardFront, idCardBack are base64 strings — loading them for 500+
    // employees causes 250-500MB memory spikes and 30-70 second response times.
    // This path is completely separate — normal requests below are not affected.
    if (isBiometricSync) {
        const cacheKey = `biometric_employees_${query.isActive}_${rawBranch || 'all'}`;
        const isStandardSync = !req.query.name && !req.query.code && !req.query.id;

        if (isStandardSync) {
            const cached = employeeCache.get(cacheKey);
            if (cached) {
                // Use res.json() NOT res.end() — res.end() bypasses Express compression
                // middleware so gzip never fires. res.json() goes through the full pipeline.
                res.setHeader('X-Cache', 'HIT');
                return res.status(200).json(cached);
            }
        }

        const docs = await Employee.find(query)
            .select('name code branch isActive fingerprintTemplate department')
            .sort({ code: 1 })
            .lean();

        const responseData = {
            success: true,
            totalCount: docs.length,
            data: docs
        };

        if (isStandardSync) {
            // Cache the plain object — res.json() will serialize + compress per request
            employeeCache.set(cacheKey, responseData, 300000); // 5 minutes cache
        }

        res.setHeader('X-Cache', 'MISS');
        return res.status(200).json(responseData);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Lightweight mode for fast employee dropdowns/autocomplete.
    // Skips heavy salary/photo/ID-card fields to keep response time low.
    if (isLightMode) {
        const limit = Math.min(parseInt(req.query.limit) || 1000, 5000);
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const skip = (page - 1) * limit;

        const employees = await Employee.find(query)
            .select('name name_urdu code branch department designation isActive basicSalary opening fDutyTime tDutyTime scheduleFDutyTime scheduleTDutyTime totalHrs offDay')
            .populate('department', 'name')
            .populate('designation', 'name')
            .sort({ code: 1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const result = {
            success: true,
            data: employees,
            totalCount: employees.length,
            totalPages: 1,
            currentPage: 1
        };

        // employeeCache.set(cacheKey, result, 120000); // Caching removed
        return res.status(200).json(result);
    }


    // 3. Ultra-Fast Parallel Fetch: Count, Employees, and Reference Maps
    const limit = Math.min(parseInt(req.query.limit) || 1000, 10000); // Increased cap to 10k
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;

    const [employees, totalCount, depts, desigs] = await Promise.all([
        Employee.find(query)
            .select('name name_urdu code branch department designation isActive basicSalary otherAllowance fixAllowance stLoss maritalStatus gender incrDate acNo selectBank cnic mobileNo totalHrs opening religion offDay allowFood bankCash payFullSalaryThroughBank allowEmployeeAdvances securityDeposit commEmp joiningDate fDutyTime tDutyTime scheduleFDutyTime scheduleTDutyTime otst30WorkingDays thirtyWorkingDays')
            .sort({ code: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Employee.countDocuments(query),
        EmployeeDepartment.find().select('name').lean(),
        Designation.find().select('name').lean()
    ]);

    // O(1) Lookup Maps for references instead of expensive 'populate'
    const deptMap = Object.fromEntries(depts.map(d => [d._id.toString(), d]));
    const desigMap = Object.fromEntries(desigs.map(d => [d._id.toString(), d]));

    const mappedEmployees = employees.map(emp => ({
        ...emp,
        department: emp.department ? (deptMap[emp.department.toString()] || (typeof emp.department === 'string' && !mongoose.Types.ObjectId.isValid(emp.department) ? { name: emp.department } : (emp.department?.name ? { name: emp.department.name } : null))) : null,
        designation: emp.designation ? (desigMap[emp.designation.toString()] || (typeof emp.designation === 'string' && !mongoose.Types.ObjectId.isValid(emp.designation) ? { name: emp.designation } : (emp.designation?.name ? { name: emp.designation.name } : null))) : null
    }));

    const result = { success: true, data: mappedEmployees, totalCount, totalPages: Math.ceil(totalCount / limit), currentPage: page };
    // employeeCache.set(cacheKey, result, 300000); // Caching removed

    res.status(200).json(result);
});



// @desc    Get employee directory report for payroll
// @route   GET /api/v1/employees/reports/employees-info
exports.getEmployeesInfoReport = asyncHandler(async (req, res, next) => {
    let query = {};

    if (req.query.branch && req.query.branch !== 'all' && req.query.branch !== '') {
        query.branch = String(req.query.branch).trim();
    }

    query = await applyBranchFilter(req, query, Employee);

    if (req.query.isActive === 'true') {
        query.isActive = true;
    } else if (req.query.isActive === 'false') {
        query.isActive = false;
    }

    if (req.query.search) {
        const search = String(req.query.search).trim();
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { cnic: { $regex: search, $options: 'i' } },
                { mobileNo: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } }
            ];
        }
    }

    const employees = await Employee.find(query)
        .select('name cnic mobileNo designation branch')
        .populate('designation', 'name')
        .sort({ branch: 1, name: 1 })
        .lean();

    const data = employees.map(emp => ({
        name: emp.name || '',
        cnic: emp.cnic || '',
        mobileNo: emp.mobileNo || '',
        designation: emp.designation ? emp.designation.name : ''
    }));

    res.status(200).json({
        success: true,
        count: data.length,
        data
    });
});

// @desc    Get single employee
// @route   GET /api/v1/employees/:id
exports.getEmployee = asyncHandler(async (req, res, next) => {
    const employee = await Employee.findById(req.params.id).populate('department designation');
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    res.status(200).json({ success: true, data: employee });
});

// @desc    Create employee
// @route   POST /api/v1/employees
exports.createEmployee = asyncHandler(async (req, res, next) => {
    // Auto-generate code if not provided
    if (!req.body.code) {
        // IMPORTANT: Exclude IMP- (payroll-import-only) employees so they never disturb the real sequence
        const lastEmployee = await Employee.findOne(
            { payrollImportOnly: { $ne: true }, code: { $not: /^IMP-/i } }
        ).sort({ code: -1 }).select('code').lean();
        let nextNum = 3000;
        if (lastEmployee && lastEmployee.code) {
            const match = lastEmployee.code.match(/\d+/);
            if (match) {
                nextNum = Math.max(3000, parseInt(match[0]) + 1);
            }
        }
        req.body.code = String(nextNum).padStart(4, '0');
    }

    // FIX: Retry on duplicate code — handles concurrent registrations race condition.
    // If 10 users save at the same time with the same code, each retry scans forward
    // to find the NEXT truly unused code (not just lastEmployee+1 which can still collide).
    let employee;
    let attempt = 0;
    const MAX_RETRIES = 15;

    while (attempt < MAX_RETRIES) {
        try {
            employee = await Employee.create({ ...req.body });
            break; // Success — exit loop
        } catch (err) {
            // MongoDB duplicate key error code
            const isDuplicateCode = err.code === 11000 &&
                (err.keyPattern?.code || (err.message && err.message.includes('code')));

            if (isDuplicateCode && attempt < MAX_RETRIES - 1) {
                // Scan forward from the current highest to find a code NOT in DB
                // This is collision-safe even when multiple retries run simultaneously
                // IMPORTANT: Exclude IMP- employees to prevent sequence contamination
                const lastEmp = await Employee.findOne(
                    { payrollImportOnly: { $ne: true }, code: { $not: /^IMP-/i } }
                ).sort({ code: -1 }).select('code').lean();
                let nextNum = 3000;
                if (lastEmp && lastEmp.code) {
                    const match = lastEmp.code.match(/\d+/);
                    if (match) nextNum = Math.max(3000, parseInt(match[0]) + 1);
                }
                // Scan forward until we find a code that doesn't exist yet
                let found = false;
                while (!found) {
                    const candidate = String(nextNum).padStart(4, '0');
                    const exists = await Employee.findOne({ code: candidate }).select('_id').lean();
                    if (!exists) {
                        found = true;
                        req.body.code = candidate;
                    } else {
                        nextNum++;
                    }
                }
                attempt++;
            } else {
                throw err; // Re-throw non-duplicate errors
            }
        }
    }

    // Clear cache on new employee
    employeeCache.clear();

    // Log Creation
    await AuditLog.log({
        action: 'create',
        entity: 'employee',
        entityId: employee._id,
        changes: req.body,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        performedBy: req.user.id
    });

    res.status(201).json({ success: true, data: employee });
});


// @desc    Update employee
// @route   PUT /api/v1/employees/:id
exports.updateEmployee = asyncHandler(async (req, res, next) => {
    const oldData = await Employee.findById(req.params.id).lean();

    const employee = await Employee.findByIdAndUpdate(req.params.id, req.body, {
        returnDocument: 'after',
        runValidators: true
    });
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Log Update
    const fieldsToTrack = ['name', 'code', 'branch', 'department', 'designation', 'basicSalary', 'salaryType', 'isActive', 'mobileNo', 'joiningDate', 'incrDate', 'fDutyTime', 'tDutyTime', 'scheduleFDutyTime', 'scheduleTDutyTime'];
    const changes = {};
    let hasChanges = false;

    fieldsToTrack.forEach(field => {
        if (req.body[field] !== undefined && String(req.body[field]) !== String(oldData[field])) {
            changes[field] = { old: oldData[field], new: req.body[field] };
            hasChanges = true;
        }
    });

    // Clear cache on update
    employeeCache.clear();

    if (hasChanges) {
        await AuditLog.log({
            action: 'update',
            entity: 'employee',
            entityId: employee._id,
            changes: changes,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            performedBy: req.user.id
        });
    }

    res.status(200).json({ success: true, data: employee });
});

// @desc    Delete employee
// @route   DELETE /api/v1/employees/:id
exports.deleteEmployee = asyncHandler(async (req, res, next) => {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Clear cache on delete
    employeeCache.clear();

    // Log Deletion
    await AuditLog.log({
        action: 'delete',
        entity: 'employee',
        entityId: employee._id,
        changes: employee,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        performedBy: req.user.id
    });

    res.status(200).json({ success: true, data: {} });
});

// @desc    Get next employee code
// @route   GET /api/v1/employees/next-code
exports.getNextCode = asyncHandler(async (req, res, next) => {
    // FIX: Find the next code that does NOT already exist in DB.
    // Prevents all concurrent users from getting the same code on screen load.
    // IMPORTANT: Exclude IMP- (payroll-import-only) employees so the sequence is never contaminated
    const lastEmployee = await Employee.findOne(
        { payrollImportOnly: { $ne: true }, code: { $not: /^IMP-/i } }
    ).sort({ code: -1 }).select('code').lean();
    let nextNum = 3000;
    if (lastEmployee && lastEmployee.code) {
        const match = lastEmployee.code.match(/\d+/);
        if (match) {
            nextNum = Math.max(3000, parseInt(match[0]) + 1);
        }
    }

    // Scan forward to find a code not yet in the DB (handles gaps from deletions too)
    let found = false;
    while (!found) {
        const candidate = String(nextNum).padStart(4, '0');
        const exists = await Employee.findOne({ code: candidate }).select('_id').lean();
        if (!exists) {
            found = true;
        } else {
            nextNum++;
        }
    }

    res.status(200).json({ success: true, data: String(nextNum).padStart(4, '0') });
});

// @desc    Migrate name_urdu: copy name to name_urdu for all employees missing it
// @route   POST /api/v1/employees/migrate/name-urdu
exports.migrateNameUrdu = asyncHandler(async (req, res, next) => {
    // Only allow admin or internal migration calls
    if (req.user && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const employees = await Employee.find({
        $or: [
            { name_urdu: { $exists: false } },
            { name_urdu: null },
            { name_urdu: '' }
        ]
    });

    console.log(`Found ${employees.length} employees without name_urdu`);

    let updated = 0;
    for (const emp of employees) {
        if (emp.name && !emp.name_urdu) {
            emp.name_urdu = emp.name;
            await emp.save();
            updated++;
        }
    }

    console.log(`Successfully updated ${updated} employees`);
    
    // Clear cache on migration update
    employeeCache.clear();

    res.status(200).json({
        success: true,
        message: `Migrated ${updated} employees - name copied to name_urdu`,
        data: { migrated: updated, total: employees.length }
    });
});

