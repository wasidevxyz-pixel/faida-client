const { app, BrowserWindow, ipcMain, systemPreferences, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

// Persistent local config storage path
const userDataPath = app.getPath('userData');
const configFilePath = path.join(userDataPath, 'bas_face_config.json');

function loadConfig() {
    let cfg = {
        serverUrl: process.env.BAS_SERVER_URL || 'https://bas.dwatson.co',
        secretKey: process.env.BAS_SECRET_KEY || '',
        branch: process.env.BAS_BRANCH || '',
        selectedCameraId: '',
        debounceSeconds: 300,
        userToken: null,
        currentUser: null
    };

    try {
        if (fs.existsSync(configFilePath)) {
            const raw = fs.readFileSync(configFilePath, 'utf8');
            const parsed = JSON.parse(raw);
            cfg = { ...cfg, ...parsed };
        }
    } catch (e) {
        console.warn('Could not read existing config, using defaults:', e.message);
    }

    // Always ensure valid https server url
    if (!cfg.serverUrl || cfg.serverUrl.includes('localhost') || cfg.serverUrl.includes('5001') || cfg.serverUrl.includes('.online')) {
        cfg.serverUrl = 'https://bas.dwatson.co';
    }
    return cfg;
}

const templatesFilePath = path.join(userDataPath, 'bas_face_templates.json');
const offlinePunchesFilePath = path.join(userDataPath, 'bas_offline_punches.json');

function loadFaceTemplates() {
    try {
        if (fs.existsSync(templatesFilePath)) {
            const raw = fs.readFileSync(templatesFilePath, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.warn('Error reading face templates:', e.message);
    }
    return [];
}

function saveFaceTemplate(data) {
    try {
        let list = loadFaceTemplates();
        list = list.filter(item => item.employeeCode !== data.employeeCode);
        list.push(data);
        fs.writeFileSync(templatesFilePath, JSON.stringify(list, null, 2), 'utf8');
        return { success: true, count: list.length };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function loadOfflinePunches() {
    try {
        if (fs.existsSync(offlinePunchesFilePath)) {
            const raw = fs.readFileSync(offlinePunchesFilePath, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.warn('Error reading offline punches:', e.message);
    }
    return [];
}

function queueOfflinePunch(punch) {
    try {
        let list = loadOfflinePunches();
        list.push({ ...punch, queuedAt: new Date().toISOString() });
        fs.writeFileSync(offlinePunchesFilePath, JSON.stringify(list, null, 2), 'utf8');
        return { success: true, count: list.length };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function clearOfflinePunches() {
    try {
        fs.writeFileSync(offlinePunchesFilePath, '[]', 'utf8');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function saveConfig(cfg) {
    try {
        fs.writeFileSync(configFilePath, JSON.stringify(cfg, null, 2), 'utf8');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function requestCameraAccessOnMac() {
    if (process.platform === 'darwin') {
        try {
            const status = systemPreferences.getMediaAccessStatus('camera');
            if (status !== 'granted') {
                const granted = await systemPreferences.askForMediaAccess('camera');
                console.log('[Face AI Desktop] macOS camera permission:', granted);
            }
        } catch (err) {
            console.warn('[Face AI Desktop] macOS media permission check:', err.message);
        }
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 840,
        minWidth: 1040,
        minHeight: 700,
        backgroundColor: '#f0f2f5',
        title: 'BAS Dual Biometric & Face AI Bridge (v29 Desktop)',
        frame: true,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false // Enables connecting to ERP API without CORS issues
        }
    });

    // Grant all media permissions in Electron session
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(true);
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        return true;
    });

    // Forward browser console logs to terminal for real-time diagnostics
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Renderer] ${message}`);
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC Handlers
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('load-config', () => loadConfig());
ipcMain.handle('save-config', (event, cfg) => saveConfig(cfg));
ipcMain.handle('load-face-templates', () => loadFaceTemplates());
ipcMain.handle('save-face-template', (event, data) => saveFaceTemplate(data));
ipcMain.handle('load-offline-punches', () => loadOfflinePunches());
ipcMain.handle('queue-offline-punch', (event, punch) => queueOfflinePunch(punch));
ipcMain.handle('clear-offline-punches', () => clearOfflinePunches());
ipcMain.handle('can-prompt-touch-id', () => {
    try {
        if (process.platform === 'darwin' && systemPreferences && systemPreferences.canPromptTouchID) {
            return systemPreferences.canPromptTouchID();
        }
    } catch (e) {
        console.warn('canPromptTouchID error:', e.message);
    }
    return false;
});
ipcMain.handle('prompt-touch-id', async (event, reason) => {
    try {
        if (process.platform === 'darwin' && systemPreferences && systemPreferences.promptTouchID) {
            await systemPreferences.promptTouchID(reason || 'Scan your fingerprint for BAS Attendance');
            return { success: true };
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
    return { success: false, error: 'Touch ID not supported on this device' };
});
ipcMain.handle('open-external', (event, url) => shell.openExternal(url));

app.whenReady().then(async () => {
    await requestCameraAccessOnMac();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
