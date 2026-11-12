const AuditLog = require('../models/AuditLog');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const asyncHandler = require('../middleware/async');

// @desc    Get all audit logs
// @route   GET /api/v1/audit-logs
// @access  Private/Admin
exports.getAuditLogs = asyncHandler(async (req, res, next) => {
    const { startDate, endDate, performedBy, entity } = req.query;

    const query = {};

    if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);

        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        query.createdAt = {
            $gte: start,
            $lte: end
        };
    }

    if (performedBy) query.performedBy = performedBy;
    if (entity) query.entity = entity;

    const logs = await AuditLog.find(query)
        .populate('performedBy', 'name email role')
        .sort({ createdAt: -1 });

    // Enrich logs with entity-specific details
    const processedLogs = await Promise.all(logs.map(async (log) => {
        const logObj = log.toObject();

        // Enrichment for Attendance
        if (log.entity === 'attendance' && log.entityId) {
            const attendance = await Attendance.findById(log.entityId).populate('employee', 'name code branch');
            if (attendance) {
                logObj.details = {
                    employeeName: attendance.employee?.name,
                    employeeCode: attendance.employee?.code,
                    branch: attendance.employee?.branch || 'Unassigned',
                    attendanceDate: attendance.date
                };
            }
        }
        // Enrichment for Employee
        else if (log.entity === 'employee' && log.entityId) {
            const employee = await Employee.findById(log.entityId);
            if (employee) {
                logObj.details = {
                    employeeName: employee.name,
                    employeeCode: employee.code,
                    branch: employee.branch || 'Unassigned'
                };
            }
        }
        // Enrichment for Advance
        else if (log.entity === 'advance' && log.entityId) {
            const advance = await EmployeeAdvance.findById(log.entityId).populate('employee', 'name code branch');
            if (advance) {
                logObj.details = {
                    employeeName: advance.employee?.name,
                    employeeCode: advance.employee?.code,
                    branch: advance.employee?.branch || 'Unassigned',
                    advanceDate: advance.date,
                    amount: advance.paid
                };
            }
        }

        return logObj;
    }));

    res.status(200).json({
        success: true,
        count: processedLogs.length,
        data: processedLogs
    });
});
