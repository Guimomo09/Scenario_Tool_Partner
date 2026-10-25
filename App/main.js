const { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  isPathInside, atomicWriteFile, validateProjectName, writeWithBackup, listBackups, restoreBackup
} = require('./lib/safe-fs');
const ProjectSchema = require('./src/core/schema');
const AI = require('./lib/ai-providers');
const Settings = require('./lib/settings');

let mainWindow;
// Fermeture autorisée une fois que le renderer a vidé ses sauvegardes en attente
let closeConfirmed = false;

// Chemin vers le dossier Partner
const PARTNER_PATH = path.join(__dirname, '..');
const PROJECTS_PATH = path.join(PARTNER_PATH, 'Projets');
const INBOX_PATH = path.join(PARTNER_PATH, 'Inbox');

// Désactiver le cache en développement
app.commandLine.appendSwitch('disable-http-cache');

// Dossier de données fixe : il contient la clé (Local State) qui déchiffre les clés API enregistrées.
// Il ne doit jamais dépendre du nom de l'app, sinon les clés deviennent illisibles.
app.setPath('userData', path.join(app.getPath('appData'), 'writing-partner'));
// Identité Windows : la fenêtre se regroupe sous l'icône Partner dans la barre des tâches
if (process.platform === 'win32') app.setAppUserModelId('com.partner.writing');
// Une seule instance : relancer depuis le raccourci ramène la fenêtre déjà ouverte
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function createWindow() {
  closeConfirmed = false;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Partner',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    frame: process.platform === 'darwin' ? true : true,
    backgroundColor: '#F4F0E8'
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
        { label: 'Restaurer une sauvegarde du projet…', click: () => mainWindow.webContents.send('menu-restore-backup') },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' }
      ]
    },
    {
      label: 'Édition',
      submenu: [
        // Le renderer choisit : annulation du texte dans un champ, sinon de la Structure / Bible
        { label: 'Annuler', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow.webContents.send('menu-undo') },
        { label: 'Rétablir', accelerator: 'CmdOrCtrl+Y', click: () => mainWindow.webContents.send('menu-redo') },
        { label: 'Rétablir', accelerator: 'CmdOrCtrl+Shift+Z', visible: false, click: () => mainWindow.webContents.send('menu-redo') },
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
        { label: 'Écrire', accelerator: 'CmdOrCtrl+Shift+1', click: () => mainWindow.webContents.send('workspace', 'write') },
        { label: 'Structure', accelerator: 'CmdOrCtrl+Shift+2', click: () => mainWindow.webContents.send('workspace', 'structure') },
        { label: 'Bible', accelerator: 'CmdOrCtrl+Shift+3', click: () => mainWindow.webContents.send('workspace', 'bible') },
        { label: 'Lecture', accelerator: 'CmdOrCtrl+Shift+4', click: () => mainWindow.webContents.send('workspace', 'lecture') },
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
      label: 'Partenaire',
      submenu: [
        { label: 'Afficher / masquer le partenaire', accelerator: 'CmdOrCtrl+Shift+P', click: () => mainWindow.webContents.send('toggle-partner') },
        { type: 'separator' },
        { label: 'Explorer', accelerator: 'CmdOrCtrl+1', click: () => mainWindow.webContents.send('partner-intent', 'explorer') },
        { label: 'Structurer', accelerator: 'CmdOrCtrl+2', click: () => mainWindow.webContents.send('partner-intent', 'structurer') },
        { label: 'Écrire', accelerator: 'CmdOrCtrl+3', click: () => mainWindow.webContents.send('partner-intent', 'ecrire') },
        { label: 'Réviser', accelerator: 'CmdOrCtrl+4', click: () => mainWindow.webContents.send('partner-intent', 'reviser') },
        { label: 'Vérifier la cohérence', accelerator: 'CmdOrCtrl+5', click: () => mainWindow.webContents.send('partner-intent', 'coherence') }
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
    const initialData = ProjectSchema.createEmptyProject(projectName);
    atomicWriteFile(path.join(projectPath, '_PROJECT.json'), JSON.stringify(initialData, null, 2));
    atomicWriteFile(path.join(projectPath, '_NOTES.md'), `# Notes — ${projectName}\n\n`);
    return { success: true, project: { name: projectName, path: projectPath } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Dossier de projet direct (Projets/<Nom>), jamais un sous-dossier ni un autre emplacement
const isProjectDir = (p) => typeof p === 'string' && isAllowedPath(p) &&
  path.resolve(path.dirname(p)).toLowerCase() === path.resolve(PROJECTS_PATH).toLowerCase();

// Migration de _PROJECT.json : sauvegarde datée, puis écriture vérifiée.
// Le main process recontrôle que rien n'est perdu par rapport au fichier sur disque.
handle('migrate-project', async (event, projectPath, content, options = {}) => {
  if (!isProjectDir(projectPath)) return outsideScope(projectPath);
  if (typeof content !== 'string') return { success: false, error: 'Contenu invalide.' };
  const filePath = path.join(projectPath, '_PROJECT.json');
  try {
    const before = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const after = JSON.parse(content);
    if (ProjectSchema.schemaVersionOf(before) >= ProjectSchema.SCHEMA_VERSION) {
      return { success: false, error: 'Le fichier sur disque est déjà au format actuel.' };
    }
    const problems = ProjectSchema.verifyMigration(before, after, { rolesToSuggestions: !!options.rolesToSuggestions });
    if (problems.length) {
      return { success: false, error: `Migration refusée, des données seraient modifiées : ${problems.slice(0, 5).join(' ; ')}` };
    }
    const backupPath = writeWithBackup(filePath, content, `v${ProjectSchema.schemaVersionOf(before)}`);
    return { success: true, backup: path.basename(backupPath) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

handle('list-project-backups', async (event, projectPath) => {
  if (!isProjectDir(projectPath)) return outsideScope(projectPath);
  try {
    return { success: true, backups: listBackups(projectPath) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

handle('restore-project-backup', async (event, projectPath, backupName) => {
  if (!isProjectDir(projectPath)) return outsideScope(projectPath);
  try {
    return { success: true, ...restoreBackup(projectPath, backupName) };
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

// === Paramètres & clés API ===
// Une clé par fournisseur, chiffrée via safeStorage (DPAPI sous Windows, liée à la session
// utilisateur). Les clés ne quittent jamais le main process : le renderer ne voit que `hasApiKey`.
const SETTINGS_PATH = path.join(PARTNER_PATH, 'App', 'settings.json');

function readSettingsFile() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('settings.json illisible :', e.message);
  }
  return { theme: 'light', apiProvider: 'none' };
}

function writeSettingsFile(stored) {
  atomicWriteFile(SETTINGS_PATH, JSON.stringify(stored, null, 2));
}

function encryptKey(plainKey) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Chiffrement indisponible sur ce système : clé non enregistrée.');
  }
  return safeStorage.encryptString(plainKey).toString('base64');
}

// Clé déchiffrée, ou la raison exacte de son absence (non enregistrée / illisible)
function readApiKey(provider) {
  const enc = readSettingsFile().providers?.[provider]?.apiKeyEnc;
  if (!enc) return { key: '', error: null };
  try {
    return { key: safeStorage.decryptString(Buffer.from(enc, 'base64')), error: null };
  } catch (e) {
    const label = AI.PROVIDERS[provider]?.label || provider;
    return { key: '', error: `La clé ${label} enregistrée ne peut pas être déchiffrée sur ce poste ou ce profil. Saisissez-la de nouveau dans Paramètres.` };
  }
}

// Ancien format (clé unique, éventuellement en clair) → une clé chiffrée par fournisseur
function migrateSettingsFile() {
  try {
    const { settings, changed } = Settings.migrateSettings(readSettingsFile(), encryptKey);
    if (changed) writeSettingsFile(settings);
  } catch (e) {
    console.error('Migration des paramètres impossible :', e.message);
  }
}

handle('get-settings', async () => Settings.publicSettings(readSettingsFile()));

handle('save-settings', async (event, update) => {
  if (!update || typeof update !== 'object') return { success: false, error: 'Paramètres invalides.' };
  try {
    const stored = Settings.applySettingsUpdate(readSettingsFile(), update, encryptKey);
    writeSettingsFile(stored);
    return { success: true, settings: Settings.publicSettings(readSettingsFile()) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Appels IA en cours, annulables par leur identifiant
const aiRequests = new Map();

// Appel IA depuis le main process avec le fournisseur et le modèle choisis dans les paramètres
handle('ai-chat', async (event, requestId, payload) => {
  if (typeof requestId !== 'string' || !requestId || aiRequests.has(requestId)) {
    return { success: false, error: 'Identifiant de demande invalide.' };
  }
  const stored = readSettingsFile();
  const provider = Settings.activeProvider(stored);
  if (provider === 'none') return { success: false, error: 'Aucun fournisseur IA choisi (Paramètres).' };
  const { key, error: keyError } = readApiKey(provider);
  if (keyError) return { success: false, error: keyError };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  aiRequests.set(requestId, controller);
  try {
    const result = await AI.chat(provider, {
      apiKey: key,
      model: Settings.modelFor(stored, provider),
      system: payload?.system,
      messages: payload?.messages,
      signal: controller.signal
    });
    return { ...result, provider, model: result.model || Settings.modelFor(stored, provider) };
  } finally {
    clearTimeout(timeout);
    aiRequests.delete(requestId);
  }
});

handle('ai-cancel', async (event, requestId) => {
  const controller = aiRequests.get(requestId);
  if (controller) controller.abort();
  return { success: Boolean(controller) };
});

handle('ai-list-models', async (event, provider) => {
  if (!AI.isProvider(provider)) return { success: false, error: 'Fournisseur inconnu.' };
  const { key, error } = readApiKey(provider);
  if (error) return { success: false, error };
  return AI.listModels(provider, { apiKey: key });
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
  migrateSettingsFile();
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
