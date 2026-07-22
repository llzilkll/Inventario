// Tablero de Ingresos de Sitios - Lógica de Aplicación
// Sincronización en NUBE en tiempo real (Firebase Realtime Database) + Modo Admin ZILKJL

const STORAGE_KEY = 'tablero_ingresos_sitios_v1';
const ADMIN_SESSION_KEY = 'tablero_admin_session_v1';
const DEFAULT_ADMIN_PASS = 'zilkjl2026';

// Configuración pública del proyecto independiente 'tablero-ingresos'
const firebaseConfig = {
  apiKey: "AIzaSyCGdHXluZcnFIRV7xPs8FhFqx8daqV6ktQ",
  authDomain: "tablero-ingresos.firebaseapp.com",
  projectId: "tablero-ingresos",
  storageBucket: "tablero-ingresos.firebasestorage.app",
  messagingSenderId: "829786327730",
  appId: "1:829786327730:web:182505481ca5fd3e4e17ab",
  measurementId: "G-YSRYD4ZH62",
  databaseURL: "https://tablero-ingresos-default-rtdb.firebaseio.com/"
};

let rtdbRef = null;

// Estado global de la aplicación
let state = {
    sites: [],
    filterMonth: 'ALL',
    filterContract: 'ALL',
    filterStatus: 'ALL',
    filterSearch: '',
    editingId: null,
    isAdmin: false,
    adminUser: 'ZILKJL',
    charts: {
        monthly: null,
        contract: null
    }
};

let DOM = {};

function initDOM() {
    DOM = {
        filterMonth: document.getElementById('filter-month'),
        filterContract: document.getElementById('filter-contract'),
        filterStatus: document.getElementById('filter-status'),
        filterSearch: document.getElementById('filter-search'),
        tableSearch: document.getElementById('table-search'),
        btnResetFilters: document.getElementById('btn-reset-filters'),
        
        kpiValTotal: document.getElementById('kpi-val-total'),
        kpiSubTotal: document.getElementById('kpi-sub-total'),
        kpiValGu: document.getElementById('kpi-val-gu'),
        kpiSubGu: document.getElementById('kpi-sub-gu'),
        kpiValRan: document.getElementById('kpi-val-ran'),
        kpiSubRan: document.getElementById('kpi-sub-ran'),
        kpiValMou: document.getElementById('kpi-val-mou'),
        kpiSubMou: document.getElementById('kpi-sub-mou'),

        pivotTbody: document.getElementById('pivot-tbody'),
        sitesTbody: document.getElementById('sites-tbody'),
        lblPivotCount: document.getElementById('lbl-pivot-count'),
        lblRecordsCount: document.getElementById('lbl-records-count'),

        btnOpenModal: document.getElementById('btn-open-modal'),
        btnExport: document.getElementById('btn-export'),
        cloudStatus: document.getElementById('cloud-status'),
        userNavActions: document.getElementById('user-nav-actions'),

        modalSite: document.getElementById('modal-site'),
        modalTitleText: document.getElementById('modal-title-text'),
        btnCloseModal: document.getElementById('btn-close-modal'),
        btnCancelModal: document.getElementById('btn-cancel-modal'),
        formSite: document.getElementById('form-site'),
        siteId: document.getElementById('site-id'),
        siteName: document.getElementById('site-name'),
        siteContract: document.getElementById('site-contract'),
        siteContractor: document.getElementById('site-contractor'),
        contractorsList: document.getElementById('contractors-list'),
        siteStatus: document.getElementById('site-status'),
        siteDay: document.getElementById('site-day'),
        siteMonth: document.getElementById('site-month'),
        siteYear: document.getElementById('site-year'),
        siteNotes: document.getElementById('site-notes'),

        modalLogin: document.getElementById('modal-login'),
        formLogin: document.getElementById('form-login'),
        loginUser: document.getElementById('login-user'),
        loginPass: document.getElementById('login-pass'),

        toastContainer: document.getElementById('toast-container')
    };
}

// --- INICIALIZACIÓN ---
function initApp() {
    initDOM();
    checkAdminSession();
    loadSitesLocal();
    initFirebase();
    initEventListeners();
    populateMonthFilterOptions();
    populateContractorsDatalist();
    renderApp();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// --- VERIFICAR SESIÓN ADMIN GRABADA EN LA MÁQUINA ---
function checkAdminSession() {
    try {
        const raw = localStorage.getItem(ADMIN_SESSION_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.loggedIn) {
                state.isAdmin = true;
                state.adminUser = parsed.user || 'ZILKJL';
            }
        }
    } catch(e) {
        state.isAdmin = false;
    }
}

// --- INICIALIZAR FIREBASE EN TIEMPO REAL ---
function initFirebase() {
    try {
        if (typeof firebase !== 'undefined') {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }

            const connectRealtime = () => {
                rtdbRef = firebase.database().ref('tablero_ingresos_sitios');
                
                // Escuchar cambios en vivo desde la Nube
                rtdbRef.on('value', (snapshot) => {
                    const val = snapshot.val();
                    if (val && Object.keys(val).length > 0) {
                        state.sites = Object.values(val);
                        saveSitesLocal();
                        populateMonthFilterOptions();
                        populateContractorsDatalist();
                        renderApp();
                    } else if (state.sites.length > 0 && state.isAdmin) {
                        // Sincronizar datos locales a la nube solo si es Admin
                        const payload = {};
                        state.sites.forEach(s => payload[s.id] = s);
                        rtdbRef.set(payload);
                    }
                    updateCloudStatus(true);
                }, (err) => {
                    console.warn("Realtime database offline:", err);
                    updateCloudStatus(false);
                });
            };

            if (firebase.auth) {
                firebase.auth().signInAnonymously()
                    .then(() => connectRealtime())
                    .catch(() => connectRealtime());
            } else {
                connectRealtime();
            }
        } else {
            updateCloudStatus(false);
        }
    } catch(e) {
        console.warn("Excepción al iniciar Firebase:", e);
        updateCloudStatus(false);
    }
}

function updateCloudStatus(online) {
    if (!DOM.cloudStatus) return;
    if (online) {
        DOM.cloudStatus.style.background = 'rgba(16, 185, 129, 0.15)';
        DOM.cloudStatus.style.color = '#10b981';
        DOM.cloudStatus.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        DOM.cloudStatus.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Nube Sincronizada`;
    } else {
        DOM.cloudStatus.style.background = 'rgba(234, 179, 8, 0.15)';
        DOM.cloudStatus.style.color = '#eab308';
        DOM.cloudStatus.style.borderColor = 'rgba(234, 179, 8, 0.3)';
        DOM.cloudStatus.innerHTML = `<i class="fa-solid fa-hard-drive"></i> Modo Local`;
    }
}

// --- ALMACENAMIENTO LOCAL FALLBACK ---
function loadSitesLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            state.sites = JSON.parse(raw);
        }
    } catch (e) {
        console.error("Error al cargar sitios locales:", e);
    }
}

function saveSitesLocal() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sites));
    } catch (e) {
        console.error("Error al guardar sitios locales:", e);
    }
}

// --- EVENT LISTENERS ---
function initEventListeners() {
    if (DOM.filterMonth) {
        DOM.filterMonth.addEventListener('change', (e) => {
            state.filterMonth = e.target.value;
            renderApp();
        });
    }

    if (DOM.filterContract) {
        DOM.filterContract.addEventListener('change', (e) => {
            state.filterContract = e.target.value;
            renderApp();
        });
    }

    if (DOM.filterStatus) {
        DOM.filterStatus.addEventListener('change', (e) => {
            state.filterStatus = e.target.value;
            renderApp();
        });
    }

    if (DOM.filterSearch) {
        DOM.filterSearch.addEventListener('input', (e) => {
            state.filterSearch = e.target.value.toLowerCase().trim();
            if (DOM.tableSearch) DOM.tableSearch.value = e.target.value;
            renderApp();
        });
    }

    if (DOM.tableSearch) {
        DOM.tableSearch.addEventListener('input', (e) => {
            state.filterSearch = e.target.value.toLowerCase().trim();
            if (DOM.filterSearch) DOM.filterSearch.value = e.target.value;
            renderApp();
        });
    }

    if (DOM.modalSite) {
        DOM.modalSite.addEventListener('click', (e) => {
            if (e.target === DOM.modalSite) closeModal();
        });
    }

    if (DOM.modalLogin) {
        DOM.modalLogin.addEventListener('click', (e) => {
            if (e.target === DOM.modalLogin) closeModal();
        });
    }

    if (DOM.formSite) {
        DOM.formSite.addEventListener('submit', (e) => {
            e.preventDefault();
            saveSiteForm();
        });
    }
}

// --- POBLAR AUTOCOMPLETADO DE CONTRATAS (DATALIST) ---
function populateContractorsDatalist() {
    if (!DOM.contractorsList) return;

    const set = new Set(['TelcoSur S.A.', 'Servicom', 'Electromontajes', 'Techint Telecom', 'Redes & Fibra']);

    state.sites.forEach(s => {
        if (s.contractor && s.contractor.trim() !== '') {
            set.add(s.contractor.trim());
        }
    });

    const sortedContractors = Array.from(set).sort((a, b) => a.localeCompare(b));
    let html = '';
    sortedContractors.forEach(contractor => {
        html += `<option value="${escapeHtml(contractor)}"></option>`;
    });

    DOM.contractorsList.innerHTML = html;
}

// --- FILTRADO ---
function getFilteredSites() {
    return state.sites.filter(site => {
        if (state.filterMonth !== 'ALL') {
            const siteMonth = site.date ? site.date.substring(0, 7) : '';
            if (siteMonth !== state.filterMonth) return false;
        }

        if (state.filterContract !== 'ALL' && site.contract !== state.filterContract) {
            return false;
        }

        if (state.filterStatus !== 'ALL' && (site.status || 'PARCIAL') !== state.filterStatus) {
            return false;
        }

        if (state.filterSearch !== '') {
            const nameMatch = (site.name || '').toLowerCase().includes(state.filterSearch);
            const contractorMatch = (site.contractor || '').toLowerCase().includes(state.filterSearch);
            const notesMatch = (site.notes || '').toLowerCase().includes(state.filterSearch);
            if (!nameMatch && !contractorMatch && !notesMatch) return false;
        }

        return true;
    });
}

// --- RENDERIZADO PRINCIPAL Y NAVEGACIÓN ROL ---
function renderApp() {
    const filteredSites = getFilteredSites();
    
    renderUserNav();
    updateKPIs(filteredSites);
    renderPivotTable(filteredSites);
    renderSitesTable(filteredSites);
    renderCharts(filteredSites);
}

function renderUserNav() {
    if (!DOM.userNavActions) return;

    if (state.isAdmin) {
        DOM.userNavActions.innerHTML = `
            <span class="badge-tag" style="background:rgba(99, 102, 241, 0.2); color:#818cf8; border:1px solid rgba(99,102,241,0.4); padding:6px 12px; font-size:0.8rem; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-user-shield"></i> Admin: ${escapeHtml(state.adminUser)}
            </span>
            <button class="btn btn-secondary btn-sm" onclick="window.logoutAdmin()" title="Cerrar sesión de Administrador">
                <i class="fa-solid fa-right-from-bracket"></i> Salir
            </button>
        `;
        if (DOM.btnOpenModal) DOM.btnOpenModal.style.display = 'inline-flex';
    } else {
        DOM.userNavActions.innerHTML = `
            <span class="badge-tag" style="background:rgba(148, 163, 184, 0.12); color:#94a3b8; border:1px solid rgba(148, 163, 184, 0.2); padding:6px 12px; font-size:0.8rem; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-eye"></i> Modo Lectura
            </span>
            <button class="btn btn-primary btn-sm" onclick="window.openLoginModal()">
                <i class="fa-solid fa-lock"></i> Acceso Admin
            </button>
        `;
        if (DOM.btnOpenModal) DOM.btnOpenModal.style.display = 'none';
    }
}

// --- POBLAR FILTRO MESES ---
function populateMonthFilterOptions() {
    if (!DOM.filterMonth) return;
    const currentMonth = DOM.filterMonth.value;
    
    const monthsSet = new Set();
    state.sites.forEach(s => {
        if (s.date && s.date.length >= 7) {
            monthsSet.add(s.date.substring(0, 7));
        }
    });

    if (monthsSet.size === 0) {
        const today = new Date().toISOString().substring(0, 7);
        monthsSet.add(today);
    }

    const sortedMonths = Array.from(monthsSet).sort().reverse();
    
    DOM.filterMonth.innerHTML = `<option value="ALL">Todos los Meses (${state.sites.length})</option>`;
    
    sortedMonths.forEach(ym => {
        const [year, month] = ym.split('-');
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
        const monthName = dateObj.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        const formattedLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        
        const option = document.createElement('option');
        option.value = ym;
        option.textContent = formattedLabel;
        DOM.filterMonth.appendChild(option);
    });

    DOM.filterMonth.value = currentMonth || 'ALL';
}

// --- ACTUALIZAR KPIS ---
function updateKPIs(filteredSites) {
    const total = filteredSites.length;
    const guCount = filteredSites.filter(s => s.contract === 'GU').length;
    const ranCount = filteredSites.filter(s => s.contract === 'RAN').length;
    const mouCount = filteredSites.filter(s => s.contract === 'MOU').length;

    const guPct = total > 0 ? ((guCount / total) * 100).toFixed(1) : 0;
    const ranPct = total > 0 ? ((ranCount / total) * 100).toFixed(1) : 0;
    const mouPct = total > 0 ? ((mouCount / total) * 100).toFixed(1) : 0;

    if (DOM.kpiValTotal) DOM.kpiValTotal.textContent = total;
    if (DOM.kpiSubTotal) DOM.kpiSubTotal.textContent = state.filterMonth === 'ALL' ? 'Ingresos acumulados' : 'Ingresos en periodo seleccionado';

    if (DOM.kpiValGu) DOM.kpiValGu.textContent = guCount;
    if (DOM.kpiSubGu) DOM.kpiSubGu.textContent = `${guPct}% del total de ingresos`;

    if (DOM.kpiValRan) DOM.kpiValRan.textContent = ranCount;
    if (DOM.kpiSubRan) DOM.kpiSubRan.textContent = `${ranPct}% del total de ingresos`;

    if (DOM.kpiValMou) DOM.kpiValMou.textContent = mouCount;
    if (DOM.kpiSubMou) DOM.kpiSubMou.textContent = `${mouPct}% del total de ingresos`;
}

// --- TABLA PIVOTE MENSUAL ---
function renderPivotTable(filteredSites) {
    if (!DOM.pivotTbody) return;
    const monthsMap = {};

    filteredSites.forEach(s => {
        const ym = s.date ? s.date.substring(0, 7) : 'Sin fecha';
        if (!monthsMap[ym]) {
            monthsMap[ym] = { GU: 0, RAN: 0, MOU: 0, total: 0 };
        }
        monthsMap[ym][s.contract] = (monthsMap[ym][s.contract] || 0) + 1;
        monthsMap[ym].total += 1;
    });

    const sortedMonths = Object.keys(monthsMap).sort().reverse();
    if (DOM.lblPivotCount) DOM.lblPivotCount.textContent = `${sortedMonths.length} Meses Registrados`;

    if (sortedMonths.length === 0) {
        DOM.pivotTbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <i class="fa-solid fa-folder-open"></i>
                        <p>No hay datos disponibles para los filtros seleccionados.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    let grandGu = 0, grandRan = 0, grandMou = 0, grandTotal = 0;

    sortedMonths.forEach(ym => {
        const data = monthsMap[ym];
        let formattedLabel = ym;
        if (ym.includes('-')) {
            const [year, month] = ym.split('-');
            const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
            const monthName = dateObj.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            formattedLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        }

        grandGu += data.GU;
        grandRan += data.RAN;
        grandMou += data.MOU;
        grandTotal += data.total;

        html += `
            <tr>
                <td><strong>${formattedLabel}</strong> <span style="color:var(--text-muted); font-size:0.75rem;">(${ym})</span></td>
                <td><span class="badge-tag badge-gu">${data.GU}</span></td>
                <td><span class="badge-tag badge-ran">${data.RAN}</span></td>
                <td><span class="badge-tag badge-mou">${data.MOU}</span></td>
                <td><strong>${data.total} sitios</strong></td>
            </tr>
        `;
    });

    html += `
        <tr class="pivot-total-row">
            <td>TOTAL ACUMULADO</td>
            <td><span class="badge-tag badge-gu">${grandGu}</span></td>
            <td><span class="badge-tag badge-ran">${grandRan}</span></td>
            <td><span class="badge-tag badge-mou">${grandMou}</span></td>
            <td><strong>${grandTotal} sitios</strong></td>
        </tr>
    `;

    DOM.pivotTbody.innerHTML = html;
}

// --- TABLA DETALLE SITIOS ---
function renderSitesTable(filteredSites) {
    if (!DOM.sitesTbody) return;
    if (DOM.lblRecordsCount) DOM.lblRecordsCount.textContent = `Mostrando ${filteredSites.length} sitios`;

    if (filteredSites.length === 0) {
        DOM.sitesTbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        <i class="fa-solid fa-inbox"></i>
                        <p>No se encontraron ingresos de sitios con los criterios seleccionados.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const sorted = [...filteredSites].sort((a, b) => {
        // 1. Ordenar por fecha de ingreso (date) descendente
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        if (dateA !== dateB) {
            return dateB - dateA;
        }

        // 2. Si la fecha es igual, mostrar arriba de todo el recién creado (createdAt)
        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (createdA !== createdB) {
            return createdB - createdA;
        }

        // 3. Fallback a ID con timestamp
        return (b.id || '').localeCompare(a.id || '');
    });

    let html = '';
    sorted.forEach((site, index) => {
        const badgeClass = site.contract === 'GU' ? 'badge-gu' : (site.contract === 'RAN' ? 'badge-ran' : 'badge-mou');
        const status = site.status || 'PARCIAL';
        let statusHtml = '';

        if (state.isAdmin) {
            const isParcial = status === 'PARCIAL' ? 'selected' : '';
            const isFinalizado = status === 'FINALIZADO' ? 'selected' : '';
            const isPendiente = status === 'PENDIENTE' ? 'selected' : '';

            statusHtml = `
                <select onchange="window.updateSiteStatusInline('${site.id}', this.value)" class="select-style" style="padding:4px 10px; font-size:0.75rem; font-weight:600; border-radius:12px; cursor:pointer; background:rgba(15, 23, 42, 0.8); border:1px solid rgba(255,255,255,0.15);">
                    <option value="PARCIAL" ${isParcial}>🟡 Parcial</option>
                    <option value="FINALIZADO" ${isFinalizado}>🟢 Finalizado</option>
                    <option value="PENDIENTE" ${isPendiente}>⚪ Pendiente</option>
                </select>
            `;
        } else {
            if (status === 'FINALIZADO') {
                statusHtml = `<span class="badge-status badge-status-finalizado"><i class="fa-solid fa-circle-check"></i> Finalizado</span>`;
            } else if (status === 'PENDIENTE') {
                statusHtml = `<span class="badge-status badge-status-pendiente"><i class="fa-solid fa-hourglass-start"></i> Pendiente</span>`;
            } else {
                statusHtml = `<span class="badge-status badge-status-parcial"><i class="fa-solid fa-clock"></i> Parcial</span>`;
            }
        }

        let actionsHtml = `<span style="color:var(--text-muted); font-size:0.75rem;"><i class="fa-solid fa-eye" style="margin-right:4px;"></i> Lectura</span>`;
        if (state.isAdmin) {
            actionsHtml = `
                <button class="btn btn-secondary btn-sm btn-icon-only" onclick="window.editSite('${site.id}')" title="Editar Sitio">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-secondary btn-sm btn-icon-only" onclick="window.deleteSite('${site.id}')" title="Eliminar" style="color:var(--danger-color);">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;
        }

        html += `
            <tr>
                <td><span style="color:var(--text-muted); font-size:0.8rem;">#${sorted.length - index}</span></td>
                <td><strong>${escapeHtml(site.name)}</strong></td>
                <td><span class="kpi-badge ${badgeClass}">${site.contract}</span></td>
                <td><span style="font-weight:500; color:#e2e8f0;"><i class="fa-solid fa-hard-hat" style="color:var(--accent-indigo); margin-right:6px; font-size:0.8rem;"></i>${site.contractor ? escapeHtml(site.contractor) : '-'}</span></td>
                <td><i class="fa-regular fa-calendar" style="color:var(--text-muted); margin-right:6px;"></i> ${formatDate(site.date)}</td>
                <td>${statusHtml}</td>
                <td><span style="color:var(--text-secondary); font-size:0.85rem;">${site.notes ? escapeHtml(site.notes) : '-'}</span></td>
                <td style="text-align: right;">${actionsHtml}</td>
            </tr>
        `;
    });

    DOM.sitesTbody.innerHTML = html;
}

// --- GRÁFICOS (CHART.JS) ---
function renderCharts(filteredSites) {
    if (typeof Chart === 'undefined') return;

    // 1. Evolución Mensual
    const monthsMap = {};
    filteredSites.forEach(s => {
        const ym = s.date ? s.date.substring(0, 7) : 'Sin fecha';
        if (!monthsMap[ym]) monthsMap[ym] = { GU: 0, RAN: 0, MOU: 0 };
        monthsMap[ym][s.contract] = (monthsMap[ym][s.contract] || 0) + 1;
    });

    const sortedMonths = Object.keys(monthsMap).sort();
    const monthLabels = sortedMonths.map(ym => {
        if (!ym.includes('-')) return ym;
        const [year, month] = ym.split('-');
        const d = new Date(parseInt(year), parseInt(month) - 1, 1);
        return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }).toUpperCase();
    });

    const dataGU = sortedMonths.map(ym => monthsMap[ym].GU);
    const dataRAN = sortedMonths.map(ym => monthsMap[ym].RAN);
    const dataMOU = sortedMonths.map(ym => monthsMap[ym].MOU);

    if (state.charts.monthly) {
        state.charts.monthly.destroy();
    }

    const canvasMonthly = document.getElementById('chart-monthly');
    if (canvasMonthly) {
        const ctxMonthly = canvasMonthly.getContext('2d');
        state.charts.monthly = new Chart(ctxMonthly, {
            type: 'bar',
            data: {
                labels: monthLabels,
                datasets: [
                    { label: 'GU', data: dataGU, backgroundColor: '#10b981', borderRadius: 4 },
                    { label: 'RAN', data: dataRAN, backgroundColor: '#0ea5e9', borderRadius: 4 },
                    { label: 'MOU', data: dataMOU, backgroundColor: '#a855f7', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94a3b8', font: { family: 'Inter' } } }
                },
                scales: {
                    x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#64748b', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
                }
            }
        });
    }

    // 2. Distribución por Contrato
    const guCount = filteredSites.filter(s => s.contract === 'GU').length;
    const ranCount = filteredSites.filter(s => s.contract === 'RAN').length;
    const mouCount = filteredSites.filter(s => s.contract === 'MOU').length;

    if (state.charts.contract) {
        state.charts.contract.destroy();
    }

    const canvasContract = document.getElementById('chart-contract');
    if (canvasContract) {
        const ctxContract = canvasContract.getContext('2d');
        state.charts.contract = new Chart(ctxContract, {
            type: 'doughnut',
            data: {
                labels: ['GU', 'RAN', 'MOU'],
                datasets: [{
                    data: [guCount, ranCount, mouCount],
                    backgroundColor: ['#10b981', '#0ea5e9', '#a855f7'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Inter' } } }
                },
                cutout: '70%'
            }
        });
    }
}

// --- MODALES Y AUTENTICACIÓN ADMIN ZILKJL ---
window.openLoginModal = function() {
    if (!DOM.modalLogin) initDOM();
    if (DOM.loginUser) DOM.loginUser.value = state.adminUser || 'ZILKJL';
    if (DOM.loginPass) DOM.loginPass.value = '';
    if (DOM.modalLogin) DOM.modalLogin.classList.add('active');
    if (DOM.loginPass) DOM.loginPass.focus();
};

window.closeLoginModal = function() {
    if (DOM.modalLogin) DOM.modalLogin.classList.remove('active');
};

window.handleLoginSubmit = function(e) {
    e.preventDefault();
    const user = DOM.loginUser ? DOM.loginUser.value.trim() : 'ZILKJL';
    const pass = DOM.loginPass ? DOM.loginPass.value.trim() : '';

    if (pass.toLowerCase() === 'zilkjl' || pass.toLowerCase() === 'zilkjl2026') {
        state.isAdmin = true;
        state.adminUser = user || 'ZILKJL';
        localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ loggedIn: true, user: state.adminUser }));
        window.closeLoginModal();
        renderApp();
        showToast(`¡Bienvenido ${state.adminUser}! Modo Administrador Activado`, "success");
    } else {
        showToast("Contraseña incorrecta", "danger");
    }
};

window.logoutAdmin = function() {
    state.isAdmin = false;
    localStorage.removeItem(ADMIN_SESSION_KEY);
    renderApp();
    showToast("Sesión de Administrador cerrada", "info");
};

window.openModal = function(siteToEdit = null) {
    if (!state.isAdmin) {
        showToast("Se requiere sesión de Administrador para editar", "danger");
        window.openLoginModal();
        return;
    }

    if (!DOM.modalSite) initDOM();
    populateContractorsDatalist();
    
    if (siteToEdit) {
        state.editingId = siteToEdit.id;
        if (DOM.modalTitleText) DOM.modalTitleText.textContent = "Editar Ingreso de Sitio";
        if (DOM.siteId) DOM.siteId.value = siteToEdit.id;
        if (DOM.siteName) DOM.siteName.value = siteToEdit.name;
        if (DOM.siteContract) DOM.siteContract.value = siteToEdit.contract;
        if (DOM.siteContractor) DOM.siteContractor.value = siteToEdit.contractor || '';
        if (DOM.siteStatus) DOM.siteStatus.value = siteToEdit.status || 'PARCIAL';
        
        if (siteToEdit.date && siteToEdit.date.includes('-')) {
            const parts = siteToEdit.date.split('-');
            if (DOM.siteYear) DOM.siteYear.value = parts[0];
            if (DOM.siteMonth) DOM.siteMonth.value = parts[1];
            if (DOM.siteDay) DOM.siteDay.value = parseInt(parts[2], 10);
        }
        if (DOM.siteNotes) DOM.siteNotes.value = siteToEdit.notes || '';
    } else {
        state.editingId = null;
        if (DOM.modalTitleText) DOM.modalTitleText.textContent = "Registrar Nuevo Ingreso de Sitio";
        if (DOM.formSite) DOM.formSite.reset();
        if (DOM.siteId) DOM.siteId.value = '';
        if (DOM.siteContractor) DOM.siteContractor.value = '';
        if (DOM.siteStatus) DOM.siteStatus.value = 'PARCIAL';
        
        const now = new Date();
        if (DOM.siteDay) DOM.siteDay.value = now.getDate();
        if (DOM.siteMonth) DOM.siteMonth.value = String(now.getMonth() + 1).padStart(2, '0');
        if (DOM.siteYear) DOM.siteYear.value = now.getFullYear();
    }
    
    if (DOM.modalSite) {
        DOM.modalSite.classList.add('active');
    }
    if (DOM.siteName) DOM.siteName.focus();
};

window.closeModal = function() {
    if (DOM.modalSite) {
        DOM.modalSite.classList.remove('active');
    }
};

window.resetFilters = function() {
    if (DOM.filterMonth) DOM.filterMonth.value = 'ALL';
    if (DOM.filterContract) DOM.filterContract.value = 'ALL';
    if (DOM.filterStatus) DOM.filterStatus.value = 'ALL';
    if (DOM.filterSearch) DOM.filterSearch.value = '';
    if (DOM.tableSearch) DOM.tableSearch.value = '';
    state.filterMonth = 'ALL';
    state.filterContract = 'ALL';
    state.filterStatus = 'ALL';
    state.filterSearch = '';
    renderApp();
    showToast("Filtros restablecidos", "success");
};

function saveSiteForm() {
    if (!state.isAdmin) {
        showToast("Acceso denegado: Inicia sesión como Admin", "danger");
        return;
    }

    const rawName = DOM.siteName ? DOM.siteName.value.trim() : '';
    const contract = DOM.siteContract ? DOM.siteContract.value : 'GU';
    const contractor = DOM.siteContractor ? DOM.siteContractor.value.trim() : '';
    const status = DOM.siteStatus ? DOM.siteStatus.value : 'PARCIAL';
    const day = DOM.siteDay ? parseInt(DOM.siteDay.value, 10) : null;
    const month = DOM.siteMonth ? DOM.siteMonth.value : '01';
    const year = DOM.siteYear ? parseInt(DOM.siteYear.value, 10) : null;
    const notes = DOM.siteNotes ? DOM.siteNotes.value.trim() : '';

    if (!rawName || !contract || !day || !month || !year || day < 1 || day > 31 || year < 2000) {
        showToast("Por favor completa los campos obligatorios y verifica el Día/Año", "danger");
        return;
    }

    const formattedDay = String(day).padStart(2, '0');
    const date = `${year}-${month}-${formattedDay}`;

    // Separar por comas para permitir ingresos múltiples individuales
    const siteNames = rawName.split(',').map(s => s.trim()).filter(s => s.length > 0);

    if (siteNames.length === 0) {
        showToast("Ingresa al menos un nombre de sitio", "danger");
        return;
    }

    // Verificación de Alerta por Sitios Duplicados
    const duplicates = [];
    siteNames.forEach(nameStr => {
        const lowerName = nameStr.toLowerCase();
        const exists = state.sites.some(s => (s.name || '').toLowerCase() === lowerName && s.id !== state.editingId);
        if (exists) {
            duplicates.push(nameStr);
        }
    });

    if (duplicates.length > 0) {
        let msg = '';
        if (duplicates.length === 1) {
            msg = `⚠️ ALERTA DE SITIO REPETIDO:\n\nEl sitio "${duplicates[0]}" YA FUE INGRESADO previamente en el tablero.\n\n¿Deseas volver a registrarlo de todos modos?`;
        } else {
            msg = `⚠️ ALERTA DE SITIOS REPETIDOS:\n\nLos siguientes sitios YA FUERON INGRESADOS previamente:\n• ${duplicates.join('\n• ')}\n\n¿Deseas volver a registrarlos de todos modos?`;
        }

        const confirmProceed = confirm(msg);
        if (!confirmProceed) {
            return;
        }
    }

    if (state.editingId) {
        // Editar un solo registro existente
        const singleName = siteNames[0];
        const siteRecord = {
            id: state.editingId,
            name: singleName,
            contract,
            contractor,
            status,
            date,
            notes,
            updatedAt: new Date().toISOString()
        };

        const index = state.sites.findIndex(s => s.id === state.editingId);
        if (index !== -1) {
            state.sites[index] = siteRecord;
        }

        if (rtdbRef) {
            rtdbRef.child(siteRecord.id).set(siteRecord).catch(err => console.warn(err));
        }

        showToast(`Sitio "${singleName}" actualizado`, "success");
    } else {
        // Crear registros individuales (uno por cada elemento separado por comas)
        const nowMs = Date.now();
        siteNames.forEach((siteNameStr, idx) => {
            const recordId = 'site_' + (nowMs + idx) + '_' + Math.random().toString(36).substr(2, 5);
            const record = {
                id: recordId,
                name: siteNameStr,
                contract,
                contractor,
                status,
                date,
                notes,
                createdAt: new Date(nowMs + idx).toISOString()
            };
            state.sites.unshift(record);

            if (rtdbRef) {
                rtdbRef.child(recordId).set(record).catch(err => console.warn(err));
            }
        });

        if (siteNames.length === 1) {
            showToast(`Sitio "${siteNames[0]}" guardado correctamente`, "success");
        } else {
            showToast(`¡Éxito! Se registraron ${siteNames.length} sitios de forma individual`, "success");
        }
    }

    saveSitesLocal();
    populateMonthFilterOptions();
    populateContractorsDatalist();
    window.closeModal();
    renderApp();
}

window.editSite = function(id) {
    if (!state.isAdmin) {
        showToast("Inicia sesión como Admin para editar", "danger");
        window.openLoginModal();
        return;
    }
    const site = state.sites.find(s => s.id === id);
    if (site) window.openModal(site);
};

window.deleteSite = function(id) {
    if (!state.isAdmin) {
        showToast("Inicia sesión como Admin para eliminar", "danger");
        window.openLoginModal();
        return;
    }
    const site = state.sites.find(s => s.id === id);
    if (!site) return;

    if (confirm(`¿Estás seguro de eliminar el sitio "${site.name}"?`)) {
        state.sites = state.sites.filter(s => s.id !== id);
        
        if (rtdbRef) {
            rtdbRef.child(id).remove().catch(err => console.warn("Error borrando en nube:", err));
        }

        saveSitesLocal();
        populateMonthFilterOptions();
        populateContractorsDatalist();
        renderApp();
        showToast(`Sitio "${site.name}" eliminado`, "success");
    }
};

window.updateSiteStatusInline = function(siteId, newStatus) {
    if (!state.isAdmin) {
        showToast("Se requiere sesión de Administrador para cambiar el estado", "danger");
        window.openLoginModal();
        return;
    }

    const site = state.sites.find(s => s.id === siteId);
    if (site) {
        site.status = newStatus;
        site.updatedAt = new Date().toISOString();

        if (rtdbRef) {
            rtdbRef.child(siteId).update({ status: newStatus, updatedAt: site.updatedAt }).catch(err => {
                console.warn("Error al actualizar estado en Firebase:", err);
            });
        }

        saveSitesLocal();
        renderApp();
        showToast(`Estado de "${site.name}" cambiado a ${newStatus}`, "success");
    }
};

// --- IMPORTAR Y EXPORTAR RESPALDOS DE DATOS ---
window.exportToJSON = function() {
    if (state.sites.length === 0) {
        showToast("No hay registros para exportar", "danger");
        return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.sites, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `Tablero_Ingresos_Sitios_Backup_${new Date().toISOString().substring(0,10)}.json`);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    dlAnchorElem.remove();

    showToast("Respaldo JSON descargado", "success");
};

window.importFromJSON = function(event) {
    if (!state.isAdmin) {
        showToast("Debes iniciar sesión como Admin para importar datos", "danger");
        window.openLoginModal();
        return;
    }

    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedSites = JSON.parse(e.target.result);
            if (Array.isArray(importedSites)) {
                state.sites = importedSites;
                saveSitesLocal();

                if (rtdbRef) {
                    const payload = {};
                    importedSites.forEach(s => payload[s.id || 'site_' + Math.random()] = s);
                    rtdbRef.set(payload).catch(err => console.warn("Error importando en la nube:", err));
                }

                populateMonthFilterOptions();
                populateContractorsDatalist();
                renderApp();
                showToast(`¡Éxito! Se importaron ${importedSites.length} sitios`, "success");
            } else {
                showToast("El archivo seleccionado no tiene un formato válido", "danger");
            }
        } catch(err) {
            console.error("Error al importar JSON:", err);
            showToast("Error al procesar el archivo JSON", "danger");
        }
    };
    reader.readAsText(file);
};

window.exportToCSV = function() {
    const filteredSites = getFilteredSites();
    if (filteredSites.length === 0) {
        showToast("No hay registros para exportar", "danger");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "sep=;\n";
    csvContent += "ID;Nombre del Sitio;Contrato;Empresa Contrata;Estado;Fecha de Ingreso (DD/MM/AAAA);Observaciones\n";

    filteredSites.forEach(s => {
        const row = [
            `"${s.id}"`,
            `"${(s.name || '').replace(/"/g, '""')}"`,
            `"${s.contract}"`,
            `"${(s.contractor || '').replace(/"/g, '""')}"`,
            `"${s.status || 'PARCIAL'}"`,
            `"${formatDate(s.date)}"`,
            `"${(s.notes || '').replace(/"/g, '""')}"`
        ];
        csvContent += row.join(";") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Ingresos_Sitios_${new Date().toISOString().substring(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Reporte CSV descargado con éxito", "success");
};

function showToast(message, type = 'info') {
    if (!DOM.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const iconClass = type === 'success' ? 'fa-circle-check' : (type === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-info');
    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${escapeHtml(message)}</span>`;
    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.printCaratulaFromModal = function() {
    const contractor = DOM.siteContractor ? DOM.siteContractor.value.trim() : '';
    const siteNames = DOM.siteName ? DOM.siteName.value.trim() : '';
    const day = DOM.siteDay ? DOM.siteDay.value : '';
    const month = DOM.siteMonth ? DOM.siteMonth.value : '';
    const year = DOM.siteYear ? DOM.siteYear.value : '';
    const notes = DOM.siteNotes ? DOM.siteNotes.value.trim() : '';

    if (!siteNames) {
        showToast("Por favor ingresa al menos un nombre de sitio para generar la carátula", "danger");
        return;
    }

    const formattedDate = (day && month && year) ? `${String(day).padStart(2, '0')}/${month}/${year}` : '';

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast("No se pudo abrir la ventana de impresión. Verifica si tienes bloqueador de ventanas emergentes.", "danger");
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Carátula de Planilla de Control</title>
            <style>
                @page {
                    size: A4 landscape;
                    margin: 8mm;
                }
                body {
                    font-family: Arial, sans-serif;
                    color: #000;
                    margin: 0;
                    padding: 0;
                }
                .header-top {
                    display: grid;
                    grid-template-columns: 1.2fr 1.6fr 1.2fr;
                    border-bottom: 3px solid #000;
                    padding-bottom: 8px;
                    margin-bottom: 12px;
                }
                .header-col {
                    text-align: center;
                }
                .header-col label {
                    display: block;
                    font-size: 11px;
                    text-transform: uppercase;
                    color: #444;
                    font-weight: bold;
                    margin-bottom: 4px;
                }
                .header-col span {
                    font-size: 28px;
                    font-weight: 800;
                }
                .title-box {
                    display: grid;
                    grid-template-columns: 4fr 1.2fr;
                    border: 2px solid #8faadc;
                    margin-bottom: 15px;
                }
                .title-text {
                    background-color: #d9e1f2;
                    font-size: 34px;
                    font-weight: bold;
                    text-align: center;
                    padding: 15px;
                    border-right: 2px solid #8faadc;
                }
                .operario-text {
                    display: flex;
                    align-items: center;
                    padding-left: 15px;
                    font-size: 18px;
                    font-weight: bold;
                }
                .grid-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .grid-table td {
                    border: 1px solid #8faadc;
                    height: 35px;
                    padding: 6px 12px;
                    font-size: 15px;
                    vertical-align: middle;
                }
                .label-cell {
                    font-weight: bold;
                    width: 180px;
                }
                .empty-row td {
                    height: 35px;
                }
            </style>
        </head>
        <body>
            <div class="header-top">
                <div class="header-col" style="text-align: left;">
                    <label>Nombre de Contrata</label>
                    <span style="font-size: 30px;">${contractor || '____________'}</span>
                </div>
                <div class="header-col">
                    <label>Sitios</label>
                    <span style="font-size: 30px;">${siteNames}</span>
                </div>
                <div class="header-col" style="text-align: right;">
                    <label>Fecha</label>
                    <span style="font-size: 24px;">${formattedDate || '___/___/______'}</span>
                </div>
            </div>

            <div class="title-box">
                <div class="title-text">Planilla de control</div>
                <div class="operario-text">Operario: ______________</div>
            </div>

            <table class="grid-table">
                <tr>
                    <td class="label-cell">Fecha de inicio:</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
                <tr>
                    <td class="label-cell">Fecha fin:</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
                <tr class="empty-row"><td></td><td></td><td></td><td></td><td></td></tr>
                <tr class="empty-row"><td></td><td></td><td></td><td></td><td></td></tr>
                <tr class="empty-row"><td></td><td></td><td></td><td></td><td></td></tr>
                
                <tr>
                    <td class="label-cell" colspan="5" style="background-color: #f2f2f2;">Observaciones:</td>
                </tr>
                <tr>
                    <td colspan="5" style="height: 60px; vertical-align: top; font-size: 16px; line-height: 1.4; white-space: pre-wrap; font-weight: bold; border-bottom: none;">${notes || ''}</td>
                </tr>
                <tr class="empty-row"><td></td><td></td><td></td><td></td><td></td></tr>
                <tr class="empty-row"><td></td><td></td><td></td><td></td><td></td></tr>
                <tr class="empty-row"><td></td><td></td><td></td><td></td><td></td></tr>
                <tr class="empty-row"><td></td><td></td><td></td><td></td><td></td></tr>
                <tr class="empty-row"><td></td><td></td><td></td><td></td><td></td></tr>
            </table>

            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                };
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
};

window.printRotulosFromModal = function() {
    const contractor = DOM.siteContractor ? DOM.siteContractor.value.trim() : '';
    const siteNames = DOM.siteName ? DOM.siteName.value.trim() : '';
    const day = DOM.siteDay ? DOM.siteDay.value : '';
    const month = DOM.siteMonth ? DOM.siteMonth.value : '';
    const year = DOM.siteYear ? DOM.siteYear.value : '';

    if (!siteNames) {
        showToast("Por favor ingresa al menos un nombre de sitio para generar los rótulos", "danger");
        return;
    }

    const countStr = prompt("¿Cuántos palets deseas rotular para este ingreso? (Ej: 3)", "3");
    if (countStr === null) return; // cancelado

    const count = parseInt(countStr, 10);
    if (isNaN(count) || count < 1) {
        showToast("Por favor ingresa un número válido de palets (ej: 1, 2, 3...)", "danger");
        return;
    }

    const formattedDate = (day && month && year) ? `${String(day).padStart(2, '0')}/${month}/${year}` : '';

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast("No se pudo abrir la ventana de impresión. Verifica si tienes bloqueador de ventanas emergentes.", "danger");
        return;
    }

    let labelsHtml = '';
    for (let i = 1; i <= count; i++) {
        labelsHtml += `
            <div class="label-page">
                <div class="label-header">
                    <span class="label-badge-label">CONTRATA</span>
                    <span class="label-badge-value">${contractor || '____________'}</span>
                </div>
                
                <div class="label-content">
                    <div style="margin-bottom: 8px;">
                        <div class="label-field-title">SITIOS</div>
                        <div class="label-field-value">${siteNames}</div>
                    </div>
                    <div>
                        <span class="label-field-title">FECHA INGRESO:</span>
                        <span class="label-date-value">${formattedDate || '___/___/______'}</span>
                    </div>
                </div>

                <div class="label-footer">
                    <span class="label-footer-brand">Control de Ingresos</span>
                    <span class="label-footer-counter">PALET ${i}/${count}</span>
                </div>
            </div>
        `;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Rótulos para Palets - Zebra</title>
            <style>
                @page {
                    size: 100mm 80mm;
                    margin: 0;
                }
                html, body {
                    margin: 0;
                    padding: 0;
                    width: 100mm;
                    height: 80mm;
                    background-color: #ffffff;
                    color: #000000;
                    font-family: 'Arial', sans-serif;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .label-page {
                    width: 100mm;
                    height: 80mm;
                    box-sizing: border-box;
                    padding: 4mm 6mm;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    page-break-after: always;
                    overflow: hidden;
                }
                .label-page:last-child {
                    page-break-after: avoid;
                }
                .label-header {
                    border-bottom: 4.5px solid #000000;
                    padding-bottom: 2px;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                }
                .label-badge-label {
                    font-size: 14px;
                    font-weight: 800;
                    color: #000;
                }
                .label-badge-value {
                    font-size: 42px;
                    font-weight: 900;
                    letter-spacing: -0.5px;
                }
                .label-content {
                    flex-grow: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    margin-top: 2px;
                    margin-bottom: 2px;
                    gap: 6px;
                }
                .label-field-title {
                    font-size: 14px;
                    font-weight: 800;
                    color: #000;
                    margin-bottom: 1px;
                    text-transform: uppercase;
                }
                .label-field-value {
                    font-size: 38px;
                    font-weight: 900;
                    line-height: 1.05;
                }
                .label-date-value {
                    font-size: 26px;
                    font-weight: 900;
                    margin-left: 6px;
                }
                .label-footer {
                    border-top: 3.5px solid #000000;
                    padding-top: 2px;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                }
                .label-footer-brand {
                    font-size: 13px;
                    font-weight: 800;
                    color: #000;
                    text-transform: uppercase;
                }
                .label-footer-counter {
                    font-size: 44px;
                    font-weight: 900;
                    color: #000000;
                    line-height: 1;
                }
            </style>
        </head>
        <body>
            ${labelsHtml}
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                };
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
};
