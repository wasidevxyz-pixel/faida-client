const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    loadConfig: () => ipcRenderer.invoke('load-config'),
    saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
    loadFaceTemplates: () => ipcRenderer.invoke('load-face-templates'),
    saveFaceTemplate: (data) => ipcRenderer.invoke('save-face-template', data),
    loadOfflinePunches: () => ipcRenderer.invoke('load-offline-punches'),
    queueOfflinePunch: (punch) => ipcRenderer.invoke('queue-offline-punch', punch),
    clearOfflinePunches: () => ipcRenderer.invoke('clear-offline-punches'),
    canPromptTouchID: () => ipcRenderer.invoke('can-prompt-touch-id'),
    promptTouchID: (reason) => ipcRenderer.invoke('prompt-touch-id', reason),
    openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
