const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { SERVER_BOOT_ID } = require('../utils/bootId');

// Protect routes
exports.protect = async (req, res, next) => {
  // If req.user is already set (e.g. by verifyApiKey), skip standard check
  if (req.user) {
    return next();
  }
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    // Set token from Bearer token in header
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (process.env.NODE_ENV !== 'production' && req.query.token) {
    // Keep query-token support outside production only for legacy/debug flows.
    token = req.query.token;
  }

  // Make sure token exists
  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Reject tokens with no bootId (issued before this feature) or wrong bootId (pre-restart tokens)
    if (!decoded.bootId || decoded.bootId !== SERVER_BOOT_ID) {
      return res.status(401).json({ success: false, message: 'Session expired after server update. Please login again.' });
    }

    // Check if decoded has user object (nested) or id directly (flat)
    const userId = decoded.user ? decoded.user.id : decoded.id;

    // PERF FIX: Combined findById + populate into ONE single DB query
    // Previously this was 2 separate round-trips to MongoDB on every API request
    req.user = await User.findById(userId)
      .select('-password')
      .populate('groupId');

    // Check if user exists
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Check if user is active
    if (!req.user.isActive) {
      return res.status(401).json({ success: false, message: 'User account is deactivated' });
    }

    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }
};

// Helper: Normalize Mongoose Map to plain object
// Fixes issue where .populate('groupId') returns Map in unpredictable formats
const normalizeRights = (rights) => {
  if (!rights) return {};
  
  // Already a plain object
  if (rights.constructor === Object) {
    return rights;
  }
  
  // Mongoose Map - convert to object
  if (rights instanceof Map || (rights.constructor && rights.constructor.name === 'Map')) {
    const normalized = {};
    for (const [key, value] of rights.entries()) {
      normalized[key] = value;
    }
    return normalized;
  }
  
  // Fallback: Try to iterate and copy
  const normalized = {};
  try {
    for (const key of Object.keys(rights)) {
      normalized[key] = rights[key];
    }
  } catch (e) {
    console.warn('[AUTH] Failed to normalize rights object:', e.message);
  }
  
  return normalized;
};

// Helper: Check if user has permission via Group
const hasGroupRight = (user, ...keys) => {
  if (!user.groupId || !user.groupId.rights) {
    // Log warning if a non-admin user lacks a group assignment
    if (user.role !== 'admin' && user.role !== 'administrator' && user.role !== 'superadmin') {
      console.warn(`[AUTH WARNING] Non-admin user "${user.email}" (${user._id}) has no groupId assigned. Cannot check permissions.`);
    }
    return false;
  }

  // ✓ BUGFIX: Normalize Mongoose Map to plain object for reliable access
  const rights = normalizeRights(user.groupId.rights);

  for (const key of keys) {
    if (rights[key] === true) {
      return true;
    }
  }
  return false;
};

// Grant access to specific roles or group permissions
exports.authorize = (...roles) => {
  return (req, res, next) => {
    // Ensure next is a function
    if (typeof next !== 'function') {
      console.error('[AUTH] ERROR: next is not a function in authorize middleware');
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }

    try {
      // 1. Check if user's role is specifically authorized
      if (roles.includes(req.user.role)) {
        return next();
      }

      // 2. Check if user has any of these keys as a Group Right (Permission)
      if (hasGroupRight(req.user, ...roles)) {
        return next();
      }

      // 3. Fallback: Always allow if user has full 'admin' or 'administration' right
      if (hasGroupRight(req.user, 'admin', 'administration')) {
        return next();
      }

      // Permission denied - provide helpful error info
      const missingPerms = roles.join(', ');
      console.warn(`[403] User "${req.user.email}" (${req.user._id}) denied access. Required: [${missingPerms}]`);

      return res.status(403).json({
        success: false,
        message: `Access denied. Required permission: ${missingPerms}`,
        user: {
          email: req.user.email,
          role: req.user.role,
          group: req.user.groupId ? req.user.groupId.name : 'NO GROUP ASSIGNED'
        }
      });
    } catch (err) {
      console.error('[AUTH] Error in authorize middleware:', err.message);
      return res.status(500).json({ success: false, message: 'Authorization error' });
    }
  };
};

// Role-based access control logic
exports.adminAccess = (req, res, next) => {
  const userRole = (req.user.role || '').toLowerCase();
  const isAdmin = userRole === 'admin' || userRole === 'administrator' || userRole === 'superadmin';
  if (isAdmin || hasGroupRight(req.user, 'admin', 'administration')) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Admin access required' });
};

// Sales User can manage sales & sales returns only
exports.salesAccess = (req, res, next) => {
  // Allow if role matches OR if has strict sales rights
  if (['admin', 'manager', 'sales'].includes(req.user.role) || hasGroupRight(req.user, 'sales', 'new_sale', 'customer_demand', 'sale_returns')) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Sales access required' });
};

// Accounts User manages cash, bank, ledgers & reports
exports.accountsAccess = (req, res, next) => {
  // Check Role
  if (['admin', 'manager', 'accounts'].includes(req.user.role)) {
    return next();
  }

  // Check Group Rights (Accounts OR Bank Management OR Management/Dashboard access)
  // 'dashboard', 'management', 'administration', 'reports', 'closing' are included so
  // Management/Reporting group users can view the dashboard payment data from vouchers API
  if (hasGroupRight(req.user,
    'accounts', 'bank_mgmt', 'bank_management', 'banks', 'easypaisa_settlement',
    'expenses', 'vouchers', 'payment_vouchers',
    'management', 'dashboard', 'administration', 'reports', 'closing'
  )) {
    return next();
  }

  return res.status(403).json({ success: false, message: 'Accounts/Bank access required' });
};

// Bank Detail Delete — requires 'bank_detail_delete' OR 'bank_payment_delete' right (admins always allowed)
exports.bankDetailDeleteAccess = (req, res, next) => {
  if (['admin', 'manager'].includes(req.user.role)) {
    return next();
  }
  if (req.user.groupId && req.user.groupId.isAdmin) {
    return next();
  }
  if (hasGroupRight(req.user, 'bank_detail_delete') || hasGroupRight(req.user, 'bank_payment_delete')) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'You do not have permission to delete bank entries.' });
};

// Manager has limited admin access
exports.managerAccess = (req, res, next) => {
  if (['admin', 'manager'].includes(req.user.role) || hasGroupRight(req.user, 'administration', 'settings')) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Manager access required' });
};
 
// Helper: Apply branch-level restriction to a Mongoose query object
exports.applyBranchFilter = async (req, query, model) => {
  const hasBranchField = model && model.schema && model.schema.paths && model.schema.paths.branch !== undefined;
  if (!hasBranchField) return query;

  const isObjectIdField = model.schema.paths.branch.instance === 'ObjectID' || model.schema.paths.branch.instance === 'ObjectId';
  const mongoose = require('mongoose');
  const Store = require('../models/Store');

  // PERF FIX: Branch Name/ID memory cache to prevent Database hits on EVERY API request
  if (!global.branchCache) {
    global.branchCache = { stores: [], lastFetch: 0 };
  }
  
  if (Date.now() - global.branchCache.lastFetch > 300000) { // 5-minute TTL
    global.branchCache.stores = await Store.find({}).select('_id name').lean();
    global.branchCache.lastFetch = Date.now();
  }
  const allStores = global.branchCache.stores;

  // Normalize user branches to an array of strings
  let userBranches = [];
  if (req.user && req.user.branch) {
    userBranches = Array.isArray(req.user.branch) ? req.user.branch : [String(req.user.branch)];
    userBranches = userBranches.map(b => b.trim());
  }

  const userRole = (req.user && req.user.role || '').toLowerCase();
  const isAdmin = userRole === 'admin' || userRole === 'administrator' || userRole === 'superadmin' || hasGroupRight(req.user, 'admin', 'administration');

  if (isObjectIdField) {
    if (req.user && !isAdmin && userBranches.length > 0) {
      // Restricted User: Force filter to allowed branches (using cache)
      const stores = allStores.filter(s => userBranches.includes(s.name));
      const branchIds = stores.map(s => s._id.toString());
      
      if (query.branch) {
        const requestedBranch = String(query.branch);
        const isId = mongoose.Types.ObjectId.isValid(requestedBranch);
        
        // Resolve name to ID if needed
        let requestedId = requestedBranch;
        if (!isId) {
          const matchedStore = stores.find(s => s.name.toLowerCase() === requestedBranch.toLowerCase());
          requestedId = matchedStore ? matchedStore._id.toString() : null;
        }

        if (requestedId && branchIds.includes(requestedId)) {
          query.branch = new mongoose.Types.ObjectId(requestedId);
        } else {
          // Requested a branch they don't have access to -> Return nothing
          query.branch = new mongoose.Types.ObjectId(); // Non-existent ID
        }
      } else {
        query.branch = { $in: branchIds.map(id => new mongoose.Types.ObjectId(id)) };
      }
    } else if (req.user && !isAdmin && userBranches.length === 0) {
      // Non-admin without assigned branches should not see cross-branch ObjectId data.
      query.branch = { $in: [] };
    } else if (query.branch) {
      // Admin or No Restriction: Just resolve name to ID if needed to prevent CastError
      const requestedBranch = String(query.branch);
      const isValidObjectId = mongoose.Types.ObjectId.isValid(requestedBranch);
      
      if (!isValidObjectId) {
        const store = allStores.find(s => s.name === requestedBranch);
        if (store) {
          query.branch = store._id;
        } else {
          // Invalid name and not an ID? Remove to prevent Mongoose CastError (404)
          delete query.branch; 
        }
      } else {
        // Already an ID, but let's ensure it's cast correctly to avoid issues
        query.branch = new mongoose.Types.ObjectId(requestedBranch);
      }
    }
  } else {
    // Branch is String field (Department, Employee)
    if (req.user && !isAdmin && userBranches.length > 0) {
      if (query.branch) {
        const requestedBranch = String(query.branch);
        // Case-insensitive check for string branch fields
        const isAllowed = userBranches.some(ub => ub.toLowerCase() === requestedBranch.toLowerCase());
        if (!isAllowed) {
          // Requested a branch they don't have access to -> Return nothing
          query.branch = "__NOT_ALLOWED_BRANCH__";
        }
      } else {
        query.branch = { $in: userBranches };
      }
    } else if (req.user && !isAdmin && userBranches.length === 0) {
      // Non-admin without assigned branches should not see cross-branch string-branch data.
      query.branch = { $in: [] };
    }
  }

  return query;
};
