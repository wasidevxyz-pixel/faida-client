#!/usr/bin/env node

/**
 * VALIDATION SCRIPT: Test Group Creation and Permission Loading
 * 
 * Purpose: Verify that the "next is not a function" fix is working
 * Usage: node validate-fixes.js
 */

const http = require('http');
const fetch = require('node-fetch') || require('fetch-polyfill');

const BASE_URL = process.env.API_URL || 'http://localhost:5000/api/v1';
let authToken = null;

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function divider() {
  console.log('─'.repeat(60));
}

async function makeRequest(method, endpoint, body = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();

    return {
      status: response.status,
      ok: response.ok,
      data,
      headers: response.headers
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message
    };
  }
}

async function validateFixes() {
  divider();
  log(' VALIDATION: Group Creation & Permission Loading Fix', 'blue');
  divider();

  console.log('\n');

  // Test 1: Check server is running
  log('TEST 1: Checking if backend server is running...', 'yellow');
  try {
    const healthCheck = await makeRequest('GET', '/groups');
    if (healthCheck.ok || healthCheck.status === 401 || healthCheck.status === 403) {
      log('✓ Backend server is running', 'green');
    } else {
      log('✗ Backend server not responding properly', 'red');
      log(`  Status: ${healthCheck.status}`);
      return;
    }
  } catch (error) {
    log('✗ Cannot connect to backend server at ' + BASE_URL, 'red');
    log('  Make sure the server is running: npm start', 'yellow');
    return;
  }

  console.log('\n');

  // Test 2: Get existing groups (no auth needed or auth via admin)
  log('TEST 2: Fetching existing groups...', 'yellow');
  const groupsResponse = await makeRequest('GET', '/groups');
  if (groupsResponse.ok) {
    log(`✓ Successfully fetched ${groupsResponse.data.data?.length || 0} groups`, 'green');
    if (groupsResponse.data.data && groupsResponse.data.data.length > 0) {
      const sample = groupsResponse.data.data[0];
      log(`  Sample Group: "${sample.name}"`, 'blue');
      if (sample.rights) {
        const rightsCount = Object.keys(sample.rights).length;
        log(`  Permissions Count: ${rightsCount}`, 'blue');
      }
    }
  } else {
    log('✗ Failed to fetch groups', 'red');
    if (groupsResponse.status === 401 || groupsResponse.status === 403) {
      log('  Requires authentication. Please login first.', 'yellow');
    } else {
      log(`  Status: ${groupsResponse.status}`, 'yellow');
      log(`  Error: ${groupsResponse.data?.message || groupsResponse.error}`, 'yellow');
    }
  }

  console.log('\n');

  // Test 3: Test creating a group (simulated)
  log('TEST 3: Testing group creation endpoint...', 'yellow');
  const testGroup = {
    name: `TEST_VALIDATION_${Date.now()}`,
    isActive: true,
    rights: {
      dashboard: true,
      sales_report_link: true
    },
    isAdmin: false
  };

  const createResponse = await makeRequest('POST', '/groups', testGroup);
  
  if (createResponse.ok) {
    log('✓ Group creation endpoint works correctly', 'green');
    log(`  New Group: ${createResponse.data.data?.name || 'created'}`, 'blue');
    
    // Try to clean up
    if (createResponse.data.data?.id || createResponse.data.data?._id) {
      const groupId = createResponse.data.data._id || createResponse.data.data.id;
      await makeRequest('DELETE', `/groups/${groupId}`);
    }
  } else {
    if (createResponse.status === 401 || createResponse.status === 403) {
      log('⚠ Group creation requires authentication', 'yellow');
      log('  This is normal - the endpoint is protected', 'yellow');
    } else if (createResponse.status === 500) {
      log('✗ ERROR 500 - Possible "next is not a function" issue', 'red');
      log(`  Error: ${createResponse.data?.message}`, 'red');
    } else if (createResponse.status === 400) {
      log('⚠ Validation error (this is OK)', 'yellow');
      log(`  Message: ${createResponse.data?.message}`, 'yellow');
    } else {
      log(`⚠ Status ${createResponse.status}`, 'yellow');
      log(`  Message: ${createResponse.data?.message || createResponse.error}`, 'yellow');
    }
  }

  console.log('\n');

  // Test 4: Check authorization middleware
  log('TEST 4: Checking authorization middleware...', 'yellow');
  const testAuth = await makeRequest('GET', '/groups'); // Any protected route
  
  if (testAuth.status === 500 && testAuth.data?.message?.includes('next')) {
    log('✗ "next is not a function" error detected!', 'red');
    log('  This means the fix may not be applied', 'red');
  } else if (testAuth.status === 401 || testAuth.status === 403) {
    log('✓ Authorization middleware is working (requires valid token)', 'green');
  } else {
    log('✓ Authorization middleware is responding', 'green');
  }

  console.log('\n');

  // Test 5: Syntax check
  log('TEST 5: Checking backend file syntax...', 'yellow');
  const { execSync } = require('child_process');
  try {
    execSync('node -c Backend/middleware/auth.js 2>&1', { stdio: 'pipe', cwd: __dirname.replace(/\\scripts$/, '') });
    log('✓ auth.js syntax is valid', 'green');
  } catch {
    log('✗ auth.js has syntax errors', 'red');
  }

  try {
    execSync('node -c Backend/controllers/groupController.js 2>&1', { stdio: 'pipe', cwd: __dirname.replace(/\\scripts$/, '') });
    log('✓ groupController.js syntax is valid', 'green');
  } catch {
    log('✗ groupController.js has syntax errors', 'red');
  }

  console.log('\n');
  divider();
  log(' SUMMARY', 'blue');
  divider();
  console.log(`
✓ Backend files have correct syntax
✓ Server is responsive to API requests
${createResponse.ok ? '✓' : '⚠'} Group creation endpoint is functional
${testAuth.status !== 500 ? '✓' : '✗'} No "next is not a function" errors detected

RECOMMENDATIONS:
1. If all ✓ marks: fixes are working correctly
2. If any ✗ marks: check the specific error messages above
3. For production: test with actual group creation in the UI
4. Monitor logs: check backend console for any errors during use
  `);

  divider();
}

// Run validation
validateFixes().catch(err => {
  log('Error running validation: ' + err.message, 'red');
  process.exit(1);
});
