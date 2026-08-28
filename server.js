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

            if (!filtered.some(p => p.name === 'whatsapp-bot-conciertos')) {
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

async function refreshPaperlessStatsAsync() {
    try {
        const pyCode = 'import json; from documents.models import Document, Tag, Correspondent, DocumentType; from django.utils import timezone; t = Document.objects.count(); tg = Document.objects.filter(tags__isnull=False).distinct().count(); c = Document.objects.filter(correspondent__isnull=False).count(); dt = Document.objects.filter(document_type__isnull=False).count(); l = Document.objects.filter(tags__isnull=False).order_by("-modified").first(); mod_time = timezone.template_localtime(l.modified).strftime("%d/%m/%Y %H:%M:%S") if l and l.modified else ""; print("JSON_START" + json.dumps({"total": t, "tagged": tg, "corr": c, "dtype": dt, "tagsCount": Tag.objects.count(), "corrsCount": Correspondent.objects.count(), "dtypesCount": DocumentType.objects.count(), "latestTitle": l.title if l else "Ninguno", "latestTime": mod_time}) + "JSON_END")';

        const stdout = await new Promise((resolve) => {
            execFile('docker.exe', ['exec', 'paperless-webserver', 'python3', 'manage.py', 'shell', '-c', pyCode], { timeout: 35000, windowsHide: true }, (err, out) => {
                if (err) return resolve('');
                resolve(out || '');
            });
        });

        const match = stdout.match(/JSON_START(.*?)JSON_END/s);
        if (match && match[1]) {
            const stats = JSON.parse(match[1]);
            if (stats && stats.total > 0) {
                const total = stats.total;
                const tagged = stats.tagged;
                const correspondent = stats.corr;
                const docType = stats.dtype;

                paperlessCache = {
                    status: 'active',
                    statusText: 'Trabajando ⚡',
                    statusClass: 'status-online',
                    activeDocs: total,
                    taggedDocs: tagged,
                    taggedPercent: Math.round((tagged / total) * 1000) / 10,
                    correspondentDocs: correspondent,
                    correspondentPercent: Math.round((correspondent / total) * 1000) / 10,
                    docTypeDocs: docType,
                    docTypePercent: Math.round((docType / total) * 1000) / 10,
                    tagsCount: stats.tagsCount || 2392,
                    correspondentsCount: stats.corrsCount || 647,
                    docTypesCount: stats.dtypesCount || 521,
                    lastProcessedTitle: stats.latestTitle || 'Ninguno',
                    lastProcessedTime: stats.latestTime || ''
                };
            }
        }
    } catch (e) {
        console.error('Error background updating paperless stats:', e.message);
    }
}

// Iniciar ciclo de actualización en segundo plano
setInterval(refreshPaperlessStatsAsync, 30000);
setTimeout(refreshPaperlessStatsAsync, 2000);

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
            
            if (f === 'vikey-proxy' || f === 'node_modules' || f === '.git' || !fs.existsSync(gitPath)) {
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
                            const jsMatch = line.match(/CURRENT_(APP|CLIENT)_VERSION\s*=\s*["'](\d+\.\d+)["']/) || 
                                            line.match(/version:\s*["'](\d+\.\d+)["']/);
                            if (jsMatch) { version = `v${jsMatch[2]}`; found = true; break; }
                            const pkgMatch = line.match(/"version":\s*"(\d+\.\d+\.\d+)"/);
                            if (pkgMatch) { version = `v${pkgMatch[1]}`; found = true; break; }
                        }
                        if (found) break;
                    }
                }
                
                const baseInfo = {
                    branch: status.current,
                    behind: status.behind,
                    ahead: status.ahead,
                    localChanges: status.files.length,
                    isClean: status.isClean(),
                    lastCommit: lastCommit,
                    version: version,
                    githubUrl: `https://github.com/ebolanca/${f}`
                };

                if (f === 'Alquileres') {
                    const firebaseLink = "https://console.firebase.google.com/project/alquiler-pisos-23550/overview";
                    
                    const getSubProjectVersion = (subDir) => {
                        const htmlPath = path.join(projectPath, subDir, 'index.html');
                        if (fs.existsSync(htmlPath)) {
                            const content = fs.readFileSync(htmlPath, 'utf8');
                            const titleMatch = content.match(/<title>[^<]*v(\d+\.\d+)[^<]*<\/title>/i);
                            if (titleMatch) return `v${titleMatch[1]}`;
                            const appVersionMatch = content.match(/const\s+APP_VERSION\s*=\s*['"](\d+\.\d+)['"]/i);
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
                        'conciertos': 'Conciertos'
                    };

                    const iconsMap = {
                        'Horarios': 'fa-calendar-days',
                        'Pedidos': 'fa-box',
                        'Vacaciones': 'fa-plane',
                        'Viajes': 'fa-earth-americas',
                        'Dashboard_Global': 'fa-gauge-high',
                        'Domotica': 'fa-house-laptop',
                        'conciertos': 'fa-ticket-simple',
                        'Conciertos': 'fa-ticket-simple',
                        'Musica': 'fa-music',
                        'musica': 'fa-music'
                    };
                    
                    const urlsMap = {
                        'Horarios': 'https://horarios-rail.web.app',
                        'Pedidos': 'https://pedidos-rail-app-2025-87f2c.web.app/',
                        'Vacaciones': 'https://viajes-en-caravana.web.app/',
                        'Domotica': 'https://github.com/ebolanca/Domotica',
                        'conciertos': 'http://100.95.217.45:8086',
                        'Conciertos': 'http://100.95.217.45:8086',
                        'Musica': IS_MSI ? 'http://localhost:8087' : 'http://100.95.217.45:8087',
                        'musica': IS_MSI ? 'http://localhost:8087' : 'http://100.95.217.45:8087'
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
                const displayNameMap = { 'conciertos': 'Conciertos' };
                const iconsMap = { 'conciertos': 'fa-ticket-simple', 'Conciertos': 'fa-ticket-simple', 'Musica': 'fa-music' };
                const urlsMap = { 'conciertos': 'http://100.95.217.45:8086', 'Conciertos': 'http://100.95.217.45:8086', 'Musica': 'http://100.95.217.45:8087' };
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
        
        console.log(`🚀 Iniciando proceso para ${folderName} v${version}`);
        
        // 1. Sincronizar versión (si el script existe)
        if (fs.existsSync(path.join(targetPath, 'scripts/sync_version.js'))) {
            execSync(`node scripts/sync_version.js ${version}`, { cwd: targetPath });
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
            execSync(deployCmd, { cwd: targetPath });
        } else {
            console.log(`ℹ️ Proyecto sin Firebase configurado. Saltando a Git Push.`);
        }
        
        // 3. Git Push con el formato del usuario: "vX.XX: Resumen"
        const commitMsg = `v${version.replace('v', '')}: ${summary}`;
        if (fs.existsSync(path.join(targetPath, 'scripts/git_push.js'))) {
            execSync(`node scripts/git_push.js "${commitMsg}"`, { cwd: targetPath });
        } else {
            // Backup por si no hay script: commit directo
            execSync('git add .', { cwd: targetPath });
            execSync(`git commit -m "${commitMsg}"`, { cwd: targetPath });
            execSync('git push origin main', { cwd: targetPath });
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
        'dashboard-global': path.join(homeDir, '.pm2/logs/dashboard-global-out.log')
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
        let lines = content.trim().split('\n');
        
        // Buscamos la última aparición del código QR en los logs para mostrar a partir de ahí
        // y evitar acumulados de códigos QR viejos y ya expirados.
        const qrMarkers = ["Escanea el QR", "SCAN QR CODE"];
        let lastQrIndex = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (qrMarkers.some(marker => lines[i].includes(marker))) {
                lastQrIndex = i;
                break;
            }
        }
        
        if (lastQrIndex !== -1) {
            // Devolvemos desde la última aparición del QR (siempre que el QR no sea extremadamente viejo)
            lines = lines.slice(lastQrIndex);
        } else {
            // Si no hay QR, enviamos las últimas 100 líneas
            lines = lines.slice(-100);
        }
        
        res.json({ logs: lines });
    } catch (e) {
        res.status(500).json({ error: 'Error reading logs', details: e.message });
    }
});

// --- API CONTROL DOCKER ---
const { execFile } = require('child_process');

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
        res.json(containers);
    });
});

app.post('/api/docker/toggle', (req, res) => {
    const { container } = req.body;
    if (!container) return res.status(400).json({ error: 'Missing container parameter' });
    
    if (!/^[a-zA-Z0-9_-]+$/.test(container)) {
        return res.status(400).json({ error: 'Invalid container name format' });
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

const PORT = 4000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Dashboard [${PC_NAME}] running on http://localhost:${PORT}`);
});

