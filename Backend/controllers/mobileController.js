const mongoose = require('mongoose');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const HolyDay = require('../models/HolyDay');
const Store = require('../models/Store');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const EmployeeAdvanceInstallmentPlan = require('../models/EmployeeAdvanceInstallmentPlan');
const Payroll = require('../models/Payroll');
const PartyCategory = require('../models/PartyCategory');
const ClosingSheet = require('../models/ClosingSheet');
const Voucher = require('../models/Voucher');
const Designation = require('../models/Designation');
const Department = require('../models/Department');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { SERVER_BOOT_ID } = require('../utils/bootId');
const { branchStatusCache } = require('../utils/memoryCache');

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

// Helper to normalize any Date or string to Pakistan Standard Time (PKT) UTC boundary
const pktNormalize = (dateInput) => {
  if (!dateInput) return new Date();
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return new Date();
  const pktDate = new Date(d.getTime() + PKT_OFFSET_MS);
  const y = pktDate.getUTCFullYear();
  const m = pktDate.getUTCMonth();
  const day = pktDate.getUTCDate();
  return new Date(Date.UTC(y, m, day, 0, 0, 0) - PKT_OFFSET_MS);
};

const toPKTDateStr = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(new Date(dateVal).getTime() + PKT_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

// Helper to sign JWT matching bootId requirement
const generateToken = (id, role) => {
  return jwt.sign(
    { id, role, bootId: SERVER_BOOT_ID },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};

// @desc    Authenticate User/Employee for Mobile App
// @route   POST /api/v1/mobile/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Please provide employee code/email and password' });
    }

    // 1. Try to find an Admin/Manager/User (Standard BAS System Accounts)
    let user = await User.findOne({ email: username.toLowerCase() }).select('+password').populate('groupId');
    if (!user) {
      user = await User.findOne({
        name: { $regex: new RegExp("^" + username.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "$", "i") }
      }).select('+password').populate('groupId');
    }
    if (!user) {
      user = await User.findOne({
        name: { $regex: new RegExp(username.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i") }
      }).select('+password').populate('groupId');
    }

    if (user) {
      if (!user.isActive) {
        return res.status(401).json({ success: false, message: 'Your account is deactivated' });
      }
      const isMatch = await user.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
      
      const token = generateToken(user._id, user.role);
      return res.status(200).json({
        success: true,
        token,
        role: user.role, // 'admin', 'manager', 'sales', 'accounts'
        name: user.name,
        code: user.email,
        branch: user.branch
      });
    }

    // 2. Try to find an Active Employee (Standard Employee Attendance Account)
    const employee = await Employee.findOne({ code: username.trim(), isActive: true });
    if (!employee) {
      return res.status(401).json({ success: false, message: 'Invalid credentials or inactive account' });
    }

    // Auth matching rules: match password input against employee's CNIC or Mobile Number
    const cleanPassword = password.trim().replace(/[-]/g, '');
    const cleanCnic = (employee.cnic || '').trim().replace(/[-]/g, '');
    const cleanMobile = (employee.mobileNo || '').trim().replace(/[-]/g, '');

    let authenticated = false;
    if (cleanCnic && cleanPassword === cleanCnic) authenticated = true;
    if (cleanMobile && cleanPassword === cleanMobile) authenticated = true;
    if (!cleanCnic && !cleanMobile && cleanPassword === '123456') authenticated = true; // Fallback setup PIN

    if (!authenticated) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. Log in using your CNIC or Mobile No.' });
    }

    const token = generateToken(employee._id, 'employee');
    return res.status(200).json({
      success: true,
      token,
      role: 'employee',
      name: employee.name,
      code: employee.code,
      branch: [employee.branch]
    });

  } catch (error) {
    console.error('Mobile Auth Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const formatMinsToHHMM = (totalMinutes) => {
  if (!totalMinutes || isNaN(totalMinutes) || totalMinutes <= 0) return '0:00';
  const hrs = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  return `${hrs}:${String(mins).padStart(2, '0')}`;
};

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const clean = timeStr.trim().toUpperCase();
  const isPM = clean.includes('PM');
  const isAM = clean.includes('AM');
  const stripped = clean.replace(/(AM|PM)/g, '').trim();
  const parts = stripped.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  let [h, m] = parts;
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
};

const getAttendanceRecordMins = (rec) => {
  if (!rec) return 0;
  if (rec.totalWorkedMinutes && rec.totalWorkedMinutes > 0) return rec.totalWorkedMinutes;
  if (rec.workedHrs) {
    const str = String(rec.workedHrs).trim();
    if (str.includes(':')) {
      const parts = str.split(':').map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    }
    const val = parseFloat(str);
    if (!isNaN(val) && val > 0) return Math.round(val * 60);
  }
  if (rec.totalHrs) {
    const val = parseFloat(String(rec.totalHrs));
    if (!isNaN(val) && val > 0) return Math.round(val * 60);
  }
  if (rec.checkIn && rec.checkOut && rec.checkIn !== '-' && rec.checkOut !== '--:--') {
    const inMins = parseTimeToMinutes(rec.checkIn);
    const outMins = parseTimeToMinutes(rec.checkOut);
    if (inMins !== null && outMins !== null) {
      let diff = outMins - inMins;
      if (diff < 0) diff += 24 * 60;
      return diff;
    }
  }
  return 0;
};

// @desc    Get Attendance Logs (Self for employee, or specific employee for Admin)
// @route   GET /api/v1/mobile/attendance/my-logs
// @access  Private (Mobile Auth Required)
exports.getMyLogs = async (req, res) => {
  try {
    let employee = null;
    let employeeId = req.query.employeeId;

    if (req.role === 'employee') {
      employee = await Employee.findById(req.user.id);
      if (!employee && req.user.code) {
        employee = await Employee.findOne({ code: req.user.code });
      }
    } else {
      if (employeeId) {
        employee = await Employee.findById(employeeId);
      }
      if (!employee && req.user?.email) {
        employee = await Employee.findOne({ code: req.user.email });
      }
      if (!employee && req.user?.name) {
        employee = await Employee.findOne({ name: req.user.name });
      }
      if (!employee) {
        employee = await Employee.findOne({ isActive: true }).sort({ code: 1 });
      }
    }

    if (!employee) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    const now = new Date();
    const targetMonth = parseInt(req.query.month) || (now.getMonth() + 1);
    const targetYear = parseInt(req.query.year) || now.getFullYear();

    const startStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const start = pktNormalize(startStr);
    const end = new Date(pktNormalize(endStr).getTime() + 24 * 60 * 60 * 1000);

    const attendanceRecords = await Attendance.find({
      employee: employee._id,
      date: { $gte: start, $lt: end }
    }).lean();

    const attendanceMap = {};
    attendanceRecords.forEach(rec => {
      attendanceMap[toPKTDateStr(rec.date)] = rec;
    });

    const holidays = await HolyDay.find({
      date: { $gte: start, $lt: end }
    }).select('description date').lean();

    const holidayMap = {};
    holidays.forEach(h => {
      holidayMap[toPKTDateStr(h.date)] = h.description;
    });

    const allDates = [];
    let curr = new Date(startStr + 'T00:00:00Z');
    const stop = new Date(endStr + 'T00:00:00Z');
    while (curr <= stop) {
      const y = curr.getUTCFullYear();
      const m = String(curr.getUTCMonth() + 1).padStart(2, '0');
      const d = String(curr.getUTCDate()).padStart(2, '0');
      allDates.push(`${y}-${m}-${d}`);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    let dutyHrs = 8;
    if (employee.totalHrs) {
      const parsed = parseInt(String(employee.totalHrs));
      if (!isNaN(parsed) && parsed > 0) dutyHrs = parsed;
    }

    const logs = [];
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayStr = toPKTDateStr(new Date());

    for (const dateStr of allDates) {
      const rec = attendanceMap[dateStr];
      const holidayName = holidayMap[dateStr];

      const tempDate = new Date(dateStr + 'T00:00:00Z');
      const dayName = daysOfWeek[tempDate.getUTCDay()];
      const isOffDay = employee.offDay && employee.offDay.toLowerCase() === dayName.toLowerCase();
      const isFutureDate = dateStr > todayStr;

      let displayStatus = 'Absent';
      let checkIn = '--:--';
      let checkOut = '--:--';
      let workedHrs = '0:00';
      let remarks = '';

      if (rec) {
        displayStatus = rec.displayStatus || 'Present';
        checkIn = rec.checkIn || '--:--';
        checkOut = rec.checkOut || '--:--';
        remarks = rec.remarks || '';

        const s = displayStatus.toLowerCase();
        if (s.includes('present') || s === 'p' || s.includes('half') || s.includes('short')) {
          let workedMins = getAttendanceRecordMins(rec);
          workedHrs = formatMinsToHHMM(workedMins);
        } else if (s.includes('leave')) {
          displayStatus = 'Leave';
        } else if (isFutureDate) {
          displayStatus = '-';
        }
      } else {
        if (holidayName) {
          displayStatus = 'Holiday';
          remarks = holidayName;
        } else if (isOffDay) {
          displayStatus = 'Weekly Off';
        } else if (isFutureDate) {
          displayStatus = '-';
        } else {
          displayStatus = 'Absent';
        }
      }

      logs.push({
        _id: rec?._id || `${employee._id}_${dateStr}`,
        date: dateStr,
        day: dayName,
        displayStatus,
        status: displayStatus,
        checkIn,
        checkOut,
        workedHrs,
        totalHrs: workedHrs,
        remarks,
        employeeName: employee.name,
        employeeCode: employee.code,
        branch: employee.branch
      });
    }

    res.status(200).json({
      success: true,
      count: logs.length,
      employee: {
        id: employee._id,
        name: employee.name,
        code: employee.code,
        branch: employee.branch
      },
      data: logs.reverse()
    });
  } catch (error) {
    console.error('Error fetching mobile attendance logs:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Admin Attendance Dashboard Summary
// @route   GET /api/v1/mobile/attendance/admin-summary
// @access  Private (Admin/Manager Mobile Auth Required)
exports.getAdminSummary = async (req, res) => {
  try {
    if (req.role === 'employee') {
      return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
    }

    const todayStart = pktNormalize(new Date());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const totalActiveEmployees = await Employee.countDocuments({ isActive: { $ne: false } });
    const presentToday = await Attendance.countDocuments({
      date: { $gte: todayStart, $lt: todayEnd },
      displayStatus: { $in: ['Present', 'P', 'Half Day', 'Short Leave', 'Late'] }
    });
    const absentToday = await Attendance.countDocuments({
      date: { $gte: todayStart, $lt: todayEnd },
      displayStatus: { $in: ['Absent', 'A'] }
    });
    const onLeaveToday = await Attendance.countDocuments({
      date: { $gte: todayStart, $lt: todayEnd },
      displayStatus: { $regex: /leave/i }
    });
    const notMarkedToday = Math.max(0, totalActiveEmployees - (presentToday + absentToday + onLeaveToday));

    const branchStats = await Attendance.aggregate([
      { $match: { date: { $gte: todayStart, $lt: todayEnd } } },
      { $group: { _id: '$branch', count: { $sum: 1 } } }
    ]);

    const recentScans = await Attendance.find({
      date: { $gte: todayStart, $lt: todayEnd }
    })
    .sort({ updatedAt: -1 })
    .limit(10)
    .populate('employee', 'name code photo')
    .lean();

    res.status(200).json({
      success: true,
      summary: {
        totalActive: totalActiveEmployees,
        present: presentToday,
        absent: absentToday,
        leave: onLeaveToday,
        notMarked: notMarkedToday
      },
      branchStats,
      recentScans: recentScans.map(scan => ({
        employeeName: scan.employee ? scan.employee.name : 'Unknown',
        employeeCode: scan.employee ? scan.employee.code : scan.code,
        photo: scan.employee ? scan.employee.photo : null,
        checkIn: scan.checkIn,
        checkOut: scan.checkOut,
        status: scan.displayStatus,
        branch: scan.branch,
        time: scan.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching admin summary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Duty Shift Schedule
// @route   GET /api/v1/mobile/schedule
// @access  Private (Mobile Auth Required)
exports.getSchedule = async (req, res) => {
  try {
    let employeeId;
    if (req.role === 'employee') {
      employeeId = req.user.id;
    } else {
      employeeId = req.query.employeeId;
    }

    let employee = null;
    if (employeeId) {
      employee = await Employee.findById(employeeId).select('name code branch fDutyTime tDutyTime scheduleFDutyTime scheduleTDutyTime offDay totalHrs allowOvertime');
    } else {
      // Graceful fallback for Admin/Manager opening Duty Shift & Schedule
      const branchFilter = (req.user && req.user.branch && req.user.branch.length > 0 && req.user.branch[0] !== 'All Branches')
        ? { branch: req.user.branch[0] }
        : {};
      employee = await Employee.findOne({ isActive: true, ...branchFilter })
        .select('name code branch fDutyTime tDutyTime scheduleFDutyTime scheduleTDutyTime offDay totalHrs allowOvertime');
      if (!employee) {
        employee = await Employee.findOne({ isActive: true })
          .select('name code branch fDutyTime tDutyTime scheduleFDutyTime scheduleTDutyTime offDay totalHrs allowOvertime');
      }
    }

    if (!employee) {
      return res.status(404).json({ success: false, message: 'No employee schedule records found.' });
    }

    res.status(200).json({
      success: true,
      data: employee
    });
  } catch (error) {
    console.error('Error fetching employee schedule:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Public Holidays list
// @route   GET /api/v1/mobile/holidays
// @access  Private (Mobile Auth Required)
exports.getHolidays = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(Date.UTC(currentYear, 0, 1));
    const endOfYear = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59));

    const holidays = await HolyDay.find({
      date: { $gte: startOfYear, $lte: endOfYear },
      isActive: true
    }).sort({ date: 1 }).lean();

    res.status(200).json({
      success: true,
      count: holidays.length,
      data: holidays
    });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Branch statuses (Device connectivity monitoring)
// @route   GET /api/v1/mobile/branches
// @access  Private (Mobile Auth Required)
exports.getBranches = async (req, res) => {
  try {
    const stores = await Store.find({ isActive: true }).select('name code description').lean();

    // Query today's latest punches across all branches from DB
    const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
    const nowPKT = new Date(Date.now() + PKT_OFFSET_MS);
    const todayPKTStart = new Date(Date.UTC(nowPKT.getUTCFullYear(), nowPKT.getUTCMonth(), nowPKT.getUTCDate(), 0, 0, 0) - PKT_OFFSET_MS);

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

    const branchesWithStatus = stores.map(store => {
      const cleanName = (store.name || '').trim().replace(/[()]/g, '');
      const cleanLower = cleanName.toLowerCase();
      const lastSeenCache = branchStatusCache.get(`lastSeen_${store.name}`) ||
                            branchStatusCache.get(`lastSeen_(${cleanName})`) ||
                            branchStatusCache.get(`lastSeen_${cleanName}`);

      const punchData = punchMap[cleanLower] || punchMap[(store.name || '').trim().toLowerCase()];
      const punchTime = punchData?.lastPunchTime ? new Date(punchData.lastPunchTime).getTime() : 0;
      const punchCount = punchData?.totalPunchesToday || 0;

      const mostRecentTime = Math.max(lastSeenCache || 0, punchTime || 0);

      // Branch is online if punches were logged today or heartbeat occurred within 12 hours
      const now = Date.now();
      const diffMs = mostRecentTime > 0 ? (now - mostRecentTime) : null;
      const isOnline = punchCount > 0 || (diffMs !== null && diffMs < 12 * 60 * 60 * 1000);
      
      const effectiveLastSeen = mostRecentTime > 0 ? mostRecentTime : (now - 15 * 60 * 1000);

      return {
        _id: store._id,
        name: store.name,
        branch: store.name,
        code: store.code || 'N/A',
        branchCode: store.code || 'N/A',
        description: store.description,
        status: isOnline ? 'ONLINE' : 'OFFLINE',
        isOnline: isOnline,
        deviceOnline: isOnline,
        bridgeOnline: isOnline,
        punchesToday: punchCount,
        lastSeen: new Date(effectiveLastSeen).toISOString()
      };
    });

    res.status(200).json({
      success: true,
      data: branchesWithStatus
    });
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Custom Protect Middleware for Mobile API
exports.protectMobile = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.bootId || decoded.bootId !== SERVER_BOOT_ID) {
      return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
    }

    if (decoded.role === 'employee') {
      const employee = await Employee.findById(decoded.id);
      if (!employee || !employee.isActive) {
        return res.status(401).json({ success: false, message: 'Employee not found or deactivated' });
      }
      req.user = { id: employee._id, role: 'employee', code: employee.code, branch: [employee.branch], name: employee.name };
      req.employee = employee;
      req.role = 'employee';
      req.userId = employee._id;
    } else {
      const user = await User.findById(decoded.id).populate('groupId');
      if (!user || !user.isActive) {
        return res.status(401).json({ success: false, message: 'User not found or deactivated' });
      }
      req.user = user;
      req.role = user.role;
      req.userId = user._id;
    }
    next();
  } catch (err) {
    console.error('Mobile Protect Middleware Error:', err);
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }
};

// Helper to parse time string like "09:00 AM" or "09:00" to minutes
const parseTimeToMins = (val, isMidnightAllowed = false) => {
  if (!val) return 0;
  const str = String(val).trim().toUpperCase();
  if (['-', '--:--', ''].includes(str)) return 0;
  const ampm = str.match(/^(\d+):(\d+)\s*(AM|PM)$/);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const mi = parseInt(ampm[2]);
    if (ampm[3] === 'PM' && h < 12) h += 12;
    if (ampm[3] === 'AM' && h === 12) h = 0;
    const result = h * 60 + mi;
    if (result === 0 && isMidnightAllowed) return 1440;
    return result;
  }
  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    const result = (parts[0] || 0) * 60 + (parts[1] || 0);
    if (result === 0 && isMidnightAllowed) return 1440;
    return result;
  }
  return 0;
};

// Helper to compute worked minutes from attendance record
const calculateWorkedMins = (rec) => {
  if (!rec.checkIn || !rec.checkOut) return 0;
  const inStr  = String(rec.checkIn).trim();
  const outStr = String(rec.checkOut).trim();
  if (['-', '--:--', ''].includes(inStr) || ['-', '--:--', ''].includes(outStr)) return 0;

  const inMin  = parseTimeToMins(inStr, false);
  const outMin = parseTimeToMins(outStr, true);
  if (outMin === 0) return 0;

  let grossMins = outMin - inMin;
  if (grossMins < 0) grossMins += 1440; // overnight shift

  let breakMins = 0;
  const bOut = String(rec.breakOut || '').trim();
  const bIn  = String(rec.breakIn  || '').trim();
  if (bOut && bIn && !['-', '--:--', ''].includes(bOut) && !['-', '--:--', ''].includes(bIn)) {
    const bOutMin = parseTimeToMins(bOut, false);
    const bInMin  = parseTimeToMins(bIn,  false);
    if (bOutMin > 0 && bInMin > 0) {
      breakMins = bInMin - bOutMin;
      if (breakMins < 0) breakMins += 1440;
    }
  }

  let netMins = grossMins - breakMins;
  if (netMins < 0) netMins = 0;

  let diffMins = 0;
  const dIn  = String(rec.timeDiffIn  || '').trim();
  const dOut = String(rec.timeDiffOut || '').trim();
  if (dIn && dOut && !['-', '--:--', ''].includes(dIn) && !['-', '--:--', ''].includes(dOut)) {
    const dInMin  = parseTimeToMins(dIn,  false);
    const dOutMin = parseTimeToMins(dOut, false);
    if (dOutMin > 0 || dInMin > 0) {
      diffMins = dOutMin - dInMin;
      if (diffMins < 0) diffMins += 1440;
    }
  }

  const mode = rec.diffMode || '+';
  let finalMins = netMins;
  if (mode === '+') finalMins += diffMins;
  else if (mode === '-') finalMins -= diffMins;
  if (finalMins < 0) finalMins = 0;

  return Math.min(finalMins, 1440);
};

// @desc    Get Admin Dashboard Summary
// @route   GET /api/v1/mobile/admin/summary
// @access  Private (Admin/Manager)
exports.getAdminSummary = async (req, res) => {
  if (req.role === 'employee') {
    return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
  }

  try {
    const today = pktNormalize(new Date());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const [totalActive, attendanceRecords] = await Promise.all([
      Employee.countDocuments({ isActive: { $ne: false } }),
      Attendance.find({
        date: { $gte: today, $lt: tomorrow }
      }).select('displayStatus').lean()
    ]);

    let present = 0;
    let absent = 0;
    let leave = 0;

    attendanceRecords.forEach(rec => {
      const s = (rec.displayStatus || '').toLowerCase();
      if (s.includes('present') || s === 'p' || s.includes('half') || s.includes('short')) {
        present++;
      } else if (s.includes('leave')) {
        leave++;
      } else {
        absent++;
      }
    });

    const recordedCount = attendanceRecords.length;
    if (totalActive > recordedCount) {
      absent += (totalActive - recordedCount);
    }

    res.status(200).json({
      success: true,
      summary: {
        totalActive,
        present,
        absent,
        leave,
        date: today.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('Error fetching admin summary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get List of Store Branches
// @route   GET /api/v1/mobile/admin/branches
// @access  Private (Mobile Auth)
exports.getBranchesList = async (req, res) => {
  try {
    const [storeBranches, empBranches] = await Promise.all([
      Store.find().select('name').lean(),
      Employee.distinct('branch', { isActive: { $ne: false } })
    ]);

    const seen = new Set();
    const cleanBranches = [];

    const addBranch = (name) => {
      if (!name) return;
      const stripped = String(name).trim().replace(/[()]/g, '');
      const key = stripped.toLowerCase();
      if (stripped && !seen.has(key)) {
        seen.add(key);
        cleanBranches.push(name.trim());
      }
    };

    storeBranches.forEach(s => addBranch(s.name));
    empBranches.forEach(b => addBranch(b));

    if (cleanBranches.length === 0) {
      cleanBranches.push('MAIN BRANCH');
    }

    cleanBranches.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    res.status(200).json({
      success: true,
      data: cleanBranches
    });
  } catch (error) {
    console.error('Error fetching branches list:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get live status of all employees in a branch for today
// @route   GET /api/v1/mobile/admin/branch-status
// @access  Private (Admin/Manager)
exports.getBranchEmployeesStatus = async (req, res) => {
  if (req.role === 'employee') {
    return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
  }

  try {
    const { branch, date } = req.query;

    const targetDate = pktNormalize(date || new Date());
    const nextDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

    const employeeQuery = { isActive: { $ne: false } };

    if (branch && branch !== 'All Branches' && branch !== 'all') {
      const rawBranch = String(branch).trim();
      const stripped = rawBranch.replace(/^\(|\)$/g, '').trim();
      const escaped = stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      employeeQuery.branch = {
        $regex: `^\\s*\\(?${escaped}\\)?\\s*$`,
        $options: 'i'
      };
    }

    const employees = await Employee.find(employeeQuery)
      .select('name code branch designation fDutyTime tDutyTime')
      .populate('designation', 'name')
      .sort({ code: 1 })
      .lean();

    if (employees.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const empIds = employees.map(e => e._id);

    const attendanceRecords = await Attendance.find({
      employee: { $in: empIds },
      date: { $gte: targetDate, $lt: nextDate }
    }).lean();

    const attendanceMap = {};
    attendanceRecords.forEach(rec => {
      attendanceMap[rec.employee.toString()] = rec;
    });

    const data = employees.map(emp => {
      const rec = attendanceMap[emp._id.toString()];
      let status = 'Not Marked';
      let checkIn = '-';
      let checkOut = '-';
      let workedHrs = '-';

      if (rec) {
        status = rec.displayStatus || 'Present';
        checkIn = rec.checkIn || '-';
        checkOut = rec.checkOut || '-';
        workedHrs = rec.workedHrs || '-';
      }

      return {
        id: emp._id,
        code: emp.code,
        name: emp.name,
        branch: emp.branch,
        designation: emp.designation ? emp.designation.name : 'Staff',
        status,
        checkIn,
        checkOut,
        workedHrs,
        shift: `${emp.fDutyTime || '--:--'} - ${emp.tDutyTime || '--:--'}`
      };
    });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching branch employees status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Detailed Date-Range Attendance Report for an Employee
// @route   GET /api/v1/mobile/admin/employee-report
// @access  Private (Admin/Manager)
exports.getEmployeeDetailedReport = async (req, res) => {
  if (req.role === 'employee') {
    return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
  }

  try {
    const { employeeId, startDate, endDate } = req.query;
    if (!employeeId || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Please provide employeeId, startDate, and endDate' });
    }

    const employee = await Employee.findById(employeeId).select('name code branch fDutyTime tDutyTime scheduleFDutyTime scheduleTDutyTime offDay totalHrs basicSalary mobileNo resPhone');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const start = pktNormalize(startDate);
    const end = new Date(pktNormalize(endDate).getTime() + 24 * 60 * 60 * 1000);

    const attendanceRecords = await Attendance.find({
      employee: employeeId,
      date: { $gte: start, $lt: end }
    }).lean();

    const toPKTDateStr = (dateVal) => {
      const d = new Date(new Date(dateVal).getTime() + PKT_OFFSET_MS);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    };

    const attendanceMap = {};
    attendanceRecords.forEach(rec => {
      attendanceMap[toPKTDateStr(rec.date)] = rec;
    });

    const holidays = await HolyDay.find({
      date: { $gte: start, $lt: end }
    }).select('description date').lean();

    const holidayMap = {};
    holidays.forEach(h => {
      holidayMap[toPKTDateStr(h.date)] = h.description;
    });

    const allDates = [];
    let curr = new Date(startDate + 'T00:00:00Z');
    const stop = new Date(endDate + 'T00:00:00Z');
    while (curr <= stop) {
      const y = curr.getUTCFullYear();
      const m = String(curr.getUTCMonth()+1).padStart(2,'0');
      const d = String(curr.getUTCDate()).padStart(2,'0');
      allDates.push(`${y}-${m}-${d}`);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    let dutyHrs = 8;
    if (employee.totalHrs) {
      const parsed = parseInt(String(employee.totalHrs));
      if (!isNaN(parsed) && parsed > 0) dutyHrs = parsed;
    }
    const dutyMins = Math.round(dutyHrs * 60);

    const scheduledStartStr = employee.scheduleFDutyTime || employee.fDutyTime;
    const scheduledEndStr = employee.scheduleTDutyTime || employee.tDutyTime;
    const scheduledStartMins = parseTimeToMinutes(scheduledStartStr);

    const logs = [];
    let totalWorkedMins = 0;
    let totalOvertimeMins = 0;
    let totalShorttimeMins = 0;
    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let holidayCount = 0;
    let totalLateDaysCount = 0;
    let totalLateMins = 0;
    let plusDaysCount = 0;
    let minusDaysCount = 0;
    let exactDaysCount = 0;

    for (const dateStr of allDates) {
      const rec = attendanceMap[dateStr];
      const holidayName = holidayMap[dateStr];

      const tempDate = new Date(dateStr + 'T00:00:00Z');
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = daysOfWeek[tempDate.getUTCDay()];
      const isOffDay = employee.offDay && employee.offDay.toLowerCase() === dayName.toLowerCase();

      let logStatus = 'Absent';
      let checkIn = '-';
      let checkOut = '-';
      let workedHrs = '0:00';
      let overtimeHrs = '0:00';
      let shorttimeHrs = '0:00';
      let isLate = false;
      let lateMins = 0;
      let lateHrs = '0:00';
      let dutyVarianceType = 'none'; // 'plus', 'minus', 'exact', 'none'
      let dutyVarianceHrs = '0:00';
      let varianceMins = 0;

      const todayStr = toPKTDateStr(new Date());
      const isFutureDate = dateStr > todayStr;

      if (rec) {
        logStatus = rec.displayStatus || 'Present';
        checkIn = rec.checkIn || '-';
        checkOut = rec.checkOut || '-';

        const s = logStatus.toLowerCase();
        if (s.includes('present') || s === 'p' || s.includes('half') || s.includes('short')) {
          presentCount++;
          let workedMins = getAttendanceRecordMins(rec);
          workedHrs = formatMinsToHHMM(workedMins);
          totalWorkedMins += workedMins;

          const diffMins = workedMins - dutyMins;
          varianceMins = diffMins;
          if (diffMins > 0) {
            totalOvertimeMins += diffMins;
            overtimeHrs = formatMinsToHHMM(diffMins);
            dutyVarianceType = 'plus';
            dutyVarianceHrs = '+' + overtimeHrs;
            plusDaysCount++;
          } else if (diffMins < 0) {
            totalShorttimeMins += Math.abs(diffMins);
            shorttimeHrs = formatMinsToHHMM(Math.abs(diffMins));
            dutyVarianceType = 'minus';
            dutyVarianceHrs = '-' + shorttimeHrs;
            minusDaysCount++;
          } else {
            dutyVarianceType = 'exact';
            dutyVarianceHrs = '0:00';
            exactDaysCount++;
          }

          // Check-in vs scheduled start duty time
          if (checkIn && checkIn !== '-' && scheduledStartMins !== null) {
            const actualCheckInMins = parseTimeToMinutes(checkIn);
            if (actualCheckInMins !== null && actualCheckInMins > scheduledStartMins) {
              isLate = true;
              lateMins = actualCheckInMins - scheduledStartMins;
              lateHrs = formatMinsToHHMM(lateMins);
              totalLateDaysCount++;
              totalLateMins += lateMins;
            }
          }
        } else if (s.includes('leave')) {
          leaveCount++;
        } else if (isFutureDate) {
          logStatus = '-';
        } else {
          absentCount++;
        }
      } else {
        if (holidayName) {
          logStatus = 'Holiday';
          holidayCount++;
        } else if (isOffDay) {
          logStatus = 'Weekly Off';
        } else if (isFutureDate) {
          logStatus = '-';
        } else {
          logStatus = 'Absent';
          absentCount++;
        }
      }

      logs.push({
        date: dateStr,
        day: dayName,
        status: logStatus,
        checkIn,
        checkOut,
        workedHrs,
        overtimeHrs,
        shorttimeHrs,
        isLate,
        lateMins,
        lateHrs,
        dutyVarianceType,
        dutyVarianceHrs,
        varianceMins,
        scheduledStart: scheduledStartStr || '--:--',
        scheduledEnd: scheduledEndStr || '--:--',
        holidayName: holidayName || null
      });
    }

    res.status(200).json({
      success: true,
      employee: {
        id: employee._id,
        name: employee.name,
        code: employee.code,
        branch: employee.branch,
        mobileNo: employee.mobileNo || '',
        fDutyTime: employee.fDutyTime || '',
        tDutyTime: employee.tDutyTime || '',
        totalHrs: employee.totalHrs || ''
      },
      summary: {
        totalDays: allDates.length,
        presentDays: presentCount,
        absentDays: absentCount,
        leaveDays: leaveCount,
        holidayCount: holidayCount,
        totalWorkedHrs: formatMinsToHHMM(totalWorkedMins),
        totalWorkedHours: Number((totalWorkedMins / 60).toFixed(2)),
        totalOvertimeHrs: formatMinsToHHMM(totalOvertimeMins),
        totalShorttimeHrs: formatMinsToHHMM(totalShorttimeMins),
        dutyHrs: dutyHrs,
        scheduledStart: scheduledStartStr || '--:--',
        scheduledEnd: scheduledEndStr || '--:--',
        totalLateDays: totalLateDaysCount,
        totalLateMins: totalLateMins,
        totalLateHrs: formatMinsToHHMM(totalLateMins),
        plusDaysCount: plusDaysCount,
        minusDaysCount: minusDaysCount,
        exactDaysCount: exactDaysCount,
        netVarianceMins: totalOvertimeMins - totalShorttimeMins,
        netVarianceHrs: (totalOvertimeMins >= totalShorttimeMins ? '+' : '-') + formatMinsToHHMM(Math.abs(totalOvertimeMins - totalShorttimeMins))
      },
      logs
    });
  } catch (error) {
    console.error('Error fetching detailed employee report:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get List of Employees (Searchable Directory)
// @route   GET /api/v1/mobile/admin/employees-directory
// @access  Private (Admin/Manager)
exports.getEmployeesDirectory = async (req, res) => {
  if (req.role === 'employee') {
    return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
  }

  try {
    const { search, branch, limit } = req.query;
    const query = { isActive: { $ne: false } };

    if (branch && branch !== 'All Branches' && branch !== 'all') {
      const cleanBranch = branch.trim().replace(/[()]/g, '');
      const escaped = cleanBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.branch = { $regex: new RegExp(`^\\s*\\(?${escaped}\\)?\\s*$`, 'i') };
    }

    if (search && search.trim()) {
      const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: new RegExp(escapedSearch, 'i') } },
        { code: { $regex: new RegExp(escapedSearch, 'i') } },
        { branch: { $regex: new RegExp(escapedSearch, 'i') } }
      ];
    }

    const maxLimit = parseInt(limit) || 1000;

    const employees = await Employee.find(query)
      .populate('designation', 'name')
      .populate('department', 'name')
      .sort({ name: 1, code: 1 })
      .limit(maxLimit)
      .lean();

    const data = employees.map(emp => {
      let photoUrl = emp.photo || null;
      if (photoUrl && !photoUrl.startsWith('http') && !photoUrl.startsWith('data:')) {
        photoUrl = `https://bas.dwatson.co/${photoUrl.replace(/\\/g, '/').replace(/^\//, '')}`;
      }

      return {
        id: emp._id,
        code: emp.code,
        name: emp.name,
        name_urdu: emp.name_urdu || '',
        fatherName: emp.fatherName || '',
        photo: photoUrl,
        branch: emp.branch || 'Central Branch',
        department: emp.department ? (emp.department.name || emp.department) : 'General',
        designation: emp.designation ? (emp.designation.name || emp.designation) : 'Staff',
        mobileNo: emp.mobileNo || '-',
        resPhone: emp.resPhone || '-',
        cnic: emp.cnic || '-',
        address: emp.address || '-',
        gender: emp.gender || 'Male',
        religion: emp.religion || 'Islam',
        maritalStatus: emp.maritalStatus || 'Single',
        domicile: emp.domicile || '-',
        dateOfBirth: emp.dateOfBirth ? toPKTDateStr(emp.dateOfBirth) : '-',
        joiningDate: emp.joiningDate ? toPKTDateStr(emp.joiningDate) : '-',
        issueDate: emp.issueDate ? toPKTDateStr(emp.issueDate) : '-',
        expiryDate: emp.expiryDate ? toPKTDateStr(emp.expiryDate) : '-',
        lastIncrementDate: emp.incrDate ? toPKTDateStr(emp.incrDate) : '-',
        incrDate: emp.incrDate ? toPKTDateStr(emp.incrDate) : null,
        basicSalary: emp.basicSalary || 0,
        salaryType: emp.salaryType || 'Per Month',
        fixAllowance: emp.fixAllowance || 0,
        otherAllowance: emp.otherAllowance || 0,
        foodAllowanceRs: emp.foodAllowanceRs || 0,
        allowFood: emp.allowFood || 'No Food',
        stLoss: emp.stLoss || 0,
        securityDeposit: emp.securityDeposit || 0,
        deduction: emp.deduction || 0,
        bankCash: emp.bankCash || 'Cash',
        acNo: emp.acNo || '-',
        selectBank: emp.selectBank || '-',
        fDutyTime: emp.fDutyTime || '--:--',
        tDutyTime: emp.tDutyTime || '--:--',
        shift: `${emp.fDutyTime || '--:--'} - ${emp.tDutyTime || '--:--'}`,
        offDay: emp.offDay || 'Sunday',
        dutyHrs: emp.totalHrs || 10,
        allowOvertime: emp.allowOvertime || false,
        eobi: emp.eobi || false,
        electricityBill: emp.electricityBill || false,
        thirtyWorkingDays: emp.thirtyWorkingDays || false,
        allowEmployeeAdvance: emp.allowEmployeeAdvance || false,
        isActive: emp.isActive !== false
      };
    });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching employees directory:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Employee Financials (Pay Slips, Advance Ledger & Branch Overview)
// @route   GET /api/v1/mobile/employee/financials
// @access  Private
exports.getEmployeeFinancials = async (req, res) => {
  try {
    let { employeeId, month, year, mode, branch, startDate, endDate } = req.query;

    if (req.role === 'employee') {
      employeeId = req.userId;
    }

    const now = new Date();
    const targetMonth = parseInt(month) || (now.getMonth() + 1);
    const targetYear = parseInt(year) || now.getFullYear();
    const targetMonthYearStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

    // -------------------------------------------------------------
    // Branch-Wise Advances Overview Mode (for Admin)
    // -------------------------------------------------------------
    if (mode === 'branch_advances' || (!employeeId && req.role !== 'employee')) {
      const advQuery = {};

      if (branch && branch !== 'All Branches' && branch !== 'all') {
        const cleanBranch = branch.trim().replace(/[()]/g, '');
        const escaped = cleanBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        advQuery.branch = { $regex: new RegExp(`^\\s*\\(?${escaped}\\)?\\s*$`, 'i') };
      }

      let startBound = null;
      let endBound = null;
      if (startDate && endDate) {
        startBound = new Date(startDate);
        startBound.setHours(0, 0, 0, 0);
        endBound = new Date(endDate);
        endBound.setHours(23, 59, 59, 999);
      } else {
        startBound = new Date(Date.UTC(targetYear, targetMonth - 1, 1, 0, 0, 0) - PKT_OFFSET_MS);
        endBound = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999) - PKT_OFFSET_MS);
      }
      advQuery.date = { $gte: startBound, $lte: endBound };

      let branchAdvances = await EmployeeAdvance.find(advQuery)
        .populate('employee', 'name code branch basicSalary')
        .sort({ date: -1 })
        .lean();

      if (branchAdvances.length === 0 && !startDate) {
        delete advQuery.date;
        branchAdvances = await EmployeeAdvance.find(advQuery)
          .populate('employee', 'name code branch basicSalary')
          .sort({ date: -1 })
          .limit(80)
          .lean();
      }

      let totalPaidThisMonth = 0;
      let totalReceivedThisMonth = 0;

      const transactions = branchAdvances.map(adv => {
        const isPay = (adv.transactionType || 'Pay').toLowerCase() === 'pay';
        if (isPay) {
          totalPaidThisMonth += (adv.paid || 0);
        } else {
          totalReceivedThisMonth += (adv.paid || 0);
        }

        const dateStr = adv.date ? new Date(adv.date).toISOString().split('T')[0] : '-';
        return {
          id: adv._id,
          employeeId: adv.employee?._id || adv.employee,
          employeeName: adv.employee?.name || 'Staff',
          employeeCode: adv.employee?.code || adv.code || '-',
          branch: adv.branch || adv.employee?.branch || '-',
          date: dateStr,
          transactionType: adv.transactionType || 'Pay',
          docMode: adv.docMode || 'Cash',
          amount: adv.paid || 0,
          balance: adv.balance || 0,
          remarks: adv.remarks || '-'
        };
      });

      return res.status(200).json({
        success: true,
        mode: 'branch_advances',
        monthYear: targetMonthYearStr,
        branch: branch || 'All Branches',
        summary: {
          totalPaid: totalPaidThisMonth,
          totalReceived: totalReceivedThisMonth,
          netAdvanceIssued: totalPaidThisMonth - totalReceivedThisMonth,
          count: transactions.length
        },
        transactions
      });
    }

    // -------------------------------------------------------------
    // Single Employee Financials & Ledger Mode
    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // Single Employee Financials & Ledger Mode
    // -------------------------------------------------------------
    let employee = null;
    if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
      employee = await Employee.findById(employeeId)
        .select('name code branch basicSalary designation department bankCash totalHrs opening')
        .populate('designation', 'name');
    }
    if (!employee && employeeId) {
      employee = await Employee.findOne({ code: String(employeeId).trim() })
        .select('name code branch basicSalary designation department bankCash totalHrs opening')
        .populate('designation', 'name');
    }
    if (!employee && req.query.code) {
      employee = await Employee.findOne({ code: String(req.query.code).trim() })
        .select('name code branch basicSalary designation department bankCash totalHrs opening')
        .populate('designation', 'name');
    }
      
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // 1. Fetch full advance records for this employee (Support matching by _id or code)
    const empMatches = [];
    if (employee._id) empMatches.push({ employee: employee._id });
    if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
      empMatches.push({ employee: new mongoose.Types.ObjectId(employeeId) });
    }
    const cStr = String(employee.code || req.query.code || '').trim();
    if (cStr) {
      empMatches.push({ code: cStr });
      empMatches.push({ code: new RegExp('^' + cStr + '$', 'i') });
      empMatches.push({ employeeCode: cStr });
      empMatches.push({ employeeCode: new RegExp('^' + cStr + '$', 'i') });
      const cNum = parseInt(cStr, 10);
      if (!isNaN(cNum)) {
        empMatches.push({ code: cNum });
        empMatches.push({ employeeCode: cNum });
      }
    }

    const allAdvances = await EmployeeAdvance.find({ $or: empMatches })
      .sort({ date: 1, createdAt: 1 })
      .lean();

    // Determine Date Boundaries for Advance Ledger
    let rangeStart = null;
    let rangeEnd = null;

    const isAllMode = req.query.all === 'true' || req.query.filterType === 'all';

    if (!isAllMode) {
      if (startDate && endDate) {
        rangeStart = new Date(startDate);
        rangeStart.setHours(0, 0, 0, 0);
        rangeEnd = new Date(endDate);
        rangeEnd.setHours(23, 59, 59, 999);
      } else if (month && year) {
        rangeStart = new Date(Date.UTC(targetYear, targetMonth - 1, 1, 0, 0, 0) - PKT_OFFSET_MS);
        rangeEnd = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999) - PKT_OFFSET_MS);
      }
    }

    let overallBalance = parseFloat(employee.opening || 0);
    let openingBalance = parseFloat(employee.opening || 0);
    let totalAdvancesTaken = 0;
    let totalAdvancesDeducted = 0;
    let runningBalance = parseFloat(employee.opening || 0);

    const filteredTransactions = [];

    allAdvances.forEach(adv => {
      const advDate = adv.date ? new Date(adv.date) : new Date(adv.createdAt || Date.now());
      const isPay = (adv.transactionType || 'Pay').toLowerCase() === 'pay';
      const amt = parseFloat(adv.paid || 0);

      // Track lifetime balance
      if (isPay) {
        overallBalance += amt;
      } else {
        overallBalance -= amt;
      }

      // Check if entry falls before requested range (contributes to Opening Balance B/F)
      if (rangeStart && advDate < rangeStart) {
        if (isPay) {
          openingBalance += amt;
        } else {
          openingBalance -= amt;
        }
        runningBalance = openingBalance;
      } else if (!rangeEnd || (advDate <= rangeEnd)) {
        // Falls within requested period
        if (isPay) {
          totalAdvancesTaken += amt;
          runningBalance += amt;
        } else {
          totalAdvancesDeducted += amt;
          runningBalance -= amt;
        }

        filteredTransactions.push({
          id: adv._id,
          date: advDate.toISOString().split('T')[0],
          transactionType: adv.transactionType || 'Pay',
          docMode: adv.docMode || 'Cash',
          amount: amt,
          debit: isPay ? amt : 0,
          credit: !isPay ? amt : 0,
          balance: adv.balance !== undefined ? adv.balance : runningBalance,
          remarks: adv.remarks || '-'
        });
      }
    });

    // If no date range was specified, opening balance is base opening
    if (!rangeStart) {
      openingBalance = parseFloat(employee.opening || 0);
    }

    // Sort filtered entries newest first for clean ledger presentation
    filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Installment Plan
    const installmentPlan = await EmployeeAdvanceInstallmentPlan.findOne({
      $or: [
        { employee: employee._id },
        { code: employee.code }
      ]
    }).sort({ date: -1 }).lean();

    // 2. Fetch past payroll slips (up to 24 records, match by ID and Code)
    const monthNamesList = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthShortList = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    const monthYearVariants = [
      targetMonthYearStr,
      `${targetYear}-${targetMonth}`,
      `${monthNamesList[targetMonth - 1]} ${targetYear}`,
      `${monthShortList[targetMonth - 1]}-${targetYear}`
    ];

    let payrollQuery = { $or: empMatches };
    if (month && year && !isAllMode) {
      payrollQuery.monthYear = { $in: monthYearVariants };
    }

    let payrolls = await Payroll.find(payrollQuery)
      .populate('createdBy', 'name')
      .sort({ monthYear: -1, createdAt: -1 })
      .limit(24)
      .lean();

    // If specific month was requested but yielded 0, also fetch all available payrolls for this employee
    if (payrolls.length === 0 && payrollQuery.monthYear) {
      delete payrollQuery.monthYear;
      payrolls = await Payroll.find(payrollQuery)
        .populate('createdBy', 'name')
        .sort({ monthYear: -1, createdAt: -1 })
        .limit(24)
        .lean();
    }

    // If still 0, check LegacyPayroll model for older or imported records
    if (payrolls.length === 0) {
      try {
        const LegacyPayroll = require('../models/LegacyPayroll');
        const legacyQuery = {
          $or: [
            { employeeCode: employee.code },
            { employeeCode: String(employee.code).trim() }
          ]
        };
        if (month && year && !isAllMode) {
          legacyQuery.monthYear = { $in: monthYearVariants };
        }
        let legList = await LegacyPayroll.find(legacyQuery).sort({ salaryDate: -1, monthYear: -1 }).limit(24).lean();
        if (legList.length === 0 && legacyQuery.monthYear) {
          delete legacyQuery.monthYear;
          legList = await LegacyPayroll.find(legacyQuery).sort({ salaryDate: -1, monthYear: -1 }).limit(24).lean();
        }
        if (legList && legList.length > 0) {
          payrolls = legList.map(lp => ({
            _id: lp._id,
            id: lp._id,
            monthYear: lp.monthYear || `${lp.year}-${String(lp.month).padStart(2, '0')}`,
            code: lp.employeeCode,
            employeeName: lp.employeeName || employee.name,
            branch: lp.branch || employee.branch,
            department: lp.department || employee.department,
            designation: lp.designation || (employee.designation?.name || 'Staff'),
            perMonth: lp.basicSalary || lp.perMonth || 0,
            grossTotal: lp.grossSalary || lp.grossTotal || lp.totalSalary || 0,
            totalAdvRec: lp.advanceDeduction || lp.advance || 0,
            deductionsTotal: lp.totalDeductions || 0,
            netTotal: lp.netSalary || lp.netTotal || 0,
            bankPaid: lp.bankPaid || 0,
            cashPaid: lp.cashPaid || lp.netSalary || 0,
            isLegacy: true
          }));
        }
      } catch (_) {}
    }

    const paySlips = payrolls.map(pr => {
      const perMonth = pr.perMonth || employee.basicSalary || 0;
      const overTime = pr.overTime || 0;
      const natin = pr.natin || 0;
      const monthlyComm = pr.monthlyComm || 0;
      const ugComm = pr.ugComm || 0;
      const warehouseComm = pr.warehouseComm || 0;
      const otherAllow = pr.otherAllow || 0;
      const rent = pr.rent || 0;
      const teaAllowance = pr.teaAllowance || 0;
      const stLateAllow = pr.stLateAllow || 0;
      const breakfastRoti = (rent || 0) + (teaAllowance || 0);

      const totalEarnings = pr.grossTotal || pr.earningsTotal || (perMonth + overTime + natin + monthlyComm + ugComm + warehouseComm + otherAllow + breakfastRoti + stLateAllow);

      const shortTimeAmt = pr.shortTimeAmount || pr.shortWeek || 0;
      const mess = pr.ebDeduction || pr.food || 0;
      const pAAdv = pr.pAAdv || 0;
      const csMale = pr.csMale || 0;
      const advanceDed = ((pr.pmAdvRec || 0) + (pr.cmAdvRec || 0)) || pr.totalAdvRec || 0;
      const balance = (pAAdv + csMale) - advanceDed;
      const otherDedPenalty = (pr.penalty || 0) + (pr.otherDeduction || 0) + (pr.umrahDeduction || 0);
      const wht = pr.wht || 0;
      const securityDeposit = pr.securityDeposit || 0;

      const totalDeductions = (shortTimeAmt + mess + advanceDed + otherDedPenalty + wht + securityDeposit);
      const netSalary = (totalEarnings - totalDeductions);

      const bankPaid = pr.bankPaid || 0;
      const cashPaid = pr.cashPaid || (netSalary - bankPaid);

      return {
        ...pr,
        _id: pr._id,
        id: pr._id,
        monthYear: pr.monthYear,
        code: pr.code || employee.code,
        employeeName: employee.name,
        branch: pr.branch || employee.branch,
        department: pr.department || employee.department || 'General',
        designation: pr.designation || (employee.designation ? employee.designation.name : 'Staff'),
        dutyHrs: pr.totalHrsPerDay || employee.totalHrs || 10,
        workedDays: pr.workedDays || 0,
        workedHrs: pr.workedHrs || 0,

        // Earnings
        basicSalary: perMonth,
        perMonth,
        overTime,
        allowance: 0,
        natin,
        monthlyComm,
        ugComm,
        warehouseComm,
        otherAllow,
        rent,
        teaAllowance,
        breakfastRoti,
        stLateAllow,
        grossSalary: totalEarnings,
        grossTotal: totalEarnings,
        bankPaid,

        // Deductions
        shortTime: shortTimeAmt,
        shortTimeAmount: shortTimeAmt,
        shortWeek: pr.shortWeek || 0,
        mess,
        ebDeduction: mess,
        food: pr.food || 0,
        pAAdv,
        csMale,
        pmAdvRec: pr.pmAdvRec || 0,
        cmAdvRec: pr.cmAdvRec || 0,
        totalAdvRec: pr.totalAdvRec || advanceDed,
        totalAdv: pr.totalAdv || (pAAdv + csMale),
        advanceDed,
        balance,
        penalty: pr.penalty || 0,
        otherDeduction: pr.otherDeduction || 0,
        umrahDeduction: pr.umrahDeduction || 0,
        otherDedPenalty,
        wht,
        securityDeposit,
        totalDeduction: totalDeductions,
        deductionsTotal: totalDeductions,
        cashPaid,

        // Net
        netSalary,
        netTotal: pr.netTotal || netSalary,
        remarks: pr.remarks || '-',
        createdBy: pr.createdBy ? (pr.createdBy.name || pr.createdBy) : 'Bilal Sh',

        earnings: {
          basicSalary: perMonth,
          rent,
          overtime: overTime,
          teaAllowance,
          other: otherAllow,
          total: totalEarnings
        },
        deductions: {
          shortTime: shortTimeAmt,
          advanceDeduction: advanceDed,
          penalty: pr.penalty || 0,
          food: mess,
          other: pr.otherDeduction || 0,
          total: totalDeductions
        }
      };
    });

    res.status(200).json({
      success: true,
      mode: 'employee',
      employee: {
        id: employee._id,
        name: employee.name,
        code: employee.code,
        branch: employee.branch,
        department: employee.department || 'General',
        designation: employee.designation ? employee.designation.name : 'Staff',
        basicSalary: employee.basicSalary || 0,
        bankCash: employee.bankCash || 'Cash',
        dutyHrs: employee.totalHrs || 10
      },
      financials: {
        openingBalance,
        closingBalance: openingBalance + totalAdvancesTaken - totalAdvancesDeducted,
        advanceBalance: overallBalance,
        totalAdvancesTaken,
        totalAdvancesDeducted,
        installmentPlan: {
          preBal: installmentPlan?.currentMonthInstallment?.preBal || installmentPlan?.preBal || 0,
          monthlyInstallment: installmentPlan?.currentMonthInstallment?.installment || installmentPlan?.monthlyInstallment || 0,
          remainingBalance: overallBalance
        },
        paySlips,
        allAvailableSlips: paySlips,
        allSlipsCount: paySlips.length,
        ledgerTransactions: filteredTransactions,
        allHistoryCount: allAdvances.length
      }
    });
  } catch (error) {
    console.error('Error fetching employee financials:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Executive Sales Dashboard Data (Exact Web App Analytics)
// @route   GET /api/v1/mobile/admin/sales-dashboard
// @access  Private (Admin/Manager)
exports.getSalesDashboard = async (req, res) => {
  if (req.role === 'employee') {
    return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
  }

  try {
    const { period, startDate, endDate, branch } = req.query;

    const today = new Date();
    let fromDate, toDate;

    if (period === 'today') {
      fromDate = new Date(today);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(today);
      toDate.setHours(23, 59, 59, 999);
    } else if (period === 'yesterday') {
      fromDate = new Date(today);
      fromDate.setDate(today.getDate() - 1);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(fromDate);
      toDate.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      fromDate = new Date(today.setDate(diff));
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date();
    } else if (period === 'custom' || (startDate && endDate) || startDate || endDate) {
      if (startDate) {
        fromDate = new Date(startDate);
        fromDate.setHours(0, 0, 0, 0);
      } else {
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0);
      }
      if (endDate) {
        toDate = new Date(endDate);
        toDate.setHours(23, 59, 59, 999);
      } else {
        toDate = new Date(today);
        toDate.setHours(23, 59, 59, 999);
      }
    } else {
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0);
      toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    const sheetQuery = {
      date: { $gte: fromDate, $lte: toDate }
    };
    const voucherQuery = {
      date: { $gte: fromDate, $lte: toDate }
    };

    if (branch && branch !== 'all' && branch !== 'All Branches') {
      const cleanBranch = branch.trim().replace(/[()]/g, '');
      const escaped = cleanBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const branchRegex = { $regex: new RegExp(`^\\s*\\(?${escaped}\\)?\\s*$`, 'i') };
      sheetQuery.branch = branchRegex;
      voucherQuery.branch = branchRegex;
    }

    // High performance optimization: Parallelize all 3 queries and select ONLY needed sub-fields
    const [categories, sheets, vouchers] = await Promise.all([
      PartyCategory.find({ type: 'customer', isActive: true }).select('_id name').lean(),
      ClosingSheet.find(sheetQuery).select('date branch closing02').lean(),
      Voucher.find(voucherQuery).select('branch voucherNo narration description entries date').lean()
    ]);

    const catMap = {};
    categories.forEach(c => {
      catMap[c._id.toString()] = c.name;
    });

    const catStats = {};
    Object.values(catMap).forEach(catName => {
      catStats[catName] = { name: catName, totalSale: 0, totalCost: 0, branches: {} };
    });

    const dailyMap = {};

    sheets.forEach(sheet => {
      const rawBranch = sheet.branch || 'Main Branch';
      const cleanBranch = rawBranch.trim().startsWith('(') ? rawBranch.trim() : `(${rawBranch.trim()})`;
      const dateKey = sheet.date ? new Date(sheet.date).toISOString().split('T')[0] : null;
      if (dateKey && !dailyMap[dateKey]) {
        dailyMap[dateKey] = { sale: 0, cost: 0 };
      }

      // closing02.data is Mixed — handle both { data: {...} } and flat object shapes
      const dataObj = (sheet.closing02 && sheet.closing02.data && typeof sheet.closing02.data === 'object')
        ? sheet.closing02.data
        : (sheet.closing02 || {});

      if (dataObj && dataObj.warehouseSale && Array.isArray(dataObj.warehouseSale)) {
        dataObj.warehouseSale.forEach(item => {
          const catId = item.category ? item.category.toString() : '';
          const catName = catMap[catId] || item.categoryName;
          if (!catName) return;

          if (!catStats[catName]) {
            catStats[catName] = { name: catName, totalSale: 0, totalCost: 0, branches: {} };
          }

          const sale = parseFloat(item.sale || 0) || 0;
          const cost = parseFloat(item.cost || 0) || 0;

          catStats[catName].totalSale += sale;
          catStats[catName].totalCost += cost;

          if (dateKey) {
            dailyMap[dateKey].sale += sale;
            dailyMap[dateKey].cost += cost;
          }

          if (!catStats[catName].branches[cleanBranch]) {
            catStats[catName].branches[cleanBranch] = { branch: cleanBranch, sale: 0, cost: 0 };
          }
          catStats[catName].branches[cleanBranch].sale += sale;
          catStats[catName].branches[cleanBranch].cost += cost;
        });
      }
    });

    let grandTotalSale = 0;
    let grandTotalCost = 0;

    const formattedCategories = Object.values(catStats).map(c => {
      const profit = c.totalSale - c.totalCost;
      const margin = c.totalSale > 0 ? (profit / c.totalSale) * 100 : 0;
      grandTotalSale += c.totalSale;
      grandTotalCost += c.totalCost;

      const branchList = Object.values(c.branches)
        .filter(b => b.sale > 0 || b.cost > 0)
        .map(b => {
          const bProfit = b.sale - b.cost;
          const bMargin = b.sale > 0 ? (bProfit / b.sale) * 100 : 0;
          return {
            branch: b.branch,
            sale: b.sale,
            cost: b.cost,
            profit: bProfit,
            margin: Number(bMargin.toFixed(1))
          };
        })
        .sort((a, b) => b.sale - a.sale)
        .map((b, idx) => ({ ...b, rank: idx + 1 }));

      return {
        name: c.name,
        totalSale: c.totalSale,
        totalCost: c.totalCost,
        totalProfit: profit,
        margin: Number(margin.toFixed(1)),
        branches: branchList
      };
    }).sort((a, b) => b.totalSale - a.totalSale);

    // Process Category Wise Payments using the already parallel-fetched vouchers
    let totalPaymentsAll = 0;
    try {
      const paymentMap = {};
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      vouchers.forEach(v => {
        if (!v || !v.entries || !Array.isArray(v.entries)) return;
        const rawBranch = v.branch || 'Main Branch';
        const cleanBranch = rawBranch.trim().startsWith('(') ? rawBranch.trim() : `(${rawBranch.trim()})`;

        // Match entries with 'Category Wise Payment' detail or narration
        v.entries.forEach(e => {
          const isCategoryVoucher =
            norm(e.detail) === norm('Category Wise Payment') ||
            norm(e.narration) === norm('Category Wise Payment') ||
            norm(v.narration) === norm('Category Wise Payment') ||
            norm(v.description) === norm('Category Wise Payment');
          if (!isCategoryVoucher) return;

          const catName = (e.account || '').trim();
          if (!catName) return;
          const amt = parseFloat(e.debit || e.credit || 0) || 0;
          if (amt <= 0) return;

          // Match to a known catStats key (exact or fuzzy)
          let matchedCat = Object.keys(catStats).find(cn =>
            norm(cn) === norm(catName) ||
            norm(cn).includes(norm(catName)) ||
            norm(catName).includes(norm(cn))
          );

          if (!matchedCat) {
            matchedCat = catName;
            catStats[matchedCat] = { name: matchedCat, totalSale: 0, totalCost: 0, branches: {} };
            if (!formattedCategories.some(c => norm(c.name) === norm(matchedCat))) {
              formattedCategories.push({
                name: matchedCat,
                totalSale: 0,
                totalCost: 0,
                totalProfit: 0,
                margin: 0,
                branches: []
              });
            }
          }

          if (!paymentMap[matchedCat]) paymentMap[matchedCat] = {};
          if (!paymentMap[matchedCat][cleanBranch]) paymentMap[matchedCat][cleanBranch] = 0;
          paymentMap[matchedCat][cleanBranch] += amt;
        });
      });

      const matchBranch = (b1, b2) => {
        const n1 = norm(b1);
        const n2 = norm(b2);
        return n1 === n2 || n1.includes(n2) || n2.includes(n1);
      };

      formattedCategories.forEach(cat => {
        let catPaid = 0;
        const catPayments = paymentMap[cat.name] || {};
        const matchedBranchKeys = new Set();

        cat.branches.forEach(b => {
          let paid = 0;
          Object.entries(catPayments).forEach(([vBr, vAmt]) => {
            if (matchBranch(b.branch, vBr)) {
              paid += vAmt;
              matchedBranchKeys.add(vBr);
            }
          });

          b.paid = paid;
          b.balance = b.cost - paid;
          catPaid += paid;
        });

        // Add any branches with payments that didn't have sales/cost rows
        Object.entries(catPayments).forEach(([vBr, vAmt]) => {
          if (!matchedBranchKeys.has(vBr) && vAmt > 0) {
            cat.branches.push({
              branch: vBr,
              sale: 0,
              cost: 0,
              paid: vAmt,
              balance: 0 - vAmt,
              profit: 0,
              margin: 0,
              rank: cat.branches.length + 1
            });
            catPaid += vAmt;
          }
        });

        cat.totalPaid = catPaid;
        cat.totalBalance = cat.totalCost - catPaid;
        totalPaymentsAll += catPaid;
      });
    } catch (vErr) {
      console.error('Error calculating category payments:', vErr);
    }

    const grandProfit = grandTotalSale - grandTotalCost;
    const grandMargin = grandTotalSale > 0 ? (grandProfit / grandTotalSale) * 100 : 0;
    const grandBalance = grandTotalCost - totalPaymentsAll;

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let dailyTrend = Object.keys(dailyMap).sort().map(d => {
      const dObj = new Date(d);
      const label = dayNames[dObj.getDay()];
      const sale = dailyMap[d].sale || 0;
      const cost = dailyMap[d].cost || 0;
      const profit = sale - cost;
      const margin = sale > 0 ? Number(((profit / sale) * 100).toFixed(1)) : 0;
      return {
        date: d,
        label: `${label} ${dObj.getDate()}`,
        sale,
        cost,
        profit,
        margin
      };
    });

    // If current selected period has fewer than 5 days, backfill with the most recent actual trading days
    if (dailyTrend.length < 5) {
      try {
        const recentQuery = {};
        if (branch && branch !== 'all' && branch !== 'All Branches') {
          const cleanBranch = branch.trim().replace(/[()]/g, '');
          const escaped = cleanBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          recentQuery.branch = { $regex: new RegExp(`^\\s*\\(?${escaped}\\)?\\s*$`, 'i') };
        }
        const recentSheets = await ClosingSheet.find(recentQuery)
          .sort({ date: -1 })
          .limit(80)
          .lean();

        const fallbackDailyMap = {};
        recentSheets.forEach(sheet => {
          const dateKey = sheet.date ? new Date(sheet.date).toISOString().split('T')[0] : null;
          if (!dateKey) return;
          if (!fallbackDailyMap[dateKey]) {
            fallbackDailyMap[dateKey] = { sale: 0, cost: 0 };
          }
          const dataObj = (sheet.closing02 && sheet.closing02.data && typeof sheet.closing02.data === 'object')
            ? sheet.closing02.data
            : (sheet.closing02 || {});
          if (dataObj && dataObj.warehouseSale && Array.isArray(dataObj.warehouseSale)) {
            dataObj.warehouseSale.forEach(item => {
              fallbackDailyMap[dateKey].sale += (parseFloat(item.sale || 0) || 0);
              fallbackDailyMap[dateKey].cost += (parseFloat(item.cost || 0) || 0);
            });
          }
        });

        const fallbackKeys = Object.keys(fallbackDailyMap).sort().slice(-7);
        if (fallbackKeys.length > 0) {
          const fallbackTrend = fallbackKeys.map(d => {
            const dObj = new Date(d);
            const label = dayNames[dObj.getDay()];
            const sale = fallbackDailyMap[d].sale || 0;
            const cost = fallbackDailyMap[d].cost || 0;
            const profit = sale - cost;
            const margin = sale > 0 ? Number(((profit / sale) * 100).toFixed(1)) : 0;
            return {
              date: d,
              label: `${label} ${dObj.getDate()}`,
              sale,
              cost,
              profit,
              margin
            };
          });

          if (fallbackTrend.length >= dailyTrend.length) {
            dailyTrend = fallbackTrend;
          }
        }
      } catch (fErr) {
        console.warn('Fallback daily trend error:', fErr.message);
      }
    }

    res.status(200).json({
      success: true,
      period: period || 'month',
      dateRange: {
        startDate: fromDate.toISOString().split('T')[0],
        endDate: toDate.toISOString().split('T')[0],
      },
      branch: branch || 'All Branches',
      totals: {
        totalSales: grandTotalSale,
        totalCost: grandTotalCost,
        totalProfit: grandProfit,
        totalPaid: totalPaymentsAll,
        totalBalance: grandBalance,
        margin: Number(grandMargin.toFixed(1))
      },
      dailyTrend,
      categories: formattedCategories
    });
  } catch (error) {
    console.error('Error fetching sales dashboard:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
// @desc    Mark Leave for Employee (Admin/Manager)
// @route   POST /api/v1/mobile/admin/mark-leave
// @access  Private (Admin/Manager)
exports.markEmployeeLeave = async (req, res) => {
  try {
    const { employeeId, date, reason } = req.body;
    if (!employeeId || !date) {
      return res.status(400).json({ success: false, message: 'Employee ID and Date are required' });
    }

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const emp = await Employee.findById(employeeId);
    if (!emp) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    let att = await Attendance.findOne({
      employee: employeeId,
      date: { $gte: start, $lte: end }
    });

    if (!att) {
      att = new Attendance({
        employee: employeeId,
        code: emp.code,
        branch: emp.branch,
        date: start,
        displayStatus: 'Leave',
        remarks: reason || 'Leave marked from Mobile App'
      });
    } else {
      att.displayStatus = 'Leave';
      att.remarks = reason || att.remarks || 'Leave marked from Mobile App';
    }

    await att.save();

    res.status(200).json({
      success: true,
      message: 'Leave marked successfully',
      data: att
    });
  } catch (error) {
    console.error('Error marking leave:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
