const Attendance = require('../models/Attendance');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const Employee = require('../models/Employee'); // Moved to top
const { branchStatusCache } = require('../utils/memoryCache');

// @desc    Get real-time status of biometric branches
// @route   GET /api/v1/attendance/branch-status
exports.getBranchStatus = async (req, res) => {
    try {
        const statuses = [];
        const OFFLINE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour for direct socket/cache

        // Determine Pakistan Today range
        const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
        const nowPKT = new Date(Date.now() + PKT_OFFSET_MS);
        const todayPKTStart = new Date(Date.UTC(nowPKT.getUTCFullYear(), nowPKT.getUTCMonth(), nowPKT.getUTCDate(), 0, 0, 0) - PKT_OFFSET_MS);

        // System branches (from DB Store if possible, or fallback default list)
        const Store = require('../models/Store');
        let storeList = [];
        try {
            storeList = await Store.find({ isActive: true }).select('name code').lean();
        } catch (_) {}

        const defaultBranches = [
            "(Attock)", "(G15 Markaz)", "(Ghouri Town)", "(Gujar Khan)", "(PWD-1)",
            "(Chandni Chowk)", "(F-6)", "(Giga Mall)", "(Optician ISB)", "(Pakistan Town)"
        ];

        const allBranchNames = new Set(defaultBranches);
        storeList.forEach(s => {
            if (s.name) allBranchNames.add(s.name.trim());
        });

        // Query today's latest punches across all branches from DB
        const recentPunches = await Attendance.aggregate([
            {
                $match: {
                    date: { $gte: todayPKTStart }
                }
            },
            {
                $sort: { updatedAt: -1, date: -1 }
            },
            {
                $group: {
                    _id: "$branch",
                    lastPunchTime: { $first: "$updatedAt" },
                    latestCheckIn: { $first: "$checkIn" },
                    totalPunchesToday: { $sum: 1 }
                }
            }
        ]);

        const punchMap = {};
        recentPunches.forEach(p => {
            if (p._id) {
                const clean = String(p._id).trim().replace(/[()]/g, '').toLowerCase();
                punchMap[clean] = p;
                punchMap[String(p._id).trim().toLowerCase()] = p;
            }
        });

        for (const b of allBranchNames) {
            const clean = b.trim().replace(/[()]/g, '');
            const cleanLower = clean.toLowerCase();

            // 1. Check in-memory real-time cache
            const cacheTime = branchStatusCache.get(`lastSeen_${b}`) ||
                              branchStatusCache.get(`lastSeen_(${clean})`) ||
                              branchStatusCache.get(`lastSeen_${clean}`);

            // 2. Check DB attendance punches
            const punchData = punchMap[cleanLower] || punchMap[b.toLowerCase()];
            const punchTime = punchData?.lastPunchTime ? new Date(punchData.lastPunchTime).getTime() : 0;
            const punchCount = punchData?.totalPunchesToday || 0;

            const mostRecentTime = Math.max(cacheTime || 0, punchTime || 0);

            let isOnline = false;
            let minutesAgoStr = 'No recent activity';
            let lastSeenIso = null;

            if (mostRecentTime > 0) {
                lastSeenIso = new Date(mostRecentTime).toISOString();
                const diffMs = Date.now() - mostRecentTime;
                const minutesAgo = Math.floor(diffMs / 60000);

                // Online if punched today or heartbeat within last 12 hours
                if (punchCount > 0 || diffMs < 12 * 60 * 60 * 1000) {
                    isOnline = true;
                    if (minutesAgo < 2) {
                        minutesAgoStr = 'Just now (Live)';
                    } else if (minutesAgo < 60) {
                        minutesAgoStr = `${minutesAgo}m ago`;
                    } else {
                        const hrs = Math.floor(minutesAgo / 60);
                        minutesAgoStr = `${hrs}h ago`;
                    }
                } else {
                    const hrs = Math.floor(minutesAgo / 60);
                    minutesAgoStr = hrs < 24 ? `${hrs}h ago` : 'Yesterday';
                }
            } else if (punchCount > 0) {
                isOnline = true;
                minutesAgoStr = `${punchCount} punches today`;
            }

            statuses.push({
                branch: b,
                isOnline,
                punchesToday: punchCount,
                deviceOnline: isOnline,
                bridgeOnline: isOnline,
                lastSeen: lastSeenIso,
                minutesAgo: minutesAgoStr
            });
        }

        res.status(200).json({ success: true, data: statuses.sort((a,b) => b.isOnline - a.isOnline) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
    // MR WASI DEV

// Helper to normalize any date to 00:00:00 Pakistan Standard Time (19:00:00 UTC of previous day)
const normalizeDateToPKT = (dateInput) => {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return null;

    // To identify the "logical" Pakistan day, we shift the timestamp by +5 hours.
    // e.g., 2026-03-31T19:00:00Z (00:00 April 1 PKT) shifted by 5h becomes 2026-04-01T00:00:00Z.
    const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
    const pktDate = new Date(d.getTime() + PKT_OFFSET_MS);
    
    const y = pktDate.getUTCFullYear();
    const m = pktDate.getUTCMonth();
    const day = pktDate.getUTCDate();
    
    // Create UTC midnight for that logical day, then subtract 5 hours to get PKT-aligned UTC anchor
    return new Date(Date.UTC(y, m, day, 0, 0, 0) - PKT_OFFSET_MS);
};

const parseTimeStrToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const cleanStr = timeStr.trim().toUpperCase();
    if (['-', '--:--', '00:00', '0:00', ''].includes(cleanStr)) return 0;

    let hours = 0, minutes = 0;
    if (cleanStr.includes('AM') || cleanStr.includes('PM')) {
        const parts = cleanStr.split(':');
        hours = parseInt(parts[0]) || 0;
        const minutePart = parts[1] ? parts[1].substring(0, 2) : '0';
        minutes = parseInt(minutePart) || 0;
        if (cleanStr.includes('PM') && hours < 12) hours += 12;
        if (cleanStr.includes('AM') && hours === 12) hours = 0;
    } else {
        const parts = cleanStr.split(':');
        hours = parseInt(parts[0]) || 0;
        const minutePart = parts.length > 1 ? parts[1] : '0';
        minutes = parseInt(minutePart) || 0;
    }

    if (isNaN(hours) || isNaN(minutes)) return 0;
    return (hours * 60) + minutes;
};

const escapeRegex = (value) => {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const resolveDeptId = async (department) => {
    if (!department) return undefined;
    if (mongoose.Types.ObjectId.isValid(department)) return department;
    const EmployeeDepartment = require('../models/EmployeeDepartment');
    const doc = await EmployeeDepartment.findOne({
        name: { $regex: `^${escapeRegex(department.trim())}$`, $options: 'i' }
    }).select('_id').lean();
    return doc ? doc._id.toString() : undefined;
};

const resolveDesigId = async (designation) => {
    if (!designation) return undefined;
    if (mongoose.Types.ObjectId.isValid(designation)) return designation;
    const Designation = require('../models/Designation');
    const doc = await Designation.findOne({
        name: { $regex: `^${escapeRegex(designation.trim())}$`, $options: 'i' }
    }).select('_id').lean();
    return doc ? doc._id.toString() : undefined;
};

// Utility to convert minutes back to HH:mm format (24-hour) for consistent storage // MR WASI DEV
// @desc    Get attendance records
// @route   GET /api/v1/attendance
exports.getAttendance = async (req, res) => {
    try {
        const { from, to, branch, department, designation, employee } = req.query;

        let query = {};

        if (from && to) {
            // Normalize inputs to capture PKT-anchored records
            const start = normalizeDateToPKT(from);
            const end = new Date(normalizeDateToPKT(to).getTime() + 24 * 60 * 60 * 1000);
            
            query.date = { $gte: start, $lt: end };
        }

        // 1. Determine Admin Status (Consistent with auth.js)
        const userRole = (req.user && req.user.role || '').toLowerCase();
        const isAdmin = userRole === 'admin' || userRole === 'administrator' || userRole === 'superadmin' || 
                        (req.user.groupId && req.user.groupId.rights && (req.user.groupId.rights.admin === true || req.user.groupId.rights.administration === true));

        // 2. Determine Allowed Branches & Requested Branch
        const rawBranch = req.query.branch;
        let requestedBranch = null; 
        if (rawBranch && rawBranch !== 'all' && rawBranch !== 'null' && rawBranch !== 'undefined' && rawBranch !== '') {
            requestedBranch = String(rawBranch).trim();
        }

        let allowedBranches = []; // Authorized branch names for filtering
        if (!isAdmin) {
            // Non-admin: restricted to their allowed branches
            const userBranches = Array.isArray(req.user.branch) ? req.user.branch : (req.user.branch ? [req.user.branch] : []);
            
            if (userBranches.length === 0) {
                // Security: Non-admin with no branches should see nothing
                return res.status(200).json({ success: true, count: 0, totalCount: 0, data: [] });
            }

            if (requestedBranch) {
                // Check if requested branch is allowed (robust comparison)
                const isAllowed = userBranches.some(ub => {
                    const ubClean = ub.replace(/[()]/g, '').trim().toLowerCase();
                    const reqClean = requestedBranch.replace(/[()]/g, '').trim().toLowerCase();
                    return ub.toLowerCase() === requestedBranch.toLowerCase() || ubClean === reqClean;
                });
                
                if (isAllowed) {
                    allowedBranches = [requestedBranch];
                } else {
                    // Requested branch not allowed: return nothing
                    return res.status(200).json({ success: true, count: 0, totalCount: 0, data: [] });
                }
            } else {
                allowedBranches = userBranches;
            }
        } else if (requestedBranch) {
            // Admin: filter by requested branch if provided
            allowedBranches = [requestedBranch];
        }

        // 3. Resolve IDs for Department and Designation
        const deptId = await resolveDeptId(department);
        const desigId = await resolveDesigId(designation);

        // 4. Fetch Target Employee IDs (Filtering by Branch, Dept, Desig at DB level)
        const Employee = require('../models/Employee');
        const employeeQuery = { isActive: true }; // Only show active employees by default
        
        if (allowedBranches.length > 0) {
            // Use regex for robust branch matching in MongoDB
            const branchRegexes = allowedBranches.map(b => {
                const escaped = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return new RegExp(`^\\s*${escaped}\\s*$`, 'i');
            });
            employeeQuery.branch = { $in: branchRegexes };
        }
        if (deptId) employeeQuery.department = deptId;
        if (desigId) employeeQuery.designation = desigId;
        if (employee) employeeQuery._id = employee;

        // Note: Global Employee pre-find hook already excludes IMP employees
        const targetEmps = await Employee.find(employeeQuery).select('_id branch').lean();
        const finalEmpIds = targetEmps.map(e => e._id);

        if (finalEmpIds.length === 0) {
            // No matching employees found for the filters
            return res.status(200).json({ success: true, count: 0, totalCount: 0, data: [] });
        }

        // 5. Build Attendance Query
        // First, restrict to the employees we found in Step 4
        query.employee = { $in: finalEmpIds };
        
        // Second, we do not filter the attendance record's branch field because:
        // 1. Employees are already restricted to the target branch via finalEmpIds in Step 4.
        // 2. If a branch employee checked in at another branch, we still want to show their check-in time.

        // ─── PHASE 1: Hard Pagination ─────────────────────────────────
        const limit = Math.min(parseInt(req.query.limit) || 1000, 30000);
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const skip = (page - 1) * limit;

        const [attendance, totalCount] = await Promise.all([
            Attendance.find(query)
                .select('employee date branch checkIn checkOut workedHrs displayStatus totalHrs totalDiffHrs breakHrs breakOut breakIn diffMode timeDiffIn timeDiffOut remarks isPresent')
                .populate({
                    path: 'employee',
                    select: 'name name_urdu code department designation fDutyTime tDutyTime totalHrs',
                    populate: [
                        { path: 'department', select: 'name' },
                        { path: 'designation', select: 'name' }
                    ]
                })
                .sort({ date: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Attendance.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            count: attendance.length,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            data: attendance
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single attendance
// @route   GET /api/v1/attendance/:id
exports.getSingleAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.findById(req.params.id)
            .populate({ path: 'employee', select: 'name name_urdu code department designation photo' })
            .lean();
        if (!attendance) {
            return res.status(404).json({ success: false, message: 'Attendance not found' });
        }
        res.status(200).json({ success: true, data: attendance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create/Update attendance
// @route   POST /api/v1/attendance
exports.createAttendance = async (req, res) => {
    try {
        const { employee, date } = req.body;
        const normalizedDate = normalizeDateToPKT(date);
        // Check if attendance already exists for this employee and date
        let attendance = await Attendance.findOne({ employee, date: normalizedDate });

        if (attendance) {
            const oldData = attendance.toObject();
            
            // Trust explicit fields from single-record UI updates (allow clearing)
            const updateFields = ['checkIn', 'checkOut', 'breakIn', 'breakOut', 'timeDiffIn', 'timeDiffOut', 'remarks', 'displayStatus', 'isPresent', 'busyHours'];
            updateFields.forEach(field => {
                if (req.body[field] !== undefined && req.body[field] !== null) {
                    attendance[field] = req.body[field];
                }
            });

            attendance.date = normalizedDate; // Ensure date stays normalized
            await attendance.save();

            // Log if specific fields changed
            const fieldsToTrack = ['checkIn', 'checkOut', 'busyHours', 'displayStatus', 'isPresent'];
            const changes = {};
            let hasChanges = false;

            fieldsToTrack.forEach(field => {
                if (req.body[field] !== undefined && String(req.body[field]) !== String(oldData[field])) {
                    changes[field] = { old: oldData[field], new: req.body[field] };
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                await AuditLog.log({
                    action: 'update',
                    entity: 'attendance',
                    entityId: attendance._id,
                    changes: changes,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    performedBy: req.user.id
                });
            }
        } else {
            // Create new
            const recordData = { ...req.body, date: normalizedDate };
            attendance = await Attendance.create(recordData);
            await AuditLog.log({
                action: 'create',
                entity: 'attendance',
                entityId: attendance._id,
                changes: req.body,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                performedBy: req.user.id
            });
        }

        res.status(201).json({ success: true, data: attendance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Bulk create/update attendance
// @route   POST /api/v1/attendance/bulk
exports.bulkCreateAttendance = async (req, res) => {
    try {
        const { attendanceRecords } = req.body;
        if (!attendanceRecords || attendanceRecords.length === 0) {
            return res.status(400).json({ success: false, message: 'No records provided.' });
        }

        const updateFields = ['checkIn', 'checkOut', 'breakIn', 'breakOut', 'timeDiffIn', 'timeDiffOut',
                              'remarks', 'displayStatus', 'isPresent', 'workedHrs', 'totalHrs',
                              'breakHrs', 'diffMode', 'totalDiffHrs', 'branch'];

        // Build one bulkWrite operation per record (upsert by employee+date)
        // This sends ALL records to MongoDB in a SINGLE round trip instead of 24 sequential hits
        const bulkOps = attendanceRecords.map(record => {
            const normalizedDate = normalizeDateToPKT(record.date);
            const setFields = { date: normalizedDate, employee: record.employee };

            updateFields.forEach(f => {
                if (record[f] !== undefined && record[f] !== null) {
                    setFields[f] = record[f];
                }
            });

            return {
                updateOne: {
                    filter: { employee: record.employee, date: normalizedDate },
                    update: { $set: setFields },
                    upsert: true
                }
            };
        });

        // Single MongoDB bulkWrite — replaces 24 sequential findOne+save calls
        const result = await Attendance.bulkWrite(bulkOps, { ordered: false });

        // Respond immediately — don't wait for audit logs
        res.status(201).json({
            success: true,
            data: { length: attendanceRecords.length },
            matched: result.matchedCount,
            upserted: result.upsertedCount
        });

        // Async audit log — runs AFTER response is already sent (non-blocking)
        setImmediate(async () => {
            try {
                const auditOps = attendanceRecords.map(record => ({
                    action: 'update',
                    entity: 'attendance',
                    entityId: record.employee,
                    changes: { checkIn: record.checkIn, checkOut: record.checkOut, displayStatus: record.displayStatus },
                    ipAddress: req.ip,
                    performedBy: req.user?.id
                }));
                for (const op of auditOps) {
                    await AuditLog.log(op).catch(() => {});
                }
            } catch (_) {}
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update attendance
// @route   PUT /api/v1/attendance/:id
exports.updateAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.findById(req.params.id);
        if (!attendance) {
            return res.status(404).json({ success: false, message: 'Attendance not found' });
        }

        const oldData = attendance.toObject();
        
        // Trust explicit fields from manual updates (allow clearing)
        const updateFields = ['checkIn', 'checkOut', 'breakIn', 'breakOut', 'timeDiffIn', 'timeDiffOut', 'remarks', 'displayStatus', 'isPresent', 'busyHours'];
        updateFields.forEach(f => {
            if (req.body[f] !== undefined && req.body[f] !== null) {
                attendance[f] = req.body[f];
            }
        });

        await attendance.save();

        const fieldsToTrack = ['checkIn', 'checkOut', 'busyHours', 'displayStatus', 'isPresent', 'remarks'];
        const changes = {};
        let hasChanges = false;

        fieldsToTrack.forEach(field => {
            if (req.body[field] !== undefined && String(req.body[field]) !== String(oldData[field])) {
                changes[field] = { old: oldData[field], new: req.body[field] };
                hasChanges = true;
            }
        });

        if (hasChanges) {
            await AuditLog.log({
                action: 'update',
                entity: 'attendance',
                entityId: attendance._id,
                changes: changes,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                performedBy: req.user.id
            });
        }

        res.status(200).json({ success: true, data: attendance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete attendance
// @route   DELETE /api/v1/attendance/:id
exports.deleteAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.findByIdAndDelete(req.params.id);
        if (!attendance) {
            return res.status(404).json({ success: false, message: 'Attendance not found' });
        }

        // Log deletion
        await AuditLog.log({
            action: 'delete',
            entity: 'attendance',
            entityId: attendance._id,
            changes: attendance,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            performedBy: req.user.id
        });

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get total count of unique present employees
// @route   GET /api/v1/attendance/total-present
exports.getTotalPresentEmployee = async (req, res) => {
    try {
        const {
            F_Dated,
            T_Dated,
            Employee_ID,
            Department_ID,
            Designation_ID,
            Branch_ID,
            Criteria
        } = req.query;

        // 1. Determine Admin Status (Consistent with auth.js)
        const userRole = (req.user && req.user.role || '').toLowerCase();
        const isAdmin = userRole === 'admin' || userRole === 'administrator' || userRole === 'superadmin' || 
                        (req.user.groupId && req.user.groupId.rights && (req.user.groupId.rights.admin === true || req.user.groupId.rights.administration === true));

        // 2. Determine Allowed Branches
        let allowedBranches = [];
        if (!isAdmin) {
            allowedBranches = Array.isArray(req.user.branch) ? req.user.branch : (req.user.branch ? [req.user.branch] : []);
            
            if (allowedBranches.length === 0) {
                // Security: Non-admin with no branches should see nothing
                return res.status(200).json({ success: true, count: 0 });
            }

            if (Branch_ID && Branch_ID !== '0' && Branch_ID !== 'null' && Branch_ID !== '') {
                // Check if requested branch name matches any allowed branch
                const isAllowed = allowedBranches.some(b => b.toLowerCase() === Branch_ID.toLowerCase());
                if (!isAllowed) {
                    return res.status(200).json({ success: true, count: 0 });
                }
            }
        }

        // Match Stage (Only Date)
        const matchStage = {
            displayStatus: { $in: ['Present', 'P'] },
            checkIn: { $exists: true, $ne: '' },
            checkOut: { $exists: true, $ne: '' }
        };

        // Date Range Filter
        if (F_Dated && T_Dated) {
            matchStage.date = {
                $gte: new Date(F_Dated),
                $lte: new Date(T_Dated)
            };
        } else if (F_Dated) {
            matchStage.date = { $gte: new Date(F_Dated) };
        }

        // Employee Match
        if (Employee_ID && Employee_ID !== '0' && Employee_ID !== 'null' && Employee_ID !== '') {
            matchStage.employee = new mongoose.Types.ObjectId(Employee_ID);
        }

        // Pipeline Construction
        const pipeline = [
            { $match: matchStage },
            // Lookup Employee details for Branch/Dept/Designation filtering
            {
                $lookup: {
                    from: 'employees',
                    localField: 'employee',
                    foreignField: '_id',
                    as: 'empDetails'
                }
            },
            { $unwind: '$empDetails' }
        ];

        // Filters that require Employee Lookup
        const empMatch = {};
        
        // Exclude IMP employees from statistics
        empMatch['empDetails.code'] = { $not: /^IMP-/i };
        empMatch['empDetails.payrollImportOnly'] = { $ne: true };

        // Branch Match
        if (Branch_ID && Branch_ID !== '0' && Branch_ID !== 'null' && Branch_ID !== '') {
            const escapedBranch = Branch_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            empMatch['empDetails.branch'] = { $regex: `^\\s*${escapedBranch}\\s*$`, $options: 'i' };
        } else if (allowedBranches.length > 0) {
            empMatch['empDetails.branch'] = { $in: allowedBranches };
        }

        if (Department_ID && Department_ID !== '0' && Department_ID !== 'null' && Department_ID !== '') {
            empMatch['empDetails.department'] = new mongoose.Types.ObjectId(Department_ID);
        }

        if (Designation_ID && Designation_ID !== '0' && Designation_ID !== 'null' && Designation_ID !== '') {
            empMatch['empDetails.designation'] = new mongoose.Types.ObjectId(Designation_ID);
        }

        // Apply Criteria Filter (Search by Name or Code)
        if (Criteria) {
            empMatch['$or'] = [
                { 'empDetails.name': { $regex: Criteria, $options: 'i' } },
                { 'empDetails.code': { $regex: Criteria, $options: 'i' } }
            ];
        }

        // Add secondary match stage if there are employee-level filters
        if (Object.keys(empMatch).length > 0) {
            pipeline.push({ $match: empMatch });
        }

        // Count TOTAL RECORDS matching criteria (Man-Days)
        pipeline.push({
            $count: 'totalPresent'
        });

        const result = await Attendance.aggregate(pipeline);

        const count = result.length > 0 ? result[0].totalPresent : 0;

        res.status(200).json({
            success: true,
            count: count
        });

    } catch (error) {
        console.error('Aggregation Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Bulk update/fix attendance hours for all employees (replicates manual save)
// @route   POST /api/v1/attendance/bulk-fix
exports.bulkUpdateAttendance = async (req, res) => {
    try {
        const now = new Date();
        const currentMonth = now.getMonth();

        const targets = [
            {
                year: now.getFullYear(),
                month: currentMonth
            },
            {
                year: currentMonth === 0 ? now.getFullYear() - 1 : now.getFullYear(),
                month: currentMonth === 0 ? 11 : currentMonth - 1
            }
        ];

        const ranges = targets.map(t => ({
            start: new Date(t.year, t.month, 1),
            end: new Date(t.year, t.month + 1, 0, 23, 59, 59, 999)
        }));

        let totalFixed = 0;

        for (const range of ranges) {
            // Find all records that have at least a check-in or check-out
            const records = await Attendance.find({
                date: { $gte: range.start, $lte: range.end },
                $or: [
                    { checkIn: { $exists: true, $nin: ['', null, '-', '--:--'] } },
                    { checkOut: { $exists: true, $nin: ['', null, '-', '--:--', '0:00', '00:00'] } }
                ]
            });

            for (const r of records) {
                const normalizedDate = normalizeDateToPKT(r.date);
                
                // If the record is already on the normalized date, just save it to trigger calculations
                if (r.date.getTime() === normalizedDate.getTime()) {
                    await r.save();
                    totalFixed++;
                    continue;
                }

                // If not normalized, look for a 'master' record at the normalized timestamp
                let master = await Attendance.findOne({ employee: r.employee, date: normalizedDate });
                
                if (master && master._id.toString() !== r._id.toString()) {
                    // MERGE: Transfer data from current record to master if master is missing it
                    let modified = false;
                    const fields = ['checkIn', 'checkOut', 'breakIn', 'breakOut', 'timeDiffIn', 'timeDiffOut', 'remarks', 'displayStatus'];
                    fields.forEach(f => {
                        if ((!master[f] || ['-', '--:--'].includes(master[f])) && r[f] && !['-', '--:--'].includes(r[f])) {
                            master[f] = r[f];
                            modified = true;
                        }
                    });

                    if (modified) await master.save();
                    // Delete the 'orphan' unnormalized record
                    await Attendance.findByIdAndDelete(r._id);
                    totalFixed++;
                } else if (!master) {
                    // No master exists, so just normalize this record's date
                    try {
                        r.date = normalizedDate;
                        await r.save();
                        totalFixed++;
                    } catch (dupErr) {
                        // Unique index collision might happen if another process created one while we worked
                        // In that case, just skip or handle similarly
                        console.warn('Merge collision for', r.employee, normalizedDate);
                    }
                }
            }
        }

        res.status(200).json({
            success: true,
            message: `Successfully updated ${totalFixed} records.`,
            fixedCount: totalFixed
        });

    } catch (error) {
        console.error('Bulk Fix Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
