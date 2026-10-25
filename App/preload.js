const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('api', {
  // File operations (limitées aux dossiers Projets/ et Inbox/ par le main process)
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  listProjects: () => ipcRenderer.invoke('list-projects'),
  createProject: (name) => ipcRenderer.invoke('create-project', name),
  migrateProject: (projectPath, content, options) => ipcRenderer.invoke('migrate-project', projectPath, content, options),
  listProjectBackups: (projectPath) => ipcRenderer.invoke('list-project-backups', projectPath),
  restoreProjectBackup: (projectPath, backupName) => ipcRenderer.invoke('restore-project-backup', projectPath, backupName),
  listFiles: (dirPath) => ipcRenderer.invoke('list-files', dirPath),
  getPaths: () => ipcRenderer.invoke('get-paths'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // IA (les clés restent dans le main process ; fournisseur et modèle viennent des paramètres)
  aiChat: (requestId, payload) => ipcRenderer.invoke('ai-chat', requestId, payload),
  aiCancel: (requestId) => ipcRenderer.invoke('ai-cancel', requestId),
  aiListModels: (provider) => ipcRenderer.invoke('ai-list-models', provider),

  // Utilities
  createDirectory: (dirPath) => ipcRenderer.invoke('create-directory', dirPath),

  // Fermeture : enregistrer puis confirmer
  onBeforeClose: (callback) => ipcRenderer.on('before-close', callback),
  confirmClose: () => ipcRenderer.invoke('confirm-close'),

  // Menu events
  onMenuNew: (callback) => ipcRenderer.on('menu-new', callback),
  onMenuSave: (callback) => ipcRenderer.on('menu-save', callback),
  onMenuRestoreBackup: (callback) => ipcRenderer.on('menu-restore-backup', callback),
  onToggleFocus: (callback) => ipcRenderer.on('toggle-focus', callback),
  onToggleTheme: (callback) => ipcRenderer.on('toggle-theme', callback),
  onTogglePartner: (callback) => ipcRenderer.on('toggle-partner', callback),
  onPartnerIntent: (callback) => ipcRenderer.on('partner-intent', (event, intent) => callback(intent)),
  onShowShortcuts: (callback) => ipcRenderer.on('show-shortcuts', callback),
  onWorkspace: (callback) => ipcRenderer.on('workspace', (event, name) => callback(name)),

  // Platform info
  platform: process.platform
});
