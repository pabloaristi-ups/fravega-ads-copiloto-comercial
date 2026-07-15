
        // Endpoint base de Google Sheets (mismo Sheet compartido, lectura en vivo vía GViz/JSONP)
        const SOURCE_SHEET_ID = '1tfz10mJDhwg9pPauk-RhWOnL9jFm-aeYi39qmjDKluQ';
        const BASE_URL_CAMP = `https://docs.google.com/spreadsheets/d/${SOURCE_SHEET_ID}/gviz/tq?gid=1808937830&headers=2`;
        const BASE_URL_GMV  = `https://docs.google.com/spreadsheets/d/${SOURCE_SHEET_ID}/gviz/tq?gid=1144863220&headers=1`;

        // Ya no se usa mapeo externo de categorías: GERENCIA viene en ambas bases.

        let brandsChart, categoryChart;
        let dataStore = { brands: { FY: [], YTD: [] }, cats: { FY: [], YTD: [] } };
        let jsonCamp = null;
        let jsonGMV = null;
        let jsonCat = { table: { rows: [] } }; // no se usa: GERENCIA viene en ambas bases

        const formatMoney = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
        const formatAxis = (value) => '$ ' + (value / 1000000).toFixed(1) + 'M';
        const formatPct = (value) => (value * 100).toFixed(2) + '%';
        
        const cleanInv = (val) => {
            if (val === null || val === undefined || val === '' || val === '#REF!') return 0;
            if (typeof val === 'number') return val;
            let raw = String(val).trim();
            // Soporta formatos AR: $ 1.234.567,89 / 1,234,567.89 / valores numéricos como texto
            raw = raw.replace(/\$/g, '').replace(/\s/g, '');
            if (raw.includes(',') && raw.includes('.')) {
                raw = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? raw.replace(/\./g, '').replace(/,/g, '.') : raw.replace(/,/g, '');
            } else if (raw.includes(',')) {
                raw = raw.replace(/\./g, '').replace(/,/g, '.');
            } else {
                raw = raw.replace(/,/g, '');
            }
            let num = parseFloat(raw);
            return isNaN(num) ? 0 : num;
        };

        const normalizeText = (val) => String(val || '')
            .trim()
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ');

        // Clave robusta SOLO para resolver diferencias invisibles entre las dos bases.
        // Importante: no reemplaza el nombre visible ni colapsa categorías; se usa como índice auxiliar.
        const normalizeKey = (val) => normalizeText(String(val || '').replace(/ /g, ' '))
            .replace(/[–—-]/g, ' ')
            .replace(/[()]/g, ' ')
            .replace(/[^A-Z0-9Ñ ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const displayCategory = (val) => String(val || '')
            .replace(/ /g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();


        const isExcludedGerencia = (val) => {
            const raw = String(val || '').trim();
            const txt = normalizeText(raw);
            const key = normalizeKey(raw);
            return ['N/A', 'NA', 'N A', 'SIN CATEGORIZAR'].includes(txt) || ['N A', 'NA', 'SIN CATEGORIZAR'].includes(key);
        };

        const normalizeEstado = normalizeText;

        const isEstadoValidoFacturacion = (val) => {
            const estado = normalizeEstado(val);
            return estado.startsWith('APROBAD') || estado.startsWith('FACTURAD');
        };

        const parseMonthValue = (val) => {
            if (val === null || val === undefined || val === '') return 0;
            if (typeof val === 'number') return val >= 1 && val <= 12 ? val : (val >= 202001 ? Number(String(Math.trunc(val)).slice(-2)) : 0);
            const txt = normalizeText(val);
            const direct = parseInt(txt, 10);
            if (!isNaN(direct)) return direct >= 1 && direct <= 12 ? direct : (direct >= 202001 ? Number(String(direct).slice(-2)) : 0);
            const map = {ENERO:1, ENE:1, FEBRERO:2, FEB:2, MARZO:3, MAR:3, ABRIL:4, ABR:4, MAYO:5, MAY:5, JUNIO:6, JUN:6, JULIO:7, JUL:7, AGOSTO:8, AGO:8, SEPTIEMBRE:9, SETIEMBRE:9, SEP:9, SET:9, OCTUBRE:10, OCT:10, NOVIEMBRE:11, NOV:11, DICIEMBRE:12, DIC:12};
            return map[txt] || 0;
        };

        const parseYearValue = (val) => {
            if (val === null || val === undefined || val === '') return 0;
            if (typeof val === 'number') return val >= 2020 && val <= 2035 ? val : (val >= 202001 ? Number(String(Math.trunc(val)).slice(0,4)) : 0);
            const txt = String(val).trim();
            const y = parseInt(txt, 10);
            if (!isNaN(y)) return y >= 2020 && y <= 2035 ? y : (y >= 202001 ? Number(String(y).slice(0,4)) : 0);
            const match = txt.match(/20\d{2}/);
            return match ? Number(match[0]) : 0;
        };
        const titleCase = (str) => str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        const cleanMarca = (marca) => {
            if (!marca) return 'Desconocida';
            let m = String(marca).trim().toUpperCase();
            if (m === 'NAN' || m === '') return 'Desconocida';
            if (m.includes("SAMSUNG")) return "SAMSUNG";
            if (m.includes("TCL")) return "TCL";
            if (m.includes("BITALI")) return "BITALI";
            if (m.includes("XIAOMI")) return "XIAOMI";
            if (m.includes("FRAVEGA HOME") || m.includes("FRÁVEGA HOME")) return "FRAVEGA HOME";
            if (m.includes("E-BAZAR") || m.includes("E - BAZAR")) return "E-BAZAR";
            if (m.includes("OVERHARD")) return "OVERHARD";
            if (m.includes("MADESA")) return "MADESA";
            if (m.includes("MORANO")) return "MORANO";
            if (m.includes("TODO BAZAR")) return "TODO BAZAR";
            return titleCase(m);
        };

        const AUTO_REFRESH_MS = 6 * 60 * 60 * 1000; // 6 horas
        let isLoadingSheetData = false;
        let refreshTimer = null;
        let lastRefreshAt = null;
        let loadingTimeout = null;

        $(document).ready(function() {
            // Botón y estado de actualización visibles para validar que el dashboard
            // vuelve a pedir datos al Google Sheet sin refrescar la página.
            const refreshBar = `
                <div id="refresh-status" style="position:fixed;right:18px;bottom:14px;z-index:9999;background:rgba(15,23,42,.92);color:#E5E7EB;border:1px solid rgba(148,163,184,.35);border-radius:12px;padding:10px 12px;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.25);">
                    <button id="btn-refresh-data" style="background:#2563EB;color:white;border:0;border-radius:8px;padding:6px 10px;margin-right:8px;cursor:pointer;font-weight:600;">Actualizar datos</button>
                    <span id="refresh-status-text">Cargando datos…</span>
                </div>`;
            $('body').append(refreshBar);
            $('#btn-refresh-data').on('click', () => loadSheetData(true));

            loadSheetData(false);
            refreshTimer = setInterval(() => loadSheetData(true), AUTO_REFRESH_MS);
        });

        function updateRefreshStatus(text) {
            $('#refresh-status-text').text(text);
        }

        function loadSheetData(isRefresh) {
            if (isLoadingSheetData) return;
            isLoadingSheetData = true;

            // Importante: reiniciamos los JSON antes de cada carga. Si no, cuando llega
            // solo uno de los tres scripts, checkDataReady podría renderizar mezclando
            // datos nuevos con datos viejos.
            jsonCamp = null;
            jsonGMV = null;
            jsonCat = { table: { rows: [] } }; // no se usa

            const ts = Date.now();
            const cbCamp = 'cbCamp_' + ts;
            const cbGMV  = 'cbGMV_'  + ts;
            let pending = 2;

            updateRefreshStatus(isRefresh ? 'Actualizando…' : 'Cargando datos…');

            clearTimeout(loadingTimeout);
            loadingTimeout = setTimeout(() => {
                if (!isLoadingSheetData) return;
                isLoadingSheetData = false;
                const msg = 'La carga demoró más de 30 segundos. Reintentá con “Actualizar datos”.';
                updateRefreshStatus(msg);
                if (!lastRefreshAt) $('#loading').html('<h2 style="color:var(--negative)">' + msg + '</h2>');
            }, 30000);

            window[cbCamp] = function(json) { jsonCamp = json; checkDataReady(ts); };
            window[cbGMV]  = function(json) { jsonGMV  = json; checkDataReady(ts); };

            function cleanup(cbName, scriptEl) {
                delete window[cbName];
                if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
            }

            function injectScript(baseUrl, cbName, errMsg) {
                let s = document.createElement('script');
                // Cache-busting fuerte: el callback y el parámetro _ cambian en cada carga.
                s.src = baseUrl + '&tqx=out:json;responseHandler:' + cbName + '&_=' + ts;
                s.onerror = () => {
                    pending--;
                    cleanup(cbName, s);
                    isLoadingSheetData = false;
                    updateRefreshStatus(errMsg);
                    if (!lastRefreshAt) $('#loading').html('<h2 style="color:var(--negative)">' + errMsg + '</h2>');
                };
                s.onload = () => {
                    pending--;
                    setTimeout(() => cleanup(cbName, s), 0);
                };
                document.body.appendChild(s);
            }

            injectScript(BASE_URL_CAMP, cbCamp, 'Error al cargar Campañas.');
            injectScript(BASE_URL_GMV,  cbGMV,  'Error al cargar GMV.');
        }

        function checkDataReady(ts) {
            if (jsonCamp && jsonGMV) {
                clearTimeout(loadingTimeout);
                renderDashboard();
                isLoadingSheetData = false;
                lastRefreshAt = new Date();
                updateRefreshStatus('Actualizado ' + lastRefreshAt.toLocaleTimeString('es-AR') + ' · Auto cada 6 h');
            }
        }

        function renderDashboard() {
            // Procesar Categorías Maestro
            window.catMap = {};
            if (jsonCat && jsonCat.table && jsonCat.table.rows) {
                jsonCat.table.rows.forEach(r => {
                    let catName = r.c[1] && r.c[1].v ? String(r.c[1].v).toUpperCase().trim() : '';
                    let grupo = r.c[2] && r.c[2].v ? String(r.c[2].v).toUpperCase().trim() : 'SIN GRUPO';
                    let gerencia = r.c[4] && r.c[4].v ? String(r.c[4].v).toUpperCase().trim() : 'SIN GERENCIA';
                    if(catName) {
                        window.catMap[catName] = { grupo: grupo, gerencia: gerencia };
                    }
                });
            }

            const cols = jsonCamp.table.cols.map(c => c ? c.label || '' : '');
            const rows = jsonCamp.table.rows;
            
            // Buscar índices de las columnas según los labels compuestos que devuelve gviz
            const colsNorm = cols.map(normalizeText);
            const findCol = (exactLabels, includesLabels = []) => {
                const exactNorm = exactLabels.map(normalizeText);
                const includesNorm = includesLabels.map(normalizeText);
                let idx = colsNorm.findIndex(c => exactNorm.includes(c));
                if (idx >= 0) return idx;
                return colsNorm.findIndex(c => includesNorm.some(label => c.includes(label)));
            };
            const colEstado = findCol(['ESTADO'], ['ESTADO']);
            const colInv = findCol(['TOTAL INVERSIÓN ARS  (S/ IVA)', 'TOTAL INVERSIÓN ARS (S/ IVA)', 'TOTAL INVERSION ARS (S/ IVA)'], ['TOTAL INVERSION ARS']);
            const colMarca = findCol(['MARCAS'], ['MARCAS']);
            const candidateCampCategoryCols = colsNorm
                .map((label, index) => ({ label, index }))
                .filter(x => x.label.includes('CATEGORIA'))
                .map(x => x.index);
            const colAno = findCol(['AÑO', 'ANO'], ['AÑO', 'ANO']);
            const colMes = findCol(['MES'], ['MES']);
            const colFechaMes = findCol(['FECHA. MES', 'FECHA MES'], ['FECHA']);
            const colGerencia = findCol(['GERENCIA'], ['GERENCIA']);
            const colIdCategoria = findCol(['ID CATEGORIA', 'ID CAT.', 'ID CAT'], ['ID CATEGORIA', 'ID CAT']);
            const colDestinoFondos = findCol(['DESTINO DE FONDOS'], ['DESTINO DE FONDOS', 'DESTINO FONDOS']);

            // Selección robusta de columnas GMV por encabezado, evitando depender de posiciones fijas.
            const gmvCols = jsonGMV.table.cols.map(c => c ? c.label || '' : '');
            const gmvColsNorm = gmvCols.map(normalizeText);
            const findGMVCol = (exactLabels, includesLabels = []) => {
                const exactNorm = exactLabels.map(normalizeText);
                const includesNorm = includesLabels.map(normalizeText);
                let idx = gmvColsNorm.findIndex(c => exactNorm.includes(c));
                if (idx >= 0) return idx;
                return gmvColsNorm.findIndex(c => includesNorm.some(label => c.includes(label)));
            };
            const colGMVFechaMes = findGMVCol(['FECHA.MES', 'FECHA MES', 'AÑOMES', 'ANO MES'], ['FECHA', 'MES']);
            const colGMVMarca = findGMVCol(['MARCA', 'MARCAS'], ['MARCA']);
            const candidateGMVCategoryCols = gmvColsNorm
                .map((label, index) => ({ label, index }))
                .filter(x => x.label.includes('CATEGORIA'))
                .map(x => x.index);
            const colGMVValue = findGMVCol(['VENTA NETA', 'GMV', 'VENTAS'], ['VENTA NETA', 'GMV']);
            const colGMVGerencia = findGMVCol(['GERENCIA'], ['GERENCIA']);
            const colGMVIdCategoria = findGMVCol(['ID CAT.', 'ID CATEGORIA', 'ID CAT'], ['ID CAT', 'ID CATEGORIA']);

            // Elige la pareja de columnas de categoría con mayor solapamiento real entre ambas bases.
            // Esto evita tomar por error una columna auxiliar que también se llame “Categoría”.
            const sampleKeys = (sourceRows, colIndex, maxRows = 600) => {
                const out = new Set();
                if (colIndex < 0) return out;
                for (let i = 0; i < Math.min(sourceRows.length, maxRows); i++) {
                    const cell = sourceRows[i].c[colIndex];
                    const key = normalizeKey(cell && cell.v !== null ? cell.v : '');
                    if (key) out.add(key);
                }
                return out;
            };
            let colCat = candidateCampCategoryCols[0] ?? findCol(['CATEGORÍA', 'CATEGORIA'], ['CATEGORIA']);
            let colGMVCat = candidateGMVCategoryCols[0] ?? 3;
            let bestOverlap = -1;
            candidateCampCategoryCols.forEach(campIdx => {
                const campSet = sampleKeys(rows, campIdx);
                candidateGMVCategoryCols.forEach(gmvIdx => {
                    const gmvSet = sampleKeys(jsonGMV.table.rows, gmvIdx);
                    let overlap = 0;
                    campSet.forEach(k => { if (gmvSet.has(k)) overlap++; });
                    if (overlap > bestOverlap) {
                        bestOverlap = overlap;
                        colCat = campIdx;
                        colGMVCat = gmvIdx;
                    }
                });
            });

            // Catálogo canónico de categorías y gerencias desde GMV.
            // Se cruza por ID de categoría como clave primaria; el texto queda como fallback.
            const canonicalCategoryByJoinKey = {};
            const canonicalGerenciaByJoinKey = {};
            const canonicalJoinKeyByNameKey = {};
            const makeCategoryJoinKey = (idValue, nameValue) => {
                const idNum = Number(idValue);
                if (Number.isFinite(idNum) && idNum > 0) return 'ID:' + String(Math.trunc(idNum));
                const idText = String(idValue || '').trim();
                if (idText && idText !== '0') return 'ID:' + normalizeKey(idText);
                const nameKey = normalizeKey(nameValue);
                return nameKey ? 'NAME:' + nameKey : '';
            };

            jsonGMV.table.rows.forEach(r => {
                const getVal = (idx) => (idx >= 0 && r.c[idx] && r.c[idx].v !== null) ? r.c[idx].v : '';
                const rawCategory = getVal(colGMVCat);
                const rawId = getVal(colGMVIdCategoria);
                const joinKey = makeCategoryJoinKey(rawId, rawCategory);
                const nameKey = normalizeKey(rawCategory);
                if (!joinKey) return;
                if (!canonicalCategoryByJoinKey[joinKey]) canonicalCategoryByJoinKey[joinKey] = displayCategory(rawCategory);
                if (nameKey && !canonicalJoinKeyByNameKey[nameKey]) canonicalJoinKeyByNameKey[nameKey] = joinKey;
                const ger = normalizeText(getVal(colGMVGerencia >= 0 ? colGMVGerencia : 6));
                if (ger && !isExcludedGerencia(ger)) canonicalGerenciaByJoinKey[joinKey] = ger;
            });

            const resolveCampaignCategory = (row) => {
                const getRowVal = (idx) => (idx >= 0 && row.c[idx] && row.c[idx].v !== null) ? row.c[idx].v : '';
                const rawId = getRowVal(colIdCategoria);
                let rawName = '';
                for (const idx of (candidateCampCategoryCols.length ? candidateCampCategoryCols : [colCat])) {
                    const candidate = getRowVal(idx);
                    if (normalizeKey(candidate)) { rawName = candidate; break; }
                }
                let joinKey = makeCategoryJoinKey(rawId, rawName);
                const nameKey = normalizeKey(rawName);
                if ((!joinKey || !canonicalCategoryByJoinKey[joinKey]) && nameKey && canonicalJoinKeyByNameKey[nameKey]) {
                    joinKey = canonicalJoinKeyByNameKey[nameKey];
                }
                return { raw: rawName, id: rawId, key: joinKey, display: canonicalCategoryByJoinKey[joinKey] || displayCategory(rawName) };
            };

            // Determinar YTD dinámico
            let currentMonth = new Date().getMonth() + 1; // getMonth es 0-index
            let mes_maximo_ytd = currentMonth - 1;
            if (mes_maximo_ytd < 1) mes_maximo_ytd = 1;
            
            const nombresMesesAbrev = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const nombreMesCorte = nombresMesesAbrev[mes_maximo_ytd - 1];
            const rango_ytd_str = `Ene-${nombreMesCorte}`;

            // Datos estructurados
            let inv_2025_fy = 0, inv_2026_fy = 0;
            let inv_2025_ytd = 0, inv_2026_ytd = 0;
            let inv_mensual_2025 = new Array(12).fill(0);
            let inv_mensual_2026 = new Array(12).fill(0);

            let marcasMap = {};
            let gruposMap = {};
            let gerenciasMap = {};

            // Recorrer el formato JSON de rows
            window.validRows = [];
            const controlDestinoFondos2025 = { ajuste: 0, coop: 0, montoExcluido: 0, filasExcluidas: 0 };
            rows.forEach(r => {
                const getVal = (idx) => (r.c[idx] && r.c[idx].v !== null) ? r.c[idx].v : '';
                
                let estado = normalizeEstado(getVal(colEstado));
                if (!isEstadoValidoFacturacion(estado)) return;

                let invRaw = getVal(colInv);
                let inv = cleanInv(invRaw);
                if (inv === 0) return;

                let marca = cleanMarca(getVal(colMarca));
                if (marca.toUpperCase() === 'DESCONOCIDO' || marca === '0') return;
                const categoriaResuelta = resolveCampaignCategory(r);
                let categoriaRaw = categoriaResuelta.raw;
                let categoria = categoriaResuelta.display;
                let categoriaKey = categoriaResuelta.key;
                let anio = parseYearValue(getVal(colAno));
                let mes = parseMonthValue(getVal(colMes));
                // Fallback: si MES/AÑO vienen vacíos o con formato no parseable, derivar desde Fecha.Mes (ej: 202606)
                const fechaMesVal = getVal(colFechaMes);
                if (!anio) anio = parseYearValue(fechaMesVal);
                if (!mes) mes = parseMonthValue(fechaMesVal);

                let isYTD = (mes <= mes_maximo_ytd);

                // Regla de depuración 2025:
                // los registros cuyo DESTINO DE FONDOS sea Ajuste o Coop no representan
                // inversión comercial y se excluyen de todos los cálculos de 2025.
                // La comparación es tolerante a mayúsculas, acentos, espacios y variantes
                // como "AJUSTE CONTABLE" o "COOP MARKETING".
                const destinoFondos = normalizeText(getVal(colDestinoFondos));
                const excluirPorDestino2025 = anio === 2025 && (
                    destinoFondos.startsWith('AJUSTE') ||
                    destinoFondos.startsWith('COOP')
                );
                if (excluirPorDestino2025) {
                    controlDestinoFondos2025.filasExcluidas += 1;
                    controlDestinoFondos2025.montoExcluido += inv;
                    if (destinoFondos.startsWith('AJUSTE')) controlDestinoFondos2025.ajuste += 1;
                    if (destinoFondos.startsWith('COOP')) controlDestinoFondos2025.coop += 1;
                    return;
                }

                // Global KPI
                if (anio === 2025) { inv_2025_fy += inv; if(isYTD) inv_2025_ytd += inv; }
                if (anio === 2026) { inv_2026_fy += inv; if(isYTD) inv_2026_ytd += inv; }

                // Mensual
                if (anio === 2025 && mes >= 1 && mes <= 12) inv_mensual_2025[mes-1] += inv;
                if (anio === 2026 && mes >= 1 && mes <= 12) inv_mensual_2026[mes-1] += inv;

                // Gerencia: viene directamente en la hoja CAMPAÑAS (ANUAL).
                // Para visualizaciones por categoría/copiloto excluimos gerencias no accionables
                // (N/A o Sin categorizar), pero mantenemos los KPIs globales y mensuales completos.
                let grupo = 'SIN ASIGNAR';
                // Para distribuir inversión por categoría no descartamos filas porque la gerencia
                // de Campañas sea N/A/Sin categorizar. La gerencia canónica se hereda desde GMV.
                let gerenciaCamp = normalizeText(getVal(colGerencia));
                let gerencia = canonicalGerenciaByJoinKey[categoriaKey] || gerenciaCamp || 'SIN ASIGNAR';
                if (isExcludedGerencia(gerencia)) gerencia = 'SIN ASIGNAR';

                // Marcas
                if (!marcasMap[marca]) marcasMap[marca] = { y25:0, y26:0, y25_ytd:0, y26_ytd:0 };
                if (anio === 2025) { marcasMap[marca].y25 += inv; if(isYTD) marcasMap[marca].y25_ytd += inv; }
                if (anio === 2026) { marcasMap[marca].y26 += inv; if(isYTD) marcasMap[marca].y26_ytd += inv; }
                
                if (!gruposMap[grupo]) gruposMap[grupo] = { y25:0, y26:0, y25_ytd:0, y26_ytd:0 };
                if (!gerenciasMap[gerencia]) gerenciasMap[gerencia] = { y25:0, y26:0, y25_ytd:0, y26_ytd:0 };
                
                if (anio === 2025) { 
                    gruposMap[grupo].y25 += inv; gerenciasMap[gerencia].y25 += inv; 
                    if(isYTD) { gruposMap[grupo].y25_ytd += inv; gerenciasMap[gerencia].y25_ytd += inv; }
                }
                if (anio === 2026) { 
                    gruposMap[grupo].y26 += inv; gerenciasMap[gerencia].y26 += inv; 
                    if(isYTD) { gruposMap[grupo].y26_ytd += inv; gerenciasMap[gerencia].y26_ytd += inv; }
                }
                
                window.validRows.push({ marca: marca, marcaKey: normalizeKey(marca), anio: anio, categoria: categoria, categoriaKey: categoriaKey, inv: inv, isYTD: isYTD, grupo: grupo, gerencia: gerencia, gerenciaKey: normalizeKey(gerencia) });
            });

            // Procesar GMV
            window.validRowsGMV = [];
            const rowsG = jsonGMV.table.rows;
            // Assuming cols: Anio, Mes, Marca, Categoria, Venta Neta
            rowsG.forEach(r => {
                const getVal = (idx) => (r.c[idx] && r.c[idx].v !== null) ? r.c[idx].v : '';
                let fechaMes = String(getVal(colGMVFechaMes >= 0 ? colGMVFechaMes : 0)).trim();
                let anio = parseYearValue(fechaMes);
                let mes = parseMonthValue(fechaMes);
                let marca = cleanMarca(getVal(colGMVMarca >= 0 ? colGMVMarca : 1));
                if (marca.toUpperCase() === 'DESCONOCIDO' || marca === '0') return;
                let categoriaRaw = getVal(colGMVCat);
                let categoriaIdRaw = getVal(colGMVIdCategoria);
                let categoriaKey = makeCategoryJoinKey(categoriaIdRaw, categoriaRaw);
                let categoria = canonicalCategoryByJoinKey[categoriaKey] || displayCategory(categoriaRaw);
                let gmv = cleanInv(getVal(colGMVValue >= 0 ? colGMVValue : 5));
                if (gmv === 0) return;
                
                let isYTD = (mes <= mes_maximo_ytd);
                
                let grupo = 'SIN ASIGNAR';
                // GERENCIA viene directamente en la hoja GMV (columna G)
                let gerencia = normalizeText(getVal(colGMVGerencia >= 0 ? colGMVGerencia : 6)) || 'SIN ASIGNAR';
                if (isExcludedGerencia(gerencia)) return;
                window.validRowsGMV.push({ marca: marca, marcaKey: normalizeKey(marca), anio: anio, mes: mes, categoria: categoria, categoriaKey: categoriaKey, gmv: gmv, isYTD: isYTD, grupo: grupo, gerencia: gerencia, gerenciaKey: normalizeKey(gerencia) });
            });

            const invYTDPorCategoria = window.validRows
                .filter(r => r.anio === 2026 && r.isYTD)
                .reduce((sum, r) => sum + r.inv, 0);
            console.info('V3.9 · Control YTD y cruce por ID de categoría', {
                corte: rango_ytd_str,
                inversionGlobalYTD: inv_2026_ytd,
                inversionYTDDisponibleParaCategorias: invYTDPorCategoria,
                diferencia: inv_2026_ytd - invYTDPorCategoria,
                columnaCategoriaCampanas: colCat,
                columnaIdCategoriaCampanas: colIdCategoria,
                columnaCategoriaGMV: colGMVCat,
                columnaIdCategoriaGMV: colGMVIdCategoria,
                categoriasCanonicasGMV: canonicalCategoryKeys.size,
                filasInversion2026YTD: window.validRows.filter(r => r.anio === 2026 && r.isYTD).length,
                categoriasConInversion2026YTD: new Set(window.validRows.filter(r => r.anio === 2026 && r.isYTD).map(r => r.categoriaKey)).size
            });

            // Procesar KPIs Globales
            let var_fy = inv_2025_ytd > 0 ? ((inv_2026_ytd / inv_2025_ytd) - 1) * 100 : 0;
            let var_ytd = inv_2025_ytd > 0 ? ((inv_2026_ytd / inv_2025_ytd) - 1) * 100 : 0;

            const formatVarHtml = (val) => {
                if (val > 0) return `<span class="positive">+${val.toFixed(1)}%</span>`;
                if (val < 0) return `<span class="negative">${val.toFixed(1)}%</span>`;
                return `<span class="neutral">0.0%</span>`;
            };

            console.log('Fuentes usadas', {
                campanas: BASE_URL_CAMP,
                gmv: BASE_URL_GMV,
                filasCampanas: rows.length,
                filasGMV: rowsG ? rowsG.length : 0,
                colGerencia,
                colDestinoFondos,
                colCategoriaCampanas: colCat,
                colIdCategoriaCampanas: colIdCategoria,
                colCategoriaGMV: colGMVCat,
                colIdCategoriaGMV: colGMVIdCategoria
            });
            console.info('Control DESTINO DE FONDOS 2025', {
                ...controlDestinoFondos2025,
                montoExcluidoFormateado: formatMoney(controlDestinoFondos2025.montoExcluido)
            });
            console.log('V3.3 estable - Visualizaciones excluyen gerencias no accionables', {excluidas: ['N/A', 'Sin categorizar']});
            $('#header-subtitle').text(`Conectado en vivo al Checklist. Datos hasta YTD ${rango_ytd_str}`);
            $('#kpi-inv-fy').text(formatMoney(inv_2026_ytd));
            $('#kpi-var-fy').html(formatVarHtml(var_fy));
            $('#kpi-title-ytd').text(`Variación YTD (${rango_ytd_str})`);
            $('#kpi-var-ytd').html(formatVarHtml(var_ytd));

            // Procesar Marcas (Tabla, Churn, Nuevas, Top 15, Pareto)
            let marcasArray = Object.keys(marcasMap).map(k => ({ nombre: k, ...marcasMap[k] }));
            
            // Pareto
            marcasArray.sort((a,b) => b.y26_ytd - a.y26_ytd);
            let top_5_pareto = marcasArray.slice(0, 5);
            let top_5_sum = top_5_pareto.reduce((sum, m) => sum + m.y26_ytd, 0);
            let pareto_pct = inv_2026_ytd > 0 ? (top_5_sum / inv_2026_ytd * 100) : 0;
            $('#pareto-text').text(`El Top 5 representa el ${pareto_pct.toFixed(1)}% de la inversión YTD26 (${rango_ytd_str})`);

            let pareto_labels = top_5_pareto.map(m => m.nombre);
            pareto_labels.push('Resto de Marcas');
            let pareto_data = top_5_pareto.map(m => m.y26_ytd);
            pareto_data.push(inv_2026_ytd - top_5_sum);

            // Churn & Nuevas
            let churn_brands = [];
            let new_brands = [];
            let table_html = '';
            marcasArray.forEach(m => {
                if (m.y25_ytd > 0 && m.y26_ytd === 0) churn_brands.push({nombre: m.nombre, val: m.y25_ytd});
                if (m.y25_ytd === 0 && m.y26_ytd > 0) new_brands.push({nombre: m.nombre, val: m.y26_ytd});
            });

            let fy_var = inv_2025_fy > 0 ? ((inv_2026_fy / inv_2025_fy) - 1) * 100 : 100;
            let ytd_var = inv_2025_ytd > 0 ? ((inv_2026_ytd / inv_2025_ytd) - 1) * 100 : 100;

            $('#title-table').text(`Detalle por Marca (FY y YTD ${rango_ytd_str})`);
            $('#kpi-ytd').html(formatMoney(inv_2026_ytd) + ` <span class="var ${ytd_var >= 0 ? 'positive' : 'negative'}">${ytd_var >= 0 ? '▲' : '▼'} ${Math.abs(ytd_var).toFixed(1)}% vs ${inv_2025_ytd===0 ? '0' : formatMoney(inv_2025_ytd)}</span>`);
            $('#kpi-fy').html(formatMoney(inv_2026_fy) + ` <span class="var ${fy_var >= 0 ? 'positive' : 'negative'}">${fy_var >= 0 ? '▲' : '▼'} ${Math.abs(fy_var).toFixed(1)}% vs ${formatMoney(inv_2025_fy)}</span>`);

            churn_brands.sort((a,b) => b.val - a.val);
            new_brands.sort((a,b) => b.val - a.val);

            $('#title-churn').text(`⚠️ Fuga de Marcas (Churn YTD ${rango_ytd_str})`);
            $('#val-churn').text(formatMoney(churn_brands.reduce((s, m) => s + m.val, 0)));
            $('#title-new').text(`🚀 Nuevas Marcas (Adquisición YTD ${rango_ytd_str})`);
            $('#val-new').text(formatMoney(new_brands.reduce((s, m) => s + m.val, 0)));

            const buildList = (arr) => {
                if(!arr.length) return "<p style='color: var(--text-muted); padding: 1rem 0;'>No hay datos.</p>";
                let h = "<ul style='list-style: none; padding: 0; margin: 0;'>";
                arr.slice(0,10).forEach(i => {
                    h += `<li style='display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);'>
                        <span style='font-weight: 500;'>${i.nombre}</span>
                        <span style='color: var(--text-muted);'>${formatMoney(i.val)}</span>
                    </li>`;
                });
                h += "</ul>";
                return h;
            };
            $('#list-churn').html(buildList(churn_brands));
            $('#list-new').html(buildList(new_brands));

            marcasArray.sort((a,b) => (b.y25+b.y26) - (a.y25+a.y26));
            let top_15_marcas = marcasArray.slice(0, 15);
            dataStore.brands.FY = [ top_15_marcas.map(m=>m.y25), top_15_marcas.map(m=>m.y26) ];
            dataStore.brands.YTD = [ top_15_marcas.map(m=>m.y25_ytd), top_15_marcas.map(m=>m.y26_ytd) ];
            dataStore.brands.FY_labels = top_15_marcas.map(m => `${m.nombre} (${m.y25 > 0 ? ((m.y26 / m.y25) - 1 > 0 ? '+' : '') + ((m.y26 / m.y25 - 1) * 100).toFixed(1) : (m.y26 > 0 ? '100' : '0')}%)`);
            dataStore.brands.YTD_labels = top_15_marcas.map(m => `${m.nombre} (${m.y25_ytd > 0 ? ((m.y26_ytd / m.y25_ytd) - 1 > 0 ? '+' : '') + ((m.y26_ytd / m.y25_ytd - 1) * 100).toFixed(1) : (m.y26_ytd > 0 ? '100' : '0')}%)`);

            let gruposKeys = Object.keys(gerenciasMap).filter(g => g && g !== 'SIN ASIGNAR').sort();
            if (!gruposKeys.length) gruposKeys = Object.keys(gerenciasMap).sort();
            dataStore.cats.FY = [ gruposKeys.map(g => gerenciasMap[g].y25), gruposKeys.map(g => gerenciasMap[g].y26) ];
            dataStore.cats.YTD = [ gruposKeys.map(g => gerenciasMap[g].y25_ytd), gruposKeys.map(g => gerenciasMap[g].y26_ytd) ];
            dataStore.cats.FY_labels = gruposKeys.map((g, i) => `${g} (${dataStore.cats.FY[0][i] > 0 ? ((dataStore.cats.FY[1][i] / dataStore.cats.FY[0][i]) - 1 > 0 ? '+' : '') + ((dataStore.cats.FY[1][i] / dataStore.cats.FY[0][i] - 1) * 100).toFixed(1) : (dataStore.cats.FY[1][i] > 0 ? '100' : '0')}%)`);
            dataStore.cats.YTD_labels = gruposKeys.map((g, i) => `${g} (${dataStore.cats.YTD[0][i] > 0 ? ((dataStore.cats.YTD[1][i] / dataStore.cats.YTD[0][i]) - 1 > 0 ? '+' : '') + ((dataStore.cats.YTD[1][i] / dataStore.cats.YTD[0][i] - 1) * 100).toFixed(1) : (dataStore.cats.YTD[1][i] > 0 ? '100' : '0')}%)`);

            // Botones de filtro dinámicos por Gerencia
            const gerenciaButtons = ['Todas'].concat(gruposKeys);
            $('#gerencia-filter-buttons').html(gerenciaButtons.map((g, idx) =>
                `<button ${idx === 0 ? 'class="active" id="btnFilterTodas"' : ''} onclick="filterTable('${g.replace(/'/g, "\'")}', this)">${g}</button>`
            ).join(''));

            const tickColorCallback = function(context) {
                let label = context.tick.label || '';
                if (label.includes('(+') || label.includes('(100')) return '#10B981';
                if (label.includes('(-')) return '#EF4444';
                return '#94A3B8';
            };

            const tickColorCallbackX = function(context) {
                let label = context.tick.label || '';
                if (Array.isArray(label)) label = label.join(' ');
                if (label.includes('(+') || label.includes('(100')) return '#10B981';
                if (label.includes('(-')) return '#EF4444';
                return '#94A3B8';
            };

            let meses_yoy_labels = nombresMesesAbrev.map((m, i) => {
                let val25 = inv_mensual_2025[i];
                let val26 = inv_mensual_2026[i];
                if (val25 === 0 && val26 === 0) return m;
                if (val26 === 0 && (i + 1 > mes_maximo_ytd)) return m;
                
                let pct = 0;
                let sign = '';
                if (val25 > 0) {
                    pct = ((val26 / val25) - 1) * 100;
                    sign = pct > 0 ? '+' : '';
                    return [m, `(${sign}${pct.toFixed(1)}%)`];
                } else if (val26 > 0 && val25 === 0) {
                    return [m, `(+100.0%)`];
                }
                return m;
            });

            if (Chart.getChart('yearChart')) Chart.getChart('yearChart').destroy();
            new Chart(document.getElementById('yearChart').getContext('2d'), {
                type: 'line',
                data: { labels: meses_yoy_labels, datasets: [
                    { label: '2025', data: inv_mensual_2025, borderColor: '#94A3B8', borderDash: [5, 5], tension: 0.4 },
                    { label: '2026', data: inv_mensual_2026, borderColor: '#818CF8', backgroundColor: 'rgba(129, 140, 248, 0.2)', fill: true, tension: 0.4 }
                ] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, labels: { color: '#F8FAFC' } }, tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + formatMoney(ctx.parsed.y) } } }, scales: { x: { ticks: { color: tickColorCallbackX, font: { size: 11 } } }, y: { ticks: { callback: formatAxis } } } }
            });

            if (Chart.getChart('paretoChart')) Chart.getChart('paretoChart').destroy();
            new Chart(document.getElementById('paretoChart').getContext('2d'), {
                type: 'doughnut',
                data: { labels: top_5_pareto.map(m => m.nombre).concat(['Resto']), datasets: [{ data: top_5_pareto.map(m => m.y26_ytd).concat([inv_2026_ytd - top_5_sum]), backgroundColor: ['#818CF8', '#C084FC', '#F472B6', '#34D399', '#FBBF24', '#475569'] }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', padding: 20 } }, tooltip: { callbacks: { label: (ctx) => ' ' + formatMoney(ctx.parsed) } } }, cutout: '65%' }
            });

            if (Chart.getChart('brandsChart')) Chart.getChart('brandsChart').destroy();
            brandsChart = new Chart(document.getElementById('brandsChart').getContext('2d'), {
                type: 'bar',
                data: { labels: dataStore.brands.FY_labels, datasets: [
                    { label: 'Inv. 2025 (FY)', data: dataStore.brands.FY[0], backgroundColor: '#94A3B8', borderRadius: 4 },
                    { label: 'Inv. (YTD)', data: dataStore.brands.FY[1], backgroundColor: '#10B981', borderRadius: 4 }
                ] },
                options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: true, labels: { color: '#F8FAFC' } }, tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + formatMoney(ctx.parsed.x) } } }, scales: { x: { ticks: { callback: formatAxis } }, y: { ticks: { color: tickColorCallback } } } }
            });

            if (Chart.getChart('categoryChart')) Chart.getChart('categoryChart').destroy();
            categoryChart = new Chart(document.getElementById('categoryChart').getContext('2d'), {
                type: 'bar',
                data: { labels: dataStore.cats.FY_labels, datasets: [
                    { label: 'Inv. 2025 (FY)', data: dataStore.cats.FY[0], backgroundColor: '#94A3B8', borderRadius: 4 },
                    { label: 'Inv. (YTD)', data: dataStore.cats.FY[1], backgroundColor: '#F59E0B', borderRadius: 4 }
                ] },
                options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: true, labels: { color: '#F8FAFC' } }, tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + formatMoney(ctx.parsed.x) } } }, scales: { x: { ticks: { callback: formatAxis } }, y: { ticks: { color: tickColorCallback } } } }
            });

            filterTable('Todas', document.getElementById('btnFilterTodas'));
            $('#loading').fadeOut();
            $('#main-container').fadeIn();
        }

        window.toggleBrands = function(type, btn) {
            $(btn).siblings().removeClass('active');
            $(btn).addClass('active');
            brandsChart.data.labels = dataStore.brands[type + '_labels'];
            brandsChart.data.datasets[0].data = dataStore.brands[type][0];
            brandsChart.data.datasets[1].data = dataStore.brands[type][1];
            brandsChart.data.datasets[0].label = 'Inv. 2025 (' + type + ')';
            brandsChart.data.datasets[1].label = 'Inv. 2026 (' + type + ')';
            brandsChart.update();
        };

        window.toggleCats = function(type, btn) {
            $(btn).siblings().removeClass('active');
            $(btn).addClass('active');
            categoryChart.data.labels = dataStore.cats[type + '_labels'];
            categoryChart.data.datasets[0].data = dataStore.cats[type][0];
            categoryChart.data.datasets[1].data = dataStore.cats[type][1];
            categoryChart.data.datasets[0].label = 'Inv. 2025 (' + type + ')';
            categoryChart.data.datasets[1].label = 'Inv. 2026 (' + type + ')';
            categoryChart.update();
        };

        const formatVarTable = (v, y25) => {
            if (v >= 100 && y25 === 0) return "<span style='color: #10B981;'>100.0% (Nueva)</span>";
            if (v > 0) return `<span style='color: #10B981;'>+${v.toFixed(1)}%</span>`;
            if (v < 0) return `<span style='color: #EF4444;'>${v.toFixed(1)}%</span>`;
            return "<span style='color: #94A3B8;'>0.0%</span>";
        };

        window.filterTable = function(group, btn) {
            if (btn) {
                $(btn).siblings().removeClass('active');
                $(btn).addClass('active');
            }

            let localMarcasMap = {};
            
            // Inversión
            window.validRows.forEach(r => {
                if (group !== 'Todas' && r.gerencia !== group) return;
                if (!localMarcasMap[r.marca]) localMarcasMap[r.marca] = { y25:0, y26:0, y25_ytd:0, y26_ytd:0 };
                if (r.anio === 2025) { localMarcasMap[r.marca].y25 += r.inv; if(r.isYTD) localMarcasMap[r.marca].y25_ytd += r.inv; }
                if (r.anio === 2026) { localMarcasMap[r.marca].y26 += r.inv; if(r.isYTD) localMarcasMap[r.marca].y26_ytd += r.inv; }
            });

            let marcasArray = Object.keys(localMarcasMap).map(k => {
                return { nombre: k, ...localMarcasMap[k] };
            });

            let table_html = '';
            marcasArray.forEach(m => {
                let m_var_fy = m.y25 === 0 && m.y26 > 0 ? 100 : (m.y25 > 0 ? (m.y26/m.y25 - 1)*100 : 0);
                let m_var_ytd = m.y25_ytd === 0 && m.y26_ytd > 0 ? 100 : (m.y25_ytd > 0 ? (m.y26_ytd/m.y25_ytd - 1)*100 : 0);
                
                if(m.y25 === 0 && m.y26 === 0) return;

                table_html += `
                <tr>
                    <td>${m.nombre}</td>
                    <td data-order="${m.y25}">${formatMoney(m.y25)}</td>
                    <td data-order="${m.y26}">${formatMoney(m.y26)}</td>
                    <td data-order="${m_var_fy}">${formatVarTable(m_var_fy, m.y25)}</td>
                    <td data-order="${m.y25_ytd}">${formatMoney(m.y25_ytd)}</td>
                    <td data-order="${m.y26_ytd}">${formatMoney(m.y26_ytd)}</td>
                    <td data-order="${m_var_ytd}">${formatVarTable(m_var_ytd, m.y25_ytd)}</td>
                </tr>`;
            });

            if ($.fn.DataTable.isDataTable('#brandsTable')) {
                $('#brandsTable').DataTable().destroy();
            }

            $('#table-body').html(table_html);
            $('#brandsTable').DataTable({ 
                "order": [[ 2, "desc" ]], 
                "paging": false,
                "columnDefs": [ { "type": "num", "targets": [1, 2, 3, 4, 5, 6] } ],
                "language": { "url": "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            
            renderGMV();
        };

        let gmvChart;

        window.renderGMV = function() {
            if (!window.validRowsGMV || window.validRowsGMV.length === 0) {
                $('#gmv-warning').show();
                return;
            } else {
                $('#gmv-warning').hide();
            }

            let gmvMarcaCatMap = {};
            let localCategoriaASMap = {};
            let localCategoriaKeyIndex = {};
            let localGerenciaASMap = {};

            const ensureCategoryBucket = (displayName, normalizedKey, gerencia, gerenciaKey) => {
                const display = displayCategory(displayName);
                const norm = normalizedKey || normalizeKey(displayName);
                let bucketKey = localCategoriaKeyIndex[norm] || display;
                if (!localCategoriaASMap[bucketKey]) {
                    localCategoriaASMap[bucketKey] = { nombre: display, key: bucketKey, normalizedKey: norm, gmv: 0, inv: 0, gerencias: {}, gerenciaLabels: {}, marcas: {} };
                    localCategoriaKeyIndex[norm] = bucketKey;
                }
                if (gerencia) {
                    const gKey = gerenciaKey || normalizeKey(gerencia);
                    localCategoriaASMap[bucketKey].gerenciaLabels[gKey] = gerencia;
                }
                return localCategoriaASMap[bucketKey];
            };

            // Agregar GMV (Solo YTD para Eficiencia). La categoría visible conserva el texto original.
            window.validRowsGMV.forEach(r => {
                if (r.anio === 2026 && r.isYTD) {
                    const catDisplay = displayCategory(r.categoria);
                    const catNorm = r.categoriaKey || normalizeKey(r.categoria);
                    const gerKey = r.gerenciaKey || normalizeKey(r.gerencia);
                    const marcaKey = r.marcaKey || normalizeKey(r.marca);
                    let key = marcaKey + '||' + catNorm;
                    if (!gmvMarcaCatMap[key]) gmvMarcaCatMap[key] = { marca: r.marca, marcaKey: marcaKey, categoria: catDisplay, categoriaKey: catNorm, grupo: r.grupo, gerencia: r.gerencia, gerenciaKey: gerKey, gmv: 0, inv: 0 };
                    gmvMarcaCatMap[key].gmv += r.gmv;
                    
                    const catBucket = ensureCategoryBucket(catDisplay, catNorm, r.gerencia, gerKey);
                    catBucket.gmv += r.gmv;
                    catBucket.gerencias[gerKey] = (catBucket.gerencias[gerKey] || 0) + r.gmv;
                    catBucket.marcas[marcaKey] = true;

                    if (!localGerenciaASMap[gerKey]) localGerenciaASMap[gerKey] = { nombre: r.gerencia, gmv: 0, inv: 0 };
                    localGerenciaASMap[gerKey].gmv += r.gmv;
                }
            });

            // Agregar Inversión (Solo YTD para Eficiencia). Se asigna por clave normalizada,
            // con fallback al nombre visible, para evitar casos como espacios invisibles o signos.
            window.validRows.forEach(r => {
                if (r.anio === 2026 && r.isYTD) {
                    const catDisplay = displayCategory(r.categoria);
                    const catNorm = r.categoriaKey || normalizeKey(r.categoria);
                    const gerKey = r.gerenciaKey || normalizeKey(r.gerencia);
                    const marcaKey = r.marcaKey || normalizeKey(r.marca);
                    let key = marcaKey + '||' + catNorm;
                    if (gmvMarcaCatMap[key]) gmvMarcaCatMap[key].inv += r.inv;
                    
                    const catBucket = ensureCategoryBucket(catDisplay, catNorm, r.gerencia, gerKey);
                    catBucket.inv += r.inv;
                    catBucket.marcas[marcaKey] = true;

                    if (!localGerenciaASMap[gerKey]) localGerenciaASMap[gerKey] = { nombre: r.gerencia || 'SIN ASIGNAR', gmv: 0, inv: 0 };
                    localGerenciaASMap[gerKey].inv += r.inv;
                }
            });

            // Diagnóstico visible en consola para detectar categorías con inversión y sin GMV asociado.
            window.copilotCategoryDiagnostics = Object.keys(localCategoriaASMap).map(k => localCategoriaASMap[k])
                .filter(x => x.inv > 0 && x.gmv === 0)
                .map(x => ({ categoria: x.nombre, inversion: x.inv, normalizedKey: x.normalizedKey }));
            if (window.copilotCategoryDiagnostics.length) console.warn('Categorías con inversión RM pero sin GMV asociado:', window.copilotCategoryDiagnostics);

            let marcasArray = Object.keys(gmvMarcaCatMap).map(k => ({ ...gmvMarcaCatMap[k] }));
            
            // Render GMV Table
            let gmv_table_html = '';
            marcasArray.forEach(m => {
                if (m.gmv === 0 && m.inv === 0) return;
                let as_ratio = m.gmv > 0 ? (m.inv / m.gmv) : 0;
                
                let catKeyForAvg = localCategoriaKeyIndex[m.categoriaKey || normalizeKey(m.categoria)] || m.categoria;
                let catAvgAS = localCategoriaASMap[catKeyForAvg] && localCategoriaASMap[catKeyForAvg].gmv > 0 ? (localCategoriaASMap[catKeyForAvg].inv / localCategoriaASMap[catKeyForAvg].gmv) : 0;
                
                let as_html = '0.00%';
                let diff_html = '-';
                if (as_ratio > 0 && catAvgAS > 0) {
                    let diff = as_ratio - catAvgAS;
                    let diff_pct = diff * 100;
                    if (as_ratio > catAvgAS) {
                        as_html = `<span style="color:#10B981">${(as_ratio*100).toFixed(2)}%</span>`;
                        diff_html = `<span style="color:#10B981; font-weight:bold">+${diff_pct.toFixed(2)}% 🟢 (Mejor que Categoría)</span>`;
                    } else {
                        as_html = `<span style="color:#EF4444">${(as_ratio*100).toFixed(2)}%</span>`;
                        diff_html = `<span style="color:#EF4444; font-weight:bold">${diff_pct.toFixed(2)}% 🔴 (Peor que Categoría)</span>`;
                    }
                } else if (as_ratio > 0) {
                    as_html = `<span>${(as_ratio*100).toFixed(2)}%</span>`;
                }

                gmv_table_html += `
                <tr>
                    <td>${m.marca}</td>
                    <td data-order="${m.gmv}">${formatMoney(m.gmv)}</td>
                    <td data-order="${m.inv}">${formatMoney(m.inv)}</td>
                    <td>${m.categoria || 'SIN ASIGNAR'}</td>
                    <td data-order="${as_ratio}">${as_html}</td>
                    <td data-order="${as_ratio}">${diff_html}</td>
                </tr>`;
            });

            if ($.fn.DataTable.isDataTable('#gmvTable')) {
                $('#gmvTable').DataTable().destroy();
            }
            $('#gmv-table-body').html(gmv_table_html);
            $('#gmvTable').DataTable({ 
                "order": [[ 1, "desc" ]], 
                "paging": true,
                "pageLength": 10,
                "columnDefs": [ { "type": "num", "targets": [1, 2, 3, 4] } ],
                "language": { "url": "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });

            // Chart GMV (Agrupar por marca pura para el chart de top 10 GMV)
            let topGMVMap = {};
            marcasArray.forEach(m => {
                if(!topGMVMap[m.marca]) topGMVMap[m.marca] = { gmv: 0, inv: 0 };
                topGMVMap[m.marca].gmv += m.gmv;
                topGMVMap[m.marca].inv += m.inv;
            });
            let pureMarcasArray = Object.keys(topGMVMap).map(k => ({ nombre: k, gmv: topGMVMap[k].gmv, inv: topGMVMap[k].inv, ratio: topGMVMap[k].gmv > 0 ? (topGMVMap[k].inv / topGMVMap[k].gmv) * 100 : 0 }));
            pureMarcasArray.sort((a,b) => b.gmv - a.gmv);
            let top10GMV = pureMarcasArray.slice(0, 10);
            
            // Populate All Brands Table
            let all_marcas_html = '';
            pureMarcasArray.forEach(m => {
                all_marcas_html += `<tr>
                    <td>${m.nombre}</td>
                    <td data-order="${m.gmv}">${formatMoney(m.gmv)}</td>
                    <td data-order="${m.inv}">${formatMoney(m.inv)}</td>
                    <td data-order="${m.ratio}">${m.ratio.toFixed(2)}%</td>
                </tr>`;
            });
            if ($.fn.DataTable.isDataTable('#topMarcasTable')) {
                $('#topMarcasTable').DataTable().destroy();
            }
            $('#top-marcas-table-body').html(all_marcas_html);
            $('#topMarcasTable').DataTable({
                "order": [[ 1, "desc" ]],
                "pageLength": 10,
                "columnDefs": [ { "type": "num", "targets": [1, 2, 3] } ],
                "language": { "url": "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });

            
            if (gmvChart) gmvChart.destroy();
            gmvChart = new Chart(document.getElementById('gmvChart').getContext('2d'), {
                type: 'bar',
                data: {
                    labels: top10GMV.map(m => m.nombre),
                    datasets: [
                        {
                            label: 'A/S Ratio %',
                            data: top10GMV.map(m => m.ratio),
                            type: 'line',
                            borderColor: '#fb8c00',
                            backgroundColor: '#fb8c00',
                            borderWidth: 3,
                            yAxisID: 'y1',
                            tension: 0.3
                        },
                        {
                            label: 'GMV (FY26)',
                            data: top10GMV.map(m => m.gmv),
                            backgroundColor: '#818CF8',
                            borderRadius: 4,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    plugins: { 
                        legend: { display: true, labels: { color: '#9CA3AF' } }, 
                        tooltip: { 
                            callbacks: { 
                                label: function(context) {
                                    if (context.datasetIndex === 0) {
                                        return context.raw.toFixed(2) + ' %';
                                    } else {
                                        return formatMoney(context.raw);
                                    }
                                } 
                            } 
                        } 
                    }, 
                    scales: { 
                        y: { 
                            type: 'linear',
                            display: true,
                            position: 'left',
                            ticks: { callback: formatAxis, color: '#6B7280' },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            grid: { drawOnChartArea: false },
                            ticks: {
                                color: '#fb8c00',
                                callback: function(val) { return val + '%'; }
                            }
                        },
                        x: {
                            ticks: { color: '#9CA3AF' },
                            grid: { display: false }
                        }
                    } 
                }
            });

            let as_ratio_categoria = Object.keys(localCategoriaASMap).map(g => ({
                nombre: g,
                gmv: localCategoriaASMap[g].gmv,
                inv: localCategoriaASMap[g].inv,
                ratio: localCategoriaASMap[g].gmv > 0 ? (localCategoriaASMap[g].inv / localCategoriaASMap[g].gmv) * 100 : 0
            })).filter(x => (x.gmv > 0 || x.inv > 0) && !['N/A', 'SIN ASIGNAR', 'SIN GRUPO'].includes(x.nombre)).sort((a,b) => b.ratio - a.ratio).slice(0, 15);

            let as_ratio_gerencia = Object.keys(localGerenciaASMap).map(g => ({
                nombre: g,
                gmv: localGerenciaASMap[g].gmv,
                inv: localGerenciaASMap[g].inv,
                ratio: localGerenciaASMap[g].gmv > 0 ? (localGerenciaASMap[g].inv / localGerenciaASMap[g].gmv) * 100 : 0
            })).filter(x => (x.gmv > 0 || x.inv > 0) && !isExcludedGerencia(x.nombre) && !['SIN ASIGNAR', 'SIN GERENCIA'].includes(x.nombre)).sort((a,b) => b.ratio - a.ratio);

            if (window.chartASRatioGerInstance) window.chartASRatioGerInstance.destroy();
            window.chartASRatioGerInstance = new Chart(document.getElementById('asRatioChartGerencia').getContext('2d'), {
                type: 'bar',
                data: {
                    labels: as_ratio_gerencia.map(x => x.nombre),
                    datasets: [{
                        label: 'A/S Ratio % (Gerencia)',
                        data: as_ratio_gerencia.map(x => x.ratio),
                        backgroundColor: '#fb8c00',
                        borderRadius: 4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return c.raw.toFixed(2) + ' %'; } } } } }
            });

            let cat_table_html = '';
            let as_ratio_categoria_full = Object.keys(localCategoriaASMap).map(g => {
                const item = localCategoriaASMap[g];
                const gerKey = Object.keys(item.gerencias || {}).sort((a,b) => (item.gerencias[b] || 0) - (item.gerencias[a] || 0))[0] || 'SIN ASIGNAR';
                const gerencia = (item.gerenciaLabels && item.gerenciaLabels[gerKey]) || (localGerenciaASMap[gerKey] && localGerenciaASMap[gerKey].nombre) || gerKey;
                const benchmark = localGerenciaASMap[gerKey] && localGerenciaASMap[gerKey].gmv > 0 ? (localGerenciaASMap[gerKey].inv / localGerenciaASMap[gerKey].gmv) * 100 : 0;
                return {
                    nombre: item.nombre || g,
                    key: g,
                    gerencia: gerencia,
                    gerenciaKey: gerKey,
                    gmv: item.gmv,
                    inv: item.inv,
                    ratio: item.gmv > 0 ? (item.inv / item.gmv) * 100 : 0,
                    benchmark: benchmark,
                    marcas: item.marcas || {}
                };
            }).filter(x => (x.gmv > 0 || x.inv > 0) && !['SIN ASIGNAR', 'SIN GRUPO'].includes(x.nombre) && !isExcludedGerencia(x.gerencia));

            as_ratio_categoria_full.forEach(c => {
                cat_table_html += `
                <tr>
                    <td>${c.nombre}</td>
                    <td data-order="${c.gmv}">${formatMoney(c.gmv)}</td>
                    <td data-order="${c.inv}">${formatMoney(c.inv)}</td>
                    <td data-order="${c.ratio}"><strong>${c.ratio.toFixed(2)}%</strong></td>
                </tr>`;
            });

            if ($.fn.DataTable.isDataTable('#catTable')) {
                $('#catTable').DataTable().destroy();
            }
            $('#cat-table-body').html(cat_table_html);
            $('#catTable').DataTable({ 
                "order": [[ 3, "desc" ]], 
                "paging": true,
                "pageLength": 5,
                "lengthMenu": [5, 10, 25],
                "columnDefs": [ { "type": "num", "targets": [1, 2, 3] } ],
                "language": { "url": "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });

            // Análisis Exhaustivo por Categoría - Copiloto Comercial RM
            const gmvValues = as_ratio_categoria_full.map(x => x.gmv).filter(v => v > 0).sort((a,b) => a-b);
            const gmvP25 = percentile(gmvValues, 0.25);
            const gmvP75 = percentile(gmvValues, 0.75);
            const maxOpportunity = Math.max(0, ...as_ratio_categoria_full.map(c => calculateOpportunityPotential(c)));
            let exh_cat_table_html = '';
            const copilotRows = as_ratio_categoria_full.map(c => ({ ...c, copilot: evaluateCopilotCategory(c, gmvP25, gmvP75, maxOpportunity) }))
                .sort((a,b) => b.copilot.score - a.copilot.score || b.copilot.opportunityPotential - a.copilot.opportunityPotential || b.gmv - a.gmv);

            window.copilotRowsForModal = copilotRows;
            copilotRows.forEach((c, idx) => {
                const cp = c.copilot;
                const status_html = buildStatusPill(cp.estado, cp.cls);
                const brechaColor = cp.brecha > 0 ? '#FCD34D' : (cp.brecha < 0 ? '#93C5FD' : '#CBD5E1');
                const potencialHtml = buildStatusPill(cp.potencial, cp.potencial === 'Alto' ? 'status-high' : (cp.potencial === 'Medio' ? 'status-opp' : 'status-low'));

                exh_cat_table_html += `
                <tr data-gerencia="${c.gerencia || 'SIN ASIGNAR'}">
                    <td class="category-cell">
                        <div class="category-wrap no-avatar">
                            <span><span class="category-name">${c.nombre}</span><span class="category-id">CAT-${String(idx+1).padStart(3,'0')}</span></span>
                        </div>
                    </td>
                    <td data-order="${c.gmv}"><span class="metric-main">${formatMoney(c.gmv)}</span><span class="metric-sub">GMV YTD</span></td>
                    <td data-order="${c.inv}"><span class="metric-main">${formatMoney(c.inv)}</span><span class="metric-sub">Inv. RM YTD</span></td>
                    <td data-order="${c.ratio}"><span class="metric-main">${c.ratio.toFixed(2)}%</span></td>
                    <td data-order="${cp.benchmark}"><span class="metric-main">${cp.benchmark.toFixed(2)}%</span></td>
                    <td data-order="${cp.brecha}" class="brecha-cell ${cp.brecha > 0 ? 'positive' : ''}"><span class="metric-main">${cp.brecha >= 0 ? '+' : ''}${cp.brecha.toFixed(2)} pp</span><span class="metric-sub">${brechaLabel(cp.brecha)}</span></td>
                    <td data-order="${cp.potencial === 'Alto' ? 3 : (cp.potencial === 'Medio' ? 2 : 1)}">${potencialHtml}</td>
                    <td data-order="${cp.score}" class="score-cell">${scoreStars(cp.score)}<span class="score-number">${cp.score} / 100</span></td>
                    <td data-order="${cp.score}">${status_html}</td>
                    <td class="action-cell">
                        <div class="action-card ${actionCardClass(cp.cls)}">
                            <span class="action-title">${shortAction(cp.estado)}</span>
                            <span class="action-detail"><b>Oportunidad potencial: ${formatMoney(cp.opportunityPotential || 0)}</b><br>${cp.accion}</span>
                            <button type="button" class="action-button" data-index="${idx}">Ver detalle y motivos</button>
                        </div>
                    </td>
                </tr>`;
            });

            renderTopOpportunities(copilotRows);

            if ($.fn.DataTable.isDataTable('#exhCatTable')) {
                $('#exhCatTable').DataTable().destroy();
            }
            $('#exh-cat-table-body').html(exh_cat_table_html);
            populateCopilotGerenciaFilter(copilotRows);
            registerCopilotGerenciaFilter();
            const copilotTable = $('#exhCatTable').DataTable({ 
                "order": [[ 7, "desc" ]], 
                "paging": true,
                "pageLength": 10,
                "lengthMenu": [10, 25, 50],
                "columnDefs": [ { "type": "num", "targets": [1, 2, 3, 4, 5, 6, 7] } ],
                "language": { "url": "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            $('#exhCatTable').off('click', '.action-button').on('click', '.action-button', function(e) {
                e.preventDefault();
                e.stopPropagation();
                openCopilotAction(Number($(this).attr('data-index')));
            });
            $('#exhCatTable').off('click', '.action-card').on('click', '.action-card', function(e) {
                e.preventDefault();
                const idx = $(this).find('.action-button').attr('data-index');
                openCopilotAction(Number(idx));
            });
            $('#copilotGerenciaFilter').off('change').on('change', function(){ copilotTable.draw(); });
            $('#copilotClearFilters').off('click').on('click', function(){ $('#copilotGerenciaFilter').val(''); copilotTable.draw(); });
        };




        function populateCopilotGerenciaFilter(rows) {
            const $select = $('#copilotGerenciaFilter');
            if (!$select.length) return;
            const current = $select.val() || '';
            const gerencias = Array.from(new Set((rows || []).map(r => r.gerencia || 'SIN ASIGNAR').filter(g => !isExcludedGerencia(g)))).sort((a,b) => String(a).localeCompare(String(b), 'es'));
            $select.empty().append('<option value="">Todas las gerencias</option>');
            gerencias.forEach(g => $select.append(`<option value="${String(g).replace(/"/g,'&quot;')}">${g}</option>`));
            if (current && gerencias.includes(current)) $select.val(current);
        }

        function registerCopilotGerenciaFilter() {
            if (window.copilotGerenciaFilterRegistered) return;
            $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
                if (!settings || !settings.nTable || settings.nTable.id !== 'exhCatTable') return true;
                const selected = $('#copilotGerenciaFilter').val();
                if (!selected) return true;
                const rowNode = settings.aoData && settings.aoData[dataIndex] ? settings.aoData[dataIndex].nTr : null;
                const gerencia = rowNode ? $(rowNode).attr('data-gerencia') : '';
                return gerencia === selected;
            });
            window.copilotGerenciaFilterRegistered = true;
        }

        function categoryInitials(name) {
            const clean = String(name || '').trim();
            if (!clean) return 'RM';
            const words = clean.split(/\s+/).filter(Boolean);
            if (words.length === 1) return words[0].slice(0,2).toUpperCase();
            return (words[0][0] + words[1][0]).toUpperCase();
        }

        function actionCardClass(cls) {
            const map = {
                'status-high': 'action-high',
                'status-big': 'action-big',
                'status-opp': 'action-opp',
                'status-ok': 'action-ok',
                'status-review': 'action-review',
                'status-low': 'action-low'
            };
            return map[cls] || 'action-review';
        }

        function brechaLabel(brecha) {
            if (brecha > 0) return 'por debajo';
            if (brecha < 0) return 'por encima';
            return 'en línea';
        }

        function scoreStars(score) {
            const n = score >= 90 ? 5 : score >= 75 ? 4 : score >= 55 ? 3 : score >= 35 ? 2 : 1;
            return '<span class="score-stars">' + '★'.repeat(n) + '☆'.repeat(5-n) + '</span>';
        }

        function shortAction(estado) {
            const map = {
                'Prioridad alta': 'Activar propuesta comercial',
                'Gran oportunidad': 'Incrementar inversión',
                'Oportunidad': 'Desarrollar nuevas marcas',
                'Saludable': 'Mantener estrategia',
                'Revisar concentración': 'Revisar eficiencia',
                'Estable': 'No priorizar por ahora'
            };
            return map[estado] || 'Revisar oportunidad';
        }

        function renderTopOpportunities(rows) {
            const top = rows.slice(0, 5);
            const html = top.map((c, idx) => {
                const cp = c.copilot;
                const medals = ['🥇','🥈','🥉','4','5'];
                return `<div class="opportunity-card">
                    <div class="opportunity-rank">${medals[idx]} · ${cp.estado}</div>
                    <div class="opportunity-name">${c.nombre}</div>
                    <div class="opportunity-meta">Gerencia ${c.gerencia || 'SIN ASIGNAR'}<br>Oportunidad ${formatMoney(cp.opportunityPotential || 0)}<br>Brecha +${Math.max(cp.brecha,0).toFixed(2)} pp</div>
                </div>`;
            }).join('');
            $('#top-opportunities').html(html || '<div class="opportunity-card">Sin datos suficientes para priorizar oportunidades.</div>');
        }

        function openCopilotHelp() { $('#copilot-help-modal').css('display','flex'); }
        function closeCopilotHelp() { $('#copilot-help-modal').hide(); }

        function openCopilotAction(index) {
            const rows = window.copilotRowsForModal || [];
            const row = rows[index];
            if (!row) return;
            const cp = row.copilot;
            const opportunity = Math.max(0, ((cp.benchmark || 0) / 100 * (row.gmv || 0)) - (row.inv || 0));
            const reasons = [];
            reasons.push(`Potencial ${cp.potencial} por nivel de GMV.`);
            if ((row.inv || 0) === 0) reasons.push('Sin inversión de Retail Media registrada.');
            if ((cp.brecha || 0) > 0) reasons.push(`Ratio ${cp.brecha.toFixed(2)} pp por debajo del benchmark de su gerencia.`);
            if ((cp.activeBrands || 0) > 0) reasons.push(`${cp.activeBrands} marca(s) activa(s) en la categoría.`);
            const html = `
                <button class="modal-close" onclick="closeCopilotAction()">Cerrar</button>
                <h2>${row.nombre}</h2>
                <div class="action-modal-grid">
                    <div><span>Gerencia</span><b>${row.gerencia || 'SIN ASIGNAR'}</b></div>
                    <div><span>Estado</span><b>${cp.estado}</b></div>
                    <div><span>GMV YTD</span><b>${formatMoney(row.gmv)}</b></div>
                    <div><span>Inv. RM YTD</span><b>${formatMoney(row.inv)}</b></div>
                    <div><span>A/S Ratio</span><b>${(row.ratio || 0).toFixed(2)}%</b></div>
                    <div><span>Benchmark gerencia</span><b>${(cp.benchmark || 0).toFixed(2)}%</b></div>
                    <div><span>Brecha</span><b>${(cp.brecha >= 0 ? '+' : '') + (cp.brecha || 0).toFixed(2)} pp</b></div>
                    <div><span>Oportunidad potencial</span><b>${formatMoney(opportunity)}</b></div>
                </div>
                <h3>Acción recomendada</h3>
                <p class="action-modal-highlight">${cp.accion}</p>
                <h3>Por qué aparece en el Copiloto</h3>
                <ul>${reasons.map(r => `<li>${r}</li>`).join('')}</ul>
                <h3>Uso comercial sugerido</h3>
                <ul>
                    <li>Usar esta categoría como disparador de agenda comercial.</li>
                    <li>Validar principales marcas/proveedores y próximos hitos comerciales.</li>
                    <li>Preparar una propuesta que acerque la inversión al benchmark de gerencia.</li>
                </ul>`;
            $('#copilot-action-content').html(html);
            $('#copilot-action-modal').css('display','flex');
        }

        function closeCopilotAction() { $('#copilot-action-modal').hide(); }

        function percentile(sortedValues, p) {
            if (!sortedValues.length) return 0;
            const idx = (sortedValues.length - 1) * p;
            const lo = Math.floor(idx), hi = Math.ceil(idx);
            if (lo === hi) return sortedValues[lo];
            return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
        }

        function buildStatusPill(label, cls) {
            return `<span class="status-pill ${cls}">${label}</span>`;
        }

        function calculateOpportunityPotential(c) {
            const benchmark = c.benchmark || 0;
            const expectedInv = (benchmark / 100) * (c.gmv || 0);
            return Math.max(0, expectedInv - (c.inv || 0));
        }

        function evaluateCopilotCategory(c, gmvP25, gmvP75, maxOpportunity) {
            const benchmark = c.benchmark || 0;
            const ratio = c.ratio || 0;
            const opportunityPotential = calculateOpportunityPotential(c);
            let potencial = c.gmv >= gmvP75 ? 'Alto' : (c.gmv >= gmvP25 ? 'Medio' : 'Bajo');
            let gapRel = benchmark > 0 ? Math.max(0, (benchmark - ratio) / benchmark) : (c.inv === 0 && c.gmv > 0 ? 1 : 0);
            let brecha = benchmark - ratio;

            // V2.7: el score prioriza el valor económico de la oportunidad.
            // Antes dos categorías sin inversión podían quedar casi empatadas aunque una representara
            // una oportunidad en pesos mucho mayor. Ahora la oportunidad potencial pesa 60%.
            const opportunityScore = maxOpportunity > 0 ? Math.sqrt(opportunityPotential / maxOpportunity) * 60 : 0;
            const gapScore = Math.min(25, gapRel * 25);
            const potentialScore = potencial === 'Alto' ? 10 : (potencial === 'Medio' ? 6 : 2);
            const activeBrands = c.marcas ? Object.keys(c.marcas).length : 0;
            const activityScore = Math.min(5, activeBrands);
            let score = Math.round(Math.min(100, opportunityScore + gapScore + potentialScore + activityScore));

            let estado = 'Saludable', cls = 'status-ok', accion = 'Mantener estrategia actual y monitorear evolución mensual.';
            if ((potencial === 'Alto' || potencial === 'Medio') && c.inv === 0 && c.gmv > 0 && opportunityPotential > 0) {
                estado = score >= 80 ? 'Prioridad alta' : 'Gran oportunidad';
                cls = score >= 80 ? 'status-high' : 'status-big';
                accion = 'Activar propuesta comercial: categoría con GMV relevante y sin inversión RM registrada.';
            } else if (opportunityPotential > 0 && benchmark > 0 && ratio <= benchmark * 0.50) {
                estado = score >= 80 ? 'Prioridad alta' : 'Gran oportunidad';
                cls = score >= 80 ? 'status-high' : 'status-big';
                accion = 'Priorizar reuniones con principales marcas; monetización muy por debajo de su gerencia.';
            } else if (opportunityPotential > 0 && benchmark > 0 && ratio < benchmark * 0.85) {
                estado = score >= 65 ? 'Gran oportunidad' : 'Oportunidad';
                cls = score >= 65 ? 'status-big' : 'status-opp';
                accion = 'Ampliar cobertura comercial y revisar mix de formatos para acercar el ratio al benchmark.';
            } else if (benchmark > 0 && ratio > benchmark * 1.50 && c.inv > 0) {
                estado = 'Revisar concentración'; cls = 'status-review';
                accion = 'Analizar eficiencia, concentración de inversión y posibilidad de diversificar marcas.';
                score = Math.min(score, 55);
            } else if (potencial === 'Bajo') {
                estado = 'Estable'; cls = 'status-low';
                accion = 'No priorizar salvo oportunidad táctica o pedido específico de marca.';
            }
            return { potencial, benchmark, brecha, score, estado, cls, accion, activeBrands, opportunityPotential };
        }

        function switchMainTab(tabId, btn) {
            $('.main-tab-btn').removeClass('active');
            $(btn).addClass('active');
            $('.main-tab-content').hide();
            $('#tab-' + tabId).fadeIn(300);
            window.dispatchEvent(new Event('resize'));
        }
    
