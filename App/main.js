const { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { isPathInside, atomicWriteFile, validateProjectName } = require('./lib/safe-fs');

let mainWindow;
// Fermeture autorisée une fois que le renderer a vidé ses sauvegardes en attente
let closeConfirmed = false;

// Chemin vers le dossier Partner
const PARTNER_PATH = path.join(__dirname, '..');
const PROJECTS_PATH = path.join(PARTNER_PATH, 'Projets');
const INBOX_PATH = path.join(PARTNER_PATH, 'Inbox');

// Désactiver le cache en développement
app.commandLine.appendSwitch('disable-http-cache');

function createWindow() {
  closeConfirmed = false;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Writing Partner',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    frame: process.platform === 'darwin' ? true : true,
    backgroundColor: '#1a1a2e'
  });

  // Désactiver le cache de session
  mainWindow.webContents.session.clearCache();
  
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Laisser le renderer enregistrer avant de fermer (il répond via 'confirm-close')
  mainWindow.on('close', (event) => {
    if (closeConfirmed) return;
    event.preventDefault();
    mainWindow.webContents.send('before-close');
  });

  // Menu personnalisé
  const menu = Menu.buildFromTemplate(getMenuTemplate());
  Menu.setApplicationMenu(menu);

  // Dev tools en mode dev
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function getMenuTemplate() {
  return [
    {
      label: 'Fichier',
      submenu: [
        { label: 'Nouveau projet', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('menu-new') },
        { label: 'Enregistrer', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('menu-save') },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' }
      ]
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Recharger', accelerator: 'CmdOrCtrl+R', click: () => {
          mainWindow.webContents.session.clearCache().then(() => {
            mainWindow.webContents.reloadIgnoringCache();
          });
        }},
        { label: 'Forcer rechargement', accelerator: 'CmdOrCtrl+Shift+R', click: () => {
          mainWindow.webContents.session.clearCache().then(() => {
            mainWindow.webContents.reloadIgnoringCache();
          });
        }},
        { type: 'separator' },
        { label: 'Mode Focus', accelerator: 'CmdOrCtrl+Shift+F', click: () => mainWindow.webContents.send('toggle-focus') },
        { label: 'Thème Sombre/Clair', accelerator: 'CmdOrCtrl+Shift+T', click: () => mainWindow.webContents.send('toggle-theme') },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Zoom +' },
        { role: 'zoomOut', label: 'Zoom -' },
        { role: 'resetZoom', label: 'Zoom 100%' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' }
      ]
    },
    {
      label: 'Agents',
      submenu: [
        { label: 'Writing Partner', accelerator: 'CmdOrCtrl+1', click: () => mainWindow.webContents.send('open-agent', 'writing-partner') },
        { label: 'World-Builder', accelerator: 'CmdOrCtrl+2', click: () => mainWindow.webContents.send('open-agent', 'world-builder') },
        { label: 'Veilleur', accelerator: 'CmdOrCtrl+3', click: () => mainWindow.webContents.send('open-agent', 'veilleur') },
        { label: 'Planificateur', accelerator: 'CmdOrCtrl+4', click: () => mainWindow.webContents.send('open-agent', 'planificateur') }
      ]
    },
    {
      label: 'Aide',
      submenu: [
        { label: 'Raccourcis clavier', accelerator: 'CmdOrCtrl+/', click: () => mainWindow.webContents.send('show-shortcuts') }
      ]
    }
  ];
}

// === IPC Handlers ===

// Le renderer ne peut lire/écrire que dans les dossiers de travail (jamais App/ ni settings.json)
const ALLOWED_ROOTS = [PROJECTS_PATH, INBOX_PATH];
const isAllowedPath = (p) => ALLOWED_ROOTS.some(root => isPathInside(root, p));
const outsideScope = (p) => ({ success: false, error: `Accès refusé hors de l'espace de travail : ${p}` });

// N'accepte que les messages de la fenêtre principale
function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      return { success: false, error: 'Émetteur IPC refusé.' };
    }
    return handler(event, ...args);
  });
}

// Lecture de fichier
handle('read-file', async (event, filePath) => {
  if (!isAllowedPath(filePath)) return outsideScope(filePath);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content, path: filePath };
  } catch (error) {
    return { success: false, error: error.message, code: error.code };
  }
});

// Écriture de fichier (atomique, ancienne version gardée en .bak)
handle('write-file', async (event, filePath, content) => {
  if (!isAllowedPath(filePath)) return outsideScope(filePath);
  if (typeof content !== 'string') return { success: false, error: 'Contenu invalide.' };
  try {
    atomicWriteFile(filePath, content);
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Créer un projet — refuse un nom existant pour ne jamais écraser ses fichiers
handle('create-project', async (event, name) => {
  const invalid = validateProjectName(name);
  if (invalid) return { success: false, error: invalid };
  const projectName = name.trim();
  const projectPath = path.join(PROJECTS_PATH, projectName);
  try {
    fs.mkdirSync(PROJECTS_PATH, { recursive: true });
    const existing = fs.readdirSync(PROJECTS_PATH).map(n => n.toLowerCase());
    if (existing.includes(projectName.toLowerCase())) {
      return { success: false, error: `Un projet « ${projectName} » existe déjà.` };
    }
    fs.mkdirSync(projectPath);
    const initialData = {
      title: projectName,
      script: [], sequences: [], characters: [], places: [], systems: [],
      timeline: [], refs: [], todos: []
    };
    atomicWriteFile(path.join(projectPath, '_PROJECT.json'), JSON.stringify(initialData, null, 2));
    atomicWriteFile(path.join(projectPath, '_NOTES.md'), `# Notes — ${projectName}\n\n`);
    return { success: true, project: { name: projectName, path: projectPath } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Fermeture : le renderer confirme après avoir enregistré
handle('confirm-close', async () => {
  closeConfirmed = true;
  setImmediate(() => mainWindow && mainWindow.close());
  return { success: true };
});

// Lister les projets
handle('list-projects', async () => {
  try {
    if (!fs.existsSync(PROJECTS_PATH)) {
      fs.mkdirSync(PROJECTS_PATH, { recursive: true });
    }
    
    const items = fs.readdirSync(PROJECTS_PATH, { withFileTypes: true });
    const projects = items
      .filter(item => item.isDirectory())
      .map(item => ({
        name: item.name,
        path: path.join(PROJECTS_PATH, item.name)
      }));
    
    return { success: true, projects };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Lister les fichiers d'un dossier
handle('list-files', async (event, dirPath) => {
  if (!isAllowedPath(dirPath)) return outsideScope(dirPath);
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = items.map(item => ({
      name: item.name,
      path: path.join(dirPath, item.name),
      isDirectory: item.isDirectory()
    }));
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Obtenir les chemins de base
handle('get-paths', () => {
  return {
    partner: PARTNER_PATH,
    projects: PROJECTS_PATH,
    inbox: INBOX_PATH
  };
});

// === Paramètres & clé API ===
// La clé est chiffrée via safeStorage (DPAPI sous Windows, liée à la session utilisateur)
// et ne quitte jamais le main process : le renderer ne reçoit que `hasApiKey`.
const SETTINGS_PATH = path.join(PARTNER_PATH, 'App', 'settings.json');

function readSettingsFile() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
  } catch (e) {}
  return { theme: 'dark', apiProvider: 'openai' };
}

function writeSettingsFile(stored) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(stored, null, 2));
}

function encryptKey(plainKey) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Chiffrement indisponible sur ce système : clé non enregistrée.');
  }
  return safeStorage.encryptString(plainKey).toString('base64');
}

function getApiKey() {
  const stored = readSettingsFile();
  if (!stored.apiKeyEnc) return '';
  try {
    return safeStorage.decryptString(Buffer.from(stored.apiKeyEnc, 'base64'));
  } catch (e) {
    return '';
  }
}

// Migration : une ancienne clé en clair est chiffrée puis retirée du fichier
function migratePlainKey() {
  const stored = readSettingsFile();
  if (!stored.apiKey) return;
  try {
    stored.apiKeyEnc = encryptKey(stored.apiKey);
    delete stored.apiKey;
    writeSettingsFile(stored);
  } catch (e) {
    console.error('Migration de la clé API impossible :', e.message);
  }
}

// Lire les paramètres (sans jamais renvoyer la clé)
handle('get-settings', async () => {
  const stored = readSettingsFile();
  return {
    theme: stored.theme || 'dark',
    apiProvider: stored.apiProvider || 'openai',
    hasApiKey: Boolean(stored.apiKeyEnc)
  };
});

// Sauver les paramètres — apiKey vide = conserver la clé existante
handle('save-settings', async (event, settings) => {
  try {
    const stored = readSettingsFile();
    stored.theme = settings.theme;
    stored.apiProvider = settings.apiProvider;
    if (settings.clearApiKey) {
      delete stored.apiKeyEnc;
    } else if (typeof settings.apiKey === 'string' && settings.apiKey.trim()) {
      stored.apiKeyEnc = encryptKey(settings.apiKey.trim());
    }
    delete stored.apiKey;
    writeSettingsFile(stored);
    return { success: true, hasApiKey: Boolean(stored.apiKeyEnc) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Appel IA depuis le main process (la clé n'est jamais exposée au renderer)
handle('ai-chat', async (event, provider, systemPrompt, userMessage) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { success: false, error: 'Aucune clé API configurée.' };
  }

  try {
    let response;
    if (provider === 'openai') {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.7,
          max_tokens: 4000
        })
      });
    } else if (provider === 'anthropic') {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }]
        })
      });
    } else {
      return { success: false, error: `Fournisseur inconnu : ${provider}` };
    }

    const errorOrBody = await response.text();
    if (!response.ok) {
      let message = errorOrBody || 'Erreur API inconnue';
      try {
        message = JSON.parse(errorOrBody).error?.message || message;
      } catch (e) {}
      return { success: false, error: message };
    }

    const data = JSON.parse(errorOrBody);
    const text = provider === 'openai' ? data.choices[0].message.content : data.content[0].text;
    return { success: true, text };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Créer un dossier (avec parents)
handle('create-directory', async (event, dirPath) => {
  if (!isAllowedPath(dirPath)) return outsideScope(dirPath);
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Dialogue pour demander un texte
handle('show-prompt', async (event, title, label) => {
  const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: title,
    message: label,
    buttons: ['Annuler', 'Créer'],
    defaultId: 1,
  });
  return response === 1 ? true : false;
});

// App lifecycle
app.whenReady().then(() => {
  migratePlainKey();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
