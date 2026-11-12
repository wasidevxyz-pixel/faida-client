const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const { employeeCache, attendanceCache, branchStatusCache } = require('../utils/memoryCache');

// ─── Settings secret cache ────────────────────────────────────────────────────
// We cache the DB apiSecret for 5 minutes so every scan doesn't hit MongoDB
// for a Settings lookup. The cache is invalidated automatically by TTL.
let _cachedApiSecret = null;
let _cachedApiSecretAt = 0;
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getApiSecret() {
    const now = Date.now();
    if (_cachedApiSecret !== null && (now - _cachedApiSecretAt) < SETTINGS_CACHE_TTL_MS) {
        return _cachedApiSecret;
    }
    const Settings = require('../models/Settings');
    const settings = await Settings.findOne({}).lean();
    _cachedApiSecret = (settings && settings.apiSecret) ? settings.apiSecret : null;
    _cachedApiSecretAt = now;
    return _cachedApiSecret;
}

function formatCleanRemarks(existingRemarks, newActionRemark, isCheckIn = false) {
    if (!existingRemarks) return newActionRemark;

    const prefix = isCheckIn ? 'Check-in from' : 'Check-out from';
    const parts = existingRemarks
        .split('|')
        .map(p => p.trim())
        .filter(p => p.length > 0 && !p.startsWith(prefix));

    if (isCheckIn) {
        parts.unshift(newActionRemark);
    } else {
        parts.push(newActionRemark);
    }

    return parts.join(' | ');
}

// @desc    Securely sync biometric logs from C# Desktop App
// @route   POST /api/v1/attendance/biometric
// @access  Private (Secret Key Required)
exports.syncBiometricLog = async (req, res) => {
    try {
        const secretKey = req.headers['bas-secret-key'];

        // 1. Verify Secret Key (uses in-memory cache — no DB hit per scan)
        const MASTER_SECRET = process.env.BIOMETRIC_SECRET;
        const dbApiSecret = await getApiSecret();

        // Allow match with either ENV secret or the Database-stored API Secret
        const isAuthorized = (MASTER_SECRET && secretKey === MASTER_SECRET) || (dbApiSecret && secretKey === dbApiSecret);

        if (!isAuthorized) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Invalid Secret Key' });
        }

        const { employeeCode, type, timestamp, branch, method } = req.body;

        const isFaceScan = (method === 'FACE' || method === 'FACE_AI' || type === 'FACE');
        const methodTag = isFaceScan ? ' [Face AI]' : ' [Biometric]';
        const verificationMethod = isFaceScan ? 'FACE_AI' : 'FINGERPRINT';

        // 🟢 Track branch status: Update "Last Seen" time (1 Hour TTL)
        if (branch) {
            branchStatusCache.set(`lastSeen_${branch}`, Date.now(), 60 * 60 * 1000);
        }


        // 2. Find Employee — use in-memory cache to avoid a DB hit on every scan.
        // Cache TTL is 10 min; invalidated on employee update.
        let employee = employeeCache.get('code_' + employeeCode);
        if (!employee) {
            employee = await Employee.findOne({ code: employeeCode }).populate('department').lean();
            if (employee) employeeCache.set('code_' + employeeCode, employee, 10 * 60 * 1000);
        }
        if (!employee) {
            return res.status(404).json({ success: false, message: `Employee with code ${employeeCode} not found` });
        }

        // ── Pakistan Standard Time (UTC+5) ──────────────────────────────────
        const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

        // ── Use the C# app's actual scan timestamp (if valid) ─────────────────
        // The C# app sends the machine's exact scan time. If we ignore it and use
        // Date.now() instead, re-synced past logs always get the WRONG time.
        // We accept any timestamp within the last 48 hours and up to 5 min future.
        let nowUtcMs = Date.now();
        if (timestamp) {
            const tsMs = new Date(timestamp).getTime();
            const maxPastMs  = 48 * 60 * 60 * 1000; // 48 hours back
            const maxFutureMs =  5 * 60 * 1000;      //  5 minutes forward
            if (!isNaN(tsMs) && tsMs >= (Date.now() - maxPastMs) && tsMs <= (Date.now() + maxFutureMs)) {
                nowUtcMs = tsMs; // ✅ Use actual scan time from biometric machine
                console.log(`[Biometric] Using machine timestamp: ${new Date(tsMs).toISOString()} for ${employeeCode}`);
            } else {
                console.warn(`[Biometric] Timestamp out of range for ${employeeCode}: ${timestamp} — using server time`);
            }
        }

        const pktNowMs = nowUtcMs + PKT_OFFSET_MS;
        const pktDate  = new Date(pktNowMs);

        // Wall-clock components for Pakistan
        const pktH = pktDate.getUTCHours();
        const pktM = pktDate.getUTCMinutes();
        const currentTimeInMinutes = pktH * 60 + pktM;
        const timeStr = `${String(pktH).padStart(2, '0')}:${String(pktM).padStart(2, '0')}`; // HH:mm (24h)


        // Helper: Get Pakistan Date String (YYYY-MM-DD) from UTC timestamp
        const getPKTDateStr = (ms) => {
            const d = new Date(ms + PKT_OFFSET_MS);
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        };

        // Helper: Get UTC Date objects for start/end of a PKT day
        // e.g. for "2026-03-30", returns 2026-03-29T19:00:00Z to 2026-03-30T19:00:00Z
        const getPKTDayRange = (dateStr) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            // 00:00:00 PKT is 19:00:00 UTC of previous day
            const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - PKT_OFFSET_MS);
            const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);
            return { start, end };
        };

        // Get max checkout time for the department
        let maxCheckoutTimeStr = '03:00';
        if (employee.department && employee.department.maxCheckoutTime) {
            maxCheckoutTimeStr = employee.department.maxCheckoutTime.toUpperCase();
        }

        let maxH = 3, maxM = 0;
        if (maxCheckoutTimeStr) {
            const isPM = maxCheckoutTimeStr.includes('PM');
            const isAM = maxCheckoutTimeStr.includes('AM');
            const cleanTime = maxCheckoutTimeStr.replace(/[A-Z\s]/g, '');
            const parts = cleanTime.split(':').map(Number);
            if (parts.length >= 2 && !isNaN(parts[0])) {
                maxH = parts[0];
                maxM = parts[1];
                if (isPM && maxH < 12) maxH += 12;
                if (isAM && maxH === 12) maxH = 0;
            }
        }
        const maxCheckoutTimeInMinutes = maxH * 60 + maxM;

        // Current actual day (00:00:00 PKT)
        const todayDateStr = getPKTDateStr(nowUtcMs);
        const { start: todayStart, end: todayEnd } = getPKTDayRange(todayDateStr);

        // Previous day (00:00:00 PKT)
        const yesterdayUtcMs = nowUtcMs - 24 * 60 * 60 * 1000;
        const yesterdayDateStr = getPKTDateStr(yesterdayUtcMs);
        const { start: yesterdayStart, end: yesterdayEnd } = getPKTDayRange(yesterdayDateStr);

        // Determine the "Logical Day" for this scan
        // If current time is before Max Checkout (e.g. 1:00 AM < 3:00 AM), logical day is Yesterday
        let targetStart, targetEnd, targetDateStr;
        let isLateNightShift = false;

        if (currentTimeInMinutes <= maxCheckoutTimeInMinutes) {
            targetStart = yesterdayStart;
            targetEnd = yesterdayEnd;
            targetDateStr = yesterdayDateStr;
            isLateNightShift = true;
            console.log(`[Biometric] Scan at ${timeStr} is before ${maxCheckoutTimeStr} cutoff. Mapping to logical day: ${targetDateStr}`);
        } else {
            targetStart = todayStart;
            targetEnd = todayEnd;
            targetDateStr = todayDateStr;
        }

        // Search for existing record on the logical day
        let attendance = await Attendance.findOne({
            employee: employee._id,
            date: { $gte: targetStart, $lt: targetEnd }
        });

        // 🟢 SAFETY CHECK: If this is an "IN" scan, but we are in the "Late Night" window (before 3am),
        // we should favor checking OUT an existing record from yesterday instead of creating a new check-in for yesterday.
        
        // 4. Handle Record Action (IN vs OUT)
        if (!attendance) {
            // No record for the logical day yet
            if (isLateNightShift) {
                // SOLUTION: If it's a late night scan (e.g. 1:00 AM) and no record exists for yesterday,
                // we create a "Check-OUT Only" record so the employee's scan is captured even if they forgot Check-IN.
                try {
                    attendance = new Attendance({
                        employee: employee._id,
                        code: employee.code,
                        date: targetStart,
                        branch: branch || employee.branch || 'Main',
                        displayStatus: 'Present',
                        isPresent: true,
                        checkIn: '--:--', // Mark check-in as missed for now
                        checkOut: timeStr,
                        verificationMethod: verificationMethod,
                        remarks: `Check-out from ${branch || 'Unknown'}${methodTag} (Late Night - Missed Check-IN)`
                    });
                    await attendance.save();
                    attendanceCache.clear();
                    return res.status(200).json({
                        success: true,
                        message: `Recorded as Check-OUT (Missed Check-IN for ${targetDateStr})`,
                        data: { employee: employee.name, code: employee.code, date: targetDateStr, checkOut: timeStr, action: 'OUT', method: verificationMethod, photo: employee.photo || employee.facePhotoUrl || null }
                    });
                } catch (dupErr) {
                    if (dupErr.code === 11000) {
                        attendance = await Attendance.findOne({ employee: employee._id, date: targetStart });
                        if (!attendance) throw new Error('Race condition: Duplicate error but record not found');
                    } else throw dupErr;
                }
            }

            try {
                attendance = new Attendance({
                    employee: employee._id,
                    code: employee.code,
                    date: targetStart, // Proper PKT-Midnight anchor
                    branch: branch || employee.branch || 'Main',
                    displayStatus: 'Present',
                    isPresent: true,
                    checkIn: timeStr,
                    verificationMethod: verificationMethod,
                    remarks: `Check-in from ${branch || 'Unknown'}${isLateNightShift ? ' (Late Night)' : ''}${methodTag}`
                });
                await attendance.save();
                attendanceCache.clear();
                return res.status(200).json({
                    success: true,
                    message: `Check-IN successful for ${targetDateStr}`,
                    data: { employee: employee.name, code: employee.code, date: targetDateStr, checkIn: timeStr, action: 'IN', method: verificationMethod, photo: employee.photo || employee.facePhotoUrl || null }
                });
            } catch (dupErr) {
                if (dupErr.code === 11000) {
                    attendance = await Attendance.findOne({ employee: employee._id, date: targetStart });
                    if (!attendance) throw new Error('Race condition: Duplicate error but record not found');
                } else throw dupErr;
            }
        }

        // Standardize ensuring "code" exists (if it was created manually without it)
        if (!attendance.code) attendance.code = employee.code;

        // Determine if this is an IN or OUT scan
        // Rule: If checkIn is empty, it's an IN. EXCEPT if it's after midnight (isLateNightShift), then we don't allow "late" check-ins.
        
        if (!attendance.checkIn || attendance.checkIn === '--:--' || attendance.checkIn.trim() === '') {
            if (isLateNightShift) {
                // If it's after midnight (late night shift), treat empty Check-In as missed and move to Check-Out logic
                attendance.checkIn = '--:--';
                attendance.remarks = (attendance.remarks || '') + (attendance.remarks ? ' | ' : '') + `Missed Check-IN`;
                // We don't return here, so it continues to the PERFORM CHECK-OUT section
            } else {
                attendance.checkIn = timeStr;
                attendance.displayStatus = 'Present';
                attendance.isPresent = true;
                attendance.verificationMethod = verificationMethod;
                attendance.remarks = formatCleanRemarks(attendance.remarks, `Check-in from ${branch || 'Unknown'}${methodTag}`, true);
                await attendance.save();
                attendanceCache.clear();
                return res.status(200).json({
                    success: true,
                    message: "Check-IN successful",
                    data: { employee: employee.name, code: employee.code, checkIn: timeStr, action: 'IN', method: verificationMethod, photo: employee.photo || employee.facePhotoUrl || null }
                });
            }
        }

        // PERFORM CHECK-OUT
        // If employee already has a check-out for today, do NOT overwrite it. Preserve original check-out time.
        if (attendance.checkOut && attendance.checkOut !== '--:--' && attendance.checkOut.trim() !== '') {
            return res.status(400).json({ 
                success: false, 
                message: `Already Checked-OUT at ${attendance.checkOut}. Duplicate scan ignored.`,
                data: {
                    employee: employee.name,
                    code: employee.code,
                    checkIn: attendance.checkIn,
                    checkOut: attendance.checkOut,
                    action: 'OUT',
                    method: attendance.verificationMethod || verificationMethod,
                    photo: employee.photo || employee.facePhotoUrl || null
                }
            });
        }

        // Calculate time since check-in to prevent redundant scanning (Double-Tap)
        const checkInTimeParts = attendance.checkIn.split(':').map(Number);
        const checkInMinutes = checkInTimeParts[0] * 60 + checkInTimeParts[1];
        
        let diffInMinutes;
        if (currentTimeInMinutes < checkInMinutes || isLateNightShift) {
            diffInMinutes = (currentTimeInMinutes + 1440) - checkInMinutes;
        } else {
            diffInMinutes = currentTimeInMinutes - checkInMinutes;
        }

        // 10-minute rule to prevent double-scanning Check-In as Check-Out immediately
        if (diffInMinutes < 10 && (!attendance.checkOut || attendance.checkOut === '--:--')) {
            return res.status(400).json({ success: false, message: `Scan ignored: Too close to Check-In (${diffInMinutes} mins).` });
        }

        attendance.checkOut = timeStr;
        attendance.verificationMethod = verificationMethod;
        attendance.remarks = formatCleanRemarks(attendance.remarks, `Check-out from ${branch || 'Unknown'}${methodTag}`, false);

        await attendance.save();
        attendanceCache.clear();

        res.status(200).json({
            success: true,
            message: "Check-OUT successful",
            data: {
                employee: employee.name,
                code: employee.code,
                checkIn: attendance.checkIn,
                checkOut: attendance.checkOut,
                action: 'OUT',
                method: verificationMethod,
                photo: employee.photo || employee.facePhotoUrl || null
            }
        });

    } catch (error) {
        console.error('Biometric Sync Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Biometric Duplicate Prevention & Concurrency Locks ─────────────────────────
const registrationLocks = new Map();
const REGISTRATION_LOCK_TTL_MS = 15000; // 15 seconds max lock

function acquireRegistrationLock(lockKey) {
    const now = Date.now();
    const existing = registrationLocks.get(lockKey);
    if (existing && (now - existing) < REGISTRATION_LOCK_TTL_MS) {
        return false;
    }
    registrationLocks.set(lockKey, now);
    return true;
}

function releaseRegistrationLock(lockKey) {
    registrationLocks.delete(lockKey);
}

/**
 * Computes cosine similarity between two float vectors.
 * Returns a value in [-1.0, 1.0]. Returns 0 if invalid.
 */
function computeCosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB)) return 0;
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        const a = vecA[i];
        const b = vecB[i];
        if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
        dot += a * b;
        normA += a * a;
        normB += b * b;
    }
    if (normA <= 0 || normB <= 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// @desc    Register/Save fingerprint template for an employee with duplicate ownership check
// @route   POST /api/v1/attendance/biometric/register
// @access  Private (Secret Key Required)
exports.registerFingerprint = async (req, res) => {
    let lockKey = null;
    try {
        const secretKey = req.headers['bas-secret-key'];

        // Use cached secret — same pattern as syncBiometricLog
        const MASTER_SECRET = process.env.BIOMETRIC_SECRET;
        const dbApiSecret = await getApiSecret();

        const isAuthorized = (MASTER_SECRET && secretKey === MASTER_SECRET) || (dbApiSecret && secretKey === dbApiSecret);

        if (!isAuthorized) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Invalid Secret Key' });
        }

        const { employeeId, employeeCode, code, template } = req.body;

        if (!template || typeof template !== 'string' || template.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or empty fingerprint template provided' });
        }

        const trimmedTemplate = template.trim();

        // Resolve target employee
        let employee = null;
        if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
            employee = await Employee.findById(employeeId);
        }
        if (!employee && (employeeCode || code)) {
            const searchCode = String(employeeCode || code).trim();
            employee = await Employee.findOne({ code: searchCode });
        }
        if (!employee && employeeId) {
            employee = await Employee.findOne({ code: String(employeeId).trim() });
        }

        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        // Concurrency lock per employee
        lockKey = `fingerprint_${employee._id}`;
        if (!acquireRegistrationLock(lockKey)) {
            return res.status(429).json({
                success: false,
                code: 'REGISTRATION_IN_PROGRESS',
                message: 'A biometric registration is already in progress for this employee. Please wait.'
            });
        }

        // ── BIOMETRIC OWNERSHIP CHECK: Ensure fingerprint is NOT registered to another employee ──
        // Note: Same-employee re-enrollment is permitted because _id is excluded ($ne: employee._id)
        const duplicateEmployee = await Employee.findOne({
            fingerprintTemplate: trimmedTemplate,
            _id: { $ne: employee._id }
        }).select('name code branch');

        if (duplicateEmployee) {
            return res.status(409).json({
                success: false,
                code: 'DUPLICATE_BIOMETRIC',
                message: `Biometric conflict: This fingerprint is already registered to ${duplicateEmployee.name} (Code: ${duplicateEmployee.code}, Branch: ${duplicateEmployee.branch || 'N/A'}). Each employee must have a unique biometric.`
            });
        }

        employee.fingerprintTemplate = trimmedTemplate;
        await employee.save();

        // Clear employee cache so new fingerprint is available immediately on next sync
        employeeCache.clear();

        res.status(200).json({
            success: true,
            message: `Fingerprint registered successfully for ${employee.name}`
        });

    } catch (error) {
        console.error('Biometric Registration Error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (lockKey) releaseRegistrationLock(lockKey);
    }
};

// @desc    Register/Save face template vector for an employee with duplicate ownership check
// @route   POST /api/v1/attendance/biometric/face/register
// @access  Private (Secret Key Required)
exports.registerFace = async (req, res) => {
    let lockKey = null;
    try {
        const secretKey = req.headers['bas-secret-key'];
        const MASTER_SECRET = process.env.BIOMETRIC_SECRET;
        const dbApiSecret = await getApiSecret();
        const isAuthorized = (MASTER_SECRET && secretKey === MASTER_SECRET) || (dbApiSecret && secretKey === dbApiSecret);

        if (!isAuthorized) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Invalid Secret Key' });
        }

        const { employeeId, employeeCode, code, template, faceTemplate, facePhotoBase64, facePhotoUrl } = req.body;

        let employee = null;
        if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
            employee = await Employee.findById(employeeId);
        }
        if (!employee && (employeeCode || code)) {
            const searchCode = String(employeeCode || code).trim();
            employee = await Employee.findOne({ code: searchCode });
        }
        if (!employee && employeeId) {
            employee = await Employee.findOne({ code: String(employeeId).trim() });
        }

        if (!employee) {
            return res.status(404).json({ success: false, message: `Employee not found for ID/Code: ${employeeId || employeeCode || code}` });
        }

        // Concurrency lock per employee
        lockKey = `face_${employee._id}`;
        if (!acquireRegistrationLock(lockKey)) {
            return res.status(429).json({
                success: false,
                code: 'REGISTRATION_IN_PROGRESS',
                message: 'A face biometric registration is already in progress for this employee. Please wait.'
            });
        }

        const rawVec = faceTemplate || template;
        let vector = rawVec;
        if (typeof rawVec === 'string') {
            try {
                vector = JSON.parse(rawVec);
            } catch (e) {
                vector = rawVec.split(',').map(Number);
            }
        }

        if (!Array.isArray(vector) || vector.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid face template vector provided' });
        }

        // Validate numerical integrity: length 128 (SFace) or 512, all finite, non-zero norm
        if ((vector.length !== 128 && vector.length !== 512) || vector.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
            return res.status(400).json({ success: false, message: 'Face vector contains invalid or non-finite values' });
        }

        // ── BIOMETRIC OWNERSHIP CHECK: Ensure face does NOT match another enrolled employee ──
        // Calibrated duplicate threshold: >= 0.55 cosine similarity indicates identical face identity
        const DUPLICATE_FACE_SIMILARITY_THRESHOLD = 0.55;

        // Query all other enrolled employees (excluding current employee to permit re-enrollment)
        const otherEnrolled = await Employee.find({
            hasFaceEnrolled: true,
            _id: { $ne: employee._id }
        }).select('+faceTemplate code name branch');

        let bestMatch = null;
        let maxSimilarity = -1;

        for (const otherEmp of otherEnrolled) {
            if (!otherEmp.faceTemplate || !Array.isArray(otherEmp.faceTemplate) || otherEmp.faceTemplate.length === 0) continue;
            const sim = computeCosineSimilarity(vector, otherEmp.faceTemplate);
            if (sim > maxSimilarity) {
                maxSimilarity = sim;
                bestMatch = otherEmp;
            }
        }

        if (bestMatch && maxSimilarity >= DUPLICATE_FACE_SIMILARITY_THRESHOLD) {
            return res.status(409).json({
                success: false,
                code: 'DUPLICATE_FACE',
                message: `Biometric conflict: This facial scan matches already enrolled employee ${bestMatch.name} (Code: ${bestMatch.code}, Branch: ${bestMatch.branch || 'N/A'}) with ${(maxSimilarity * 100).toFixed(1)}% similarity. Duplicate face enrollment is prohibited.`
            });
        }

        employee.faceTemplate = vector;
        employee.hasFaceEnrolled = true;
        employee.faceEnrolledAt = new Date();

        if (facePhotoBase64) {
            employee.facePhotoUrl = facePhotoBase64;
            // Only set employee.photo as fallback if the employee has no official registration photo
            if (!employee.photo) {
                employee.photo = facePhotoBase64;
            }
        }

        await employee.save();
        employeeCache.clear();

        res.status(200).json({
            success: true,
            message: `Face enrolled successfully for ${employee.name}`
        });

    } catch (error) {
        console.error('Face Registration Error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (lockKey) releaseRegistrationLock(lockKey);
    }
};

// @desc    Get all enrolled face templates for a branch (optimized for desktop cache)
// @route   GET /api/v1/attendance/biometric/face/descriptors
// @access  Private (Secret Key Required)
exports.getFaceDescriptors = async (req, res) => {
    try {
        const secretKey = req.headers['bas-secret-key'];
        const MASTER_SECRET = process.env.BIOMETRIC_SECRET;
        const dbApiSecret = await getApiSecret();
        const isAuthorized = (MASTER_SECRET && secretKey === MASTER_SECRET) || (dbApiSecret && secretKey === dbApiSecret);

        if (!isAuthorized) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Invalid Secret Key' });
        }

        const { branch } = req.query;
        const query = { isActive: true, hasFaceEnrolled: true };
        if (branch && branch !== 'All' && branch !== 'Select Branch') {
            query.branch = branch;
        }

        const employees = await Employee.find(query)
            .select('+faceTemplate code name branch photo facePhotoUrl department designation')
            .lean();

        const data = employees.map(emp => ({
            id: emp._id,
            code: emp.code,
            name: emp.name,
            branch: emp.branch,
            photo: emp.photo || emp.facePhotoUrl || null,
            faceTemplate: emp.faceTemplate || []
        }));

        res.status(200).json({
            success: true,
            count: data.length,
            data
        });

    } catch (error) {
        console.error('Get Face Descriptors Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

