/**
 * DIAGNOSTIC SCRIPT: Audit Group Permissions & User Access
 * 
 * This script audits existing groups and users to identify permission issues.
 * Run with: node Backend/scripts/audit-group-permissions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');
const User = require('../models/User');

const log = {
  success: (msg) => console.log('\x1b[32m✓\x1b[0m', msg),
  error: (msg) => console.log('\x1b[31m✗\x1b[0m', msg),
  info: (msg) => console.log('\x1b[36mℹ\x1b[0m', msg),
  warn: (msg) => console.log('\x1b[33m⚠\x1b[0m', msg),
  separator: () => console.log('\n' + '='.repeat(70) + '\n')
};

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

async function auditPermissions() {
  try {
    log.info('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    log.success('Connected to MongoDB\n');

    log.separator();
    log.info('AUDIT: GROUP PERMISSIONS & USER ACCESS');
    log.separator();

    // PART 1: Audit Groups
    log.info('PART 1: Auditing Groups');
    log.separator();

    const groups = await Group.find().lean();
    log.info(`Found ${groups.length} groups\n`);

    let groupIssues = 0;

    for (const group of groups) {
      const issues = [];
      let rightsCount = 0;

      if (!group.rights) {
        issues.push('rights field is null/undefined');
      } else if (typeof group.rights === 'object') {
        rightsCount = Object.keys(group.rights).length;
      }

      if (!group.name) {
        issues.push('name is missing');
      }

      if (issues.length === 0) {
        log.success(`[${group.name}]`);
        log.info(`  ID: ${group._id}`);
        log.info(`  Rights: ${rightsCount}`);
        log.info(`  Admin: ${group.isAdmin}`);
      } else {
        log.error(`[${group.name || 'UNNAMED'}]`);
        issues.forEach(issue => log.error(`  ✗ ${issue}`));
        groupIssues++;
      }
    }

    if (groupIssues === 0) {
      log.success(`\n✓ All ${groups.length} groups are valid`);
    } else {
      log.warn(`\n⚠ Found ${groupIssues} groups with issues`);
    }

    log.separator();

    // PART 2: Audit Users
    log.info('PART 2: Auditing Users with Group Assignments');
    log.separator();

    const users = await User.find({ groupId: { $ne: null } }).populate('groupId').lean();
    log.info(`Found ${users.length} users with group assignments\n`);

    let userIssues = 0;

    for (const user of users) {
      const issues = [];

      if (!user.name) issues.push('name missing');
      if (!user.email) issues.push('email missing');
      if (!user.groupId) {
        issues.push('group not found (broken reference)');
      } else if (!user.groupId.rights) {
        issues.push(`group has no rights (group: ${user.groupId.name})`);
      } else {
        const normalizedRights = normalizeRights(user.groupId.rights);
        const rightCount = Object.keys(normalizedRights).length;
        
        if (rightCount === 0) {
          issues.push(`group "${user.groupId.name}" has ZERO rights assigned`);
        }
      }

      if (issues.length === 0) {
        const rightCount = Object.keys(normalizeRights(user.groupId.rights)).length;
        log.success(`[${user.email}]`);
        log.info(`  Name: ${user.name}`);
        log.info(`  Role: ${user.role}`);
        log.info(`  Group: ${user.groupId.name}`);
        log.info(`  Permissions: ${rightCount}`);
        log.info(`  Active: ${user.isActive}`);
      } else {
        log.error(`[${user.email}]`);
        log.info(`  Name: ${user.name}`);
        log.info(`  Role: ${user.role}`);
        issues.forEach(issue => log.error(`  ✗ ${issue}`));
        userIssues++;
      }
    }

    if (userIssues === 0) {
      log.success(`\n✓ All ${users.length} users have valid group assignments`);
    } else {
      log.warn(`\n⚠ Found ${userIssues} users with permission issues`);
    }

    log.separator();

    // PART 3: Sample User Permission Check
    log.info('PART 3: Sample Permission Verification');
    log.separator();

    if (users.length > 0) {
      const testUser = users[0];
      log.info(`Testing user: ${testUser.email}`);
      log.info(`Group: ${testUser.groupId.name}`);

      const userRights = normalizeRights(testUser.groupId.rights);
      const samplePerms = Object.keys(userRights).slice(0, 5);

      log.info(`\nSample permissions assigned to this user:`);
      samplePerms.forEach(perm => {
        log.success(`  • ${perm}`);
      });

      if (Object.keys(userRights).length > 5) {
        log.info(`  ... and ${Object.keys(userRights).length - 5} more`);
      }
    }

    log.separator();

    // RECOMMENDATIONS
    log.info('RECOMMENDATIONS');
    log.separator();

    if (groupIssues > 0) {
      log.warn('Found group configuration issues:');
      log.info('1. Run: node Backend/scripts/create-admin-group.js');
      log.info('2. Manually review groups with missing rights via the API');
    }

    if (userIssues > 0) {
      log.warn('Found user assignment issues:');
      log.info('1. Check users have groupId assigned');
      log.info('2. Check groups have rights defined');
      log.info('3. Reassign users to groups with proper rights');
    }

    if (groupIssues === 0 && userIssues === 0) {
      log.success('✓ No issues found! Permission system appears healthy.');
      log.info('\nNext steps:');
      log.info('1. Run: node Backend/scripts/test-group-permissions.js');
      log.info('2. Test a user login to verify access to screens');
    }

    log.separator();

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    log.error(`FATAL ERROR: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

auditPermissions();
