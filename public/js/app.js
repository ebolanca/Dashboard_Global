let config = {};
let isInitialLoading = true;
let allProjects = [];
let allBots = [];
let currentFilter = 'all';
let currentView = localStorage.getItem('dashboard_view') || 'list';
let searchQuery = '';
let logInterval = null;

const iconsMap = {
    'Horarios': 'fa-calendar-days',
    'Alquileres': 'fa-house',
    'Pedidos': 'fa-utensils',
    'Vacaciones': 'fa-plane',
    'Viajes': 'fa-earth-americas',
    'Dashboard_Global': 'fa-gauge-high',
    'Domotica': 'fa-house-signal',
    'conciertos': 'fa-guitar',
    'Conciertos': 'fa-guitar',
    'Musica': 'fa-music',
    'Subastas': 'fa-gavel',
    'subastas': 'fa-gavel',
    'Drop': 'fa-paperclip',
    'drop': 'fa-paperclip'
};

async function init() {
    try {
        const res = await fetch('/api/config');
        config = await res.json();
        
        // Actualizar UI con nombre de PC
        document.getElementById('pc-name-display').innerText = config.pcName;
        
        // Marcar pestaña activa
        const currentPC = config.pcName.toLowerCase();
        const tabEl = document.getElementById(`tab-${currentPC}`);
        if (tabEl) tabEl.classList.add('active');

        // Configurar listeners de la barra de control
        setupToolbarEvents();

        // Carga inicial de datos
        await fetchData();
        
        // Refrescar cada 60 segundos
        setInterval(fetchData, 60000);
    } catch (e) {
        console.error('Error inicializando dashboard', e);
    }
}

function setupToolbarEvents() {
    // 1. View Switcher (Lista vs Cuadrícula)
    const btnList = document.getElementById('btn-view-list');
    const btnGrid = document.getElementById('btn-view-grid');

    function updateViewMode(view) {
        currentView = view;
        localStorage.setItem('dashboard_view', view);
        if (btnList && btnGrid) {
            btnList.classList.toggle('active', view === 'list');
            btnGrid.classList.toggle('active', view === 'grid');
        }
        applyFiltersAndRender();
    }

    if (btnList) btnList.addEventListener('click', () => updateViewMode('list'));
    if (btnGrid) btnGrid.addEventListener('click', () => updateViewMode('grid'));
    updateViewMode(currentView);

    // 2. Filtros por Píldoras
    const pillButtons = document.querySelectorAll('.pill-btn');
    pillButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            pillButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter') || 'all';
            applyFiltersAndRender();
        });
    });

    // 3. Buscador en tiempo real
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            applyFiltersAndRender();
        });

        // Atajo de teclado: presionar '/' o Ctrl+K para buscar
        window.addEventListener('keydown', (e) => {
            if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) && document.activeElement !== searchInput) {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            } else if (e.key === 'Escape' && document.activeElement === searchInput) {
                searchInput.value = '';
                searchQuery = '';
                searchInput.blur();
                applyFiltersAndRender();
            }
        });
    }
}

async function fetchData() {
    try {
        // Cargar proyectos (locales)
        const projectsRes = await fetch('/api/projects');
        allProjects = await projectsRes.json();
        if (!Array.isArray(allProjects)) allProjects = [];

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
                const whatsappBots = remoteBots.filter(b => b.name.includes('whatsapp'));
                finalBots = [...finalBots, ...whatsappBots];
            } catch (e) {
                console.warn('No se pudieron cargar los bots remotos del OMEN', e);
            }
        }
        
        // Deduplicar bots por nombre único
        const seenBotNames = new Set();
        const uniqueBots = [];
        for (const b of finalBots) {
            if (!seenBotNames.has(b.name)) {
                seenBotNames.add(b.name);
                uniqueBots.push(b);
            }
        }
        allBots = uniqueBots.filter(b => b.name !== 'paperless-ai-watcher');

        isInitialLoading = false;
        applyFiltersAndRender();
    } catch (error) {
        console.error('Error fetching data:', error);
        isInitialLoading = false;
        applyFiltersAndRender();
    }
}

function applyFiltersAndRender() {
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');
    const secProjects = document.getElementById('section-projects');
    const secBots = document.getElementById('section-bots');

    if (isInitialLoading) {
        if (loadingState) loadingState.style.display = 'flex';
        if (emptyState) emptyState.style.display = 'none';
        if (secProjects) secProjects.style.display = 'none';
        if (secBots) secBots.style.display = 'none';
        return;
    } else {
        if (loadingState) loadingState.style.display = 'none';
    }

    // 1. Calcular pendientes
    const pendingProjects = allProjects.filter(p => (p.localChanges > 0 || p.behind > 0 || p.ahead > 0 || p.error));
    const pendingBots = allBots.filter(b => b.status !== 'online');
    const totalPending = pendingProjects.length + pendingBots.length;

    // Actualizar contadores en la barra
    const countAllEl = document.getElementById('count-all');
    const countPendingEl = document.getElementById('count-pending');
    const countProjectsEl = document.getElementById('count-projects');
    const countBotsEl = document.getElementById('count-bots');
    const pillPendingEl = document.getElementById('pill-pending');

    if (countAllEl) countAllEl.innerText = allProjects.length + allBots.length;
    if (countPendingEl) countPendingEl.innerText = totalPending;
    if (countProjectsEl) countProjectsEl.innerText = allProjects.length;
    if (countBotsEl) countBotsEl.innerText = allBots.length;

    if (pillPendingEl) {
        if (totalPending > 0) {
            pillPendingEl.classList.add('has-pending');
        } else {
            pillPendingEl.classList.remove('has-pending');
        }
    }

    // Actualizar contadores de sección
    const secProjCount = document.getElementById('section-count-projects');
    const secBotsCount = document.getElementById('section-count-bots');
    if (secProjCount) secProjCount.innerText = allProjects.length;
    if (secBotsCount) secBotsCount.innerText = allBots.length;

    // 2. Filtrar proyectos
    let filteredProjects = allProjects;
    if (currentFilter === 'pending') {
        filteredProjects = pendingProjects;
    } else if (currentFilter === 'bots') {
        filteredProjects = [];
    }

    if (searchQuery) {
        filteredProjects = filteredProjects.filter(p => 
            p.name.toLowerCase().includes(searchQuery) ||
            (p.lastCommit && p.lastCommit.toLowerCase().includes(searchQuery)) ||
            (p.branch && p.branch.toLowerCase().includes(searchQuery))
        );
    }

    // 3. Filtrar bots
    let filteredBots = allBots;
    if (currentFilter === 'pending') {
        filteredBots = pendingBots;
    } else if (currentFilter === 'projects') {
        filteredBots = [];
    }

    if (searchQuery) {
        filteredBots = filteredBots.filter(b => b.name.toLowerCase().includes(searchQuery));
    }

    // 4. Actualizar clases de vista en wrappers
    const projWrapper = document.getElementById('projects-grid');
    const botsWrapper = document.getElementById('bots-grid');
    const viewClass = currentView === 'grid' ? 'view-grid' : 'view-list';

    if (projWrapper) {
        projWrapper.className = `projects-wrapper ${viewClass}`;
    }
    if (botsWrapper) {
        botsWrapper.className = `bots-wrapper ${viewClass}`;
    }

    // 5. Mostrar / Ocultar secciones según el filtro

    const showProjects = filteredProjects.length > 0 && currentFilter !== 'bots';
    const showBots = filteredBots.length > 0 && currentFilter !== 'projects';

    if (secProjects) secProjects.style.display = showProjects ? 'block' : 'none';
    if (secBots) secBots.style.display = showBots ? 'block' : 'none';

    if (!showProjects && !showBots) {
        if (emptyState) {
            emptyState.style.display = 'block';
            if (currentFilter === 'pending') {
                emptyState.querySelector('h3').innerText = '¡Todo está sincronizado y al día!';
                emptyState.querySelector('p').innerText = 'No hay ningún proyecto con cambios locales ni bots caídos.';
            } else if (searchQuery) {
                emptyState.querySelector('h3').innerText = 'No se encontraron resultados';
                emptyState.querySelector('p').innerText = `No hay proyectos ni bots que coincidan con "${searchQuery}".`;
            } else {
                emptyState.querySelector('h3').innerText = 'Sin elementos';
                emptyState.querySelector('p').innerText = 'No hay servicios en esta categoría.';
            }
        }
    } else {
        if (emptyState) emptyState.style.display = 'none';
    }

    // 6. Renderizar
    if (showProjects) renderProjects(filteredProjects);
    if (showBots) renderBots(filteredBots);
}

function renderProjects(projects) {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    if(!projects || projects.length === 0) {
        return;
    }

    projects.forEach(p => {
        let statusClass = 'status-online';
        let statusText = 'Actualizado';
        let clickAction = "";
        let pulseDot = true;

        if (p.error) {
            statusClass = 'status-offline';
            statusText = 'Error Git';
            pulseDot = false;
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
        const hasChanges = p.localChanges > 0 || p.ahead > 0;
        
        const actionBtn = hasChanges ? `
            <button class="btn-action deploy-btn" onclick="openDeployModal(event, '${p.name}', '${p.version}')" title="Sincronizar y Subir cambios">
                <i class="fa-solid fa-rocket"></i>
            </button>
        ` : '';

        const firebaseBtn = (p.consoleUrl && p.consoleUrl !== '#') ? `
            <button class="btn-action" onclick="window.openUrl(event, '${p.consoleUrl}')" title="Consola Firebase">
                <i class="fa-solid fa-cloud"></i>
            </button>
        ` : '';

        const row = document.createElement('div');
        row.className = 'row-item';

        row.innerHTML = `
            <!-- Columna 1: Identificador -->
            <div class="row-identity" onclick="window.openUrl(event, '${p.url}')" title="Abrir ${p.name}">
                <div class="row-icon-box">
                    <i class="fa-solid ${icon}"></i>
                </div>
                <div class="row-name-block">
                    <div class="row-title">
                        <span>${p.name}</span>
                    </div>
                    <span class="row-version">${p.version || 'v?'}</span>
                </div>
            </div>

            <!-- Columna 2: Estado Git / Despliegue -->
            <div class="row-status">
                <div class="status-badge ${statusClass}" ${clickAction} title="${statusText}">
                    <div class="status-dot ${pulseDot ? 'pulse' : ''}"></div>
                    <span>${statusText}</span>
                </div>
            </div>

            <!-- Columna 3: Rama y Último Commit -->
            <div class="row-meta">
                <span class="branch-tag" title="Rama">${p.branch || 'main'}</span>
                <div class="commit-text" title="${p.lastCommit || 'Sin commit'}">
                    <i class="fa-solid fa-code-commit"></i>
                    <span>${p.lastCommit || '-'}</span>
                </div>
            </div>

            <!-- Columna 4: Acciones -->
            <div class="row-actions">
                <button class="btn-action" onclick="window.openUrl(event, '${p.githubUrl}')" title="Ver en GitHub">
                    <i class="fa-brands fa-github"></i>
                </button>
                ${firebaseBtn}
                ${actionBtn}
            </div>
        `;
        grid.appendChild(row);
    });
}

function renderBots(bots) {
    const grid = document.getElementById('bots-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    if(!bots || bots.length === 0) {
        return;
    }

    bots.forEach(b => {
        const isOnline = b.status === 'online';
        const statusClass = isOnline ? 'status-online' : 'status-offline';
        const isWhatsApp = b.name.includes('whatsapp');
        const icon = isWhatsApp ? 'fa-brands fa-whatsapp' : 'fa-solid fa-robot';
        const iconColor = isWhatsApp ? '#25D366' : 'var(--accent)';

        const row = document.createElement('div');
        row.className = 'row-item';

        const logsBtn = isWhatsApp ? `
            <button class="btn-action btn-text" onclick="window.showBotLogs('${b.name}')" title="Ver mensajes y logs">
                <i class="fa-solid fa-terminal"></i> <span>Logs</span>
            </button>
        ` : '';

        row.innerHTML = `
            <!-- Columna 1: Identificador -->
            <div class="row-identity" ${isWhatsApp ? `onclick="window.showBotLogs('${b.name}')" style="cursor: pointer;"` : ''}>
                <div class="row-icon-box" style="border-color: ${iconColor}40">
                    <i class="${icon}" style="color: ${iconColor}"></i>
                </div>
                <div class="row-name-block">
                    <div class="row-title">
                        <span>${b.name}</span>
                    </div>
                    <span class="row-version">PM2</span>
                </div>
            </div>

            <!-- Columna 2: Estado -->
            <div class="row-status">
                <div class="status-badge ${statusClass}">
                    <div class="status-dot ${isOnline ? 'pulse' : ''}"></div>
                    <span>${b.status}</span>
                </div>
            </div>

            <!-- Columna 3: Métricas de rendimiento -->
            <div class="row-meta">
                <div class="bot-metrics">
                    <div class="metric-pill" title="Memoria RAM">
                        <i class="fa-solid fa-memory" style="color: var(--accent);"></i>
                        <strong>${b.memory}</strong> MB
                    </div>
                    <div class="metric-pill" title="Uso de CPU">
                        <i class="fa-solid fa-microchip" style="color: #a855f7;"></i>
                        <strong>${b.cpu}</strong>%
                    </div>
                    <div class="metric-pill" title="Tiempo activo">
                        <i class="fa-solid fa-clock" style="color: #10b981;"></i>
                        <strong>${Math.floor(b.uptime / 3600000)}</strong>h
                    </div>
                </div>
            </div>

            <!-- Columna 4: Acciones -->
            <div class="row-actions">
                ${logsBtn}
            </div>
        `;
        grid.appendChild(row);
    });
}

window.openUrl = (e, url) => {
    if (e) e.stopPropagation();
    if (!url || url === '#') return;
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
        badge.innerHTML = '<div class="spinner" style="width:12px; height:12px; border-width:2px;"></div> <span style="margin-left:6px">Actualizando...</span>';
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
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Sincronizando...</span>';
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

    await fetchLogs();

    if (logInterval) clearInterval(logInterval);
    logInterval = setInterval(fetchLogs, 5000);
};

function calculateNextVersion(current) {
    if (!current) return '1.0.0';
    const clean = current.replace(/^v/, '').trim();
    const parts = clean.split('.').map(Number);
    if (parts.length === 3) {
        let [major, minor, patch] = parts;
        if (isNaN(major) || isNaN(minor) || isNaN(patch)) return '1.0.0';
        if (minor > 9) return (major + 1) + '.0.0';
        if (patch > 9) return major + '.' + (minor + 1) + '.0';
        patch += 1;
        if (patch > 9) {
            patch = 0;
            minor += 1;
            if (minor > 9) {
                minor = 0;
                major += 1;
            }
        }
        return `${major}.${minor}.${patch}`;
    } else if (parts.length === 2) {
        let [major, minor] = parts;
        if (isNaN(major) || isNaN(minor)) return '1.0.0';
        return `${major + 1}.0.0`;
    }
    return '1.0.0';
}

window.openDeployModal = async (e, name, currentVersion) => {
    if (e) e.stopPropagation();
    document.getElementById('modal-project-name').innerText = name;
    document.getElementById('deploy-version').value = calculateNextVersion(currentVersion);
    
    const summaryInput = document.getElementById('deploy-summary');
    const hintEl = document.getElementById('deploy-summary-hint');
    summaryInput.value = 'Detectando cambios locales automáticamente...';
    summaryInput.disabled = true;
    if (hintEl) hintEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Leyendo Git...';
    
    document.getElementById('deploy-modal').style.display = 'flex';
    document.getElementById('btn-confirm-deploy').onclick = () => window.confirmDeploy(name);

    try {
        const res = await fetch(`/api/projects/changes-summary?name=${encodeURIComponent(name)}`);
        const data = await res.json();
        summaryInput.value = data.summary || 'Actualización y cambios locales';
        if (hintEl) hintEl.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Auto-detectado';
    } catch (err) {
        summaryInput.value = 'Actualización y cambios locales';
        if (hintEl) hintEl.innerHTML = '<i class="fa-solid fa-pen"></i> Manual';
    } finally {
        summaryInput.disabled = false;
        summaryInput.focus();
    }
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
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
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
            const errData = await res.json().catch(() => ({}));
            alert("Fallo en la operación: " + (errData.details || errData.error || "Revisa la consola del servidor."));
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión con el servidor.");
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Confirmar y Subir';
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

// Iniciar aplicación
init();
