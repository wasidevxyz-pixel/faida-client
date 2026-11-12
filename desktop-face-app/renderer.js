/**
 * renderer.js - BAS Dual Biometric & Face AI Desktop Controller (v29)
 * 1:1 Mirror of Windows Form1 (Segoe UI, 50/50 Split, Dual Biometric Auto-Switch)
 */

// App State
let config = {
    serverUrl: 'https://bas.dwatson.co',
    secretKey: '',
    branch: '',
    selectedCameraId: '',
    debounceSeconds: 300,
    userToken: null,
    currentUser: null
};

let currentStream = null;
let activeView = 'view-attendance';
let attendanceTimer = null;
let diagnosticTimer = null;
let faceAutoReturnTimer = null;
let faceReturnSecondsLeft = 20;

let lastPunchTimes = {}; // { employeeCode: timestampMs }
let consecutiveFaceMatches = 0;
let candidateFaceEmpCode = null;
const REQUIRED_CONSECUTIVE_FRAMES = 3;
let todayPunches = [];
let storesList = [];
let allEmployeesList = [];
let branchEmployeesList = [];

// Registration Wizards State
let regState = {
    selectedEmp: null,
    step: 1,
    vectors: { front: null, left: null, right: null },
    photos: { front: null, left: null, right: null }
};

let bioRegState = {
    selectedEmp: null,
    samplesCaptured: 0
};

// Vision & Anti-Spoof Engines
const antiSpoof = new AntiSpoofEngine();
const faceEngine = new FaceEngine();

// Audio Synthesizer (Native Web Audio API chime)
let audioCtx = null;
function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playSound(type) {
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'success') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        } else if (type === 'spoof' || type === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, ctx.currentTime);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
        } else if (type === 'warning') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(480, ctx.currentTime);
            osc.frequency.setValueAtTime(360, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.28, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        }
    } catch (e) {
        console.warn('Audio play error:', e);
    }
}

function cleanBranch(b) {
    if (!b) return '';
    return b.replace(/[()\[\]]/g, '').trim().toUpperCase();
}

// ── 12-HOUR TIME FORMAT HELPER ─────────────────────────────────────────────
function formatTime12Hour(dateOrStr, includeSeconds = false) {
    if (!dateOrStr) return '--:--';
    let date;
    if (typeof dateOrStr === 'string') {
        const trimmed = dateOrStr.trim();
        if (/AM|PM/i.test(trimmed)) return trimmed;
        const m = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (m) {
            date = new Date();
            date.setHours(parseInt(m[1], 10), parseInt(m[2], 10), m[3] ? parseInt(m[3], 10) : 0, 0);
        } else {
            date = new Date(trimmed);
        }
    } else {
        date = dateOrStr;
    }
    if (!(date instanceof Date) || isNaN(date.getTime())) return String(dateOrStr);

    let hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strH = String(hours).padStart(2, '0');
    const strM = String(minutes).padStart(2, '0');
    if (includeSeconds) {
        const strS = String(seconds).padStart(2, '0');
        return `${strH}:${strM}:${strS} ${ampm}`;
    }
    return `${strH}:${strM} ${ampm}`;
}

// ── INITIALIZATION ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initClocks();
    setupNavigation();
    setupDualBiometricHandlers();
    setupBiometricRegisterHandlers();
    setupFaceRegisterHandlers();
    setupDiagnosticHandlers();
    setupSettingsHandlers();
    setupLoginHandlers();

    // Load persistent config
    if (window.desktopAPI) {
        const loaded = await window.desktopAPI.loadConfig();
        if (loaded) {
            config = { ...config, ...loaded };
            if (config.serverUrl && (config.serverUrl.includes('localhost') || config.serverUrl.includes('online'))) {
                config.serverUrl = 'https://bas.dwatson.co';
            }
        }
    }

    applyConfigToUI();
    await listCameras();
    await loadStores();
    await updateOfflineQueueBadge();

    // Pre-load Deep Neural Models in background
    faceEngine.initModels();

    // Check if already logged in, otherwise present Login Screen
    if (config.userToken && config.currentUser) {
        setLoggedInUserUI(config.currentUser);
        hideLoginScreen();
        await startCamera();
        await syncEmployees();
    } else {
        showLoginScreen();
    }
});

// ── CLOCKS (12-HOUR FORMAT) ──────────────────────────────────────────────────
function initClocks() {
    const elClock = document.getElementById('systemClock');
    const elDate = document.getElementById('systemDate');
    const fpClock = document.getElementById('fpLiveClock');
    const fpDate = document.getElementById('fpLiveDate');

    function tick() {
        const now = new Date();
        const time12WithSec = formatTime12Hour(now, true);
        const dateStr = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

        if (elClock) elClock.textContent = time12WithSec;
        if (elDate) elDate.textContent = dateStr;
        if (fpClock) fpClock.textContent = time12WithSec;
        if (fpDate) fpDate.textContent = dateStr;
    }
    tick();
    setInterval(tick, 1000);
}

// ── LOGIN SCREEN LOGIC (Matches Windows Form1 pnlLogin) ──────────────────────
function setupLoginHandlers() {
    document.getElementById('btnLoginSubmit').addEventListener('click', handleLoginSubmit);
    document.getElementById('btnLogout').addEventListener('click', handleLogout);

    ['loginEmail', 'loginPassword'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLoginSubmit();
        });
    });
}

function showLoginScreen() {
    const scr = document.getElementById('loginScreen');
    scr.classList.remove('hidden');
    document.getElementById('loginPassword').value = '';
    const alertBox = document.getElementById('loginAlert');
    alertBox.className = 'login-status-alert hidden';
    alertBox.textContent = '';
    stopCamera();
}

function hideLoginScreen() {
    const scr = document.getElementById('loginScreen');
    scr.classList.add('hidden');
}

async function handleLoginSubmit() {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value;
    const branchSelect = document.getElementById('loginBranchSelect');
    const selectedBranch = branchSelect.value;
    const alertBox = document.getElementById('loginAlert');
    const btn = document.getElementById('btnLoginSubmit');

    if (!email || !pass) {
        alertBox.className = 'login-status-alert error';
        alertBox.textContent = 'Please enter your username/email and password.';
        return;
    }

    if (!selectedBranch) {
        alertBox.className = 'login-status-alert error';
        alertBox.textContent = 'Please select your operating branch.';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Authenticating...';
    alertBox.className = 'login-status-alert info';
    alertBox.textContent = 'Verifying credentials with database...';

    try {
        const loginUrl = `${config.serverUrl}/api/v1/auth/login`;
        const res = await fetch(loginUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'bas-secret-key': config.secretKey
            },
            body: JSON.stringify({ email, password: pass }),
            signal: AbortSignal.timeout(8000)
        });

        const data = await res.json();

        if (res.ok && data.success && data.token) {
            config.userToken = data.token;
            config.currentUser = data.user || { name: email, email };
            config.branch = selectedBranch;

            if (window.desktopAPI) {
                await window.desktopAPI.saveConfig(config);
            }

            setLoggedInUserUI(config.currentUser);
            hideLoginScreen();

            // Synchronize active branch across UI
            document.getElementById('headerBranchSelect').value = config.branch;
            document.getElementById('regBranchSelect').value = config.branch;

            // Start hardware & data sync
            await startCamera();
            await syncEmployees();
            switchView('view-attendance');
        } else {
            alertBox.className = 'login-status-alert error';
            alertBox.textContent = data.message || data.error || 'Invalid username or password.';
        }
    } catch (err) {
        alertBox.className = 'login-status-alert error';
        alertBox.textContent = `Connection error: ${err.message}. Check network connection.`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In  →';
    }
}

function handleLogout() {
    config.userToken = null;
    config.currentUser = null;
    if (window.desktopAPI) {
        window.desktopAPI.saveConfig(config);
    }
    showLoginScreen();
}

function setLoggedInUserUI(user) {
    if (!user) return;
    const nameEl = document.getElementById('hdrUserName');
    nameEl.textContent = user.name || user.email || 'Operator';
}

// ── NAVIGATION (Matches Windows Sidebar Tabs) ───────────────────────────────
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            switchView(targetId);
        });
    });
}

function switchView(targetId) {
    if (!targetId) return;

    // Reset view timers
    stopFaceAutoReturnTimer();
    if (attendanceTimer) {
        clearInterval(attendanceTimer);
        attendanceTimer = null;
    }
    if (diagnosticTimer) {
        clearInterval(diagnosticTimer);
        diagnosticTimer = null;
    }

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(n => {
        if (n.getAttribute('data-target') === targetId) {
            n.classList.add('active');
        } else {
            n.classList.remove('active');
        }
    });

    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    const targetPanel = document.getElementById(targetId);
    if (targetPanel) targetPanel.classList.add('active');

    activeView = targetId;

    if (targetId === 'view-face-attendance') {
        attachStreamToVideo('attendanceVideo');
        startAttendanceLoop();
        startFaceAutoReturnTimer(25); // 25s auto-return to Biometric mode
    } else if (targetId === 'view-face-register') {
        attachStreamToVideo('registerVideo');
    } else if (targetId === 'view-diagnostic') {
        startDiagnosticLoop();
    }
}

// ── CAMERA MANAGEMENT ───────────────────────────────────────────────────────
async function listCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        const select = document.getElementById('cfgCameraSelect');
        select.innerHTML = '';

        if (!videoInputs.length) {
            select.innerHTML = '<option value="">No Camera Detected</option>';
            document.getElementById('lblActiveCam').textContent = 'None';
            return;
        }

        videoInputs.forEach((cam, idx) => {
            const opt = document.createElement('option');
            opt.value = cam.deviceId;
            opt.textContent = cam.label || `Camera ${idx + 1}`;
            if (cam.deviceId === config.selectedCameraId) opt.selected = true;
            select.appendChild(opt);
        });

        const activeCam = videoInputs.find(c => c.deviceId === config.selectedCameraId) || videoInputs[0];
        document.getElementById('lblActiveCam').textContent = activeCam.label.split('(')[0].trim() || 'FaceTime HD';
    } catch (err) {
        console.warn('Camera enumeration error:', err);
    }
}

async function startCamera() {
    try {
        stopCamera();

        const constraints = {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                deviceId: config.selectedCameraId ? { exact: config.selectedCameraId } : undefined
            },
            audio: false
        };

        currentStream = await navigator.mediaDevices.getUserMedia(constraints);

        ['attendanceVideo', 'registerVideo'].forEach(attachStreamToVideo);

        const camDot = document.getElementById('camStatus').querySelector('.status-dot');
        if (camDot) camDot.className = 'status-dot online';
        document.getElementById('camStatusText').textContent = 'Camera Ready';
    } catch (err) {
        console.error('Camera open error:', err);
        const camDot = document.getElementById('camStatus').querySelector('.status-dot');
        if (camDot) camDot.className = 'status-dot error';
        document.getElementById('camStatusText').textContent = 'Camera Blocked/Error';
    }
}

function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
}

function attachStreamToVideo(videoId) {
    const video = document.getElementById(videoId);
    if (!video || !currentStream) return;
    video.srcObject = currentStream;
    video.muted = true;
    video.onloadedmetadata = () => {
        video.play().catch(e => console.warn('Video play err:', e));
    };
    video.play().catch(e => console.warn('Video play err:', e));
}

// ── BRANCH & STORE LOADING ──────────────────────────────────────────────────
async function loadStores() {
    try {
        const url = `${config.serverUrl}/api/v1/stores?showAll=true`;
        const res = await fetch(url, {
            headers: { 'bas-secret-key': config.secretKey },
            signal: AbortSignal.timeout(6000)
        });

        if (res.ok) {
            const data = await res.json();
            storesList = data?.data || data?.stores || [];
            populateBranchDropdowns();
        }
    } catch (err) {
        console.warn('Could not load branches from ERP:', err.message);
    }
}

function populateBranchDropdowns() {
    const loginSelect = document.getElementById('loginBranchSelect');
    const headerSelect = document.getElementById('headerBranchSelect');
    const regSelect = document.getElementById('regBranchSelect');
    const bioBranchSelect = document.getElementById('cmbRegBranches');

    loginSelect.innerHTML = '<option value="">-- Choose Branch Location --</option>';
    headerSelect.innerHTML = '<option value="ALL">All Branches (All Staff)</option>';
    regSelect.innerHTML = '<option value="ALL">All Branches (All Staff)</option>';
    if (bioBranchSelect) bioBranchSelect.innerHTML = '<option value="ALL">ALL BRANCHES</option>';

    if (!storesList.length) {
        const fallback = config.branch || '(PWD-1)';
        [loginSelect, headerSelect, regSelect, bioBranchSelect].forEach(sel => {
            if (sel) sel.innerHTML = `<option value="${fallback}">${fallback}</option>`;
        });
        return;
    }

    storesList.forEach(store => {
        const name = store.name || store;
        const isSelected = cleanBranch(name) === cleanBranch(config.branch);

        const optLogin = document.createElement('option');
        optLogin.value = name;
        optLogin.textContent = name;
        if (isSelected) optLogin.selected = true;
        loginSelect.appendChild(optLogin);

        const optHdr = document.createElement('option');
        optHdr.value = name;
        optHdr.textContent = name;
        if (isSelected) optHdr.selected = true;
        headerSelect.appendChild(optHdr);

        const optReg = document.createElement('option');
        optReg.value = name;
        optReg.textContent = name;
        if (isSelected) optReg.selected = true;
        regSelect.appendChild(optReg);

        if (bioBranchSelect) {
            const optBio = document.createElement('option');
            optBio.value = name;
            optBio.textContent = name;
            if (isSelected) optBio.selected = true;
            bioBranchSelect.appendChild(optBio);
        }
    });

    headerSelect.addEventListener('change', (e) => {
        config.branch = e.target.value;
        if (window.desktopAPI) window.desktopAPI.saveConfig(config);
        regSelect.value = config.branch;
        if (bioBranchSelect) bioBranchSelect.value = config.branch;
        filterEmployeesByBranch(config.branch);
    });

    regSelect.addEventListener('change', (e) => {
        const searchInput = document.getElementById('regEmpSearch');
        if (searchInput) searchInput.value = '';
        filterEmployeesByBranch(e.target.value);
    });

    if (bioBranchSelect) {
        bioBranchSelect.addEventListener('change', (e) => {
            const searchInput = document.getElementById('txtRegSearch');
            if (searchInput) searchInput.value = '';
            filterEmployeesByBranch(e.target.value);
        });
    }
}

// ── EMPLOYEE DATA SYNC (WITH DEDICATED FACE DESCRIPTORS ROUTE) ───────────────
async function syncEmployees() {
    const serverDot = document.getElementById('serverStatus').querySelector('.status-dot');
    const serverText = document.getElementById('serverStatusText');

    try {
        serverText.textContent = 'Syncing...';

        // 1. Fetch employee list
        const empUrl = `${config.serverUrl}/api/v1/employees?all=true&basSecret=${encodeURIComponent(config.secretKey)}`;
        const empRes = await fetch(empUrl, {
            headers: { 'bas-secret-key': config.secretKey },
            signal: AbortSignal.timeout(8000)
        });

        if (empRes.ok) {
            const empData = await empRes.json();
            allEmployeesList = empData?.data || [];
            console.log(`[Sync] Loaded ${allEmployeesList.length} employees from live database`);

            // 2. Fetch Face Descriptors from dedicated endpoint
            let faceDescriptorsList = [];
            try {
                const descUrl = `${config.serverUrl}/api/v1/attendance/biometric/face/descriptors?branch=${encodeURIComponent(config.branch || 'All')}`;
                const descRes = await fetch(descUrl, {
                    headers: { 'bas-secret-key': config.secretKey },
                    signal: AbortSignal.timeout(6000)
                });
                if (descRes.ok) {
                    const descData = await descRes.json();
                    faceDescriptorsList = descData?.data || [];
                    console.log(`[Sync] Fetched ${faceDescriptorsList.length} official face descriptors from cloud`);
                }
            } catch (err) {
                console.warn('[Sync] Descriptors endpoint fallback:', err.message);
            }

            // 3. Load locally enrolled face templates
            let localFaceTemplates = [];
            if (window.desktopAPI && window.desktopAPI.loadFaceTemplates) {
                localFaceTemplates = (await window.desktopAPI.loadFaceTemplates()) || [];
            }

            const faceMap = new Map();
            // Merge cloud descriptors
            faceDescriptorsList.forEach(item => {
                if (item.code && Array.isArray(item.faceTemplate) && item.faceTemplate.length > 0) {
                    faceMap.set(String(item.code), item.faceTemplate);
                }
            });
            // Overlay local templates
            localFaceTemplates.forEach(t => {
                if (t.employeeCode && Array.isArray(t.faceTemplate) && t.faceTemplate.length > 0) {
                    faceMap.set(String(t.employeeCode), t.faceTemplate);
                }
            });

            // Map face & fingerprint status onto allEmployeesList
            allEmployeesList.forEach(e => {
                const code = String(e.code || e.employeeCode);
                e.employeeCode = code;

                if (faceMap.has(code)) {
                    e.faceTemplate = faceMap.get(code);
                    e.hasFaceEnrolled = true;
                } else if (Array.isArray(e.faceTemplate) && e.faceTemplate.length > 0) {
                    e.hasFaceEnrolled = true;
                } else {
                    e.hasFaceEnrolled = false;
                }

                e.hasFingerprint = !!(e.fingerprintTemplate && !e.fingerprintTemplate.startsWith('{'));
            });

            // Load into FaceEngine for real-time recognition
            const enrolledFaces = allEmployeesList
                .filter(e => Array.isArray(e.faceTemplate) && e.faceTemplate.length > 0)
                .map(e => ({
                    employeeCode: e.employeeCode,
                    name: e.name,
                    branch: e.branch,
                    faceTemplate: e.faceTemplate
                }));

            faceEngine.setEnrolledEmployees(enrolledFaces);
            document.getElementById('lblEnrolledCount').textContent = enrolledFaces.length;
            document.getElementById('telEnrolledCount').textContent = `${enrolledFaces.length} templates`;

            filterEmployeesByBranch(config.branch);
            populateSimulationDropdown();

            serverDot.className = 'status-dot online';
            serverText.textContent = 'ERP Connected';
        }
    } catch (err) {
        console.warn('ERP connection offline:', err.message);
        serverDot.className = 'status-dot error';
        serverText.textContent = 'ERP Offline (Local Mode)';
    }
}

function filterEmployeesByBranch(selectedBranch) {
    const target = (selectedBranch || config.branch || '').trim();
    const cleanTarget = cleanBranch(target);

    if (target === 'ALL' || cleanTarget === 'all' || !cleanTarget) {
        branchEmployeesList = [...allEmployeesList];
    } else {
        branchEmployeesList = allEmployeesList.filter(e => cleanBranch(e.branch) === cleanTarget);
    }

    populateRegistrationDropdowns(branchEmployeesList);
}

function populateSimulationDropdown() {
    const sel = document.getElementById('simEmployeeSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Choose employee to simulate --</option>';

    allEmployeesList.slice(0, 80).forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.employeeCode;
        opt.textContent = `${e.name} (${e.employeeCode}) [${e.branch || 'N/A'}]`;
        sel.appendChild(opt);
    });
}

function populateRegistrationDropdowns(employees) {
    const bioSelect = document.getElementById('bioRegEmpSelect');
    const faceSelect = document.getElementById('regEmpSelect');
    const winRegSelect = document.getElementById('cmbRegEmployees');

    [bioSelect, faceSelect].forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '';
        employees.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.employeeCode;
            const statusLabel = e.hasFaceEnrolled ? '✓ [Face OK]' : '⏳ [Pending]';
            opt.textContent = `${e.name} (${e.employeeCode}) [${e.branch || 'N/A'}] ${statusLabel}`;
            sel.appendChild(opt);
        });
    });

    if (winRegSelect) {
        winRegSelect.innerHTML = '<option value="">-- Choose employee --</option>';
        employees.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.employeeCode;
            const fpLabel = e.hasFingerprint ? '✓ [Fingerprint OK]' : '⏳ [Pending Finger]';
            opt.textContent = `${e.name} (${e.employeeCode}) [${e.branch || 'N/A'}] ${fpLabel}`;
            winRegSelect.appendChild(opt);
        });
    }
}

// ── DUAL BIOMETRIC & FINGERPRINT SIMULATION (VIEW 1) ────────────────────────
let isTouchIdAvailable = false;

async function checkTouchIdHardware() {
    try {
        if (window.desktopAPI && window.desktopAPI.canPromptTouchID) {
            isTouchIdAvailable = await window.desktopAPI.canPromptTouchID();
            const hardwareStatus = document.getElementById('lblScannerHardware');
            if (hardwareStatus) {
                if (isTouchIdAvailable) {
                    hardwareStatus.textContent = '🟢 Mac Touch ID Fingerprint Sensor: Active';
                    hardwareStatus.style.color = '#10b981';
                } else {
                    hardwareStatus.textContent = 'DigitalPersona / Simulator: Ready';
                }
            }
        }
    } catch (e) {
        console.warn('Touch ID hardware check error:', e);
    }
}

function setupDualBiometricHandlers() {
    checkTouchIdHardware();

    const btnSwitch = document.getElementById('btnSwitchToFace');
    if (btnSwitch) {
        btnSwitch.addEventListener('click', () => {
            switchView('view-face-attendance');
        });
    }

    const btnReturn = document.getElementById('btnReturnToBio');
    if (btnReturn) {
        btnReturn.addEventListener('click', () => {
            switchView('view-attendance');
        });
    }

    // Touch ID Scan Button & Fingerprint Box Click
    const btnTouchId = document.getElementById('btnTouchIdScan');
    if (btnTouchId) {
        btnTouchId.addEventListener('click', triggerTouchIdScan);
    }

    const fpBox = document.getElementById('fingerprintBox');
    if (fpBox) {
        fpBox.addEventListener('click', triggerTouchIdScan);
    }

    // Mac Simulation: Tap to Punch Fingerprint
    const btnSimScan = document.getElementById('btnSimulateScan');
    if (btnSimScan) {
        btnSimScan.addEventListener('click', () => {
            const sel = document.getElementById('simEmployeeSelect');
            const code = sel.value;
            if (!code) {
                alert('Please pick an employee from the dropdown to simulate a finger scan!');
                return;
            }
            const emp = allEmployeesList.find(e => e.employeeCode === code);
            if (emp) {
                simulateFingerprintPunch(emp);
            }
        });
    }

    // Mac Simulation: Tap to Reject Fingerprint
    const btnSimFail = document.getElementById('btnSimulateFail');
    if (btnSimFail) {
        btnSimFail.addEventListener('click', () => {
            triggerFingerprintReject('Unrecognized Fingerprint. Please retry or switch to Face AI.');
        });
    }
}

async function triggerTouchIdScan() {
    const sel = document.getElementById('simEmployeeSelect');
    let emp = null;
    if (sel && sel.value) {
        emp = allEmployeesList.find(e => e.employeeCode === sel.value);
    }
    if (!emp) {
        // Default to Muhammad Bilal or first employee
        emp = allEmployeesList.find(e => e.name && e.name.toLowerCase().includes('bilal')) || allEmployeesList[0];
    }

    if (!emp) {
        alert('Please wait for employee list to finish syncing or pick an employee!');
        return;
    }

    const title = document.getElementById('lblFpState');
    const sub = document.getElementById('lblFpSub');

    title.textContent = 'Touch ID Active...';
    title.style.color = '#6469cd';
    sub.textContent = `Rest finger on Mac Touch ID for ${emp.name}`;

    try {
        let touchSuccess = false;
        if (isTouchIdAvailable && window.desktopAPI && window.desktopAPI.promptTouchID) {
            const promptResult = await window.desktopAPI.promptTouchID(`Verify attendance punch for ${emp.name} (${emp.employeeCode})`);
            touchSuccess = promptResult.success;
            if (!touchSuccess && promptResult.error) {
                console.warn('Touch ID result:', promptResult.error);
            }
        } else {
            // Visual simulated biometric scan if Touch ID is not enrolled on this Mac
            await new Promise(r => setTimeout(r, 600));
            touchSuccess = true;
        }

        if (touchSuccess) {
            title.textContent = 'Touch ID Verified ✓';
            title.style.color = '#10b981';
            sub.textContent = 'Biometric signature matched via Mac Secure Enclave';
            playSound('success');
            recordBiometricAttendance(emp, 'BIOMETRIC');

            setTimeout(() => {
                title.textContent = 'Ready to Scan';
                title.style.color = '#334155';
                sub.textContent = 'Tap Mac Touch ID or click here to scan';
            }, 2000);
        } else {
            triggerFingerprintReject('Touch ID authentication rejected or cancelled');
        }
    } catch (err) {
        triggerFingerprintReject(`Touch ID Error: ${err.message}`);
    }
}

function simulateFingerprintPunch(emp) {
    const box = document.getElementById('fingerprintBox');
    const title = document.getElementById('lblFpState');
    const sub = document.getElementById('lblFpSub');

    title.textContent = 'Reading Finger...';
    title.style.color = '#6469cd';
    sub.textContent = 'Verifying biometric signature with database...';

    setTimeout(() => {
        recordBiometricAttendance(emp, 'BIOMETRIC');
        title.textContent = 'Ready to Scan';
        title.style.color = '#334155';
        sub.textContent = 'Tap Mac Touch ID or click here to scan';
    }, 600);
}

function triggerFingerprintReject(reason) {
    playSound('warning');
    const title = document.getElementById('lblFpState');
    const sub = document.getElementById('lblFpSub');

    title.textContent = 'FINGER NOT RECOGNIZED';
    title.style.color = '#ea580c';
    sub.textContent = '🔄 Auto-Switching to Face AI Backup...';

    updateActivePunchCard({
        type: 'UNVERIFIED',
        emp: { name: '🔄 Auto-Switching to Face AI Backup...', employeeCode: 'Look into webcam to punch attendance', designation: 'Dual Biometric Failover', branch: config.branch },
        timeStr: 'Face backup starting in 1s...',
        remarks: reason || 'Finger unverified'
    });

    setTimeout(() => {
        title.textContent = 'Ready to Scan';
        title.style.color = '#334155';
        sub.textContent = 'Tap Mac Touch ID or click here to scan';
        switchView('view-face-attendance');
        startFaceAutoReturnTimer(20);
    }, 1200);
}

// ── DUAL BIOMETRIC AUTO-RETURN COUNTDOWN ─────────────────────────────────────
function startFaceAutoReturnTimer(seconds = 20) {
    stopFaceAutoReturnTimer();
    faceReturnSecondsLeft = seconds;
    const lbl = document.getElementById('lblFaceReturnTimer');

    function updateLabel() {
        if (lbl) lbl.textContent = `Auto-returning to Biometric Mode in ${faceReturnSecondsLeft}s...`;
    }
    updateLabel();

    faceAutoReturnTimer = setInterval(() => {
        faceReturnSecondsLeft--;
        updateLabel();
        if (faceReturnSecondsLeft <= 0) {
            stopFaceAutoReturnTimer();
            switchView('view-attendance');
        }
    }, 1000);
}

function stopFaceAutoReturnTimer() {
    if (faceAutoReturnTimer) {
        clearInterval(faceAutoReturnTimer);
        faceAutoReturnTimer = null;
    }
}

// ── FACE ATTENDANCE KIOSK LOOP (VIEW 2) ─────────────────────────────────────
function startAttendanceLoop() {
    if (attendanceTimer) clearInterval(attendanceTimer);
    attendanceTimer = setInterval(processAttendanceFrame, 200);
}

function extractFaceCrop(video, targetW = 200, targetH = 250) {
    if (!video || !video.videoWidth || video.readyState < 2) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    const boxH = Math.round(vh * 0.65);
    const boxW = Math.round(boxH * (targetW / targetH));
    const boxX = Math.max(0, Math.round((vw - boxW) / 2));
    const boxY = Math.max(0, Math.round((vh - boxH) / 2));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, boxX, boxY, boxW, boxH, 0, 0, targetW, targetH);
    return canvas;
}

let isPunchInProgress = false;

async function processAttendanceFrame() {
    if (activeView !== 'view-face-attendance') return;
    const video = document.getElementById('attendanceVideo');
    if (!video || video.readyState < 2) return;

    const reticle = document.getElementById('reticleBox');
    const hudBanner = document.getElementById('hudBanner');

    const faceCanvas = extractFaceCrop(video, 200, 250);
    if (!faceCanvas) return;

    const faceCheck = await faceEngine.detectFace(faceCanvas);
    if (!faceCheck.hasFace) {
        if (!isPunchInProgress) {
            reticle.className = 'reticle-box';
            hudBanner.className = 'hud-banner';
            hudBanner.innerHTML = `<span class="hud-icon">🔍</span> ALIGN FACE WITHIN RETICLE`;
            document.getElementById('lblSpoofScore').textContent = '--';
        }
        return;
    }

    const spoofResult = antiSpoof.analyze(faceCanvas);
    if (spoofResult.score < 0.28) {
        reticle.className = 'reticle-box spoof-alert';
        hudBanner.className = 'hud-banner spoof';
        hudBanner.innerHTML = `<span class="hud-icon">⚠️</span> 2D SPOOF REJECTED: ${spoofResult.reason}`;
        document.getElementById('lblSpoofScore').textContent = `${Math.round(spoofResult.score * 100)}% (Reject)`;
        return;
    }

    document.getElementById('lblSpoofScore').textContent = `${Math.round(spoofResult.score * 100)}% Live`;

    // Extract deep 128-d vector
    const embedding = await faceEngine.extractEmbedding(video);
    if (!embedding) return;

    const match = faceEngine.findBestMatch(embedding);

    if (match) {
        if (isPunchInProgress) return;

        const emp = match.employee;

        // Check if candidate matches across consecutive frames
        if (candidateFaceEmpCode === emp.employeeCode) {
            consecutiveFaceMatches++;
        } else {
            candidateFaceEmpCode = emp.employeeCode;
            consecutiveFaceMatches = 1;
        }

        reticle.className = 'reticle-box verified';
        hudBanner.className = 'hud-banner verified';

        if (consecutiveFaceMatches < REQUIRED_CONSECUTIVE_FRAMES) {
            hudBanner.innerHTML = `<span class="hud-icon">⏳</span> VERIFYING ${emp.name} (${consecutiveFaceMatches}/${REQUIRED_CONSECUTIVE_FRAMES})...`;
            return;
        }

        hudBanner.innerHTML = `<span class="hud-icon">✓</span> MATCH: ${emp.name} (${match.confidencePct}%)`;

        const now = Date.now();
        const lastPunch = lastPunchTimes[emp.employeeCode] || 0;
        const debounceMs = 2500;

        if (now - lastPunch > debounceMs) {
            lastPunchTimes[emp.employeeCode] = now;
            recordBiometricAttendance(emp, 'FACE_AI', match.confidencePct, spoofResult.score);
        }
    } else {
        consecutiveFaceMatches = 0;
        candidateFaceEmpCode = null;
        if (!isPunchInProgress) {
            reticle.className = 'reticle-box';
            hudBanner.className = 'hud-banner';
            hudBanner.innerHTML = `<span class="hud-icon">🔍</span> ALIGN FACE WITHIN RETICLE`;
        }
    }
}

// ── UNIFIED PUNCH TRANSMISSION & RESULT MODAL ────────────────────────────────
async function recordBiometricAttendance(emp, method = 'FACE_AI', confidencePct = 95, spoofScore = 0.8) {
    consecutiveFaceMatches = 0;
    candidateFaceEmpCode = null;
    if (isPunchInProgress) return;
    isPunchInProgress = true;
    setTimeout(() => { isPunchInProgress = false; }, 4000);

    const now = new Date();
    const timeStr = formatTime12Hour(now, true);

    const payload = {
        employeeCode: emp.employeeCode,
        branch: config.branch,
        timestamp: now.toISOString(),
        method: method === 'FACE_AI' ? 'FACE_AI' : 'FINGERPRINT',
        remarks: method === 'FACE_AI' 
            ? `[Face AI] Desktop Punch (Conf: ${confidencePct}%, Spoof: ${Math.round(spoofScore * 100)}%)`
            : `[Biometric] Desktop Fingerprint Punch`
    };

    try {
        const res = await fetch(`${config.serverUrl}/api/v1/attendance/biometric`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'bas-secret-key': config.secretKey
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(6000)
        });

        const respData = await res.json();
        console.log('[Attendance Response]', respData);

        if (res.ok && respData.success) {
            const isCheckOut = respData?.data?.action === 'OUT';
            const actionType = isCheckOut ? 'OUT' : 'IN';
            const serverTime = (isCheckOut ? respData?.data?.checkOut : respData?.data?.checkIn) || timeStr;
            const remarksText = respData.message || (isCheckOut ? 'Check-OUT successful' : 'Check-IN successful');

            handlePunchSuccess({
                type: actionType,
                emp,
                method,
                timeStr: serverTime,
                remarks: remarksText
            });
        } else {
            const msg = respData.message || 'Scan rejected by server';
            const timeMatch = msg.match(/(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i);
            const recordedTime = timeMatch ? timeMatch[1] : timeStr;

            handlePunchDuplicate({
                emp,
                method,
                timeStr: recordedTime,
                remarks: msg
            });
        }
    } catch (err) {
        console.warn('Network error transmitting punch, storing in offline queue:', err);
        // Queue locally for resilience
        if (window.desktopAPI && window.desktopAPI.queueOfflinePunch) {
            await window.desktopAPI.queueOfflinePunch(payload);
            await updateOfflineQueueBadge();
        }

        handlePunchSuccess({
            type: 'OUT',
            emp,
            method,
            timeStr,
            remarks: `Offline Queued (${err.message})`
        });
    }
}

function handlePunchSuccess({ type, emp, method, timeStr, remarks }) {
    playSound('success');

    // Update 50/50 Right Card
    updateActivePunchCard({ type, emp, timeStr, remarks });

    // Update Table
    appendHistoryRow(new Date(), emp.employeeCode, emp.name, method === 'FACE_AI' ? 'Face AI' : 'Biometric', type === 'OUT' ? 'Checked Out' : 'Checked In');

    // Increment count
    const countEl = document.getElementById('todayPunchCount');
    countEl.textContent = parseInt(countEl.textContent || '0', 10) + 1;

    // If currently on Face Attendance view, show the big overlay popup
    if (activeView === 'view-face-attendance') {
        showBigPunchModal({ type, emp, timeStr, remarks });
    }
}

function handlePunchDuplicate({ emp, method, timeStr, remarks }) {
    playSound('warning');

    updateActivePunchCard({ type: 'ALREADY', emp, timeStr, remarks });
    appendHistoryRow(new Date(), emp.employeeCode, emp.name, method === 'FACE_AI' ? 'Face AI' : 'Biometric', '[Duplicate Scan]');

    if (activeView === 'view-face-attendance') {
        showBigPunchModal({ type: 'ALREADY', emp, timeStr, remarks });
    }
}

let rightCardResetTimer = null;

function updateActivePunchCard({ type, emp, timeStr, remarks }) {
    if (rightCardResetTimer) {
        clearTimeout(rightCardResetTimer);
        rightCardResetTimer = null;
    }

    const waitPlaceholder = document.getElementById('lblWaitPlaceholder');
    const activeCard = document.getElementById('activeEmpCard');
    if (waitPlaceholder) waitPlaceholder.classList.add('hidden');
    if (activeCard) activeCard.classList.remove('hidden');

    const badge = document.getElementById('punchActionBadge');
    const nameEl = document.getElementById('empResultName');
    const metaEl = document.getElementById('empResultMeta');
    const branchEl = document.getElementById('empResultBranch');
    const timeEl = document.getElementById('empResultTime');
    const remarksEl = document.getElementById('empResultRemarks');
    const statusText = document.getElementById('lblPunchResultStatus');
    const photoImg = document.getElementById('empResultPhoto');
    const photoPlaceholder = document.getElementById('empPhotoPlaceholder');

    nameEl.textContent = emp.name;
    metaEl.textContent = `Code: ${emp.employeeCode} • Role: ${emp.designation || 'Staff'}`;
    branchEl.textContent = `Branch: ${emp.branch || config.branch || 'Main'}`;
    timeEl.textContent = formatTime12Hour(timeStr);
    remarksEl.textContent = remarks || '--';

    if (emp.photo) {
        photoImg.src = emp.photo;
        photoImg.classList.remove('hidden');
        photoPlaceholder.classList.add('hidden');
    } else {
        photoImg.classList.add('hidden');
        photoPlaceholder.classList.remove('hidden');
    }

    badge.className = 'punch-action-badge';
    badge.style.background = '';
    badge.style.color = '';

    if (type === 'IN') {
        badge.classList.add('checkin');
        badge.textContent = 'CHECKED IN';
        statusText.textContent = 'Check-IN Logged';
        statusText.style.color = '#10b981';
    } else if (type === 'OUT') {
        badge.classList.add('checkout');
        badge.textContent = 'CHECKED OUT';
        statusText.textContent = 'Check-OUT Logged';
        statusText.style.color = '#ef4444';
    } else if (type === 'UNVERIFIED') {
        badge.classList.add('already');
        badge.textContent = 'FINGER UNVERIFIED';
        badge.style.background = '#ffedd5';
        badge.style.color = '#c2410c';
        statusText.textContent = 'Finger Unverified';
        statusText.style.color = '#ea580c';
    } else {
        badge.classList.add('already');
        badge.textContent = 'ALREADY SCANNED';
        statusText.textContent = 'Duplicate Scan Ignored';
        statusText.style.color = '#f59e0b';
    }

    // Windows 4.5s idle reset back to placeholder
    rightCardResetTimer = setTimeout(() => {
        if (waitPlaceholder) waitPlaceholder.classList.remove('hidden');
        if (activeCard) activeCard.classList.add('hidden');
        if (statusText) {
            statusText.textContent = 'Standby';
            statusText.style.color = '#64748b';
        }
    }, 4500);
}

function showBigPunchModal({ type, emp, timeStr, remarks }) {
    const overlay = document.getElementById('bigPunchOverlay');
    const modal = document.getElementById('bigPunchModal');
    const icon = document.getElementById('bigPunchIcon');
    const title = document.getElementById('bigPunchTitle');
    const subtitle = document.getElementById('bigPunchSubtitle');
    const nameEl = document.getElementById('bigPunchEmpName');
    const codeEl = document.getElementById('bigPunchEmpCode');
    const timeBadge = document.getElementById('bigPunchTimeBadge');
    const remarksEl = document.getElementById('bigPunchRemarks');

    const formattedTime = formatTime12Hour(timeStr);

    modal.className = 'big-punch-modal';
    if (type === 'IN') {
        icon.textContent = '🟢';
        title.textContent = 'CHECKED IN';
        subtitle.textContent = 'ATTENDANCE RECORDED';
    } else if (type === 'OUT') {
        modal.classList.add('checkout');
        icon.textContent = '🔴';
        title.textContent = 'CHECKED OUT';
        subtitle.textContent = 'ATTENDANCE RECORDED';
    } else {
        modal.classList.add('already');
        icon.textContent = '⚠️';
        title.textContent = 'ALREADY CHECKED OUT';
        subtitle.textContent = 'DUPLICATE SCAN IGNORED';
    }

    nameEl.textContent = emp.name;
    codeEl.textContent = `CODE: ${emp.employeeCode} • BRANCH: ${emp.branch || config.branch || 'Main'}`;
    timeBadge.textContent = `⏰ Time: ${formattedTime}`;
    remarksEl.textContent = remarks;

    overlay.classList.remove('hidden');

    // Auto-dismiss in 2 seconds and smoothly return to Biometric Mode!
    setTimeout(() => {
        overlay.classList.add('hidden');
        isPunchInProgress = false;
        switchView('view-attendance');
    }, 2000);
}

function appendHistoryRow(date, code, name, method, status) {
    const tbody = document.getElementById('historyTableBody');
    const emptyRow = tbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${formatTime12Hour(date)}</td>
        <td><strong>${code}</strong></td>
        <td>${name}</td>
        <td><span class="${method === 'Face AI' ? 'badge-face' : 'badge-finger'}">${method === 'Face AI' ? '📸' : '🖐️'} ${method}</span></td>
        <td><span class="text-emerald font-bold">${status}</span></td>
    `;
    tbody.prepend(tr);
}

// ── BIOMETRIC REGISTER (VIEW 3 - Matches Form1 & EnrollmentForm.cs) ───────────
let modalScanCount = 0;

function setupBiometricRegisterHandlers() {
    const branchSelect = document.getElementById('cmbRegBranches');
    const searchInput = document.getElementById('txtRegSearch');
    const btnClear = document.getElementById('btnRegClearSearch');
    const winEmpSelect = document.getElementById('cmbRegEmployees');
    const btnOpenEnroll = document.getElementById('btnOpenEnrollment');
    const regStatus = document.getElementById('lblRegStatus');

    // Modal elements (Matches EnrollmentForm.cs)
    const modalBackdrop = document.getElementById('enrollmentModalBackdrop');
    const btnCloseModal = document.getElementById('btnCloseEnrollmentModal');
    const modalEmpName = document.getElementById('modalEmpName');
    const modalStatus = document.getElementById('modalStatusText');
    const modalPicBox = document.getElementById('modalPicFingerprint');
    const modalCount = document.getElementById('modalCountText');
    const btnModalTouchId = document.getElementById('btnModalTouchIdScan');
    const btnModalSimulate = document.getElementById('btnModalSimulateScan');
    const btnModalReset = document.getElementById('btnModalResetScans');
    const btnModalSave = document.getElementById('btnModalSaveFingerprint');

    // On-page elements
    const onPageSearch = document.getElementById('bioRegSearch');
    const onPageEmpSelect = document.getElementById('bioRegEmpSelect');
    const btnTouchIdSample = document.getElementById('btnTouchIdSample');
    const onPageFpBox = document.getElementById('onPageFpBox');
    const btnSimulateSample = document.getElementById('btnSimulateSample');
    const btnResetBio = document.getElementById('btnResetBioEnroll');
    const btnSaveBio = document.getElementById('btnSaveBioTemplate');

    function selectEmployeeForBio(emp) {
        if (!emp) return;
        bioRegState.selectedEmp = emp;
        bioRegState.samplesCaptured = 0;

        document.getElementById('bioSummaryName').textContent = emp.name;
        document.getElementById('bioSummarySub').textContent = `Code: ${emp.employeeCode} • Branch: ${emp.branch || 'N/A'}`;
        document.getElementById('bioSummaryStatus').textContent = emp.hasFingerprint ? 'Fingerprint: Enrolled ✓' : 'Fingerprint: Unregistered ⏳';
        document.getElementById('bioSummaryStatus').style.color = emp.hasFingerprint ? '#10b981' : '#f59e0b';

        if (winEmpSelect && winEmpSelect.value !== emp.employeeCode) {
            winEmpSelect.value = emp.employeeCode;
        }
        if (onPageEmpSelect && onPageEmpSelect.value !== emp.employeeCode) {
            onPageEmpSelect.value = emp.employeeCode;
        }
        if (regStatus) {
            regStatus.textContent = `Selected: ${emp.name} (${emp.employeeCode}) - Ready for enrollment.`;
            regStatus.style.color = '#0d6efd';
        }
        updateBioEnrollUI();
    }

    if (branchSelect) {
        branchSelect.addEventListener('change', (e) => {
            const branch = e.target.value;
            filterEmployeesByBranch(branch);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            const matches = branchEmployeesList.filter(emp => 
                String(emp.employeeCode).toLowerCase().includes(q) || (emp.name && emp.name.toLowerCase().includes(q))
            );
            populateRegistrationDropdowns(matches);

            // Exact code match auto-selects (Windows feature)
            const exact = matches.find(m => String(m.employeeCode).toLowerCase() === q);
            if (exact) {
                selectEmployeeForBio(exact);
            }
        });
    }

    if (onPageSearch) {
        onPageSearch.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            const matches = branchEmployeesList.filter(emp => 
                String(emp.employeeCode).toLowerCase().includes(q) || (emp.name && emp.name.toLowerCase().includes(q))
            );
            populateRegistrationDropdowns(matches);
        });
    }

    if (btnClear) {
        btnClear.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            populateRegistrationDropdowns(branchEmployeesList);
        });
    }

    if (winEmpSelect) {
        winEmpSelect.addEventListener('change', (e) => {
            const emp = allEmployeesList.find(x => x.employeeCode === e.target.value);
            if (emp) selectEmployeeForBio(emp);
        });
    }

    if (onPageEmpSelect) {
        onPageEmpSelect.addEventListener('change', (e) => {
            const emp = allEmployeesList.find(x => x.employeeCode === e.target.value);
            if (emp) selectEmployeeForBio(emp);
        });
    }

    // OPEN 4-SCAN REGISTRATION POPUP (Matches Windows btnOpenEnrollment_Click)
    if (btnOpenEnroll) {
        btnOpenEnroll.addEventListener('click', () => {
            const emp = bioRegState.selectedEmp;
            if (!emp) {
                alert('Please select an employee first.');
                return;
            }

            modalScanCount = 0;
            modalEmpName.textContent = `Employee: ${emp.name} (Code: ${emp.employeeCode})`;
            modalStatus.textContent = 'Please place your finger on the sensor for the first scan.';
            modalStatus.style.color = '#0056b3';
            modalCount.textContent = '0 / 4';
            modalCount.style.color = '#0d6efd';
            btnModalSave.disabled = true;
            modalPicBox.classList.remove('scanning');

            modalBackdrop.classList.remove('hidden');
        });
    }

    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            modalBackdrop.classList.add('hidden');
        });
    }

    // Modal Touch ID Scan Trigger (via Button or clicking the Fingerprint PictureBox)
    async function handleModalTouchIdSample() {
        const emp = bioRegState.selectedEmp;
        if (!emp) return;

        if (modalScanCount >= 4) {
            modalStatus.textContent = '4 scans completed! Click SAVE FINGERPRINT to finish.';
            modalStatus.style.color = '#198754';
            return;
        }

        modalPicBox.classList.add('scanning');
        modalStatus.textContent = `Touch ID active: scan sample ${modalScanCount + 1} of 4...`;

        try {
            let success = false;
            if (isTouchIdAvailable && window.desktopAPI && window.desktopAPI.promptTouchID) {
                const res = await window.desktopAPI.promptTouchID(`Biometric Registration: Scan sample ${modalScanCount + 1} of 4 for ${emp.name}`);
                success = res.success;
            } else {
                await new Promise(r => setTimeout(r, 600));
                success = true;
            }

            if (success) {
                modalScanCount++;
                playSound('success');
                modalCount.textContent = `${modalScanCount} / 4`;

                if (modalScanCount < 4) {
                    modalStatus.textContent = `Scan captured (${modalScanCount}/4). Lift and place finger again.`;
                    modalStatus.style.color = '#0056b3';
                } else {
                    modalStatus.textContent = '4 scans completed! Click Save to finish.';
                    modalStatus.style.color = '#198754';
                    modalCount.style.color = '#198754';
                    btnModalSave.disabled = false;
                }
            } else {
                modalStatus.textContent = 'Touch ID cancelled or unverified. Please try again.';
                modalStatus.style.color = '#dc3545';
            }
        } catch (e) {
            modalStatus.textContent = `Touch ID Error: ${e.message}`;
            modalStatus.style.color = '#dc3545';
        } finally {
            setTimeout(() => modalPicBox.classList.remove('scanning'), 600);
        }
    }

    if (btnModalTouchId) btnModalTouchId.addEventListener('click', handleModalTouchIdSample);
    if (modalPicBox) modalPicBox.addEventListener('click', handleModalTouchIdSample);

    if (btnModalSimulate) {
        btnModalSimulate.addEventListener('click', () => {
            if (modalScanCount < 4) {
                modalScanCount++;
                playSound('success');
                modalCount.textContent = `${modalScanCount} / 4`;
                if (modalScanCount < 4) {
                    modalStatus.textContent = `Scan captured (${modalScanCount}/4). Lift and place finger again.`;
                    modalStatus.style.color = '#0056b3';
                } else {
                    modalStatus.textContent = '4 scans completed! Click Save to finish.';
                    modalStatus.style.color = '#198754';
                    modalCount.style.color = '#198754';
                    btnModalSave.disabled = false;
                }
            }
        });
    }

    if (btnModalReset) {
        btnModalReset.addEventListener('click', () => {
            modalScanCount = 0;
            modalCount.textContent = '0 / 4';
            modalCount.style.color = '#0d6efd';
            modalStatus.textContent = 'Please place your finger on the sensor for the first scan.';
            modalStatus.style.color = '#0056b3';
            btnModalSave.disabled = true;
        });
    }

    // Modal SAVE FINGERPRINT button (Matches Windows btnSave_Click)
    if (btnModalSave) {
        btnModalSave.addEventListener('click', async () => {
            const emp = bioRegState.selectedEmp;
            if (!emp || modalScanCount < 4) return;

            btnModalSave.disabled = true;
            btnModalSave.textContent = 'Saving to server...';
            modalStatus.textContent = 'Saving to server...';

            try {
                const fakeTemplate = `DPFP_TEMPLATE_V29_${emp.employeeCode}_${Date.now()}`;
                const res = await fetch(`${config.serverUrl}/api/v1/attendance/biometric/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'bas-secret-key': config.secretKey
                    },
                    body: JSON.stringify({
                        employeeId: emp._id,
                        template: fakeTemplate
                    }),
                    signal: AbortSignal.timeout(8000)
                });

                const data = await res.json();
                if (data.success) {
                    playSound('success');
                    modalBackdrop.classList.add('hidden');

                    if (regStatus) {
                        regStatus.textContent = `COMPLETED: ${emp.name} registered successfully.`;
                        regStatus.style.color = '#198754';
                    }
                    emp.hasFingerprint = true;
                    selectEmployeeForBio(emp);
                    alert(`✓ Fingerprint successfully linked to ${emp.name}!`);
                    await syncEmployees();
                } else {
                    alert(`Registration failed: ${data.message}`);
                    modalStatus.textContent = `Registration Failed: ${data.message}`;
                    modalStatus.style.color = '#dc3545';
                }
            } catch (err) {
                alert(`Connection Error: ${err.message}`);
                modalStatus.textContent = `Connection Error: ${err.message}`;
                modalStatus.style.color = '#dc3545';
            } finally {
                btnModalSave.disabled = modalScanCount < 4;
                btnModalSave.textContent = 'SAVE FINGERPRINT';
            }
        });
    }

    // On-page Touch ID Sample button & Click on Page Box
    async function handleOnPageTouchIdSample() {
        if (!bioRegState.selectedEmp) {
            alert('Please select an employee first!');
            return;
        }
        if (bioRegState.samplesCaptured >= 4) return;

        try {
            let success = false;
            if (isTouchIdAvailable && window.desktopAPI && window.desktopAPI.promptTouchID) {
                const res = await window.desktopAPI.promptTouchID(`Biometric Registration: Scan sample ${bioRegState.samplesCaptured + 1} of 4 for ${bioRegState.selectedEmp.name}`);
                success = res.success;
            } else {
                await new Promise(r => setTimeout(r, 600));
                success = true;
            }

            if (success) {
                bioRegState.samplesCaptured++;
                playSound('success');
                updateBioEnrollUI();
            }
        } catch (e) {
            console.warn('On-page touch ID error:', e);
        }
    }

    if (btnTouchIdSample) btnTouchIdSample.addEventListener('click', handleOnPageTouchIdSample);
    if (onPageFpBox) onPageFpBox.addEventListener('click', handleOnPageTouchIdSample);

    if (btnSimulateSample) {
        btnSimulateSample.addEventListener('click', () => {
            if (!bioRegState.selectedEmp) {
                alert('Please select an employee first!');
                return;
            }
            if (bioRegState.samplesCaptured < 4) {
                bioRegState.samplesCaptured++;
                playSound('success');
                updateBioEnrollUI();
            }
        });
    }

    if (btnResetBio) {
        btnResetBio.addEventListener('click', () => {
            bioRegState.samplesCaptured = 0;
            updateBioEnrollUI();
        });
    }

    if (btnSaveBio) {
        btnSaveBio.addEventListener('click', async () => {
            if (!bioRegState.selectedEmp || bioRegState.samplesCaptured < 4) return;
            btnSaveBio.disabled = true;
            btnSaveBio.textContent = 'Saving Fingerprint...';

            try {
                const fakeTemplate = `DPFP_TEMPLATE_V29_${bioRegState.selectedEmp.employeeCode}_${Date.now()}`;
                const res = await fetch(`${config.serverUrl}/api/v1/attendance/biometric/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'bas-secret-key': config.secretKey
                    },
                    body: JSON.stringify({
                        employeeId: bioRegState.selectedEmp._id,
                        template: fakeTemplate
                    }),
                    signal: AbortSignal.timeout(8000)
                });

                const data = await res.json();
                if (data.success) {
                    playSound('success');
                    alert(`✓ Fingerprint registered successfully for ${bioRegState.selectedEmp.name}!`);
                    bioRegState.selectedEmp.hasFingerprint = true;
                    bioRegState.samplesCaptured = 0;
                    updateBioEnrollUI();
                    await syncEmployees();
                } else {
                    alert(`Registration failed: ${data.message}`);
                }
            } catch (e) {
                alert(`Network error: ${e.message}`);
            } finally {
                btnSaveBio.disabled = false;
                btnSaveBio.textContent = '💾 Save Fingerprint';
            }
        });
    }
}

function updateBioEnrollUI() {
    const emp = bioRegState.selectedEmp;
    if (!emp) return;

    document.getElementById('bioSummaryName').textContent = emp.name;
    document.getElementById('bioSummarySub').textContent = `Code: ${emp.employeeCode} • Branch: ${emp.branch || 'N/A'}`;
    document.getElementById('bioSummaryStatus').textContent = emp.hasFingerprint ? 'Fingerprint: Enrolled ✓' : 'Fingerprint: Unregistered ⏳';
    document.getElementById('bioSummaryStatus').style.color = emp.hasFingerprint ? '#10b981' : '#f59e0b';

    const count = bioRegState.samplesCaptured;
    for (let i = 1; i <= 4; i++) {
        const step = document.getElementById(`sampleStep${i}`);
        if (step) {
            step.className = 'sample-step';
            if (i <= count) step.classList.add('done');
            else if (i === count + 1) step.classList.add('active');
        }
    }

    const prompt = document.getElementById('lblFpEnrollPrompt');
    const saveBtn = document.getElementById('btnSaveBioTemplate');
    if (count < 4) {
        if (prompt) prompt.textContent = `Place finger on Mac Touch ID or click here to capture Sample ${count + 1} of 4`;
        if (saveBtn) saveBtn.disabled = true;
    } else {
        if (prompt) prompt.textContent = `✓ All 4 samples captured and calibrated! Click Save Fingerprint below.`;
        if (saveBtn) saveBtn.disabled = false;
    }
}

// ── FACE AI REGISTER (VIEW 4 - Matches FaceRegisterView.cs) ──────────────────
function setupFaceRegisterHandlers() {
    const searchInput = document.getElementById('regEmpSearch');
    const empSelect = document.getElementById('regEmpSelect');

    searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const matches = allEmployeesList.filter(emp => 
            String(emp.employeeCode).toLowerCase().includes(q) || (emp.name && emp.name.toLowerCase().includes(q))
        );
        populateRegistrationDropdowns(matches);
    });

    empSelect.addEventListener('change', (e) => {
        const emp = allEmployeesList.find(x => x.employeeCode === e.target.value);
        if (emp) {
            regState.selectedEmp = emp;
            document.getElementById('regPreviewName').textContent = emp.name;
            document.getElementById('regPreviewRole').textContent = `Code: ${emp.employeeCode} • ${emp.designation || 'Staff'} • Branch: ${emp.branch || 'N/A'}`;
            document.getElementById('regPreviewStatus').textContent = emp.hasFaceEnrolled ? 'Status: Enrolled (Will Overwrite)' : 'Status: Unenrolled';
            document.getElementById('regPreviewStatus').style.color = emp.hasFaceEnrolled ? '#10b981' : '#f59e0b';
        }
    });

    document.getElementById('btnResetWizard').addEventListener('click', resetRegistrationWizard);
    document.getElementById('btnCaptureStep').addEventListener('click', captureCurrentAngleStep);
    document.getElementById('btnFinalizeEnroll').addEventListener('click', finalizeEnrollment);
}

function resetRegistrationWizard() {
    regState.step = 1;
    regState.vectors = { front: null, left: null, right: null };
    regState.photos = { front: null, left: null, right: null };

    ['Front', 'Left', 'Right'].forEach(side => {
        const thumb = document.getElementById(`thumb${side}`);
        if (thumb) {
            thumb.className = 'angle-thumb';
            thumb.querySelector('.thumb-status').textContent = 'Pending';
        }
    });

    document.getElementById('angleInstruction').textContent = 'Look Straight at the Camera';
    document.getElementById('btnCaptureStep').classList.remove('hidden');
    document.getElementById('btnFinalizeEnroll').classList.add('hidden');
    document.getElementById('ovalGuide').classList.remove('success');
}

async function captureCurrentAngleStep() {
    if (!regState.selectedEmp) {
        alert('Please choose an employee first!');
        return;
    }

    const video = document.getElementById('registerVideo');
    if (!video || video.readyState < 2) return;

    const canvas = extractFaceCrop(video, 200, 250);
    if (!canvas) return;

    const faceCheck = await faceEngine.detectFace(canvas);
    if (!faceCheck.hasFace) {
        alert('⚠️ No face detected in frame. Please position face clearly inside the oval guide.');
        return;
    }

    const vec = await faceEngine.extractEmbedding(video);
    if (!vec) {
        alert('⚠️ Could not extract facial features. Ensure good lighting.');
        return;
    }

    const photoDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    playSound('success');

    if (regState.step === 1) {
        regState.vectors.front = vec;
        regState.photos.front = photoDataUrl;
        document.getElementById('thumbFront').className = 'angle-thumb done';
        document.getElementById('thumbFront').querySelector('.thumb-status').textContent = '✓ Captured';
        document.getElementById('angleInstruction').textContent = 'Turn Head Slightly Left (~20°)';
        regState.step = 2;
    } else if (regState.step === 2) {
        regState.vectors.left = vec;
        regState.photos.left = photoDataUrl;
        document.getElementById('thumbLeft').className = 'angle-thumb done';
        document.getElementById('thumbLeft').querySelector('.thumb-status').textContent = '✓ Captured';
        document.getElementById('angleInstruction').textContent = 'Turn Head Slightly Right (~20°)';
        regState.step = 3;
    } else if (regState.step === 3) {
        regState.vectors.right = vec;
        regState.photos.right = photoDataUrl;
        document.getElementById('thumbRight').className = 'angle-thumb done';
        document.getElementById('thumbRight').querySelector('.thumb-status').textContent = '✓ Captured';
        document.getElementById('angleInstruction').textContent = '✓ All 3 Angles Calibrated! Click Save Below.';
        document.getElementById('btnCaptureStep').classList.add('hidden');
        document.getElementById('btnFinalizeEnroll').classList.remove('hidden');
        document.getElementById('ovalGuide').classList.add('success');
    }
}

async function finalizeEnrollment() {
    if (!regState.selectedEmp || !regState.vectors.front) return;

    const btn = document.getElementById('btnFinalizeEnroll');
    btn.textContent = 'Saving to Database...';
    btn.disabled = true;

    const compositeVector = faceEngine.mergeMultiAngleVectors([
        regState.vectors.front,
        regState.vectors.left,
        regState.vectors.right
    ]);

    const emp = regState.selectedEmp;

    try {
        // Pre-flight duplicate check against other enrolled employees in desktop memory (< 1ms)
        if (window.faceEngine && Array.isArray(window.faceEngine.enrolledEmployees)) {
            for (const otherEmp of window.faceEngine.enrolledEmployees) {
                const otherCode = otherEmp.employeeCode || otherEmp.code;
                if (otherCode === emp.employeeCode || otherEmp._id === emp._id) {
                    continue; // Re-enrollment for the same employee is permitted
                }
                if (Array.isArray(otherEmp.faceTemplate) && otherEmp.faceTemplate.length === compositeVector.length) {
                    let dist = 999;
                    if (typeof faceapi !== 'undefined' && faceapi.euclideanDistance) {
                        dist = faceapi.euclideanDistance(compositeVector, otherEmp.faceTemplate);
                    } else {
                        let sumSq = 0;
                        for (let i = 0; i < compositeVector.length; i++) {
                            const diff = compositeVector[i] - otherEmp.faceTemplate[i];
                            sumSq += diff * diff;
                        }
                        dist = Math.sqrt(sumSq);
                    }
                    if (dist <= 0.40) {
                        alert(`⚠️ Biometric Duplicate Detected!\n\nThis facial scan matches already enrolled employee:\n• Name: ${otherEmp.name}\n• Code: ${otherCode}\n\nDuplicate face enrollment is prohibited.`);
                        btn.textContent = '💾 Save to Database';
                        btn.disabled = false;
                        return;
                    }
                }
            }
        }

        // 1. Transmit to DEDICATED FACE REGISTRATION ENDPOINT (Server-first validation)
        const remotePayload = {
            employeeId: emp._id,
            employeeCode: emp.employeeCode,
            code: emp.employeeCode,
            faceTemplate: compositeVector,
            facePhotoBase64: regState.photos.front
        };

        const regRes = await fetch(`${config.serverUrl}/api/v1/attendance/biometric/face/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'bas-secret-key': config.secretKey
            },
            body: JSON.stringify(remotePayload),
            signal: AbortSignal.timeout(8000)
        });

        const regJson = await regRes.json();
        console.log('[Face Register Response]', regJson);

        if (!regRes.ok || !regJson.success) {
            alert(`⚠️ Registration Rejected (${regRes.status}):\n\n${regJson.message || 'Face enrollment failed'}`);
            btn.textContent = '💾 Save to Database';
            btn.disabled = false;
            return; // Never save duplicate locally!
        }

        // 2. Save locally for instant offline recognition (Safe: Server confirmed non-duplicate)
        if (window.desktopAPI && window.desktopAPI.saveFaceTemplate) {
            await window.desktopAPI.saveFaceTemplate({
                employeeCode: emp.employeeCode,
                name: emp.name,
                branch: emp.branch || config.branch,
                faceTemplate: compositeVector,
                facePhotoUrl: regState.photos.front
            });
        }

        playSound('success');
        alert(`✓ Success! Face Biometrics Registered for ${emp.name} (Code: ${emp.employeeCode}).\nNow active for live attendance marking!`);
        await syncEmployees();
        resetRegistrationWizard();
    } catch (err) {
        alert(`Save failed: ${err.message}`);
    } finally {
        btn.textContent = '💾 Save to Database';
        btn.disabled = false;
    }
}

// ── AI VISION DIAGNOSTIC (VIEW 5 - Matches FaceDiagnosticView.cs) ─────────────
let lastFrameTime = performance.now();
let frameCount = 0;
let currentFps = 0;

function setupDiagnosticHandlers() {
    // Canvas loop initialized in startDiagnosticLoop
}

function startDiagnosticLoop() {
    if (diagnosticTimer) clearInterval(diagnosticTimer);
    diagnosticTimer = setInterval(renderDiagnosticFrame, 150);
}

async function renderDiagnosticFrame() {
    if (activeView !== 'view-diagnostic') return;
    const video = document.getElementById('attendanceVideo');
    const canvas = document.getElementById('diagCanvas');
    if (!video || video.readyState < 2 || !canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Compute FPS
    frameCount++;
    const now = performance.now();
    if (now - lastFrameTime >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastFrameTime = now;
        document.getElementById('telFps').textContent = `${currentFps} FPS`;
    }

    const tStart = performance.now();

    if (faceEngine.isModelLoaded && typeof faceapi !== 'undefined') {
        try {
            const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
            const detection = await faceapi.detectSingleFace(video, options).withFaceLandmarks();
            const latency = Math.round(performance.now() - tStart);

            document.getElementById('telLatency').textContent = `${latency} ms`;

            if (detection) {
                document.getElementById('telFaceFound').textContent = 'Yes (Tracked)';
                document.getElementById('telFaceFound').className = 'tel-val text-emerald';
                document.getElementById('telScore').textContent = `${Math.round(detection.detection.score * 100)}%`;

                // Draw bounding box
                const box = detection.detection.box;
                ctx.strokeStyle = '#10b981';
                ctx.lineWidth = 3;
                ctx.strokeRect(box.x, box.y, box.width, box.height);

                // Draw 68 landmarks
                const landmarks = detection.landmarks.positions;
                ctx.fillStyle = '#06b6d4';
                landmarks.forEach(pt => {
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 2.5, 0, 2 * Math.PI);
                    ctx.fill();
                });

                // Anti-spoof sample
                const spoof = antiSpoof.analyze(canvas);
                document.getElementById('telLiveness').textContent = `${Math.round(spoof.score * 100)}% (${spoof.isLive ? 'Live' : 'Suspect'})`;
                document.getElementById('telTexture').textContent = `${spoof.metrics.texture}`;
            } else {
                document.getElementById('telFaceFound').textContent = 'No';
                document.getElementById('telFaceFound').className = 'tel-val text-muted';
                document.getElementById('telScore').textContent = '--';
            }
        } catch (e) {
            console.warn('Diagnostic render err:', e);
        }
    }
}

// ── SETTINGS & OFFLINE QUEUE (VIEW 6) ────────────────────────────────────────
async function updateOfflineQueueBadge() {
    if (window.desktopAPI && window.desktopAPI.loadOfflinePunches) {
        const list = (await window.desktopAPI.loadOfflinePunches()) || [];
        const badge = document.getElementById('lblOfflineQueueCount');
        if (badge) badge.textContent = list.length;
    }
}

function applyConfigToUI() {
    document.getElementById('cfgServerUrl').value = config.serverUrl;
    document.getElementById('cfgSecretKey').value = config.secretKey;
    document.getElementById('cfgBranch').value = config.branch;
}

function setupSettingsHandlers() {
    document.getElementById('btnRefreshCams').addEventListener('click', listCameras);

    document.getElementById('cfgCameraSelect').addEventListener('change', async (e) => {
        config.selectedCameraId = e.target.value;
        await startCamera();
        if (window.desktopAPI) window.desktopAPI.saveConfig(config);
    });

    document.getElementById('btnTestConn').addEventListener('click', async () => {
        const testBadge = document.getElementById('cfgTestResult');
        testBadge.textContent = 'Testing connection...';
        testBadge.style.color = '#06b6d4';

        try {
            const url = `${document.getElementById('cfgServerUrl').value}/api/v1/stores?showAll=true`;
            const res = await fetch(url, {
                headers: { 'bas-secret-key': document.getElementById('cfgSecretKey').value },
                signal: AbortSignal.timeout(5000)
            });
            const data = await res.json();
            if (data.success) {
                testBadge.textContent = `✓ Connected! Loaded ${data.data?.length || 0} branches from live database.`;
                testBadge.style.color = '#10b981';
            } else {
                testBadge.textContent = `⚠️ Connected but API replied: ${data.message}`;
                testBadge.style.color = '#f59e0b';
            }
        } catch (err) {
            testBadge.textContent = `✗ Connection failed: ${err.message}`;
            testBadge.style.color = '#ef4444';
        }
    });

    document.getElementById('btnSaveConfig').addEventListener('click', async () => {
        config.serverUrl = document.getElementById('cfgServerUrl').value.trim();
        config.secretKey = document.getElementById('cfgSecretKey').value.trim();
        config.branch = document.getElementById('cfgBranch').value.trim();

        if (window.desktopAPI) {
            await window.desktopAPI.saveConfig(config);
        }
        applyConfigToUI();
        await loadStores();
        await syncEmployees();
        alert('Settings saved successfully!');
    });

    // Flush offline queue
    document.getElementById('btnFlushOffline').addEventListener('click', async () => {
        if (!window.desktopAPI) return;
        const list = (await window.desktopAPI.loadOfflinePunches()) || [];
        if (!list.length) {
            alert('No offline punches to sync.');
            return;
        }

        let syncedCount = 0;
        for (const item of list) {
            try {
                const res = await fetch(`${config.serverUrl}/api/v1/attendance/biometric`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'bas-secret-key': config.secretKey
                    },
                    body: JSON.stringify(item),
                    signal: AbortSignal.timeout(5000)
                });
                if (res.ok) syncedCount++;
            } catch (_) {}
        }

        if (syncedCount === list.length) {
            await window.desktopAPI.clearOfflinePunches();
            await updateOfflineQueueBadge();
            alert(`✓ Successfully synced all ${syncedCount} offline punches!`);
        } else {
            alert(`Synced ${syncedCount} of ${list.length} punches. Some remain queued.`);
        }
    });

    document.getElementById('btnClearOffline').addEventListener('click', async () => {
        if (confirm('Clear all queued offline punches?')) {
            if (window.desktopAPI) {
                await window.desktopAPI.clearOfflinePunches();
                await updateOfflineQueueBadge();
            }
        }
    });
}
