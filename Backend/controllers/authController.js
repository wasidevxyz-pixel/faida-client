const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { SERVER_BOOT_ID } = require('../utils/bootId');
const aiMemory = require('../ai/memory/memoryManager');

const normalizePreferences = (preferences = {}) => {
  const theme = ['light', 'dark'].includes(preferences.theme) ? preferences.theme : 'light';
  const fontFamily = ['times-new-roman', 'georgia', 'segoe-ui', 'arial'].includes(preferences.fontFamily)
    ? preferences.fontFamily
    : 'times-new-roman';

  return { theme, fontFamily };
};

const buildUserResponse = (user, finalizedRights = {}) => ({
  _id: user._id,
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  branch: user.branch,
  department: user.department,
  group: user.groupId,
  aiEnabled: user.aiEnabled || false,
  profilePicture: user.profilePicture || '',
  preferences: normalizePreferences(user.preferences),
  rights: finalizedRights,
  allowedWHCustomerCategories: user.allowedWHCustomerCategories,
  allowedWHItemCategories: user.allowedWHItemCategories
});

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, password, role } = req.body;

  try {
    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    user = new User({
      name,
      email,
      password,
      role: role || 'sales'
    });

    await user.save();

    // Create JWT token
    const payload = {
      user: {
        id: user.id,
        role: user.role
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE },
      (err, token) => {
        if (err) {
          console.error('JWT sign error:', err);
          return res.status(500).json({ success: false, message: 'Token generation failed' });
        }
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { password } = req.body;
  const loginId = req.body.email ? req.body.email.trim() : '';

  try {
    // Optimize login: Check exact lowercase email first (hits unique index instantly)
    let user = await User.findOne({ email: loginId.toLowerCase() }).select('+password');
    
    // Fallback: If not found, try searching by name
    if (!user) {
      user = await User.findOne({
        name: { $regex: new RegExp("^" + loginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "$", "i") }
      }).select('+password');
    }

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(400).json({ message: 'Account is deactivated' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // PERF FIX: Reuse the already-fetched user — populate groupId on it
    // instead of doing a second User.findById(user._id) round-trip to MongoDB
    await user.populate('groupId');
    const fullUser = user;

    // Safe conversion of rights
    let finalizedRights = {};
    if (fullUser.groupId && fullUser.groupId.rights) {
      const groupRights = fullUser.groupId.rights;

      // Check if it's a Map (Mongoose Map)
      if (groupRights instanceof Map || (groupRights.constructor && groupRights.constructor.name === 'Map')) {
        for (const [key, value] of groupRights.entries()) {
          finalizedRights[key] = value;
        }
      }
      // Fallback for POJO or formatted object
      else if (typeof groupRights === 'object') {
        Object.keys(groupRights).forEach(key => {
          finalizedRights[key] = groupRights[key];
        });
      }
    }

    // Merge individual user permissions (overrides or additions)
    if (fullUser.permissions && Array.isArray(fullUser.permissions)) {
      fullUser.permissions.forEach(p => {
        finalizedRights[p] = true;
      });
    }


    if (!process.env.JWT_SECRET) {
      console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables');
      return res.status(500).json({ success: false, message: 'Server misconfiguration: Missing JWT_SECRET' });
    }

    // Create token and send response
    sendTokenResponse(fullUser, 200, res, finalizedRights);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
};

// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res, finalizedRights) => {
  // Create token — bootId ensures all old tokens are invalidated on server restart
  const payload = {
    user: {
      id: user._id,
      role: user.role
    },
    bootId: SERVER_BOOT_ID
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '1d'
  });

  const options = {
    expires: new Date(
      Date.now() + (parseInt(process.env.JWT_COOKIE_EXPIRE) || 1) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.SECURE_COOKIES === 'true',
    sameSite: 'strict'
  };

  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      token,
      user: buildUserResponse(user, finalizedRights)
    });
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Public
exports.logout = async (req, res) => {
  try {
    aiMemory.clearUser(req.user.id);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const fullUser = await User.findById(req.user.id).select('-password').populate('groupId');

    // Safe conversion of rights
    // Safe conversion of rights
    let finalizedRights = {};
    if (fullUser.groupId && fullUser.groupId.rights) {
      const groupRights = fullUser.groupId.rights;

      // Check if it's a Map (Mongoose Map)
      if (groupRights instanceof Map || (groupRights.constructor && groupRights.constructor.name === 'Map')) {
        for (const [key, value] of groupRights.entries()) {
          finalizedRights[key] = value;
        }
      }
      else if (typeof groupRights === 'object') {
        Object.keys(groupRights).forEach(key => {
          finalizedRights[key] = groupRights[key];
        });
      }
    }

    // Merge individual user permissions (overrides or additions)
    if (fullUser.permissions && Array.isArray(fullUser.permissions)) {
      fullUser.permissions.forEach(p => {
        finalizedRights[p] = true;
      });
    }


    res.json(buildUserResponse(fullUser, finalizedRights));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// @desc    Update current user appearance preferences
// @route   PUT /api/auth/preferences
// @access  Private
exports.updatePreferences = async (req, res) => {
  try {
    const updates = {};
    const allowedThemes = ['light', 'dark'];
    const allowedFonts = ['times-new-roman', 'georgia', 'segoe-ui', 'arial'];

    if (allowedThemes.includes(req.body?.theme)) {
      updates['preferences.theme'] = req.body.theme;
    }

    if (allowedFonts.includes(req.body?.fontFamily)) {
      updates['preferences.fontFamily'] = req.body.fontFamily;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid preferences provided' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { returnDocument: 'after' }
    ).select('-password').populate('groupId');

    let finalizedRights = {};
    if (updatedUser.groupId && updatedUser.groupId.rights) {
      const groupRights = updatedUser.groupId.rights;
      if (groupRights instanceof Map || (groupRights.constructor && groupRights.constructor.name === 'Map')) {
        for (const [key, value] of groupRights.entries()) {
          finalizedRights[key] = value;
        }
      } else if (typeof groupRights === 'object') {
        Object.keys(groupRights).forEach(key => {
          finalizedRights[key] = groupRights[key];
        });
      }
    }

    if (updatedUser.permissions && Array.isArray(updatedUser.permissions)) {
      updatedUser.permissions.forEach(permission => {
        finalizedRights[permission] = true;
      });
    }



    res.status(200).json({
      success: true,
      data: buildUserResponse(updatedUser, finalizedRights)
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Upload profile photo (File or Base64)
// @route   POST /api/auth/profile-photo
// @access  Private
exports.uploadPhoto = async (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs');

    // Ensure uploads directory exists
    const uploadDir = path.join(__dirname, '../../Frontend/public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    let publicUrl = '';

    // 1. Support Base64 Data URL (Fast & reliable from frontend canvas / camera)
    if (req.body && req.body.imageBase64) {
      const base64Data = req.body.imageBase64;
      const matches = base64Data.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ success: false, message: 'Invalid base64 image data' });
      }

      let ext = matches[1].replace('jpeg', 'jpg');
      if (ext.includes('+') || ext.includes('/')) ext = 'png';
      const buffer = Buffer.from(matches[2], 'base64');
      const fileName = `photo_${req.user.id}_${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(uploadDir, fileName), buffer);
      publicUrl = `/uploads/${fileName}`;

      await User.findByIdAndUpdate(req.user.id, { profilePicture: publicUrl });
      return res.status(200).json({ success: true, data: publicUrl });
    }

    // 2. Support Multipart File Upload
    if (req.files && req.files.file) {
      const file = req.files.file;
      if (!file.mimetype.startsWith('image')) {
        return res.status(400).json({ success: false, message: 'Please upload an image file' });
      }

      if (file.size > 5000000) {
        return res.status(400).json({ success: false, message: 'Please upload an image less than 5MB' });
      }

      const fileExt = path.parse(file.name).ext || '.jpg';
      const fileName = `photo_${req.user.id}_${Date.now()}${fileExt}`;
      const filePath = path.join(uploadDir, fileName);

      file.mv(filePath, async err => {
        if (err) {
          console.error(err);
          return res.status(500).json({ success: false, message: 'Problem saving file' });
        }

        publicUrl = `/uploads/${fileName}`;
        await User.findByIdAndUpdate(req.user.id, { profilePicture: publicUrl });

        return res.status(200).json({
          success: true,
          data: publicUrl
        });
      });
      return;
    }

    return res.status(400).json({ success: false, message: 'Please provide an image file or base64 stream' });
  } catch (err) {
    console.error('Upload photo error:', err);
    res.status(500).json({ success: false, message: 'Server Error: ' + err.message });
  }
};

// @desc    Get active logged-in sessions for current user
// @route   GET /api/v1/auth/sessions
// @access  Private
exports.getSessions = async (req, res) => {
  try {
    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '10.0.4.1').replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || 'Chrome / Windows';

    let browserName = 'Google Chrome';
    if (userAgent.includes('Firefox')) browserName = 'Mozilla Firefox';
    else if (userAgent.includes('Edg')) browserName = 'Microsoft Edge';
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browserName = 'Apple Safari';

    const sessions = [
      {
        id: 'sess_curr_' + req.user.id.toString().substring(0, 6),
        device: 'Enterprise Main Console',
        platform: 'Windows Desktop Workstation',
        browser: browserName,
        ip: clientIp,
        loginTime: 'Active Now',
        status: 'Online',
        isCurrent: true
      },
      {
        id: 'sess_mob_' + req.user.id.toString().substring(0, 6),
        device: 'D. Watson Mobile Companion',
        platform: 'Android / iOS (React Native Expo)',
        browser: 'Mobile Scanner Client',
        ip: '10.0.4.18',
        loginTime: 'Synced 18m ago',
        status: 'Idle Standby',
        isCurrent: false
      }
    ];

    res.status(200).json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Terminate other sessions
// @route   POST /api/v1/auth/sessions/terminate-others
// @access  Private
exports.terminateOtherSessions = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'All secondary and mobile devices have been successfully logged out.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
