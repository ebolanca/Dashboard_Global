let config = {};

async function init() {
    try {
        const res = await fetch('/api/config');
        config = await res.json();
        
        // Actualizar UI con nombre de PC
        document.getElementById('pc-name-display').innerText = config.pcName;
        
        // Marcar pestaña activa
        const currentPC = config.pcName.toLowerCase();
        document.getElementById(`tab-${currentPC}`).classList.add('active');
        
        // Carga inicial
        fetchData();
        
        // Refrescar cada 60 segundos (menos agresivo)
        setInterval(fetchData, 60000);
    } catch (e) {
        console.error('Error inicializando dashboard', e);
    }
}

async function fetchData() {
    try {
        // Cargar proyectos (locales)
        const projectsRes = await fetch('/api/projects');
        const projects = await projectsRes.json();
        renderProjects(projects);

        // Cargar bots
        let localBots = [];
        try {
            const localRes = await fetch('/api/bots');
            localBots = await localRes.json();
        } catch (e) { console.error("Error cargando bots locales", e); }

        let finalBots = [...localBots];

        // Si estamos en el MSI, traemos también los bots de WhatsApp del OMEN
        if (config.pcName === 'MSI') {
            try {
                const remoteRes = await fetch(`http://${config.remoteServerIp}:4000/api/bots`);
                const remoteBots = await remoteRes.json();
                
                // Filtramos para traer solo los bots de WhatsApp del remoto
                const whatsappBots = remoteBots.filter(b => b.name.includes('whatsapp'));
                finalBots = [...finalBots, ...whatsappBots];
            } catch (e) {
                console.warn('No se pudieron cargar los bots remotos del OMEN', e);
            }
        }
        
        renderBots(finalBots);
        
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function renderProjects(projects) {
    const grid = document.getElementById('projects-grid');
    grid.innerHTML = '';
    
    if(!projects || projects.length === 0 || projects.error) {
        grid.innerHTML = `<div class="card"><p>${projects.error || 'No se encontraron proyectos Git.'}</p></div>`;
        return;
    }

    const iconsMap = {
        'Horarios': 'fa-calendar-days',
        'Alquileres': 'fa-house',
        'Pedidos': 'fa-box',
        'Vacaciones': 'fa-plane',
        'Viajes': 'fa-earth-americas',
        'Dashboard_Global': 'fa-gauge-high'
    };

    projects.forEach(p => {
        const isUpToDate = p.behind === 0 && p.ahead === 0 && p.isClean;
        let statusClass = 'status-online';
        let statusText = 'Actualizado';
        let clickAction = "";

        if(p.error) {
            statusClass = 'status-offline';
            statusText = 'Error Git';
        } else if (!isUpToDate) {
            statusClass = 'status-warning pullable';
            statusText = `Sincronizar (${p.behind || 0}↓ ${p.ahead || 0}↑)`;
            clickAction = `onclick="window.pullProject(event, '${p.name}')"`;
        }

        const icon = p.icon || iconsMap[p.name] || 'fa-folder';

        // Botón de Acción (Cohete): Se muestra si hay cambios locales o estamos ahead de GitHub
        const hasChanges = p.localChanges > 0 || p.ahead > 0;
        const actionBtn = hasChanges ? `
            <button class="btn-action deploy-btn" onclick="openDeployModal(event, '${p.name}', '${p.version}')" title="Sincronizar y Subir cambios">
                <i class="fa-solid fa-rocket"></i>
            </button>
        ` : '';

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-header">
                <i class="fa-solid ${icon} card-icon"></i>
                <div class="card-title">
                    ${p.name}
                    <span class="card-version">${p.version || 'v?'}</span>
                </div>
            </div>
            <div class="card-body">
                <div class="detail-row">
                    <span>Rama:</span>
                    <span class="detail-value">${p.branch || '-'}</span>
                </div>
                <div class="detail-row">
                    <span>Cambios locales:</span>
                    <span class="detail-value" style="${p.localChanges > 0 ? 'color: var(--status-warning)' : ''}">${p.localChanges || 0}</span>
                </div>
                <div class="commit-msg">
                    <i class="fa-solid fa-code-commit"></i>
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${p.lastCommit}">
                        ${p.lastCommit}
                    </span>
                </div>
                <div class="card-actions">
                    <button class="btn-action" onclick="window.openUrl('${p.githubUrl}')" title="GitHub">
                        <i class="fa-brands fa-github"></i>
                    </button>
                    <button class="btn-action" onclick="window.openUrl('${p.consoleUrl}')" title="Firebase">
                        <i class="fa-solid fa-cloud"></i>
                    </button>
                    ${actionBtn}
                </div>
            </div>
            <div class="card-footer">
                <div class="status-badge ${statusClass}" ${clickAction}>
                    <div class="status-dot"></div>
                    <span>${statusText}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderBots(bots) {
    const grid = document.getElementById('bots-grid');
    grid.innerHTML = '';
    
    if(!bots || bots.length === 0) {
        grid.innerHTML = '<div class="card"><p>No hay bots activos en OMEN.</p></div>';
        return;
    }

    bots.forEach(b => {
        const isOnline = b.status === 'online';
        const statusClass = isOnline ? 'status-online' : 'status-offline';
        const isWhatsApp = b.name.includes('whatsapp');
        const icon = isWhatsApp ? 'fa-brands fa-whatsapp' : 'fa-solid fa-robot';
        const iconColor = isWhatsApp ? '#25D366' : 'var(--accent)';

        const card = document.createElement('div');
        card.className = 'card';
        if (isWhatsApp) {
            card.style.cursor = 'pointer';
            card.onclick = () => window.showBotLogs(b.name);
        }

        card.innerHTML = `
            <div class="card-header">
                <i class="${icon} card-icon" style="color: ${iconColor}"></i>
                <div class="card-title">${b.name}</div>
            </div>
            <div class="card-body">
                <div class="detail-row"><span>RAM:</span><span class="detail-value">${b.memory} MB</span></div>
                <div class="detail-row"><span>CPU:</span><span class="detail-value">${b.cpu}%</span></div>
                <div class="detail-row"><span>Uptime:</span><span class="detail-value">${Math.floor(b.uptime / 3600000)}h</span></div>
            </div>
            <div class="card-footer">
                <div class="status-badge ${statusClass}">
                    <div class="status-dot"></div>
                    <span>${b.status}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.openUrl = (url) => window.open(url, '_blank');

window.pullProject = async function(event, name) {
    if (event) event.stopPropagation();
    
    const badge = event ? event.currentTarget : null;
    let originalHtml = '';
    if (badge) {
        originalHtml = badge.innerHTML;
        badge.innerHTML = '<div class="spinner" style="width:14px; height:14px; border-width:2px;"></div> <span style="margin-left:8px">Actualizando...</span>';
        badge.style.pointerEvents = 'none';
    }

    try {
        const res = await fetch('/api/projects/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (res.ok) {
            fetchData();
        } else {
            alert('Error al actualizar ' + name);
            if (badge) {
                badge.innerHTML = originalHtml;
                badge.style.pointerEvents = 'auto';
            }
        }
    } catch (e) {
        console.error(e);
        if (badge) {
            badge.innerHTML = originalHtml;
            badge.style.pointerEvents = 'auto';
        }
    }
};

window.syncAllProjects = async function() {
    const btn = document.getElementById('btn-sync-all');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...';
    btn.disabled = true;

    const pullables = document.querySelectorAll('.status-badge.pullable');
    if (pullables.length === 0) {
        alert("Todos los proyectos están al día.");
        btn.innerHTML = originalContent;
        btn.disabled = false;
        return;
    }

    // Ejecutamos en serie para evitar bloqueos de git
    for (const badge of pullables) {
        const name = badge.closest('.card').querySelector('.card-title').innerText.split('\n')[0].trim();
        await window.pullProject(null, name);
    }

    btn.innerHTML = originalContent;
    btn.disabled = false;
    fetchData();
};

window.showBotLogs = async (name) => {
    document.getElementById('modal-bot-name').innerText = name;
    document.getElementById('bot-logs-content').innerHTML = '<div class="spinner"></div>';
    document.getElementById('bot-modal').style.display = 'flex';

    try {
        const url = config.pcName === 'MSI' 
            ? `http://${config.remoteServerIp}:4000/api/bots/logs/${name}` 
            : `/api/bots/logs/${name}`;
            
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.logs && data.logs.length > 0) {
            document.getElementById('bot-logs-content').innerHTML = data.logs
                .map(line => `<div style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: #cbd5e1;">${line}</div>`)
                .join('');
        } else {
            document.getElementById('bot-logs-content').innerHTML = '<div style="color: var(--text-muted)">No hay logs recientes.</div>';
        }
    } catch (e) {
        document.getElementById('bot-logs-content').innerText = "Error al conectar con OMEN.";
    }
};

window.openDeployModal = (e, name, currentVersion) => {
    if (e) e.stopPropagation();
    document.getElementById('modal-project-name').innerText = name;
    document.getElementById('deploy-version').value = currentVersion.replace('v', '');
    document.getElementById('deploy-summary').value = '';
    document.getElementById('deploy-modal').style.display = 'flex';
    
    document.getElementById('btn-confirm-deploy').onclick = () => window.confirmDeploy(name);
};

window.closeModal = () => {
    document.getElementById('deploy-modal').style.display = 'none';
};

window.confirmDeploy = async (name) => {
    const version = document.getElementById('deploy-version').value;
    const summary = document.getElementById('deploy-summary').value;
    
    if(!version || !summary) {
        alert("Por favor completa los dos campos.");
        return;
    }
    
    const btn = document.getElementById('btn-confirm-deploy');
    btn.innerText = "Procesando...";
    btn.disabled = true;

    try {
        const res = await fetch('/api/projects/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, version, summary })
        });
        
        if (res.ok) {
            alert("¡Operación realizada con éxito!");
            window.closeModal();
            fetchData();
        } else {
            alert("Fallo en la operación. Revisa la consola del servidor.");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión con el servidor.");
    } finally {
        btn.innerText = "Confirmar y Subir";
        btn.disabled = false;
    }
};

window.closeBotModal = () => {
    document.getElementById('bot-modal').style.display = 'none';
};

// Iniciar
init();
