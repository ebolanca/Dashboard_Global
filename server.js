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
            res.json(list.map(proc => ({
                id: proc.pm_id,
                name: proc.name,
                status: proc.pm2_env.status,
                restarts: proc.pm2_env.restart_time,
                cpu: proc.monit ? proc.monit.cpu : 0,
                memory: proc.monit ? Math.round(proc.monit.memory / 1024 / 1024) : 0,
                uptime: proc.pm2_env.pm_uptime
            })));
        });
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

        const projects = [];

        for (const f of folders) {
            const projectPath = path.join(WORKSPACE_DIR, f);
            const gitPath = path.join(projectPath, '.git');
            
            if (f === 'vikey-proxy' || f === 'node_modules' || f === '.git') continue;
            
            if (fs.existsSync(gitPath)) {
                try {
                    const git = simpleGit(projectPath);
                    
                    // Fetch silencioso para actualizar estado remoto
                    await git.fetch().catch(e => console.log(`Fetch failed for ${f}, continuing with local status`));
                    
                    const status = await git.status();
                    const log = await git.log({ n: 1 }).catch(() => ({ latest: null }));
                    const lastCommit = log.latest ? log.latest.message : 'No commits';

                    // Extracción de versión mejorada
                    let version = 'v?';
                    const versionPaths = [
                        path.join(projectPath, 'public', 'js', 'modules', 'constants.js'),
                        path.join(projectPath, 'public-app', 'js', 'main.js'),
                        path.join(projectPath, 'public', 'js', 'main.js'),
                        path.join(projectPath, 'package.json'),
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
                        projects.push({ 
                            name: "Alquileres (Garlopan)", 
                            url: "https://alquiler-pisos-23550.web.app", 
                            consoleUrl: firebaseLink, 
                            icon: 'fa-house',
                            ...baseInfo 
                        });
                        projects.push({ 
                            name: "Alquileres (L'estudi)", 
                            url: "https://lestudi.web.app", 
                            consoleUrl: firebaseLink, 
                            icon: 'fa-building',
                            ...baseInfo 
                        });
                    } else {
                        const iconsMap = {
                            'Horarios': 'fa-calendar-days',
                            'Pedidos': 'fa-box',
                            'Vacaciones': 'fa-plane',
                            'Viajes': 'fa-earth-americas',
                            'Dashboard_Global': 'fa-gauge-high'
                        };
                        
                        const urlsMap = {
                            'Horarios': 'https://horarios-rail.web.app',
                            'Pedidos': 'https://pedidos-rail-app-2025-87f2c.web.app/',
                            'Vacaciones': 'https://vacaciones.web.app'
                        };

                        projects.push({
                            name: f,
                            url: urlsMap[f] || "#",
                            consoleUrl: `https://console.firebase.google.com/project/${f.toLowerCase()}/overview`,
                            icon: iconsMap[f] || 'fa-folder',
                            ...baseInfo
                        });
                    }
                } catch (e) {
                    console.error(`Error checking git for ${f}`, e);
                    projects.push({ name: f, error: 'Git error', details: e.message });
                }
            }
        }
        res.json(projects);
    } catch (e) {
        res.status(500).json({ error: 'Cannot read workspace directory', details: e.message });
    }
});

app.post('/api/projects/pull', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Project name is required' });
        
        // Limpiar nombre (ej: "Alquileres (Garlopan)" -> "Alquileres")
        const folderName = name.replace(/ \(.*?\)$/, '');
        const projectPath = path.join(WORKSPACE_DIR, folderName);
        
        if (!fs.existsSync(projectPath)) return res.status(404).json({ error: `Project folder not found: ${folderName}` });
        
        const git = simpleGit(projectPath);
        const pullResult = await git.pull();
        res.json({ success: true, details: pullResult });
    } catch (e) {
        res.status(500).json({ error: 'Pull failed', details: e.message });
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
        'dashboard-global': path.join(homeDir, '.pm2/logs/dashboard-global-out.log')
    };

    const filePath = logPaths[botName];
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Log file not found' });
    }

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        // Cogemos las últimas 50 líneas para asegurar que el QR quepa entero
        const lines = content.trim().split('\n').slice(-50).reverse();
        res.json({ logs: lines });
    } catch (e) {
        res.status(500).json({ error: 'Error reading logs', details: e.message });
    }
});

const PORT = 4000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Dashboard [${PC_NAME}] running on http://localhost:${PORT}`);
});
