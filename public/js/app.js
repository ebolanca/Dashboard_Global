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
        fetchPaperlessStats();
        
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
        'Dashboard_Global': 'fa-gauge-high',
        'Domotica': 'fa-house-laptop',
        'conciertos': 'fa-ticket-simple'
    };

    projects.forEach(p => {
        let statusClass = 'status-online';
        let statusText = 'Actualizado';
        let clickAction = "";

        if (p.error) {
            statusClass = 'status-offline';
            statusText = 'Error Git';
        } else if (p.behind > 0 || p.ahead > 0) {
            statusClass = 'status-warning pullable';
            statusText = `Sincronizar (${p.behind || 0}↓ ${p.ahead || 0}↑)`;
            clickAction = `onclick="window.pullProject(event, '${p.name}')"`;
        } else if (!p.isClean) {
            statusClass = 'status-warning pullable';
            statusText = `Cambios locales (${p.localChanges})`;
            clickAction = `onclick="window.openDeployModal(event, '${p.name}', '${p.version}')"`;
        }

        const icon = p.icon || iconsMap[p.name] || 'fa-folder';

        // Botón de Acción (Cohete): Se muestra si hay cambios locales o estamos ahead de GitHub
        const hasChanges = p.localChanges > 0 || p.ahead > 0;
        const actionBtn = hasChanges ? `
            <button class="btn-action deploy-btn" onclick="openDeployModal(event, '${p.name}', '${p.version}')" title="Sincronizar y Subir cambios">
                <i class="fa-solid fa-rocket"></i>
            </button>
        ` : '';

        const firebaseBtn = (p.consoleUrl && p.consoleUrl !== '#') ? `
            <button class="btn-action" onclick="window.openUrl(event, '${p.consoleUrl}')" title="Firebase">
                <i class="fa-solid fa-cloud"></i>
            </button>
        ` : '';

        const card = document.createElement('div');
        card.className = 'card';
        card.style.cursor = 'pointer';
        card.onclick = () => window.openUrl(null, p.url);

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
                    <button class="btn-action" onclick="window.openUrl(event, '${p.githubUrl}')" title="GitHub">
                        <i class="fa-brands fa-github"></i>
                    </button>
                    ${firebaseBtn}
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

window.openUrl = (e, url) => {
    if (e) e.stopPropagation();
    window.open(url, '_blank');
};

window.pullProject = async function(event, name) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const badge = event ? event.currentTarget : null;
    let originalHtml = '';
    
    if (badge) {
        originalHtml = badge.innerHTML;
        badge.innerHTML = '<div class="spinner" style="width:14px; height:14px; border-width:2px;"></div> <span style="margin-left:8px">Actualizando...</span>';
        badge.style.pointerEvents = 'none';
        badge.classList.add('syncing');
    }

    try {
        const res = await fetch('/api/projects/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.details || 'Error desconocido');
        }
        
        await fetchData();
    } catch (e) {
        console.error(`Error en pull de ${name}:`, e);
        alert(`Fallo al actualizar ${name}: ${e.message}`);
        if (badge) {
            badge.innerHTML = originalHtml;
            badge.style.pointerEvents = 'auto';
            badge.classList.remove('syncing');
        }
    }
};

window.syncAllProjects = async function() {
    const btn = document.getElementById('btn-sync-all');
    if (!btn) return;

    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando todo...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/projects/pull-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.details || 'Error al sincronizar proyectos');
        }
        
        await fetchData();
    } catch (err) {
        console.error("Error en syncAllProjects:", err);
        alert(`Error al sincronizar todo: ${err.message}`);
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
};

let logInterval = null;

window.showBotLogs = async (name) => {
    document.getElementById('modal-bot-name').innerText = name;
    document.getElementById('bot-logs-content').innerHTML = '<div class="spinner"></div>';
    document.getElementById('bot-modal').style.display = 'flex';

    const fetchLogs = async () => {
        try {
            const url = config.pcName === 'MSI' 
                ? `http://${config.remoteServerIp}:4000/api/bots/logs/${name}` 
                : `/api/bots/logs/${name}`;
                
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.logs && data.logs.length > 0) {
                const logsText = data.logs.join('\n');
                const container = document.getElementById('bot-logs-content');
                const preElement = container.querySelector('.terminal-logs');
                
                // Evitamos parpadeos y saltos de scroll si los logs no han cambiado
                if (!preElement || preElement.textContent !== logsText) {
                    container.innerHTML = `<pre class="terminal-logs">${logsText}</pre>`;
                    container.scrollTop = container.scrollHeight;
                }
            } else {
                document.getElementById('bot-logs-content').innerHTML = '<div style="color: var(--text-muted)">No hay logs recientes.</div>';
            }
        } catch (e) {
            document.getElementById('bot-logs-content').innerText = "Error al conectar con OMEN.";
        }
    };

    // Carga inicial
    await fetchLogs();

    // Limpiamos cualquier intervalo activo previo
    if (logInterval) clearInterval(logInterval);
    
    // Auto-actualizar logs cada 5 segundos mientras esté abierto el modal para capturar el QR fresco
    logInterval = setInterval(fetchLogs, 5000);
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
    if (logInterval) {
        clearInterval(logInterval);
        logInterval = null;
    }
    document.getElementById('bot-modal').style.display = 'none';
};

// Iniciar
init();

async function fetchPaperlessStats() {
    try {
        const res = await fetch('/api/paperless/stats');
        const data = await res.json();
        renderPaperlessStats(data);
    } catch (e) {
        console.error('Error cargando métricas de Paperless:', e);
        const container = document.getElementById('paperless-container');
        if (container) {
            container.innerHTML = '<div class="card"><p>Error conectando con Paperless API.</p></div>';
        }
    }
}

function renderPaperlessStats(data) {
    const badge = document.getElementById('paperless-status-badge');
    const badgeText = document.getElementById('paperless-status-text');
    const container = document.getElementById('paperless-container');

    if (!data || data.error) {
        if (badge) {
            badge.className = 'status-badge status-offline';
        }
        if (badgeText) badgeText.innerText = 'Desconectado';
        if (container) container.innerHTML = '<div class="card"><p>No disponible.</p></div>';
        return;
    }

    if (badge) {
        badge.className = `status-badge ${data.statusClass || 'status-online'}`;
    }
    if (badgeText) {
        badgeText.innerText = data.statusText || 'En línea';
    }

    if (!container) return;

    container.innerHTML = `
        <div class="card" style="grid-column: 1 / -1;">
            <div class="card-header" style="border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-brain card-icon" style="color: #a855f7; font-size: 1.3em;"></i>
                    <div class="card-title" style="font-size: 1.15em; font-weight: 700;">Progreso de Análisis de IA</div>
                </div>
            </div>
            <div class="card-body">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px;">
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 12px; border-radius: 8px;">
                        <div style="font-size: 0.8em; color: var(--text-muted);">Documentos Totales Activos</div>
                        <div style="font-size: 1.6em; font-weight: 700; color: #fff;">${data.activeDocs ? data.activeDocs.toLocaleString('es-ES') : 0}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 12px; border-radius: 8px;">
                        <div style="font-size: 0.8em; color: var(--text-muted);">Etiquetados (Tags)</div>
                        <div style="font-size: 1.6em; font-weight: 700; color: #3b82f6;">${data.taggedDocs ? data.taggedDocs.toLocaleString('es-ES') : 0} <span style="font-size: 0.6em; color: #93c5fd;">(${data.taggedPercent}%)</span></div>
                        <div style="background: rgba(255,255,255,0.1); height: 4px; border-radius: 2px; margin-top: 6px; overflow: hidden;">
                            <div style="background: #3b82f6; height: 100%; width: ${data.taggedPercent}%;"></div>
                        </div>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 12px; border-radius: 8px;">
                        <div style="font-size: 0.8em; color: var(--text-muted);">Con Corresponsal (Emisor)</div>
                        <div style="font-size: 1.6em; font-weight: 700; color: #10b981;">${data.correspondentDocs ? data.correspondentDocs.toLocaleString('es-ES') : 0} <span style="font-size: 0.6em; color: #6ee7b7;">(${data.correspondentPercent}%)</span></div>
                        <div style="background: rgba(255,255,255,0.1); height: 4px; border-radius: 2px; margin-top: 6px; overflow: hidden;">
                            <div style="background: #10b981; height: 100%; width: ${data.correspondentPercent}%;"></div>
                        </div>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 12px; border-radius: 8px;">
                        <div style="font-size: 0.8em; color: var(--text-muted);">Con Tipo de Documento</div>
                        <div style="font-size: 1.6em; font-weight: 700; color: #f59e0b;">${data.docTypeDocs ? data.docTypeDocs.toLocaleString('es-ES') : 0} <span style="font-size: 0.6em; color: #fde68a;">(${data.docTypePercent}%)</span></div>
                        <div style="background: rgba(255,255,255,0.1); height: 4px; border-radius: 2px; margin-top: 6px; overflow: hidden;">
                            <div style="background: #f59e0b; height: 100%; width: ${data.docTypePercent}%;"></div>
                        </div>
                    </div>
                </div>

                <div class="detail-row" style="margin-top: 10px;">
                    <span>Etiquetas únicas generadas:</span>
                    <span class="detail-value" style="color: #60a5fa;">${data.tagsCount ? data.tagsCount.toLocaleString('es-ES') : 0}</span>
                </div>
                <div class="detail-row">
                    <span>Corresponsales identificados:</span>
                    <span class="detail-value" style="color: #34d399;">${data.correspondentsCount ? data.correspondentsCount.toLocaleString('es-ES') : 0}</span>
                </div>
                <div class="detail-row">
                    <span>Tipos de documento clasificados:</span>
                    <span class="detail-value" style="color: #fbbf24;">${data.docTypesCount ? data.docTypesCount.toLocaleString('es-ES') : 0}</span>
                </div>
                <div class="commit-msg" style="margin-top: 14px; font-size: 0.88em; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 10px 14px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 250px;">
                        <i class="fa-solid fa-clock-rotate-left" style="color: #c084fc;"></i>
                        <span>Último analizado: <strong style="color: #f3e8ff;">${data.lastProcessedTitle || 'Cargando...'}</strong></span>
                    </div>
                    ${data.lastProcessedTime ? `
                        <div style="font-size: 0.85em; color: #d8b4fe; background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.3); padding: 4px 10px; border-radius: 6px; display: flex; align-items: center; gap: 6px; white-space: nowrap; font-weight: 500;">
                            <i class="fa-regular fa-clock" style="color: #c084fc;"></i>
                            <span>${data.lastProcessedTime}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

window.restartPaperlessAI = async function(e) {
    if (e) e.stopPropagation();
    const btn = e ? e.currentTarget : null;
    let originalText = '';
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reiniciando...';
        btn.disabled = true;
    }

    try {
        const res = await fetch('/api/paperless/restart', { method: 'POST' });
        if (res.ok) {
            alert('¡Servicio de IA de Paperless reiniciado con éxito!');
            setTimeout(fetchPaperlessStats, 2000);
        } else {
            alert('No se pudo reiniciar el servicio de IA.');
        }
    } catch (err) {
        console.error('Error al reiniciar IA:', err);
        alert('Error de conexión.');
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};