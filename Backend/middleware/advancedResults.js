const advancedResults = (model, populate) => async (req, res, next) => {
  try {
    let query;

    // Helper: Normalize Mongoose Map to plain object
    const normalizeRights = (rights) => {
      if (!rights) return {};
      if (rights.constructor === Object) return rights;
      if (rights instanceof Map || (rights.constructor && rights.constructor.name === 'Map')) {
        const normalized = {};
        for (const [key, value] of rights.entries()) {
          normalized[key] = value;
        }
        return normalized;
      }
      return {};
    };

    const hasGroupRight = (user, ...keys) => {
      if (!user || !user.groupId || !user.groupId.rights) return false;
      // ✓ BUGFIX: Normalize Mongoose Map to plain object
      const rights = normalizeRights(user.groupId.rights);
      for (const key of keys) {
        if (rights[key] === true) return true;
      }
      return false;
    };

    const userRole = (req.user && req.user.role || '').toLowerCase();
    const isAdmin = userRole === 'admin' || userRole === 'administrator' || userRole === 'superadmin'
      || hasGroupRight(req.user, 'admin', 'administration');

    // Create a copy of req.query
    const reqQuery = { ...req.query };

    // Fields to exclude from filtering
    const removeFields = ['select', 'sort', 'page', 'limit', 'search', 'startDate', 'endDate'];

    // Handle date range filtering
    if (req.query.startDate || req.query.endDate) {
      reqQuery.date = {};
      if (req.query.startDate) {
        const startDate = new Date(req.query.startDate);
        reqQuery.date.$gte = startDate.toISOString();
      }
      if (req.query.endDate) {
        // Set end date to end of day
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999);
        reqQuery.date.$lte = endDate.toISOString();
      }
    }

    // Remove fields from reqQuery
    removeFields.forEach(param => delete reqQuery[param]);

    // Store date filter separately to avoid stringify/parse issues
    const dateFilter = reqQuery.date ? { ...reqQuery.date } : null;

    // Remove date from reqQuery before stringify to avoid double $ prefix
    if (reqQuery.date) {
      delete reqQuery.date;
    }

    // Parse the query and add date filter back if it exists
    let parsedQuery;
    try {
      let queryStr = JSON.stringify(reqQuery);
      queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);
      parsedQuery = JSON.parse(queryStr);
    } catch (parseErr) {
      return res.status(400).json({ success: false, message: 'Invalid filter parameters' });
    }
    if (dateFilter) {
      parsedQuery.date = dateFilter;
    }

    // Branch-Level Restriction & Resolution: 
    // 1. Ensure any model using branch as ObjectID doesn't crash on name strings
    // 2. Enforce branch permissions for non-admins
    // Branch-Level Restriction & Resolution: 
    // 1. Ensure any model using branch as ObjectID doesn't crash on name strings
    // 2. Enforce branch permissions for non-admins
    const hasBranchField = model.schema && model.schema.paths && model.schema.paths.branch !== undefined;
    if (hasBranchField) {
      const isObjectIdField = model.schema.paths.branch.instance === 'ObjectID' || model.schema.paths.branch.instance === 'ObjectId';
      const mongoose = require('mongoose');
      const Store = require('../models/Store');

      // Normalize user branches to an array of strings
      let userBranches = [];
      if (req.user && req.user.branch) {
        userBranches = Array.isArray(req.user.branch) ? req.user.branch : [String(req.user.branch)];
        // Clean up names (remove parentheses if needed for matching, though we should match exactly first)
        userBranches = userBranches.map(b => b.trim());
      }

      if (isObjectIdField) {
        if (req.user && userBranches.length > 0) {
          // Restricted User: Force filter to allowed branches
          // We search for stores matching names exactly or names containing the string to be safe
          const stores = await Store.find({ name: { $in: userBranches } }).select('_id name').lean();
          const branchIds = stores.map(s => s._id.toString());
          const branchNames = stores.map(s => s.name);

          if (parsedQuery.branch) {
            const requestedBranch = String(parsedQuery.branch);
            const isId = mongoose.Types.ObjectId.isValid(requestedBranch);
            const isAllowedId = isId && branchIds.includes(requestedBranch);
            const matchedStoreByName = stores.find(s => s.name === requestedBranch);
            
            if (matchedStoreByName) {
              parsedQuery.branch = matchedStoreByName._id;
            } else if (isAllowedId) {
              parsedQuery.branch = new mongoose.Types.ObjectId(requestedBranch);
            } else {
              // Not allowed or invalid format: fallback to all allowed IDs
              parsedQuery.branch = { $in: branchIds.map(id => new mongoose.Types.ObjectId(id)) };
            }
          } else {
            parsedQuery.branch = { $in: branchIds.map(id => new mongoose.Types.ObjectId(id)) };
          }
        } else if (req.user && !isAdmin && userBranches.length === 0) {
          // Non-admin without assigned branches should not see cross-branch ObjectId data.
          parsedQuery.branch = { $in: [] };
        } else if (parsedQuery.branch) {
          // Admin or No Restriction: Just resolve name to ID if needed to prevent CastError
          const requestedBranch = String(parsedQuery.branch);
          const isValidObjectId = mongoose.Types.ObjectId.isValid(requestedBranch);
          
          if (!isValidObjectId) {
            const store = await Store.findOne({ name: requestedBranch }).select('_id').lean();
            if (store) {
              parsedQuery.branch = store._id;
            } else {
              // Invalid name and not an ID? Remove to prevent Mongoose CastError (404)
              delete parsedQuery.branch; 
            }
          } else {
            // Already an ID, but let's ensure it's cast correctly to avoid issues
            parsedQuery.branch = new mongoose.Types.ObjectId(requestedBranch);
          }
        }
      } else {
        // Branch is String field (Department, Employee)
        if (req.user && userBranches.length > 0) {
          if (parsedQuery.branch) {
            const requestedBranch = String(parsedQuery.branch);
            if (!userBranches.includes(requestedBranch)) {
              parsedQuery.branch = { $in: userBranches };
            }
          } else {
            parsedQuery.branch = { $in: userBranches };
          }
        } else if (req.user && !isAdmin && userBranches.length === 0) {
          // Non-admin without assigned branches should not see cross-branch string-branch data.
          parsedQuery.branch = { $in: [] };
        }
      }
    }

    // Start building the query
    query = model.find(parsedQuery);

    // Search functionality
    if (req.query.search) {
      const searchFields = model.schema.obj && model.schema.obj.$text ?
        { $text: { $search: req.query.search } } :
        {
          $or: [
            { name: { $regex: req.query.search, $options: 'i' } },
            { sku: { $regex: req.query.search, $options: 'i' } },
            { barcode: { $regex: req.query.search, $options: 'i' } },
            { email: { $regex: req.query.search, $options: 'i' } },
            { phone: { $regex: req.query.search, $options: 'i' } },
            { invoiceNo: { $regex: req.query.search, $options: 'i' } },
            { referenceNo: { $regex: req.query.search, $options: 'i' } }
          ]
        };

      // Combine search with other filters (like date, status)
      const combinedQuery = { ...searchFields };
      if (dateFilter) {
        combinedQuery.date = dateFilter;
      }
      // Add other filters from parsedQuery
      Object.keys(parsedQuery).forEach(key => {
        if (key !== 'date' && !searchFields[key]) {
          combinedQuery[key] = parsedQuery[key];
        }
      });

      query = model.find(combinedQuery);
      queryStr = JSON.stringify(combinedQuery);
    }

    // Select fields
    if (req.query.select) {
      const fields = req.query.select.split(',').join(' ');
      query = query.select(fields);
    }

    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }

    // ─── PERFORMANCE OPTIMIZATION ───
    // Use .lean() to get POJOs instead of Mongoose Documents
    query = query.lean();

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10);
    if (isNaN(limit) || limit === undefined) {
      limit = 1000; // sensible default
    }
    if (limit === 0) {
      limit = 10000000; // effectively unlimited
    }

    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    // Build count query (same conditions as main query)
    let countQuery = model.countDocuments(parsedQuery);

    // If search is used, count with search fields
    if (req.query.search) {
      const searchFields = model.schema.obj && model.schema.obj.$text ?
        { $text: { $search: req.query.search } } :
        {
          $or: [
            { name: { $regex: req.query.search, $options: 'i' } },
            { sku: { $regex: req.query.search, $options: 'i' } },
            { barcode: { $regex: req.query.search, $options: 'i' } },
            { email: { $regex: req.query.search, $options: 'i' } },
            { phone: { $regex: req.query.search, $options: 'i' } },
            { invoiceNo: { $regex: req.query.search, $options: 'i' } },
            { referenceNo: { $regex: req.query.search, $options: 'i' } }
          ]
        };

      if (dateFilter) {
        searchFields.date = dateFilter;
      }
      Object.keys(parsedQuery).forEach(key => {
        if (key !== 'date' && !searchFields[key]) {
          searchFields[key] = parsedQuery[key];
        }
      });

      countQuery = model.countDocuments(searchFields);
    }

    const total = await countQuery;

    query = query.skip(startIndex).limit(limit);

    // Populate if specified
    if (populate) {
      if (Array.isArray(populate)) {
        populate.forEach(p => {
          query = query.populate(p);
        });
      } else {
        query = query.populate(populate);
      }
    }

    // Execute query
    const results = await query;

    // Pagination result
    const pagination = {
      page,
      limit,
      total
    };

    if (endIndex < total) {
      pagination.next = {
        page: page + 1,
        limit
      };
    }

    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit
      };
    }

    res.advancedResults = {
      success: true,
      count: results.length,
      pagination,
      data: results
    };

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = advancedResults;
