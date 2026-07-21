// Registrar Service Worker para PWA (100% Offline)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registrado con éxito:', reg.scope))
            .catch(err => console.warn('Error al registrar el Service Worker:', err));
    });
}

// Estado de la aplicación (Fuera de línea)
const state = {
    workbookGeneral: null, // Archivo Excel de Telefónica
    sheetNameGeneral: '',
    parsedGeneral: [], // Datos estructurados del Excel de Telefónica
    parsedControl: [], // Datos estructurados del Reporte de Control pegado
    reconciliationData: [], // Resultado final cruzado
    activeTab: 'todos',
    searchQuery: '',
    filterZona: 'TODOS',
    filterSitio: 'TODOS',
    installPromptEvent: null
};

// Elementos de la Interfaz (UI)
const welcomePanel = document.getElementById('welcome-panel');
const dropZoneGeneral = document.getElementById('drop-zone-general');
const inputGeneral = document.getElementById('input-general');
const generalFileInfo = document.getElementById('general-file-info');

const controlPasteArea = document.getElementById('control-paste-area');
const pasteRowsCount = document.getElementById('paste-rows-count');
const pasteStatusMsg = document.getElementById('paste-status-msg');

const mappingPanel = document.getElementById('mapping-panel');
const selectSheetGeneral = document.getElementById('select-sheet-general');
const btnRunManualMapping = document.getElementById('btn-run-manual-mapping');

const metricsPanel = document.getElementById('metrics-panel');
const resultsPanel = document.getElementById('results-panel');
const tableHeaders = document.getElementById('table-headers');
const tableBody = document.getElementById('table-body');
const searchInput = document.getElementById('search-input');
const btnCopy = document.getElementById('btn-copy');
const btnReset = document.getElementById('btn-reset');
const installBtn = document.getElementById('install-btn');

// PWA Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installPromptEvent = e;
    installBtn.style.display = 'flex';
});

installBtn.addEventListener('click', () => {
    if (!state.installPromptEvent) return;
    state.installPromptEvent.prompt();
    state.installPromptEvent.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('El usuario aceptó instalar la PWA');
        }
        state.installPromptEvent = null;
        installBtn.style.display = 'none';
    });
});

// Helper: Normalizar nombre del sitio (ej: "EXPERIS BN177" -> "BN177", "BN177 (CONTROL RAN)" -> "BN177")
function normalizeSite(siteStr) {
    if (!siteStr) return 'SIN SITIO';
    
    // Buscar patrón de 2 letras y 3 números (ej: BN177, KO376, BO398)
    const match = String(siteStr).toUpperCase().match(/[A-Z]{2}\d{3}/);
    if (match) {
        return match[0];
    }
    
    return String(siteStr)
        .replace(/\(control ran\)/gi, '')
        .replace(/\(control\)/gi, '')
        .trim()
        .toUpperCase();
}

// Procesar el texto pegado (Estructura TSV)
function parsePastedReport(text) {
    if (!text || !text.trim()) return [];
    
    const lines = text.split('\n');
    if (lines.length === 0) return [];

    // Buscar cabeceras en las primeras líneas
    let headersLineIdx = -1;
    let headers = [];

    for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const parts = lines[i].split('\t').map(h => h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
        if (parts.includes('sitio') || parts.includes('codigo') || parts.includes('cantidad') || parts.includes('descripcion')) {
            headersLineIdx = i;
            headers = parts;
            break;
        }
    }

    let colSitio = 0;
    let colCodigo = 1;
    let colNroParte = 2;
    let colDescripcion = 3;
    let colEstado = 4;
    let colCantidad = 5;

    if (headersLineIdx !== -1) {
        const sIdx = headers.indexOf('sitio');
        if (sIdx !== -1) colSitio = sIdx;
        
        const cIdx = headers.findIndex(h => h.includes('codigo') || h === 'cod');
        if (cIdx !== -1) colCodigo = cIdx;
        
        const pIdx = headers.findIndex(h => h.includes('parte') || h.includes('nro') || h.includes('numero'));
        if (pIdx !== -1) colNroParte = pIdx;
        
        const dIdx = headers.findIndex(h => h.includes('descripcion') || h.includes('desc'));
        if (dIdx !== -1) colDescripcion = dIdx;
        
        const eIdx = headers.findIndex(h => h.includes('estado') || h.includes('destino'));
        if (eIdx !== -1) colEstado = eIdx;
        
        const qIdx = headers.findIndex(h => h.includes('cantidad') || h === 'cant');
        if (qIdx !== -1) colCantidad = qIdx;
    }

    const parsed = [];
    const startLine = headersLineIdx !== -1 ? headersLineIdx + 1 : 0;

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        const cols = line.split('\t').map(c => c.trim());
        if (cols.length < 2) continue; // Descartar líneas malformadas

        const rawSitio = cols[colSitio] || '';
        const sitio = normalizeSite(rawSitio);
        const codigo = cols[colCodigo] || '';
        
        if (!codigo) continue;

        let cantidad = 1;
        const rawCant = cols[colCantidad] || '';
        if (rawCant) {
            const parsedCant = parseInt(rawCant.replace(/[^\d-]/g, ''), 10);
            if (!isNaN(parsedCant)) cantidad = parsedCant;
        }

        parsed.push({
            sitio: sitio,
            codigo: codigo,
            nroParte: cols[colNroParte] || '',
            descripcion: cols[colDescripcion] || 'Sin Descripción',
            estado: cols[colEstado] || 'N/A',
            cantidad: cantidad
        });
    }

    return parsed;
}

// Escuchar cambios en la caja de pegado
controlPasteArea.addEventListener('input', () => {
    const text = controlPasteArea.value;
    state.parsedControl = parsePastedReport(text);

    if (state.parsedControl.length > 0) {
        pasteRowsCount.textContent = `${state.parsedControl.length} filas`;
        pasteStatusMsg.className = "paste-status status-success";
        
        // Obtener los sitios únicos detectados en el pegado
        const uniqueSites = [...new Set(state.parsedControl.map(x => x.sitio))];
        pasteStatusMsg.textContent = `✓ Reporte procesado. Sitios detectados: ${uniqueSites.join(', ')}`;
        
        // Ejecutar conciliación automática si ya cargaron el Excel
        if (state.workbookGeneral) {
            runReconciliation();
        }
    } else {
        pasteRowsCount.textContent = "0 filas";
        pasteStatusMsg.className = "paste-status status-waiting";
        if (text.trim().length > 0) {
            pasteStatusMsg.className = "paste-status status-error";
            pasteStatusMsg.textContent = "✕ No pudimos leer las columnas. Copia la tabla completa de la web.";
        } else {
            pasteStatusMsg.textContent = "Esperando pegado de datos...";
        }
    }
});

// Configurar Drop Zone única para el Excel de Telefónica
setupDragAndDrop(dropZoneGeneral, inputGeneral);

function setupDragAndDrop(zone, input) {
    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
}

// Manejar la carga del archivo Excel
function handleFileSelect(file) {
    if (state.parsedControl.length === 0) {
        showToast("Primero pega el reporte de control en la caja de la izquierda.", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            state.workbookGeneral = workbook;
            generalFileInfo.textContent = file.name;
            generalFileInfo.style.display = 'inline-block';
            dropZoneGeneral.classList.add('has-file');

            const sheetNames = workbook.SheetNames;
            
            // Buscar automáticamente la pestaña de la planilla general
            const sheetGeneral = sheetNames.find(name => {
                const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return n.includes('general') || n.includes('gral') || n.includes('planilla');
            }) || sheetNames[0];

            if (sheetGeneral) {
                state.sheetNameGeneral = sheetGeneral;
                runReconciliation();
            } else {
                setupManualMapping(sheetNames);
            }
        } catch (error) {
            console.error(error);
            showToast(`Error al leer el archivo Excel: ${error.message}`, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

// Mapeador manual si hay múltiples pestañas y no se autodetectan
function setupManualMapping(sheets) {
    selectSheetGeneral.innerHTML = '<option value="">-- Seleccionar Hoja --</option>';
    sheets.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        selectSheetGeneral.appendChild(opt);
    });

    if (sheets.length === 1) selectSheetGeneral.value = sheets[0];

    mappingPanel.style.display = 'block';
    welcomePanel.style.display = 'none';
}

btnRunManualMapping.addEventListener('click', () => {
    const val = selectSheetGeneral.value;
    if (!val) {
        showToast('Debes seleccionar la pestaña de Telefónica para continuar.', 'error');
        return;
    }

    state.sheetNameGeneral = val;
    mappingPanel.style.display = 'none';
    runReconciliation();
});

// Lógica principal de ejecución de conciliación
function runReconciliation() {
    try {
        const sheet = state.workbookGeneral.Sheets[state.sheetNameGeneral];
        const rawGeneral = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        // Procesar y estructurar datos del Excel
        state.parsedGeneral = cleanAndStructureData(rawGeneral);

        if (state.parsedGeneral.length === 0) {
            showToast('No se encontraron datos legibles en el Excel de Telefónica.', 'error');
            return;
        }

        // Realizar la conciliación
        reconcile();
        
        // Ocultar bienvenida y mostrar resultados
        welcomePanel.style.display = 'none';
        mappingPanel.style.display = 'none';
        metricsPanel.style.display = 'grid';
        resultsPanel.style.display = 'block';

        renderResults();
        showToast('Conciliación finalizada con éxito.');
    } catch (e) {
        console.error(e);
        showToast(`Error al procesar la conciliación: ${e.message}`, 'error');
    }
}

// Buscar cabecera de la tabla en Excel
function findHeaderRow(sheetData) {
    for (let r = 0; r < Math.min(sheetData.length, 25); r++) {
        const row = sheetData[r];
        if (!row || row.length === 0) continue;
        
        let hasSitio = false;
        let hasCodigo = false;
        
        for (let c = 0; c < row.length; c++) {
            const cellVal = String(row[c] || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (cellVal === 'sitio') hasSitio = true;
            if (cellVal.includes('codigo') || cellVal === 'cod' || cellVal.includes('numero de parte') || cellVal.includes('num. serie')) {
                hasCodigo = true;
            }
        }
        if (hasSitio || (hasCodigo && row.length > 3)) {
            return r;
        }
    }
    return 0;
}

// Limpiar y estructurar las columnas del Excel
function cleanAndStructureData(rawRows) {
    if (rawRows.length === 0) return [];

    const headerIndex = findHeaderRow(rawRows);
    const headers = rawRows[headerIndex].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(headerIndex + 1);

    const columnMap = {};
    
    // Paso 1: Buscar coincidencias exactas
    headers.forEach((h, index) => {
        const normalized = h.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (normalized === 'sitio') {
            columnMap['sitio'] = index;
        } else if (normalized === 'codigo' || normalized === 'cod' || normalized === 'código') {
            columnMap['codigo'] = index;
        } else if (normalized === 'zona') {
            columnMap['zona'] = index;
        } else if (normalized === 'destino') {
            columnMap['destino'] = index;
        } else if (normalized === 'cantidad' || normalized === 'cant') {
            columnMap['cantidad'] = index;
        }
    });

    // Paso 2: Coincidencias parciales para los restantes (excluyendo 'nombre')
    headers.forEach((h, index) => {
        const normalized = h.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        if (columnMap['sitio'] === undefined && normalized.includes('siti') && !normalized.includes('nombre') && !normalized.includes('nom ')) {
            columnMap['sitio'] = index;
        }
        if (columnMap['codigo'] === undefined && (normalized.includes('cod') || normalized.includes('codigo'))) {
            columnMap['codigo'] = index;
        }
        if (columnMap['zona'] === undefined && normalized.includes('zon')) {
            columnMap['zona'] = index;
        }
        if (columnMap['descripcion'] === undefined && (normalized.includes('descripcion') || normalized.includes('desc'))) {
            columnMap['descripcion'] = index;
        }
        if (columnMap['destino'] === undefined && normalized.includes('dest')) {
            columnMap['destino'] = index;
        }
        if (columnMap['serie'] === undefined && (normalized.includes('serie') || normalized.includes('ser'))) {
            columnMap['serie'] = index;
        }
        if (columnMap['nroParte'] === undefined && (normalized.includes('parte') || normalized.includes('numero de parte'))) {
            columnMap['nroParte'] = index;
        }
        if (columnMap['cantidad'] === undefined && normalized.includes('cant')) {
            columnMap['cantidad'] = index;
        }
    });

    const structured = [];

    dataRows.forEach(row => {
        const isRowEmpty = row.every(val => val === null || val === undefined || String(val).trim() === '');
        if (isRowEmpty) return;

        const getVal = (colKey) => {
            const idx = columnMap[colKey];
            return idx !== undefined && row[idx] !== undefined ? String(row[idx]).trim() : '';
        };

        const codigo = getVal('codigo');
        const rawSitio = getVal('sitio');
        const sitio = normalizeSite(rawSitio);
        
        if (!codigo && !rawSitio) return;

        // Limpiar cantidad
        let cantidad = 1;
        const rawCant = getVal('cantidad');
        if (rawCant) {
            const parsed = parseInt(rawCant.replace(/[^\d-]/g, ''), 10);
            if (!isNaN(parsed)) cantidad = parsed;
        }

        structured.push({
            zona: getVal('zona') || 'N/A',
            sitio: sitio, // Sitio limpio y normalizado
            codigo: codigo,
            nroParte: getVal('nroParte'),
            descripcion: getVal('descripcion') || 'Sin Descripción',
            destino: getVal('destino') || 'N/A',
            serie: getVal('serie'),
            cantidad: cantidad
        });
    });

    return structured;
}

// Conciliar datos: Excel vs Pegado
function reconcile() {
    const excelGrouped = {};
    const controlGrouped = {};

    // Obtener los sitios cargados en el Reporte de Control para filtrar en Excel
    const targetSites = new Set(state.parsedControl.map(item => item.sitio));

    // 1. Agrupar datos del Excel de Telefónica (filtrado por sitios del pegado)
    state.parsedGeneral.forEach(item => {
        if (!targetSites.has(item.sitio)) return;

        const key = `${item.sitio}_${item.codigo}`;
        if (!excelGrouped[key]) {
            excelGrouped[key] = {
                zona: item.zona,
                sitio: item.sitio,
                codigo: item.codigo,
                nroParte: item.nroParte,
                descripcion: item.descripcion,
                destino: item.destino,
                series: item.serie ? [item.serie] : [],
                cantidad: 0
            };
        } else {
            if (item.serie && !excelGrouped[key].series.includes(item.serie)) {
                excelGrouped[key].series.push(item.serie);
            }
            if (excelGrouped[key].descripcion === 'Sin Descripción' && item.descripcion) {
                excelGrouped[key].descripcion = item.descripcion;
            }
        }
        excelGrouped[key].cantidad += item.cantidad;
    });

    // 2. Agrupar datos del Reporte de Control pegado
    state.parsedControl.forEach(item => {
        const key = `${item.sitio}_${item.codigo}`;
        
        if (!controlGrouped[key]) {
            controlGrouped[key] = {
                zona: 'N/A',
                sitio: item.sitio,
                codigo: item.codigo,
                nroParte: item.nroParte,
                descripcion: item.descripcion,
                destino: item.estado,
                cantidad: 0
            };
        }
        controlGrouped[key].cantidad += item.cantidad;
    });

    // 3. Cruzar ambos mapas agrupados
    const allKeys = new Set([...Object.keys(excelGrouped), ...Object.keys(controlGrouped)]);
    const result = [];

    allKeys.forEach(key => {
        const excelItem = excelGrouped[key];
        const controlItem = controlGrouped[key];

        const sitio = excelItem ? excelItem.sitio : controlItem.sitio;
        const codigo = excelItem ? excelItem.codigo : controlItem.codigo;
        const zona = excelItem ? excelItem.zona : controlItem.zona;
        const nroParte = excelItem ? excelItem.nroParte : controlItem.nroParte;
        const descripcion = excelItem ? excelItem.descripcion : controlItem.descripcion;
        const destinoExcel = excelItem ? excelItem.destino : 'N/A';
        const destinoControl = controlItem ? controlItem.destino : 'N/A';

        const qtyExcel = excelItem ? excelItem.cantidad : 0;
        const qtyControl = controlItem ? controlItem.cantidad : 0;
        const diff = qtyControl - qtyExcel; // Diferencia (Real Control - Cantidad)

        let status = '';
        if (qtyExcel > 0 && qtyControl > 0) {
            status = diff === 0 ? 'coinciden' : 'discrepancias';
        } else if (qtyExcel > 0) {
            status = 'faltantes'; // Esperado en Excel pero no en Reporte
        } else if (qtyControl > 0) {
            status = 'sobrantes'; // En Reporte pero no en Excel
        }

        result.push({
            key: `${sitio}_${codigo}`,
            zona,
            sitio,
            codigo,
            nroParte,
            descripcion,
            destinoExcel,
            destinoControl,
            qtyExcel,
            qtyControl,
            diff,
            status,
            series: excelItem ? excelItem.series.join(', ') : ''
        });
    });

    state.reconciliationData = result;
    state.filterZona = 'TODOS';
    state.filterSitio = 'TODOS';
    updateMetrics(result);
}

// Calcular y renderizar KPIs
function updateMetrics(data) {
    const counts = {
        coinciden: 0,
        discrepancias: 0,
        faltantes: 0,
        sobrantes: 0
    };

    data.forEach(item => {
        counts[item.status]++;
    });

    document.getElementById('kpi-coincidencias').textContent = counts.coinciden;
    document.getElementById('kpi-discrepancias').textContent = counts.discrepancias;
    document.getElementById('kpi-faltantes').textContent = counts.faltantes;
    document.getElementById('kpi-sobrantes').textContent = counts.sobrantes;

    document.getElementById('badge-coinciden').textContent = counts.coinciden;
    document.getElementById('badge-discrepancias').textContent = counts.discrepancias;
    document.getElementById('badge-faltantes').textContent = counts.faltantes;
    document.getElementById('badge-sobrantes').textContent = counts.sobrantes;
    document.getElementById('badge-todos').textContent = data.length;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === state.activeTab);
    });
}

// Renderizar tabla de resultados
function renderResults() {
    const filtered = state.reconciliationData.filter(item => {
        if (state.activeTab !== 'todos' && item.status !== state.activeTab) {
            return false;
        }

        if (state.filterZona && state.filterZona !== 'TODOS' && item.zona !== state.filterZona) {
            return false;
        }

        if (state.filterSitio && state.filterSitio !== 'TODOS' && item.sitio !== state.filterSitio) {
            return false;
        }

        if (state.searchQuery) {
            const query = state.searchQuery.toLowerCase();
            return (
                item.sitio.toLowerCase().includes(query) ||
                item.codigo.toLowerCase().includes(query) ||
                item.nroParte.toLowerCase().includes(query) ||
                item.descripcion.toLowerCase().includes(query) ||
                item.destinoExcel.toLowerCase().includes(query) ||
                item.destinoControl.toLowerCase().includes(query)
            );
        }

        return true;
    });

    tableHeaders.innerHTML = '';
    tableBody.innerHTML = '';

    const headers = [
        'Zona', 'Sitio', 'Código', 'Nro Parte', 'Descripción', 
        'Destino', 'Destino Control', 'Cantidad', 'Recibido', 'Diferencia', 'Series'
    ];

    const tabFilteredData = state.reconciliationData.filter(item => state.activeTab === 'todos' || item.status === state.activeTab);
    const uniqueZonas = Array.from(new Set(tabFilteredData.map(i => i.zona).filter(Boolean))).sort();
    const uniqueSitios = Array.from(new Set(tabFilteredData.map(i => i.sitio).filter(Boolean))).sort();

    headers.forEach(h => {
        const th = document.createElement('th');
        if (h === 'Zona') {
            th.innerHTML = `
                <div class="th-filter-wrapper">
                    <span>Zona</span>
                    <select id="header-filter-zona" class="header-filter-select">
                        <option value="TODOS">Todas (${uniqueZonas.length})</option>
                        ${uniqueZonas.map(z => `<option value="${z}" ${state.filterZona === z ? 'selected' : ''}>${z}</option>`).join('')}
                    </select>
                </div>
            `;
            const sel = th.querySelector('#header-filter-zona');
            if (sel) {
                sel.addEventListener('change', (e) => {
                    state.filterZona = e.target.value;
                    renderResults();
                });
            }
        } else if (h === 'Sitio') {
            th.innerHTML = `
                <div class="th-filter-wrapper">
                    <span>Sitio</span>
                    <select id="header-filter-sitio" class="header-filter-select">
                        <option value="TODOS">Todos (${uniqueSitios.length})</option>
                        ${uniqueSitios.map(s => `<option value="${s}" ${state.filterSitio === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
            `;
            const sel = th.querySelector('#header-filter-sitio');
            if (sel) {
                sel.addEventListener('change', (e) => {
                    state.filterSitio = e.target.value;
                    renderResults();
                });
            }
        } else {
            th.textContent = h;
        }
        tableHeaders.appendChild(th);
    });

    if (filtered.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = headers.length;
        td.style.textAlign = 'center';
        td.style.color = 'var(--text-secondary)';
        td.style.padding = '2rem';
        td.textContent = 'No se encontraron resultados en esta categoría.';
        tr.appendChild(td);
        tableBody.appendChild(tr);
        return;
    }

    filtered.forEach(item => {
        const tr = document.createElement('tr');
        
        let diffClass = 'diff-ok';
        let diffText = item.diff;
        if (item.diff < 0) {
            diffClass = 'diff-negative';
            diffText = item.diff;
        } else if (item.diff > 0) {
            diffClass = 'diff-positive';
            diffText = `+${item.diff}`;
        }

        const cells = [
            item.zona,
            item.sitio,
            item.codigo,
            item.nroParte || '-',
            item.descripcion,
            item.destinoExcel,
            item.destinoControl,
            item.qtyExcel,
            `<div class="qty-control-container">
                <button class="btn-qty btn-qty-down" onclick="adjustQty('${item.key}', -1)">−</button>
                <span class="qty-val">${item.qtyControl}</span>
                <button class="btn-qty btn-qty-up" onclick="adjustQty('${item.key}', 1)">+</button>
             </div>`,
            `<span class="val-diff ${diffClass}">${diffText}</span>`,
            item.series || '-'
        ];

        cells.forEach((val, idx) => {
            const td = document.createElement('td');
            if (idx === 8 || idx === 9) {
                td.innerHTML = val;
            } else {
                td.textContent = val;
            }
            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });
}

// Configurar Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeTab = btn.getAttribute('data-tab');
        renderResults();
    });
});

// Filtro de búsqueda en tiempo real
searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderResults();
});

// Botón: Copiar Tabla visible
btnCopy.addEventListener('click', () => {
    const table = document.getElementById('results-table');
    if (!table) return;

    let tsv = [];
    const headerCells = table.querySelectorAll('thead th');
    const headerRow = Array.from(headerCells).map(cell => {
        const titleSpan = cell.querySelector('span');
        return titleSpan ? titleSpan.textContent.trim() : cell.textContent.trim();
    }).join('\t');
    tsv.push(headerRow);

    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 1 && cells[0].textContent.includes('No se encontraron')) return;

        const rowText = Array.from(cells).map((cell, idx) => {
            if (idx === 8) {
                const qtyValSpan = cell.querySelector('.qty-val');
                return qtyValSpan ? qtyValSpan.textContent.trim() : cell.textContent.trim();
            }
            return cell.textContent.trim();
        }).join('\t');
        tsv.push(rowText);
    });

    if (tsv.length <= 1) {
        showToast('No hay datos en la tabla para copiar.', 'error');
        return;
    }

    navigator.clipboard.writeText(tsv.join('\n'))
        .then(() => showToast('¡Copiado! Pégalo directamente en Excel (Ctrl + V).'))
        .catch(err => {
            console.error(err);
            showToast('Error al copiar automáticamente.', 'error');
        });
});

// Botón: Nueva Conciliación
btnReset.addEventListener('click', () => {
    state.workbookGeneral = null;
    state.sheetNameGeneral = '';
    state.parsedGeneral = [];
    state.parsedControl = [];
    state.reconciliationData = [];
    state.searchQuery = '';
    state.filterZona = 'TODOS';
    state.filterSitio = 'TODOS';
    searchInput.value = '';
    controlPasteArea.value = '';
    pasteRowsCount.textContent = '0 filas';
    pasteStatusMsg.className = 'paste-status status-waiting';
    pasteStatusMsg.textContent = 'Esperando pegado de datos...';

    // Restablecer dropzone
    dropZoneGeneral.classList.remove('has-file');
    generalFileInfo.style.display = 'none';
    inputGeneral.value = '';

    // Ocultar resultados y volver a bienvenida
    metricsPanel.style.display = 'none';
    resultsPanel.style.display = 'none';
    mappingPanel.style.display = 'none';
    welcomePanel.style.display = 'flex';

    showToast('Listo para una nueva conciliación.');
});

// Función global para ajustar cantidad
window.adjustQty = function(key, amount) {
    const item = state.reconciliationData.find(d => d.key === key);
    if (!item) return;

    item.qtyControl = Math.max(0, item.qtyControl + amount);
    item.diff = item.qtyControl - item.qtyExcel;

    // Recalcular estado
    if (item.qtyExcel > 0 && item.qtyControl > 0) {
        item.status = item.diff === 0 ? 'coinciden' : 'discrepancias';
    } else if (item.qtyExcel > 0) {
        item.status = 'faltantes';
    } else if (item.qtyControl > 0) {
        item.status = 'sobrantes';
    } else {
        item.status = 'coinciden';
    }

    updateMetrics(state.reconciliationData);
    renderResults();
};

// Helper: Mostrar Toast
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const msgSpan = document.getElementById('toast-message');

    toast.className = 'toast';
    if (type === 'success') {
        toast.classList.add('toast-success');
        icon.innerHTML = '<i class="fa-solid fa-check"></i>';
    } else {
        toast.classList.add('toast-error');
        icon.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    }

    msgSpan.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}
