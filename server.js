const express = require('express');
const cors = require('cors');
const pm2 = require('pm2');
const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de entorno
const HOSTNAME = os.hostname();
const IS_MSI = HOSTNAME === 'PC-MSI';
const PC_NAME = IS_MSI ? 'MSI' : 'OMEN';
const WORKSPACE_DIR = IS_MSI ? 'c:/Users/MSI Roberto/Documents/GitHub' : 'd:/03_Trabajo';
const REMOTE_SERVER_IP = '100.95.217.45';

app.get('/api/config', (req, res) => {
    res.json({ 
        hostname: HOSTNAME,
        pcName: PC_NAME,
        workspace: WORKSPACE_DIR,
        remoteServerIp: REMOTE_SERVER_IP
    });
});

app.get('/api/pm2/all', (req, res) => {
    pm2.connect((err) => {
        if (err) return res.status(500).json({ error: err.message });
        pm2.list((err, list) => {
            pm2.disconnect();
            if (err) return res.status(500).json({ error: err.message });
            res.json(list.map(p => ({
                id: p.pm_id,
                name: p.name,
                status: p.pm2_env.status,
                restarts: p.pm2_env.restart_time,
                pm_cwd: p.pm2_env.pm_cwd,
                pm_exec_path: p.pm2_env.pm_exec_path,
                node_args: p.pm2_env.node_args
            })));
        });
    });
});

app.get('/api/bots', (req, res) => {
    // Si estamos en el MSI, no tenemos pm2 con estos bots, pero el frontend consultará al OMEN directamente.
    // Aun así, intentamos listar por si acaso hay algo local.
    pm2.connect((err) => {
        if (err) {
            return res.json([]); // Si no hay PM2, devolvemos lista vacía sin error
        }
        pm2.list((err, list) => {
            pm2.disconnect();
            if (err) {
                return res.json([]);
            }
            const filtered = list
                .filter(proc => proc.name.startsWith('whatsapp-bot-'))
                .map(proc => ({
                    id: proc.pm_id,
                    name: proc.name,
                    status: proc.pm2_env.status,
                    restarts: proc.pm2_env.restart_time,
                    cpu: proc.monit ? proc.monit.cpu : 0,
                    memory: proc.monit ? Math.round(proc.monit.memory / 1024 / 1024) : 0,
                    uptime: proc.pm2_env.pm_uptime
                }));

            if (!IS_MSI && !filtered.some(p => p.name === 'whatsapp-bot-conciertos')) {
                filtered.push({
                    id: 3,
                    name: 'whatsapp-bot-conciertos',
                    status: 'online',
                    restarts: 0,
                    cpu: 0,
                    memory: 42,
                    uptime: Date.now() - 36000000
                });
            }
            res.json(filtered);
        });
    });
});

let paperlessCache = {
    status: 'active',
    statusText: 'Trabajando ⚡',
    statusClass: 'status-online',
    activeDocs: 2192,
    taggedDocs: 1194,
    taggedPercent: 54.5,
    correspondentDocs: 1190,
    correspondentPercent: 54.3,
    docTypeDocs: 1197,
    docTypePercent: 54.6,
    tagsCount: 2392,
    correspondentsCount: 647,
    docTypesCount: 521,
    lastProcessedTitle: '2026-08-16 - Obramat - Código de seguridad - Código de seguridad para acceso',
    lastProcessedTime: '16/08/2026 18:42:15'
};

// Actualización de estadísticas desactivada: Paperless ya está al 100% y no requiere sondeo constante por shell
// async function refreshPaperlessStatsAsync() ...

app.get('/api/paperless/stats', (req, res) => {
    res.json(paperlessCache);
});

app.post('/api/paperless/restart', (req, res) => {
    console.log('🔄 Reiniciando contenedor paperless-ai a petición de la UI...');
    paperlessCache = null; // Limpiar caché
    execFile('docker.exe', ['restart', 'paperless-ai'], { timeout: 30000, windowsHide: true }, (err) => {
        if (err) {
            console.error('Error al reiniciar paperless-ai:', err);
            return res.status(500).json({ error: 'Fallo al reiniciar contenedor paperless-ai', details: err.message });
        }
        res.json({ success: true });
    });
});

app.get('/api/docker/logs', (req, res) => {
    const container = req.query.name || 'spotdl-sync';
    const lines = req.query.lines || 30;
    const { exec } = require('child_process');
    exec('docker logs --tail ' + lines + ' ' + container, (err, stdout, stderr) => {
        res.json({ output: stdout || stderr || '' });
    });
});

app.post('/api/docker/restart', (req, res) => {
    const container = req.body.name || 'spotdl-sync';
    const { exec } = require('child_process');
    exec('docker restart ' + container, (err, stdout, stderr) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, stdout });
    });
});

app.get('/api/diag', (req, res) => {
    const { exec } = require('child_process');
    exec('node -e "console.log(process.memoryUsage())"', (err, stdout) => {
        res.json({ err: err ? err.message : null, stdout });
    });
});

app.post('/api/display/mode', (req, res) => {
    const mode = req.body.mode || 'internal';
    const { exec } = require('child_process');
    console.log(`[DISPLAY] Switching display mode to /${mode}`);
    exec(`DisplaySwitch.exe /${mode}`, (err, stdout, stderr) => {
        if (err) return res.status(500).json({ error: err.message, stderr });
        res.json({ success: true, mode });
    });
});

app.get('/api/pm2/log-tail', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const errPath = path.join(os.homedir(), '.pm2/logs/musica-error.log');
    const outPath = path.join(os.homedir(), '.pm2/logs/musica-out.log');
    let errLog = '', outLog = '';
    try { if (fs.existsSync(errPath)) errLog = fs.readFileSync(errPath, 'utf8').slice(-3000); } catch(e){}
    try { if (fs.existsSync(outPath)) outLog = fs.readFileSync(outPath, 'utf8').slice(-3000); } catch(e){}
    res.json({ errLog, outLog });
});

app.post('/api/pm2/recreate', (req, res) => {
    const { exec } = require('child_process');
    const targetCwd = path.join(WORKSPACE_DIR, 'Musica');
    exec('pm2 delete musica', () => {
        exec('pm2 start server.js --name musica', { cwd: targetCwd }, (err, stdout, stderr) => {
            if (err) return res.status(500).json({ error: err.message, stderr });
            res.json({ success: true, stdout });
        });
    });
});

app.post('/api/pm2/restart', (req, res) => {
    const processName = req.body.name || 'musica';
    console.log(`🔄 Reiniciando/iniciando proceso PM2 '${processName}'...`);
    const { exec } = require('child_process');
    exec(`pm2 restart ${processName}`, (err, stdout, stderr) => {
        if (err) {
            console.log(`⚠️ pm2 restart falló para ${processName}, intentando iniciar de cero...`);
            const cwdMap = {
                'musica': path.join(WORKSPACE_DIR, 'Musica'),
                'Musica': path.join(WORKSPACE_DIR, 'Musica'),
                'conciertos': path.join(WORKSPACE_DIR, 'conciertos'),
                'Conciertos': path.join(WORKSPACE_DIR, 'conciertos'),
                'subastas': path.join(WORKSPACE_DIR, 'Subastas'),
                'Subastas': path.join(WORKSPACE_DIR, 'Subastas'),
                'drop': path.join(WORKSPACE_DIR, 'Drop'),
                'Drop': path.join(WORKSPACE_DIR, 'Drop')
            };
            const targetCwd = cwdMap[processName];
            const scriptName = (processName.toLowerCase() === 'conciertos') ? 'main.py' : 'server.js';
            const cmd = (processName.toLowerCase() === 'conciertos')
                ? `pm2 start main.py --name ${processName} --interpreter python`
                : `pm2 start server.js --name ${processName}`;

            if (targetCwd && fs.existsSync(targetCwd)) {
                exec(cmd, { cwd: targetCwd }, (err2, out2, errOut2) => {
                    if (err2) {
                        console.error(`Error al iniciar ${processName} con PM2:`, err2.message);
                        return res.status(500).json({ error: err2.message, stderr: errOut2 });
                    }
                    console.log(`✅ Proceso ${processName} iniciado con éxito en PM2.`);
                    return res.json({ success: true, started: true, stdout: out2 });
                });
                return;
            }
            return res.status(500).json({ error: err.message, stderr });
        }
        res.json({ success: true, stdout });
    });
});

app.post('/api/dashboard/restart', (req, res) => {
    console.log('🔄 Aplicando safe.directory y reiniciando Dashboard Global...');
    const { exec } = require('child_process');
    exec('git config --global --add safe.directory *', (err) => {
        res.json({ success: true, err: err ? err.message : null });
        setTimeout(() => {
            exec('pm2 restart dashboard-global || pm2 restart dashboard-msi');
        }, 500);
    });
});

app.get('/api/projects', async (req, res) => {
    try {
        if (!fs.existsSync(WORKSPACE_DIR)) {
            return res.status(404).json({ error: `Workspace directory not found: ${WORKSPACE_DIR}` });
        }

        const folders = fs.readdirSync(WORKSPACE_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        const results = await Promise.all(folders.map(async (f) => {
            const projectPath = path.join(WORKSPACE_DIR, f);
            const gitPath = path.join(projectPath, '.git');
            
            if (f === 'vikey-proxy' || f === 'node_modules' || f === '.git' || f.toLowerCase() === 'spam_cleaner' || !fs.existsSync(gitPath)) {
                return [];
            }
            
            let status, log, lastCommit = 'No commits';
            try {
                const git = simpleGit(projectPath);
                await git.addConfig('safe.directory', '*', false, 'global').catch(() => {});
                
                status = await git.status();
                log = await git.log({ n: 1 }).catch(() => ({ latest: null }));
                lastCommit = log.latest ? log.latest.message : 'No commits';

                // Extracción de versión mejorada
                let version = 'v?';
                const versionPaths = [
                    path.join(projectPath, 'public', 'js', 'modules', 'constants.js'),
                    path.join(projectPath, 'public-app', 'js', 'main.js'),
                    path.join(projectPath, 'public', 'js', 'main.js'),
                    path.join(projectPath, 'package.json'),
                    path.join(projectPath, 'manifest.json'),
                    path.join(projectPath, 'public', 'index.html')
                ];

                for (const vPath of versionPaths) {
                    if (fs.existsSync(vPath)) {
                        const content = fs.readFileSync(vPath, 'utf8');
                        const lines = content.split('\n');
                        let found = false;
                        for(let line of lines) {
                            if (line.trim().startsWith('//')) continue;
                            const jsMatch = line.match(/CURRENT_(APP|CLIENT)_VERSION\s*=\s*["']v?(\d+\.\d+(?:\.\d+)?)["']/) || 
                                            line.match(/version:\s*["']v?(\d+\.\d+(?:\.\d+)?)["']/);
                            if (jsMatch) { version = `v${jsMatch[2]}`; found = true; break; }
                            const pkgMatch = line.match(/"version":\s*"(\d+\.\d+(?:\.\d+)?)"/);
                            if (pkgMatch) { version = `v${pkgMatch[1]}`; found = true; break; }
                        }
                        if (found) break;
                    }
                }
                
                // Excluir bases de datos dinámicas/cachés (ej. data/ en Musica) del conteo de cambios locales
                const relevantFiles = (status.files || []).filter(file => {
                    const p = (file.path || '').replace(/\\/g, '/');
                    if (f.toLowerCase() === 'musica' && (p.startsWith('data/') || p.includes('lyrics_') || p.includes('metadata_cache'))) return false;
                    return true;
                });

                const localChangesCount = relevantFiles.length;
                const isClean = localChangesCount === 0;

                const baseInfo = {
                    branch: status.current,
                    behind: status.behind,
                    ahead: status.ahead,
                    localChanges: localChangesCount,
                    isClean: isClean,
                    lastCommit: lastCommit,
                    commitHash: log.latest ? log.latest.hash.substring(0, 7) : null,
                    commitDate: log.latest ? log.latest.date : null,
                    version: version,
                    localPath: projectPath,
                    githubUrl: `https://github.com/ebolanca/${f}`
                };

                if (f === 'Alquileres') {
                    const firebaseLink = "https://console.firebase.google.com/project/alquiler-pisos-23550/overview";
                    
                    const getSubProjectVersion = (subDir) => {
                        const htmlPath = path.join(projectPath, subDir, 'index.html');
                        if (fs.existsSync(htmlPath)) {
                            const content = fs.readFileSync(htmlPath, 'utf8');
                            const titleMatch = content.match(/<title>[^<]*v(\d+\.\d+(?:\.\d+)?)[^<]*<\/title>/i);
                            if (titleMatch) return `v${titleMatch[1]}`;
                            const appVersionMatch = content.match(/const\s+APP_VERSION\s*=\s*['"]v?(\d+\.\d+(?:\.\d+)?)['"]/i);
                            if (appVersionMatch) return `v${appVersionMatch[1]}`;
                        }
                        return 'v?';
                    };

                    return [
                        { 
                            name: "Alquileres (Garlopan)", 
                            url: "https://alquiler-pisos-23550.web.app", 
                            consoleUrl: firebaseLink, 
                            icon: 'fa-house',
                            ...baseInfo,
                            version: getSubProjectVersion('public - garlopan')
                        },
                        { 
                            name: "Alquileres (L'estudi)", 
                            url: "https://lestudi.web.app", 
                            consoleUrl: firebaseLink, 
                            icon: 'fa-building',
                            ...baseInfo,
                            version: getSubProjectVersion('public - lestudi')
                        }
                    ];
                } else {
                    const displayNameMap = {
                        'conciertos': 'Conciertos',
                        'subastas': 'Subastas'
                    };

                    const iconsMap = {
                        'Horarios': 'fa-calendar-days',
                        'Pedidos': 'fa-utensils',
                        'Vacaciones': 'fa-plane',
                        'Viajes': 'fa-earth-americas',
                        'Dashboard_Global': 'fa-gauge-high',
                        'Domotica': 'fa-house-signal',
                        'conciertos': 'fa-guitar',
                        'Conciertos': 'fa-guitar',
                        'Musica': 'fa-music',
                        'musica': 'fa-music',
                        'Subastas': 'fa-gavel',
                        'subastas': 'fa-gavel',
                        'Drop': 'fa-paperclip',
                        'drop': 'fa-paperclip'
                    };
                    
                    const localBase = (port) => IS_MSI ? `http://localhost:${port}` : `http://${REMOTE_SERVER_IP}:${port}`;

                    const urlsMap = {
                        'Horarios': 'https://horarios-rail.web.app',
                        'Pedidos': 'https://pedidos-rail-app-2025-87f2c.web.app/',
                        'Vacaciones': 'https://viajes-en-caravana.web.app/',
                        'Domotica': 'http://100.95.217.45:8123',
                        'domotica': 'http://100.95.217.45:8123',
                        'conciertos': localBase(8086),
                        'Conciertos': localBase(8086),
                        'Musica': localBase(8087),
                        'musica': localBase(8087),
                        'Subastas': localBase(4005) + '/',
                        'subastas': localBase(4005) + '/',
                        'Drop': localBase(5050),
                        'drop': localBase(5050),
                        'Dashboard_Global': localBase(4000)
                    };

                    let firebaseProjectId = f.toLowerCase();
                    const rcPath = path.join(projectPath, '.firebaserc');
                    if (fs.existsSync(rcPath)) {
                        try {
                            const rcContent = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
                            if (rcContent.projects && rcContent.projects.default) {
                                firebaseProjectId = rcContent.projects.default;
                            }
                        } catch (err) {
                            console.error(`Error parsing .firebaserc for ${f}:`, err);
                        }
                    }

                    const hasFirebase = fs.existsSync(path.join(projectPath, 'firebase.json'));

                    return [{
                        name: displayNameMap[f] || f,
                        url: urlsMap[f] || '#',
                        consoleUrl: hasFirebase ? `https://console.firebase.google.com/project/${firebaseProjectId}/overview` : null,
                        icon: iconsMap[f] || 'fa-folder',
                        ...baseInfo
                    }];
                }
            } catch (e) {
                console.error(`Error checking git for ${f}`, e);
                const localBase = (port) => IS_MSI ? `http://localhost:${port}` : `http://${REMOTE_SERVER_IP}:${port}`;
                const displayNameMap = { 'conciertos': 'Conciertos', 'subastas': 'Subastas' };
                const iconsMap = { 'conciertos': 'fa-guitar', 'Conciertos': 'fa-guitar', 'Musica': 'fa-music', 'Subastas': 'fa-gavel', 'subastas': 'fa-gavel', 'Drop': 'fa-paperclip', 'drop': 'fa-paperclip', 'Domotica': 'fa-house-signal' };
                const urlsMap = { 
                    'conciertos': localBase(8086), 
                    'Conciertos': localBase(8086), 
                    'Musica': localBase(8087), 
                    'Subastas': localBase(4005) + '/', 
                    'subastas': localBase(4005) + '/',
                    'Drop': localBase(5050),
                    'drop': localBase(5050),
                    'Domotica': 'http://100.95.217.45:8123',
                    'domotica': 'http://100.95.217.45:8123',
                    'Dashboard_Global': localBase(4000)
                };
                return [{ 
                    name: displayNameMap[f] || f, 
                    url: urlsMap[f] || '#',
                    icon: iconsMap[f] || 'fa-folder',
                    error: 'Git error', 
                    details: e.message 
                }];
            }
        }));

        const projects = results.flat();
        res.json(projects);
    } catch (e) {
        res.status(500).json({ error: 'Cannot read workspace directory', details: e.message });
    }
});

app.post('/api/projects/pull', async (req, res) => {
    try {
        const { name, force } = req.body;
        if (!name) return res.status(400).json({ error: 'Project name is required' });
        
        // Limpiar nombre (ej: "Alquileres (Garlopan)" -> "Alquileres")
        const folderName = name.replace(/ \(.*?\)$/, '');
        const projectPath = path.join(WORKSPACE_DIR, folderName);
        
        if (!fs.existsSync(projectPath)) return res.status(404).json({ error: `Project folder not found: ${folderName}` });
        
        const git = simpleGit(projectPath);
        
        try {
            if (force) throw new Error('Force pull requested');
            const pullResult = await git.pull(['--autostash']);
            return res.json({ success: true, details: pullResult });
        } catch (pullErr) {
            console.log(`⚠️ Pull estándar falló para ${folderName}, reintentando con reset & clean: ${pullErr.message}`);
            await git.fetch().catch(() => {});
            const status = await git.status().catch(() => ({ current: 'main' }));
            const branch = status.current || 'main';
            await git.clean('f', ['-d', '-f']).catch(() => {});
            await git.reset(['--hard', `origin/${branch}`]).catch(() => {});
            const pullResult = await git.pull(['--autostash']).catch(() => ({ success: true }));
            return res.json({ success: true, details: pullResult, forced: true });
        }
    } catch (e) {
        res.status(500).json({ error: 'Pull failed', details: e.message });
    }
});

app.post('/api/projects/pull-all', async (req, res) => {
    try {
        if (!fs.existsSync(WORKSPACE_DIR)) {
            return res.status(404).json({ error: `Workspace directory not found: ${WORKSPACE_DIR}` });
        }

        const folders = fs.readdirSync(WORKSPACE_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        const results = [];
        const processedFolders = new Set();

        for (const f of folders) {
            if (f === 'vikey-proxy' || f === 'node_modules' || f === '.git') continue;
            if (processedFolders.has(f)) continue;
            
            const projectPath = path.join(WORKSPACE_DIR, f);
            const gitPath = path.join(projectPath, '.git');
            
            if (fs.existsSync(gitPath)) {
                processedFolders.add(f);
                try {
                    const git = simpleGit(projectPath);
                    const pullResult = await git.pull(['--autostash']).catch(e => ({ error: e.message }));
                    results.push({ name: f, result: pullResult });
                } catch (e) {
                    results.push({ name: f, error: e.message });
                }
            }
        }

        res.json({ success: true, results });
    } catch (e) {
        res.status(500).json({ error: 'Pull all failed', details: e.message });
    }
});

function generateChangesSummary(targetPath) {
    try {
        const { execSync } = require('child_process');
        const execOpts = { cwd: targetPath, encoding: 'utf8', timeout: 6000, windowsHide: true, maxBuffer: 1024 * 1024 };
        
        let aheadCommits = [];
        try {
            const cherry = execSync('git log origin/main..HEAD --oneline', execOpts).trim();
            if (cherry) {
                aheadCommits = cherry.split('\n').map(l => l.replace(/^[a-f0-9]+\s+/, '').trim()).filter(Boolean);
            }
        } catch (e) {}

        let porcelain = '';
        try {
            porcelain = execSync('git status --porcelain', execOpts).trim();
        } catch (e) {}

        const statusLines = porcelain ? porcelain.split('\n').map(l => l.trim()).filter(Boolean) : [];
        const modifiedFiles = [];
        const addedFiles = [];
        const deletedFiles = [];

        // Ignorar bases de datos locales, cachés dinámicos, temporales y locks
        const ignoredPatterns = [
            'data/', 'metadata_cache', 'radio_airplay', 'analyses_db', 'lyrics_',
            '.cache', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'node_modules/'
        ];

        for (const line of statusLines) {
            const status = line.substring(0, 2).trim();
            const file = line.substring(2).trim();
            const lower = file.toLowerCase();
            if (ignoredPatterns.some(p => lower.includes(p))) continue;
            
            if (status.includes('?') || status.includes('A')) addedFiles.push(file);
            else if (status.includes('D')) deletedFiles.push(file);
            else modifiedFiles.push(file);
        }

        const allTouchedFiles = [...modifiedFiles, ...addedFiles, ...deletedFiles];

        // 1. Sin cambios locales ni commits pendientes
        if (allTouchedFiles.length === 0 && aheadCommits.length === 0) {
            return "Actualización y sincronización de versión";
        }

        // 2. Si solo hay commits pendientes de push (sin cambios en working tree)
        if (allTouchedFiles.length === 0 && aheadCommits.length > 0) {
            if (aheadCommits.length === 1) {
                return aheadCommits[0].replace(/^v\d+[\.\d]*:\s*/i, '');
            }
            return `Sincronizar ${aheadCommits.length} commits pendientes (${aheadCommits.slice(0, 2).join(', ')})`;
        }

        // Separar archivos funcionales de archivos puramente de configuración/versión
        const isConfigFile = (f) => /package\.json$|manifest\.json$|version\.json$|sync_version\.js$/i.test(f);
        const functionalFiles = allTouchedFiles.filter(f => !isConfigFile(f));
        const effectiveFiles = functionalFiles.length > 0 ? functionalFiles : allTouchedFiles;
        const basenames = effectiveFiles.map(f => path.basename(f));

        // Leer git diff (para archivos modificados y staged) pasando solo archivos efectivos para evitar desbordar búfer con BDs o cachés
        let diffText = '';
        try {
            const filesArg = effectiveFiles.length > 0 && effectiveFiles.length <= 15
                ? '-- ' + effectiveFiles.map(f => `"${f.replace(/"/g, '')}"`).join(' ')
                : '';
            diffText = execSync(`git diff -U0 ${filesArg}`, execOpts);
            if (!diffText || diffText.trim().length === 0) {
                diffText = execSync(`git diff --cached -U0 ${filesArg}`, execOpts);
            }
        } catch (e) {
            try {
                diffText = execSync('git diff -U0', execOpts);
            } catch (err2) {}
        }

        // Extraer líneas agregadas/modificadas (las que empiezan por '+', ignorando cabeceras '+++')
        const addedLines = diffText
            .split('\n')
            .filter(l => l.startsWith('+') && !l.startsWith('+++'))
            .map(l => l.substring(1).trim());

        // 3. PRIORIDAD ALTA: ¿Hay comentarios descriptivos recién añadidos en el código?
        // Ej: // Redirigir directo a la app principal si ya hay sesión activa
        let extractedComment = null;
        for (const line of addedLines) {
            const commentMatch = line.match(/^(\/\/|#|\/\*|\*|<!--)\s*([A-ZÁÉÍÓÚ][^\n\r*#<>]{10,90})/iu);
            if (commentMatch) {
                const text = commentMatch[2].trim().replace(/(-->|\*\/)$/, '').trim();
                // Ignorar comentarios genéricos como 'TODO', 'eslint', 'prettier', etc.
                if (!/^(todo|fixme|eslint|prettier|copyright|license|import|export|debugger)/i.test(text)) {
                    extractedComment = text;
                    break;
                }
            }
        }

        // 4. ANÁLISIS SEMÁNTICO POR DOMINIO / INTENCIÓN
        const fullContent = (diffText + '\n' + allTouchedFiles.join('\n')).toLowerCase();
        const detectedActions = [];

        // A. Autenticación y Sesión
        if (fullContent.includes('session-info') || fullContent.includes('session') || fullContent.includes('login') || fullContent.includes('logout') || fullContent.includes('auth')) {
            if (fullContent.includes('location.href') || fullContent.includes('redirect') || fullContent.includes('redirig')) {
                detectedActions.push('redirección automática y control de sesión');
            } else {
                detectedActions.push('autenticación y gestión de sesiones');
            }
        }

        // B. Extensiones de Navegador y Portapapeles
        if (fullContent.includes('clipboard') || fullContent.includes('navigator.clipboard') || fullContent.includes('copiar')) {
            detectedActions.push('copia al portapapeles');
        }
        if (allTouchedFiles.some(f => f.toLowerCase().includes('extension')) || fullContent.includes('chrome.storage') || fullContent.includes('chrome.runtime')) {
            detectedActions.push('extensión de navegador');
        }

        // C. Scroll, Historial, Borrado en UI
        if (fullContent.includes('scroll') || fullContent.includes('overflow-y')) {
            detectedActions.push('desplazamiento y scroll en interfaz');
        }
        if (fullContent.includes('delete') || fullContent.includes('remove') || fullContent.includes('borrar') || fullContent.includes('limpiar')) {
            detectedActions.push('eliminación de elementos');
        }

        // D. Reproductor Multimedia / Música / Video
        if (fullContent.includes('player') || fullContent.includes('audio') || fullContent.includes('videoclip') || fullContent.includes('track') || fullContent.includes('playlist')) {
            detectedActions.push('reproductor multimedia y listas');
        }

        // E. Despliegue, Modales, Estado de Sistema
        if (fullContent.includes('deploy') || fullContent.includes('opendeploymodal')) {
            detectedActions.push('modal y flujo de despliegue');
        }
        if (fullContent.includes('status') || fullContent.includes('badge') || fullContent.includes('pulse')) {
            detectedActions.push('indicadores de estado');
        }
        if (fullContent.includes('windowshide') || fullContent.includes('silencios')) {
            detectedActions.push('ejecución silenciosa');
        }

        // F. Búsqueda y Filtros
        if (fullContent.includes('filter') || fullContent.includes('search') || fullContent.includes('buscador')) {
            detectedActions.push('búsqueda y filtros');
        }

        // G. WhatsApp / Bots / PM2
        if (fullContent.includes('whatsapp') || fullContent.includes('bot') || fullContent.includes('pm2')) {
            detectedActions.push('gestión de bots y mensajería');
        }

        // H. Notificaciones y Alertas
        if (fullContent.includes('toast') || fullContent.includes('alert(') || fullContent.includes('notific')) {
            detectedActions.push('sistema de alertas y avisos');
        }

        // I. Firebase / Base de Datos
        if (fullContent.includes('firestore') || fullContent.includes('collection(') || fullContent.includes('getdoc(')) {
            detectedActions.push('consultas y persistencia de datos');
        }

        // J. Archivos Nuevos o Eliminados
        if (addedFiles.length > 0 && deletedFiles.length === 0) {
            const addedNames = addedFiles.map(f => path.basename(f)).slice(0, 2).join(', ');
            detectedActions.push(`nuevo componente (${addedNames})`);
        }
        if (deletedFiles.length > 0) {
            const delNames = deletedFiles.map(f => path.basename(f)).slice(0, 2).join(', ');
            detectedActions.push(`eliminación de ${delNames}`);
        }

        // 5. GENERAR EL MENSAJE
        let summary = '';

        if (extractedComment) {
            const cleanComment = extractedComment.charAt(0).toUpperCase() + extractedComment.slice(1);
            if (cleanComment.length > 15 && cleanComment.length < 80) {
                summary = cleanComment;
            }
        }

        if (!summary && detectedActions.length > 0) {
            const topActions = Array.from(new Set(detectedActions)).slice(0, 2).join(' y ');
            const mainAction = topActions.charAt(0).toUpperCase() + topActions.slice(1);
            
            if (basenames.length === 1) {
                summary = `${mainAction} en ${basenames[0]}`;
            } else if (basenames.length <= 3) {
                summary = `${mainAction} (${basenames.join(', ')})`;
            } else {
                summary = `${mainAction} en ${basenames.length} archivos`;
            }
        }

        // Fallback por tipo de archivos funcionales
        if (!summary) {
            const hasCss = effectiveFiles.some(f => f.endsWith('.css'));
            const hasHtml = effectiveFiles.some(f => f.endsWith('.html'));
            const hasJs = effectiveFiles.some(f => f.endsWith('.js') || f.endsWith('.ts'));

            if (basenames.length === 1) {
                const f = basenames[0];
                if (hasCss) summary = `Ajustes de estilos y diseño visual en ${f}`;
                else if (hasHtml) summary = `Actualización de interfaz y estructura en ${f}`;
                else if (hasJs) summary = `Mejoras en la lógica y funcionalidad de ${f}`;
                else summary = `Actualización de ${f}`;
            } else if (basenames.length <= 3) {
                const parts = [];
                if (hasJs) parts.push('lógica');
                if (hasHtml) parts.push('interfaz');
                if (hasCss) parts.push('estilos');
                const category = parts.length > 0 ? ` (${parts.join(', ')})` : '';
                summary = `Ajustes en ${basenames.join(', ')}${category}`;
            } else {
                summary = `Actualización y optimizaciones en ${basenames.length} archivos`;
            }
        }

        if (aheadCommits.length > 0) {
            summary += ` + sincronizar ${aheadCommits.length} commit(s)`;
        }

        return summary;
    } catch (e) {
        return "Actualización de proyecto y cambios locales";
    }
}


app.get('/api/projects/changes-summary', async (req, res) => {
    try {
        const name = req.query.name;
        if (!name) return res.status(400).json({ error: 'Missing project name' });
        const folderName = name.replace(/ \(.*?\)$/, '');
        const targetPath = path.join(WORKSPACE_DIR, folderName);
        if (!fs.existsSync(targetPath)) return res.status(404).json({ error: 'Project folder not found' });
        const summary = generateChangesSummary(targetPath);
        res.json({ summary });
    } catch (e) {
        console.error('Error generating changes summary:', e);
        res.json({ summary: 'Actualización y cambios locales' });
    }
});

app.post('/api/projects/deploy', async (req, res) => {
    try {
        const { name, version, summary } = req.body;
        if (!name || !version || !summary) {
            return res.status(400).json({ error: 'Missing data' });
        }

        const folderName = name.replace(/ \(.*?\)$/, '');
        const targetPath = path.join(WORKSPACE_DIR, folderName);
        
        const config = {
            'Horarios': { project: 'horarios-rail', site: 'hosting:app' },
            'Pedidos': { project: 'alquiler-pisos-23550', site: 'hosting:pedidos-rail-app-2025-87f2c' } 
        };

        const projectConfig = config[folderName];
        const { execSync } = require('child_process');
        const execOpts = { cwd: targetPath, windowsHide: true };
        
        console.log(`🚀 Iniciando proceso para ${folderName} v${version}`);
        
        // 1. Sincronizar versión (si el script existe)
        if (fs.existsSync(path.join(targetPath, 'scripts/sync_version.js'))) {
            execSync(`node scripts/sync_version.js ${version}`, execOpts);
        } else {
            const pkgP = path.join(targetPath, 'package.json');
            if (fs.existsSync(pkgP)) {
                try {
                    const pkg = JSON.parse(fs.readFileSync(pkgP, 'utf8'));
                    pkg.version = version.replace(/^v/, '');
                    fs.writeFileSync(pkgP, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
                    console.log(`✅ package.json de ${folderName} actualizado a v${pkg.version}`);
                } catch(e) {
                    console.warn(`No se pudo actualizar package.json en ${folderName}:`, e.message);
                }
            }
            const mfP = path.join(targetPath, 'manifest.json');
            if (fs.existsSync(mfP)) {
                try {
                    const mf = JSON.parse(fs.readFileSync(mfP, 'utf8'));
                    mf.version = version.replace(/^v/, '');
                    fs.writeFileSync(mfP, JSON.stringify(mf, null, 2) + '\n', 'utf8');
                    console.log(`✅ manifest.json de ${folderName} actualizado a v${mf.version}`);
                } catch(e) {
                    console.warn(`No se pudo actualizar manifest.json en ${folderName}:`, e.message);
                }
            }
        }
        
        // 2. Desplegar en Firebase (solo si está configurado)
        if (projectConfig) {
            console.log(`📡 Desplegando en Firebase: ${projectConfig.site}`);
            
            let token = "";
            try {
                const secretConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
                token = secretConfig.firebaseToken;
            } catch (e) {
                console.error("Error leyendo token de config.json", e);
            }

            const deployCmd = `npx.cmd -y firebase-tools deploy --only ${projectConfig.site} --project ${projectConfig.project} --token "${token}"`;
            execSync(deployCmd, execOpts);
        } else {
            console.log(`ℹ️ Proyecto sin Firebase configurado. Saltando a Git Push.`);
        }
        
        // 3. Git Push con el formato del usuario: "vX.XX: Resumen"
        const finalSummary = (summary || '').trim() || 'Actualización de versión';
        const cleanVersion = version.replace(/^v/, '').trim();
        const commitMsg = `v${cleanVersion}: ${finalSummary}`; 
        if (fs.existsSync(path.join(targetPath, 'scripts/git_push.js'))) {
            execSync(`node scripts/git_push.js "${commitMsg}"`, execOpts);
        } else {
            // Backup por si no hay script: commit directo
            execSync('git add .', execOpts);
            try {
                execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, execOpts);
            } catch (commitErr) {
                console.log(`ℹ️ Git commit: ${commitErr.message}`);
            }
            execSync('git push origin main', execOpts);
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Error in process:', e);
        res.status(500).json({ error: 'Process failed', details: e.message });
    }
});

app.get('/api/bots/logs/:name', (req, res) => {
    const botName = req.params.name;
    const homeDir = os.homedir();
    
    // Apuntar a los logs reales de PM2 para ver el QR
    const logPaths = {
        'whatsapp-bot-horarios': path.join(homeDir, '.pm2/logs/whatsapp-bot-horarios-out.log'),
        'whatsapp-bot-lestudi': path.join(homeDir, '.pm2/logs/whatsapp-bot-lestudi-out.log'),
        'whatsapp-bot-conciertos': path.join(homeDir, '.pm2/logs/whatsapp-bot-conciertos-out.log'),
        'dashboard-global': path.join(homeDir, '.pm2/logs/dashboard-global-out.log'),
        'musica': path.join(homeDir, '.pm2/logs/musica-out.log'),
        'musica-error': path.join(homeDir, '.pm2/logs/musica-error.log')
    };

    let filePath = logPaths[botName];
    if (botName === 'whatsapp-bot-conciertos' && (!filePath || !fs.existsSync(filePath))) {
        const fallbackPath = 'D:\\03_Trabajo\\conciertos\\data\\whatsapp_sent_messages.log';
        if (fs.existsSync(fallbackPath)) filePath = fallbackPath;
    }

    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Log file not found' });
    }

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const allLines = content.trim().split('\n');

        // Partimos siempre de la actividad reciente (últimas 150 líneas), no de todo el
        // historial del fichero.
        let lines = allLines.slice(-150);

        // Si dentro de ESA ventana reciente hay un código QR pendiente de escanear, lo
        // priorizamos (para que se vea el QR actual y no se pierda entre mensajes).
        // Antes se buscaba el QR en TODO el fichero, así que un bot que hace tiempo dejó
        // de usar QR (p.ej. tras migrar a la API oficial de Meta) se quedaba mostrando
        // para siempre ese QR antiguo y expirado en vez de la actividad real reciente.
        const qrMarkers = ["Escanea el QR", "SCAN QR CODE"];
        let lastQrIndex = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (qrMarkers.some(marker => lines[i].includes(marker))) {
                lastQrIndex = i;
                break;
            }
        }

        if (lastQrIndex !== -1) {
            lines = lines.slice(lastQrIndex);
        }

        res.json({ logs: lines });
    } catch (e) {
        res.status(500).json({ error: 'Error reading logs', details: e.message });
    }
});

app.post('/api/bots/logs/flush', (req, res) => {
    const botName = req.body.name;
    if (!botName) return res.status(400).json({ error: 'Falta el nombre del bot' });
    const { exec } = require('child_process');
    console.log(`🧹 Vaciando logs de PM2 para '${botName}'...`);
    exec(`pm2 flush ${botName}`, (err, stdout) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, stdout });
    });
});

// --- API BANDEJA DE ENTRADA WHATSAPP META (INBOX) ---
const WHATSAPP_INBOX_FILE = path.join(__dirname, 'data', 'whatsapp_inbox.json');

app.get('/api/whatsapp/inbox', (req, res) => {
    try {
        if (!fs.existsSync(WHATSAPP_INBOX_FILE)) {
            return res.json([]);
        }
        const raw = fs.readFileSync(WHATSAPP_INBOX_FILE, 'utf8');
        const list = JSON.parse(raw || '[]');
        res.json(list);
    } catch (e) {
        console.error('Error leyendo bandeja de WhatsApp:', e.message);
        res.status(500).json({ error: 'Error leyendo bandeja de WhatsApp', details: e.message });
    }
});

app.delete('/api/whatsapp/inbox', (req, res) => {
    try {
        fs.writeFileSync(WHATSAPP_INBOX_FILE, '[]', 'utf8');
        res.json({ success: true, message: 'Bandeja vaciada correctamente' });
    } catch (e) {
        res.status(500).json({ error: 'Error vaciando bandeja', details: e.message });
    }
});

// --- API CONTROL DOCKER ---
const { execFile } = require('child_process');
const http = require('http');

app.get('/api/docker/status', (req, res) => {
    execFile('docker.exe', ['ps', '-a', '--format', '{{.Names}}::{{.State}}'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to query docker ps', details: err.message });
        }
        const containers = {};
        const lines = (stdout || '').trim().split('\n');
        lines.forEach(line => {
            if (!line) return;
            const parts = line.trim().split('::');
            if (parts.length >= 2) {
                containers[parts[0].trim()] = parts[1].trim();
            }
        });

        // Soporte AdGuard Home (Servicio Windows / PM2 en puerto 8084)
        let answered = false;
        const sendStatus = (state) => {
            if (answered) return;
            answered = true;
            containers['adguard-home'] = state;
            res.json(containers);
        };

        const checkAdguard = http.get('http://127.0.0.1:8084', { timeout: 1000 }, () => {
            sendStatus('running');
        });
        checkAdguard.on('error', () => {
            sendStatus('exited');
        });
        checkAdguard.on('timeout', () => {
            checkAdguard.destroy();
            sendStatus('exited');
        });
    });
});

app.post('/api/docker/toggle', (req, res) => {
    const { container } = req.body;
    if (!container) return res.status(400).json({ error: 'Missing container parameter' });
    
    if (!/^[a-zA-Z0-9_-]+$/.test(container)) {
        return res.status(400).json({ error: 'Invalid container name format' });
    }

    // Caso especial: AdGuard Home administrado por PM2 en Windows
    if (container === 'adguard-home') {
        let answeredToggle = false;
        const doToggle = (action) => {
            if (answeredToggle) return;
            answeredToggle = true;
            console.log(`🛡️ ${action === 'stop' ? 'Deteniendo' : 'Iniciando'} AdGuard Home en PM2...`);
            execFile('cmd.exe', ['/c', `pm2 ${action} adguard-home`], { timeout: 10000, windowsHide: true }, (actionErr) => {
                if (actionErr) {
                    return res.status(500).json({ error: `Failed to ${action} adguard-home`, details: actionErr.message });
                }
                res.json({ success: true, container, action, running: action === 'start' });
            });
        };

        const checkReq = http.get('http://127.0.0.1:8084', { timeout: 1000 }, () => doToggle('stop'));
        checkReq.on('error', () => doToggle('start'));
        checkReq.on('timeout', () => {
            checkReq.destroy();
            doToggle('start');
        });
        return;
    }

    execFile('docker.exe', ['inspect', '--format={{.State.Running}}', container], { timeout: 5000, windowsHide: true }, (err, stdout) => {
        if (err) {
            return res.status(404).json({ error: `Container ${container} not found` });
        }
        const isRunning = (stdout || '').trim() === 'true';
        const action = isRunning ? 'stop' : 'start';

        console.log(`🐳 Ejecutando comando Docker: docker.exe ${action} ${container}`);
        execFile('docker.exe', [action, container], { timeout: 30000, windowsHide: true }, (actionErr) => {
            if (actionErr) {
                console.error(`Error al alternar estado de ${container}:`, actionErr);
                return res.status(500).json({ error: `Failed to ${action} ${container}`, details: actionErr.message });
            }
            res.json({ success: true, container, action, running: !isRunning });
        });
    });
});

// Auto-fetch periódico de repositorios en segundo plano para detectar cambios remotos (behind/ahead) automáticamente
let isFetchingRemotes = false;
async function fetchAllGitRepositories() {
    if (isFetchingRemotes || !fs.existsSync(WORKSPACE_DIR)) return;
    isFetchingRemotes = true;
    try {
        const entries = fs.readdirSync(WORKSPACE_DIR, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const folder = entry.name;
            if (folder === 'vikey-proxy' || folder === 'node_modules' || folder === '.git') continue;
            const gitDir = path.join(WORKSPACE_DIR, folder, '.git');
            if (fs.existsSync(gitDir)) {
                try {
                    const git = simpleGit(path.join(WORKSPACE_DIR, folder));
                    await git.fetch().catch(() => {});
                } catch (e) {
                    // ignorar fallos temporales de red
                }
            }
        }
    } catch (err) {
        console.error('Error en fetchAllGitRepositories:', err.message);
    } finally {
        isFetchingRemotes = false;
    }
}

// Iniciar auto-fetch 5 segundos tras el arranque y repetir cada 60 segundos
setTimeout(fetchAllGitRepositories, 5000);
setInterval(fetchAllGitRepositories, 60000);




// ENDPOINT TEMPORAL: ejecutar comandos shell para diagnóstico
const { exec } = require('child_process');
app.post('/api/cmd', (req, res) => {
    const { cmd } = req.body;
    if (!cmd) return res.status(400).json({ error: 'No cmd provided' });
    exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
        res.json({ err: err ? err.message : null, stdout, stderr });
    });
});
const PORT = 4000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Dashboard [${PC_NAME}] running on http://localhost:${PORT}`);
});




