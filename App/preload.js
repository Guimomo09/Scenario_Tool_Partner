const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('api', {
  // File operations (limitées aux dossiers Projets/ et Inbox/ par le main process)
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  listProjects: () => ipcRenderer.invoke('list-projects'),
  createProject: (name) => ipcRenderer.invoke('create-project', name),
  listFiles: (dirPath) => ipcRenderer.invoke('list-files', dirPath),
  getPaths: () => ipcRenderer.invoke('get-paths'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // IA (la clé reste dans le main process)
  aiChat: (provider, systemPrompt, userMessage) => ipcRenderer.invoke('ai-chat', provider, systemPrompt, userMessage),

  // Utilities
  createDirectory: (dirPath) => ipcRenderer.invoke('create-directory', dirPath),

  // Fermeture : enregistrer puis confirmer
  onBeforeClose: (callback) => ipcRenderer.on('before-close', callback),
  confirmClose: () => ipcRenderer.invoke('confirm-close'),

  // Menu events
  onMenuNew: (callback) => ipcRenderer.on('menu-new', callback),
  onMenuSave: (callback) => ipcRenderer.on('menu-save', callback),
  onToggleFocus: (callback) => ipcRenderer.on('toggle-focus', callback),
  onToggleTheme: (callback) => ipcRenderer.on('toggle-theme', callback),
  onOpenAgent: (callback) => ipcRenderer.on('open-agent', (event, agent) => callback(agent)),
  onShowShortcuts: (callback) => ipcRenderer.on('show-shortcuts', callback),

  // Platform info
  platform: process.platform
});
