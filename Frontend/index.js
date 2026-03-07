let chart;
let categoryChart;
let auditCharts = { accuracy: null, distribution: null };
let staffProductivityChart = null;
let auditDiscrepancies = []; // Global to store raw discrepancy data
let allData = [];
let currentTab = 'inventory';

// Date Helpers
const parseInputDate = (value, endOfDay) => {
    const valStr = String(value || '');
    if (!valStr || valStr.trim() === '') return null;
    const parts = valStr.split('-').map(Number);
    if (parts.length !== 3) return null;
    const [year, month, day] = parts;
    return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
};

const parseFlexDate = (dateVal) => {
    if (!dateVal || dateVal === 'N/A' || dateVal === '') return null;

    // 1. Handle Excel Serial Numbers (e.g., 46055)
    const num = Number(dateVal);
    if (!isNaN(num) && num > 30000 && num < 60000) {
        return new Date((num - 25569) * 86400 * 1000);
    }

    const valStr = String(dateVal).trim();
    if (valStr.includes('T')) {
        const parsed = new Date(valStr);
        if (!isNaN(parsed.getTime())) return parsed;
    }

    const parts = valStr.split(/[\/\-\.]/).map(p => p.trim());
    if (parts.length === 3) {
        let y, m, d;
        if (parts[0].length === 4) {
            y = Number(parts[0]); m = Number(parts[1]); d = Number(parts[2]);
        } else if (parts[2].length === 4) {
            let v1 = Number(parts[0]); let v2 = Number(parts[1]); y = Number(parts[2]);
            if (v1 > 12) { d = v1; m = v2; }
            else if (v2 > 12) { m = v1; d = v2; }
            else { d = v1; m = v2; } // Default to DD/MM
        } else {
            let v1 = Number(parts[0]); let v2 = Number(parts[1]); y = Number(parts[2]) + 2000;
            if (v1 > 12) { d = v1; m = v2; }
            else if (v2 > 12) { m = v1; d = v2; }
            else { d = v1; m = v2; } // Default to DD/MM
        }
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m - 1, d, 12, 0, 0);
    }
    return null;
};

const getStatusType = (status) => {
    const s = String(status || '').toLowerCase().trim();
    if (s === 'gain' || s.includes('extra') || s.includes('increased') || s.includes('gain') || s.includes('زيادة') || s === '+') return 'Gain';
    if (s === 'loss' || s.includes('missing') || s.includes('decreased') || s.includes('loss') || s.includes('ناقص') || s === '-') return 'Loss';
    if (s === 'match') return 'Match';
    return 'Match';
};


function showView(viewId) {
    currentTab = viewId;

    const views = ['inventory', 'location', 'audit'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        const nav = document.getElementById(`nav-${v}`);
        if (el) el.classList.add('hidden');
        if (nav) {
            nav.classList.remove('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-100', 'active');
            nav.classList.add('text-slate-600', 'hover:bg-slate-100');
        }
    });

    const activeEl = document.getElementById(`view-${viewId}`);
    const activeNav = document.getElementById(`nav-${viewId}`);
    if (activeEl) activeEl.classList.remove('hidden');
    if (activeNav) {
        activeNav.classList.remove('text-slate-600', 'hover:bg-slate-100');
        activeNav.classList.add('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-100', 'active');
    }

    // Load data based on view
    if (viewId === 'inventory') fetchData();
    if (viewId === 'location') fetchSmartAnalysis();
    if (viewId === 'audit') fetchProductivityAnalysis();
}

async function fetchSmartAnalysis() {
    try {
        document.getElementById('lastUpdate').innerText = 'Analyzing Locations...';
        const userInfo = JSON.parse(localStorage.getItem('userInfo'));
        const res = await fetch('/api/inventory/location-analysis', {
            headers: { 'Authorization': `Bearer ${userInfo?.token}` }
        });
        const data = await res.json();

        if (data.error) {
            console.warn("Location API returned an error:", data.error);
            document.getElementById('lastUpdate').innerText = 'Notice: ' + data.error;
            return;
        }

        updateLocationDashboard(data);
        setupLocationFilters();
        fetchScansRawData();
        document.getElementById('lastUpdate').innerText = 'Location Updated: ' + new Date().toLocaleTimeString();
    } catch (err) {
        console.error("Location Fetch error:", err);
        document.getElementById('lastUpdate').innerText = 'Location Error';
    }
}

async function fetchProductivityAnalysis() {
    try {
        document.getElementById('lastUpdate').innerText = 'Loading Productivity...';
        const userInfo = JSON.parse(localStorage.getItem('userInfo'));
        const res = await fetch('/api/inventory/productivity', {
            headers: { 'Authorization': `Bearer ${userInfo?.token}` }
        });
        const data = await res.json();

        if (data.error) {
            console.warn("Productivity API returned an error:", data.error);
            document.getElementById('lastUpdate').innerText = 'Notice: ' + data.error;
            updateProductivityDashboard(data);
            return;
        }

        updateProductivityDashboard(data);
        document.getElementById('lastUpdate').innerText = 'Productivity Updated: ' + new Date().toLocaleTimeString();
    } catch (err) {
        console.error("Productivity Fetch error:", err);
        document.getElementById('lastUpdate').innerText = 'Productivity Error';
    }
}
function updateProductivityDashboard(data) {
    window.lastProductivityData = data;

    // Update staff productivity chart and table
    const staffReport = data.staffReport || {};
    const hourlyData = data.hourlyProductivity || [];
    const averages = data.productivityAverages || {};
    const kpis = data.productivityKPIs || { avgPerHour: 0, avgPerDay: 0, totalItems: 0 };

    // Update new KPI cards
    const avgHourEl = document.getElementById('avgWorkerHour');
    const avgDayEl = document.getElementById('avgWorkerDay');
    const avgLocsHourEl = document.getElementById('avgLocsHour');
    const avgLocsDayEl = document.getElementById('avgLocsDay');

    if (avgHourEl) avgHourEl.innerText = kpis.avgPerHour;
    if (avgDayEl) avgDayEl.innerText = kpis.avgPerDay;
    if (avgLocsHourEl) avgLocsHourEl.innerText = kpis.avgLocsPerHour || 0;
    if (avgLocsDayEl) avgLocsDayEl.innerText = kpis.avgLocsPerDay || 0;

    console.log("[Productivity] KPIs Updated:", kpis);

    window.staffFullData = staffReport;
    window.discrepanciesFullData = data.discrepanciesArr || [];
    window.staffProdMetrics = kpis.staffProductivity || {};

    // Render existing staff report
    renderStaffTable(staffReport, window.staffProdMetrics);

    // Store globally for filtering
    window.fullHourlyData = hourlyData;

    // Populate Employee Filter Dropdown
    populateProductivityEmployeeFilter(hourlyData);

    // Apply default filters (0-8 hours) on load to sync Cards and Table
    window.applyProductivityFilters();
}

function populateProductivityEmployeeFilter(data) {
    const selector = document.getElementById('prodEmployeeFilter');
    if (!selector) return;

    // Get unique employees
    const employees = [...new Set(data.map(item => item.employee))].sort();

    // Preserve current selection if any
    const currentVal = selector.value;

    selector.innerHTML = '<option value="all">All Employees</option>';
    employees.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = emp;
        opt.innerText = emp;
        selector.appendChild(opt);
    });

    if (employees.includes(currentVal)) {
        selector.value = currentVal;
    }
}

// Global functions for HTML access
window.exportCurrentInventory = function () {
    // Use the correctly filtered list from updateDashboard
    const dataToExport = window.currentFilteredProducts || allData;

    if (!dataToExport || dataToExport.length === 0) {
        alert("No data available to export.");
        return;
    }

    const headers = [
        "Product Code",
        "Product Name",
        "Category",
        "Product Status",
        "History Date",
        "FinalQTY",
        "Sys QTY",
        "Discrepancy"
    ];

    const rows = [];

    dataToExport.forEach(p => {
        const baseInfo = [
            p.ProductCode,
            `"${String(p.ProductName || '').replace(/"/g, '""')}"`,
            `"${String(p.Category || '').replace(/"/g, '""')}"`,
            `"${String(p.ProductStatus || 'Match').replace(/"/g, '""')}"`
        ];

        // Check if history exists and is not empty
        if (p.history && Array.isArray(p.history) && p.history.length > 0) {
            // Sort history by date (newest first usually preferred, or oldest first)
            const sortedHistory = [...p.history].sort((a, b) => new Date(a.date) - new Date(b.date));

            sortedHistory.forEach(h => {
                const queryDate = h.formattedDate || (h.date ? new Date(h.date).toISOString().split('T')[0] : 'N/A');

                const discrepancy = (h.quantity || 0) - (h.sysQty || 0);
                rows.push([
                    ...baseInfo,
                    queryDate,
                    h.quantity,
                    h.sysQty || 0,
                    discrepancy
                ]);
            });
        } else {
            // No history, just export product row with empty history fields
            rows.push([
                ...baseInfo,
                "", "", "", ""
            ]);
        }
    });

    const csvContent = [
        headers.join(","),
        ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `inventory_history_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Helper for Ghost Table button
window.openLocationFilter = function (locationName) {
    const searchInput = document.getElementById('auditSearchInput');
    if (searchInput) {
        searchInput.value = locationName;
        // Trigger the search logic
        const event = new Event('input');
        searchInput.dispatchEvent(event);

        // Scroll to the main table
        const table = document.getElementById('discrepancyTable');
        if (table) table.scrollIntoView({ behavior: 'smooth' });
    }
};

window.applyProductivityFilters = function () {
    if (!window.fullHourlyData) return;

    const empFilter = document.getElementById('prodEmployeeFilter').value;
    const dateFromVal = document.getElementById('prodDateFrom').value;
    const dateToVal = document.getElementById('prodDateTo').value;
    const hourFrom = parseInt(document.getElementById('prodHourFrom').value);
    const hourTo = parseInt(document.getElementById('prodHourTo').value);

    // Helper to parse "M/D/YYYY" from data to Date object for comparison
    const parseRowDate = (dateStr) => {
        const parts = dateStr.split('/');
        // parts[0] = DD, parts[1] = MM, parts[2] = YYYY
        return new Date(parts[2], parts[1] - 1, parts[0]);
    };

    // Parse Filter Dates
    const dateFrom = dateFromVal ? new Date(dateFromVal) : null;
    if (dateFrom) dateFrom.setHours(0, 0, 0, 0);

    const dateTo = dateToVal ? new Date(dateToVal) : null;
    if (dateTo) dateTo.setHours(23, 59, 59, 999);

    const filtered = window.fullHourlyData.filter(row => {
        // 1. Employee Filter
        if (empFilter !== 'all' && row.employee !== empFilter) return false;

        // 2. Hour Filter
        const rowHour = parseInt(row.hour);
        if (!isNaN(hourFrom) && rowHour < hourFrom) return false;
        if (!isNaN(hourTo) && rowHour > hourTo) return false;

        // 3. Date Filter
        if (dateFrom || dateTo) {
            const rowDate = parseRowDate(row.date);
            if (dateFrom && rowDate < dateFrom) return false;
            if (dateTo && rowDate > dateTo) return false;
        }

        return true;
    });

    // Recalculate KPIs for the filtered slice
    let totalItems = 0;
    let totalLocs = 0;
    const dayGrouping = new Map(); // "employee|date" => { items, locs }

    filtered.forEach(row => {
        totalItems += (row.uniqueProducts || 0);
        totalLocs += (row.uniqueLocations || 0);

        const dayKey = `${row.employee}|${row.date}`;
        if (!dayGrouping.has(dayKey)) {
            dayGrouping.set(dayKey, { items: 0, locs: 0 });
        }
        const g = dayGrouping.get(dayKey);
        g.items += (row.uniqueProducts || 0);
        g.locs += (row.uniqueLocations || 0);
    });

    const avgPerHour = filtered.length > 0 ? (totalItems / filtered.length).toFixed(1) : '0';
    const avgLocsPerHour = filtered.length > 0 ? (totalLocs / filtered.length).toFixed(1) : '0';

    let dayItemsSum = 0;
    let dayLocsSum = 0;
    dayGrouping.forEach(val => {
        dayItemsSum += val.items;
        dayLocsSum += val.locs;
    });

    const avgPerDay = dayGrouping.size > 0 ? (dayItemsSum / dayGrouping.size).toFixed(1) : '0';
    const avgLocsPerDay = dayGrouping.size > 0 ? (dayLocsSum / dayGrouping.size).toFixed(1) : '0';

    // Update UI
    const avgHourEl = document.getElementById('avgWorkerHour');
    const avgDayEl = document.getElementById('avgWorkerDay');
    const avgLocsHourEl = document.getElementById('avgLocsHour');
    const avgLocsDayEl = document.getElementById('avgLocsDay');

    if (avgHourEl) avgHourEl.innerText = avgPerHour;
    if (avgDayEl) avgDayEl.innerText = avgPerDay;
    if (avgLocsHourEl) avgLocsHourEl.innerText = avgLocsPerHour;
    if (avgLocsDayEl) avgLocsDayEl.innerText = avgLocsPerDay;

    renderHourlyProductivityTable(filtered);

    // Unified: Also trigger Staff Error Analysis filter
    filterStaffByDate();
};

window.clearProductivityFilters = function () {
    document.getElementById('prodEmployeeFilter').value = 'all';
    document.getElementById('prodDateFrom').value = '';
    document.getElementById('prodDateTo').value = '';
    // Set default range as requested: 0 to 8
    document.getElementById('prodHourFrom').value = '00';
    document.getElementById('prodHourTo').value = '23';

    // Re-apply
    window.applyProductivityFilters();
};

function updateLocationDashboard(data) {
    const products = data.products || [];
    const kpis = data.kpis || {};

    // Store globally for filters
    window.locationTableFullData = products;
    window.productLocationsData = {};

    // Build productLocationsData for modal
    products.forEach(p => {
        window.productLocationsData[p.itemId] = {
            name: p.name,
            category: p.category,
            physicalLocations: p.physicalLocations,
            systemLocations: p.systemLocations,
            matchLocs: p.matchLocs || 0,
            missMatchLocs: p.missMatchLocs || 0,
            locationStatus: p.locationStatus,
            physicalDetails: p.physicalDetails || [],
            systemDetails: p.systemDetails || []
        };
    });

    // Update KPIs
    const updateEl = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };

    updateEl('locTotalProducts', `${kpis.totalProducts || 0}`);
    updateEl('locTotalLocations', `${kpis.totalLocations || 0}`);

    const locMatch = kpis.locMatchCount || 0;
    const locMissMatch = kpis.locMissMatchCount || 0;
    const totalUniqueLocs = kpis.totalLocations || 0;
    const locMatchPct = totalUniqueLocs > 0 ? Math.round((locMatch / totalUniqueLocs) * 100) : 0;
    const locMissMatchPct = totalUniqueLocs > 0 ? Math.round((locMissMatch / totalUniqueLocs) * 100) : 0;
    updateEl('locMatchCount', `${locMatch} <span class="text-base text-slate-400 font-normal">/ ${totalUniqueLocs}</span>`);
    updateEl('locMatchPercent', `<span class="inline-block px-2.5 py-1 text-sm font-bold rounded-full bg-green-100 text-green-700">${locMatchPct}%</span>`);
    updateEl('locMissMatchCount', `${locMissMatch} <span class="text-base text-slate-400 font-normal">/ ${totalUniqueLocs}</span>`);
    updateEl('locMissMatchPercent', `<span class="inline-block px-2.5 py-1 text-sm font-bold rounded-full bg-red-100 text-red-700">${locMissMatchPct}%</span>`);

    // Render main table
    renderLocationTable(products, 'matchLocsDesc');

    // Status Distribution Chart (location-based)
    updateLocationStatusChart({
        matchCount: kpis.locMatchCount || 0,
        missMatchCount: kpis.locMissMatchCount || 0
    });

    // Top 5 Miss Match Items (most location differences)
    const topMissMatchDiv = document.getElementById('topMissMatchList');
    const missMatchItems = products.filter(p => p.locationStatus !== 'match')
        .map(item => {
            const physSet = new Set((item.physicalDetails || []).map(d => d.location));
            const sysSet = new Set((item.systemDetails || []).map(d => d.location));
            const physOnly = [...physSet].filter(l => !sysSet.has(l)).length;
            const sysOnly = [...sysSet].filter(l => !physSet.has(l)).length;
            return { ...item, diffCount: physOnly + sysOnly };
        })
        .sort((a, b) => b.diffCount - a.diffCount)
        .slice(0, 5);

    if (missMatchItems.length > 0) {
        topMissMatchDiv.innerHTML = missMatchItems.map((item, i) => `
            <div class="p-3 bg-orange-50 border border-orange-100 rounded-lg">
                <div class="flex items-start mb-2">
                    <div class="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mr-3 font-bold text-sm flex-shrink-0">${i + 1}</div>
                    <div>
                        <p class="text-sm font-medium text-slate-700">${item.name}</p>
                        <p class="text-xs text-slate-400 font-mono">${item.itemId}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 ml-11 flex-wrap">
                    <span class="px-2 py-1 text-xs font-bold text-cyan-700 bg-cyan-100 rounded">Physical: ${item.physicalLocations}</span>
                    <span class="px-2 py-1 text-xs font-bold text-purple-700 bg-purple-100 rounded">System: ${item.systemLocations}</span>
                    <span class="px-2 py-1 text-xs font-bold text-white bg-orange-500 rounded">Diff: ${item.diffCount}</span>
                </div>
            </div>
        `).join('');
    } else {
        topMissMatchDiv.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">No miss match items found.</p>';
    }

    // Discrepancy Locations Putaway (System Qty=0, Physical>0)
    // Build putaway data: for each product, find locations where physical qty > 0 and system qty = 0
    const putawayRows = [];
    products.forEach(product => {
        const physicalLocs = product.physicalDetails || [];
        const systemLocs = product.systemDetails || [];

        // Build system qty map per location for this product
        const sysQtyMap = {};
        systemLocs.forEach(d => {
            const loc = d.location;
            sysQtyMap[loc] = (sysQtyMap[loc] || 0) + (d.quantity || 0);
        });

        // Group physical by location
        const physByLoc = {};
        physicalLocs.forEach(d => {
            const loc = d.location;
            if (!physByLoc[loc]) physByLoc[loc] = { totalQty: 0, dates: [] };
            physByLoc[loc].totalQty += (d.finalQty || 0);
            if (d.date) physByLoc[loc].dates.push(d.date);
        });

        Object.entries(physByLoc).forEach(([loc, info]) => {
            const sysQty = sysQtyMap[loc] || 0;
            if (sysQty === 0 && info.totalQty > 0) {
                // Latest date for this location
                let latestDate = null;
                info.dates.forEach(dateStr => {
                    const dt = new Date(dateStr);
                    if (!latestDate || dt > latestDate) latestDate = dt;
                });
                putawayRows.push({
                    name: product.name,
                    itemId: product.itemId,
                    category: product.category,
                    location: loc,
                    physicalQty: info.totalQty,
                    date: latestDate
                });
            }
        });
    });

    // Store globally for filtering
    window.putawayFullData = putawayRows;

    // Populate putaway category filter
    const putawayCatFilter = document.getElementById('putawayCategoryFilter');
    if (putawayCatFilter) {
        const cats = [...new Set(putawayRows.map(r => r.category))].filter(Boolean).sort();
        putawayCatFilter.innerHTML = '<option value="all">All Categories</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // Render putaway table
    renderPutawayTable(putawayRows);

    // Setup putaway filters
    const applyPutawayBtn = document.getElementById('applyPutawayFilter');
    if (applyPutawayBtn) {
        applyPutawayBtn.addEventListener('click', () => {
            const catVal = document.getElementById('putawayCategoryFilter')?.value || 'all';
            const dateFrom = document.getElementById('putawayDateFrom')?.value;
            const dateTo = document.getElementById('putawayDateTo')?.value;

            let filtered = window.putawayFullData;
            if (catVal !== 'all') {
                filtered = filtered.filter(r => r.category === catVal);
            }
            if (dateFrom) {
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                filtered = filtered.filter(r => r.date && r.date >= from);
            }
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                filtered = filtered.filter(r => r.date && r.date <= to);
            }
            renderPutawayTable(filtered);
        });
    }
}

function exportPutawayExcel() {
    const rows = window.putawayFilteredData || window.putawayFullData || [];
    if (rows.length === 0) {
        alert('No data to export.');
        return;
    }

    // BOM for UTF-8
    const BOM = '\uFEFF';
    const headers = ['Product Name', 'Item ID', 'Category', 'Location', 'Physical Qty', 'Date'];
    const csvRows = [headers.join(',')];

    rows.forEach(row => {
        const dateDisplay = row.date ? row.date.toLocaleDateString('en-GB') : '';
        csvRows.push([
            `"${(row.name || '').replace(/"/g, '""')}"`,
            `"${row.itemId || ''}"`,
            `"${(row.category || '').replace(/"/g, '""')}"`,
            `"${(row.location || '').replace(/"/g, '""')}"`,
            row.physicalQty || 0,
            dateDisplay
        ].join(','));
    });

    const blob = new Blob([BOM + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Discrepancy_Putaway_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function renderPutawayTable(rows) {
    // Store filtered data for export
    window.putawayFilteredData = rows;
    const tbody = document.getElementById('putawayTableBody');
    const emptyMsg = document.getElementById('putawayEmpty');
    if (!tbody) return;

    if (rows.length === 0) {
        tbody.innerHTML = '';
        if (emptyMsg) emptyMsg.classList.remove('hidden');
        return;
    }
    if (emptyMsg) emptyMsg.classList.add('hidden');

    // Sort by physical qty descending
    const sorted = [...rows].sort((a, b) => b.physicalQty - a.physicalQty);

    tbody.innerHTML = sorted.map(row => {
        const dateDisplay = row.date ? row.date.toLocaleDateString('en-GB') : '-';
        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50">
                <td class="py-2 pr-2">
                    <p class="text-sm font-medium text-slate-700 truncate max-w-[140px]" title="${row.name}">${row.name}</p>
                    <p class="text-xs text-slate-400 font-mono">${row.itemId}</p>
                </td>
                <td class="py-2 pr-2 text-sm text-slate-600">${row.location}</td>
                <td class="py-2 pr-2 text-center">
                    <span class="px-2 py-0.5 text-xs font-bold bg-orange-100 text-orange-700 rounded">${row.physicalQty}</span>
                </td>
                <td class="py-2 text-center text-xs text-slate-500">${dateDisplay}</td>
            </tr>`;
    }).join('');
}

function setupAuditFilters() {
    const searchInput = document.getElementById('auditSearchInput');
    const statusFilter = document.getElementById('auditStatusFilter');
    const categoryFilter = document.getElementById('auditCategoryFilter');
    const dateFromInput = document.getElementById('auditDateFrom');
    const dateToInput = document.getElementById('auditDateTo');
    const dateClearBtn = document.getElementById('auditDateClear');

    const applyBtn = document.getElementById('applyAuditFilters');

    function triggerFilter() {
        const searchTerm = searchInput.value.toLowerCase();
        const statusVal = statusFilter.value;
        const categoryVal = categoryFilter.value;
        const hasDateFilter = Boolean(dateFromInput?.value || dateToInput?.value);
        const startDate = parseInputDate(dateFromInput?.value, false) || new Date(1900, 0, 1, 0, 0, 0);
        const endDate = parseInputDate(dateToInput?.value, true) || new Date(2099, 11, 31, 23, 59, 59);

        const filtered = auditDiscrepancies.filter(d => {
            const matchesSearch =
                (String(d.product || '').toLowerCase()).includes(searchTerm) ||
                (String(d.location || '').toLowerCase()).includes(searchTerm) ||
                (String(d.category || '').toLowerCase()).includes(searchTerm) ||
                (String(d.productId || '').toLowerCase()).includes(searchTerm) ||
                (String(d.staffName || '').toLowerCase()).includes(searchTerm) ||
                (String(d.barcode || '').toLowerCase()).includes(searchTerm);

            const statusTerm = String(d.locationStatus || '').toLowerCase();
            const matchesStatus =
                statusVal === 'all' ||
                statusTerm.includes(statusVal);

            const matchesCategory = categoryVal === 'all' || d.category === categoryVal;

            const recordDate = parseFlexDate(d.dateNow);
            const matchesDate = !hasDateFilter || (recordDate && recordDate >= startDate && recordDate <= endDate);

            return matchesSearch && matchesStatus && matchesCategory && matchesDate;
        });

        renderDiscrepancyTable(filtered);
    }

    // Populate Categories dynamically
    const categories = [...new Set(auditDiscrepancies.map(d => d.category).filter(Boolean))].sort();
    const currentCat = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="all">All Categories</option>' +
        categories.map(c => `<option value="${c}" ${c === currentCat ? 'selected' : ''}>${c}</option>`).join('');

    if (searchInput.dataset.initialized) {
        // Just trigger to refresh table with current data/filters if already initialized
        triggerFilter();
        return;
    }

    // Attach to Apply Button
    applyBtn?.addEventListener('click', triggerFilter);

    // Initial trigger
    triggerFilter();

    dateClearBtn?.addEventListener('click', () => {
        if (dateFromInput) dateFromInput.value = '';
        if (dateToInput) dateToInput.value = '';
        if (searchInput) searchInput.value = '';
        if (categoryFilter) categoryFilter.value = 'all';
        if (statusFilter) statusFilter.value = 'all';
        triggerFilter();
    });

    searchInput.dataset.initialized = 'true';
}

function renderDiscrepancyTable(discrepancies) {
    const discTbody = document.getElementById('discrepancyTable');
    const countDisplay = document.getElementById('auditResultCount');

    countDisplay.innerText = `Showing ${discrepancies.length} rows`;

    if (!discrepancies || discrepancies.length === 0) {
        discTbody.innerHTML = `<tr><td colspan="18" class="px-6 py-10 text-center text-slate-400">No discrepancies match your filters</td></tr>`;
        return;
    }

    discTbody.innerHTML = discrepancies.map(d => `
        <tr class="hover:bg-red-50/30 transition-colors whitespace-nowrap">
            <td class="px-3 py-3"><span class="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-600">${d.location}</span></td>
            <td class="px-3 py-3 font-mono text-slate-400">${d.barcode}</td>
            <td class="px-3 py-3 font-mono text-slate-400">${d.productId}</td>
            <td class="px-3 py-3 font-bold text-slate-800">${d.product}</td>
            <td class="px-3 py-3 text-slate-500">${d.productionDate}</td>
            <td class="px-3 py-3 text-right text-slate-500">${d.expirationDate}</td>
            <td class="px-3 py-3 text-right text-slate-500">${d.finalQty}</td>
            <td class="px-3 py-3 text-right font-bold text-slate-800">${d.systemQty}</td>
            <td class="px-3 py-3 text-right text-slate-600">${d.finalVar}</td>
            <td class="px-3 py-3"><span class="text-[10px] px-2 py-1 bg-slate-50 border rounded-md text-slate-600">${d.locationStatus}</span></td>
            <td class="px-3 py-3 whitespace-normal min-w-[120px]">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${d.diff > 0 ? 'bg-orange-100 text-orange-700' : d.diff < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">
                    ${d.productStatus || (d.diff > 0 ? 'Gain' : d.diff < 0 ? 'Loss' : 'Match')}
                </span>
            </td>
            <td class="px-3 py-3 font-medium text-slate-800">${d.staffName}</td>
            <td class="px-3 py-3 text-center text-slate-400">${d.employeeAccuracy}</td>
            <td class="px-3 py-3 text-slate-400 text-[10px]">${d.live}</td>

            <td class="px-3 py-3 text-slate-400 text-[10px]">${d.liveWait}</td>
        </tr>
    `).join('');
}

async function fetchData() {
    console.log('🔄 fetchData called');
    const search = document.getElementById('searchInput')?.value || '';
    const type = document.getElementById('statusInput')?.value || '';
    const category = document.getElementById('categoryInput')?.value || '';
    const startDate = document.getElementById('dateFrom')?.value || '';
    const endDate = document.getElementById('dateTo')?.value || '';

    const params = new URLSearchParams({ search, type, category, startDate, endDate });
    const lastUpdateEl = document.getElementById('lastUpdate');

    try {
        if (lastUpdateEl) lastUpdateEl.innerText = 'Fetching...';

        const userInfo = JSON.parse(localStorage.getItem('userInfo'));
        console.log('📡 Fetching from API...');
        const res = await fetch(`/api/inventory/dashboard?${params}`, {
            headers: { 'Authorization': `Bearer ${userInfo?.token}` }
        });

        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

        const data = await res.json();
        console.log('✅ Data received:', data.products?.length, 'products');

        // allData should contain the FULL products list for lookups (History/Charts)
        allData = data.uniqueProducts || data.products || [];

        // Limit to 20 visually if no filters are applied
        const hasFilters = search || type || category || startDate || endDate;
        const displayData = { ...data };
        if (!hasFilters) {
            if (displayData.products) displayData.products = displayData.products.slice(0, 20);
            if (displayData.uniqueProducts) displayData.uniqueProducts = displayData.uniqueProducts.slice(0, 20);
        }

        if ((!data.products || data.products.length === 0) && (!data.uniqueProducts || data.uniqueProducts.length === 0)) {
            // Empty state handled by table checks usually
            console.log('⚠️ No products data');
        }

        updateDashboard(displayData, data.products || []);

        if (lastUpdateEl) lastUpdateEl.innerText = 'Updated: ' + new Date().toLocaleTimeString();

    } catch (err) {
        console.error("❌ Fetch error:", err);
        if (lastUpdateEl) lastUpdateEl.innerText = 'Error';
    }
}

function clearFilters() {
    const searchInput = document.getElementById('searchInput');
    const statusInput = document.getElementById('statusInput');
    const categoryInput = document.getElementById('categoryInput');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');

    if (searchInput) searchInput.value = '';
    if (statusInput) statusInput.value = '';
    if (categoryInput) categoryInput.value = '';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';

    fetchData();
}


function updateDashboard(data, allProducts = null) {
    console.log('📊 updateDashboard called with:', {
        productsCount: data.products?.length,
        kpis: data.kpis
    });

    // Auto-populate Category filter from FULL data (not sliced display data)
    const categorySelect = document.getElementById('categoryInput');
    const fullProducts = allProducts || data.products || [];
    if (categorySelect && fullProducts.length > 0) {
        const currentVal = categorySelect.value;
        // Only rebuild if no category filter is applied (to avoid narrowing the list when filtering)
        if (!currentVal) {
            const categories = [...new Set(fullProducts.map(p => p.Category).filter(Boolean))].sort();
            if (categories.length > 0) {
                categorySelect.innerHTML = '<option value="">All Categories</option>' +
                    categories.map(c => `<option value="${c}">${c}</option>`).join('');
            }
        }
    }

    // Update KPIs
    // Update KPIs (Audit Style)
    const invAccuracyEl = document.getElementById('invAccuracy');
    const invAccuracyBar = document.getElementById('invAccuracyBar');
    const invMatchedEl = document.getElementById('invMatched');
    const invGainEl = document.getElementById('invGain');
    const invLossEl = document.getElementById('invLoss');

    // Total Products should show BOTH records and DISTINCT count per user request
    const totalProductsEl = document.getElementById('totalProducts');
    const totalPiecesEl = document.getElementById('totalPieces');
    if (totalProductsEl) {
        totalProductsEl.innerHTML = `${data.kpis.totalProducts.toLocaleString()}`;
    }
    if (totalPiecesEl) totalPiecesEl.innerText = (data.kpis.totalLatestQuantity || 0).toLocaleString();

    if (invAccuracyEl) invAccuracyEl.innerText = `${data.kpis.accuracy}%`;
    if (invAccuracyBar) invAccuracyBar.style.width = `${data.kpis.accuracy}%`;

    if (invMatchedEl) {
        invMatchedEl.innerHTML = `${data.kpis.productsStable.toLocaleString()}`;
    }
    if (invGainEl) {
        invGainEl.innerHTML = `${data.kpis.productsGain.toLocaleString()}`;
    }
    if (invLossEl) {
        invLossEl.innerHTML = `${data.kpis.productsLoss.toLocaleString()}`;
    }

    // Sums
    const invMatchedSumEl = document.getElementById('invMatchedSum');
    const invGainSumEl = document.getElementById('invGainSum');
    const invLossSumEl = document.getElementById('invLossSum');
    if (invMatchedSumEl) invMatchedSumEl.innerText = data.kpis.sumStable.toLocaleString();
    if (invGainSumEl) invGainSumEl.innerText = data.kpis.sumGain.toLocaleString();
    if (invLossSumEl) invLossSumEl.innerText = data.kpis.sumLoss.toLocaleString();

    // Percentages
    const invMatchedPctEl = document.getElementById('invMatchedPct');
    const invGainPctEl = document.getElementById('invGainPct');
    const invLossPctEl = document.getElementById('invLossPct');
    if (invMatchedPctEl) invMatchedPctEl.innerText = `${data.kpis.percentStable}%`;
    if (invGainPctEl) invGainPctEl.innerText = `${data.kpis.percentGain}%`;
    if (invLossPctEl) invLossPctEl.innerText = `${data.kpis.percentLoss}%`;

    // Expiry Table (Moved from Audit to Inventory View)
    if (data.expiryAnalysis) {
        const expiryRows = data.expiryAnalysis.expired.concat(data.expiryAnalysis.expiring7Days);
        const expiryCountEl = document.getElementById('expiryCount');
        const expiryTbody = document.getElementById('expiryTable');

        if (expiryCountEl) expiryCountEl.innerText = `${expiryRows.length} Items`;
        if (expiryTbody) {
            expiryTbody.innerHTML = expiryRows.length > 0 ? expiryRows.map(item => {
                const expParsed = parseFlexDate(item.expiryDate);
                const isCritical = expParsed && expParsed < new Date();
                return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-3">
                        <p class="font-medium text-slate-800">${item.productName}</p>
                        <p class="text-xs text-slate-400 font-mono">${item.productId}</p>
                    </td>
                    <td class="px-4 py-3 text-slate-600">${item.location}</td>
                    <td class="px-4 py-3 text-right font-bold ${isCritical ? 'text-red-600' : 'text-orange-600'}">
                        ${expParsed ? expParsed.toLocaleDateString() : 'N/A'}
                    </td>
                </tr>
            `}).join('') : '<tr><td colspan="3" class="px-6 py-4 text-center text-slate-400">No critical expiries found.</td></tr>';
        }
    }

    console.log('✅ KPIs updated');

    // Render Table (Unique Products only)
    const tbody = document.getElementById('inventoryTable');
    if (!tbody) {
        console.error('❌ inventoryTable element not found!');
        return;
    }

    tbody.innerHTML = '';

    const productsToRender = data.uniqueProducts || data.products;

    // Save for export
    window.currentFilteredProducts = productsToRender;

    if (productsToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-slate-400">No products found matching filters.</td></tr>';
        console.log('⚠️ No products to display');
        return;
    }

    console.log('🔨 Rendering', productsToRender.length, 'unique products...');
    productsToRender.forEach(p => {
        const statusType = getStatusType(p.ProductStatus);
        let statusClass = 'text-green-600 bg-green-50'; // Default Match

        if (statusType === 'Gain') {
            statusClass = 'text-orange-600 bg-orange-50';
        } else if (statusType === 'Loss') {
            statusClass = 'text-red-600 bg-red-50';
        }

        const row = document.createElement('tr');
        row.className = "border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer";

        // Clicking row shows chart
        row.onclick = () => showTrend(p);

        row.innerHTML = `
            <td class="px-6 py-4">
                <p class="font-semibold text-slate-800">${p.ProductName}</p>
                <p class="text-xs text-slate-400 font-mono">${p.ProductCode}</p>
            </td>
            <td class="px-6 py-4 text-sm text-slate-600">${p.Category}</td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 rounded-lg font-bold text-xs ${statusClass}">
                    ${statusType}
                </span>
            </td>
            <td class="px-6 py-4">
                <button onclick="event.stopPropagation(); openHistory('${p.ProductCode}')" 
                        class="text-green-600 hover:text-green-800 hover:bg-green-50 px-3 py-1 rounded-lg font-medium text-sm transition-colors">
                    View History
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    console.log('✅ Table rendered with', data.products.length, 'rows');

    if (data.products.length > 0) {
        if (!chart) showTrend(data.products[0]);
        updateCategoryChart(data.products);
    }

    // Render Expiry Table
    if (data.expiryAnalysis) {
        // Concatenate Expired + 7 Days + 30 Days arrays to cover all critical items
        const expiryRows = (data.expiryAnalysis.expired || [])
            .concat(data.expiryAnalysis.expiring7Days || [])
            .concat(data.expiryAnalysis.expiring30Days || []);

        window.allExpiryRows = expiryRows;
        window.renderExpiryTable();
    }

    console.log('✨ updateDashboard complete');
}

function renderExpiryTable(rowsToRender = window.allExpiryRows) {
    const expiryTbody = document.getElementById('expiryTable');
    if (!expiryTbody || !rowsToRender) return;

    // Sort by expiry date ascending (closest to expire/expired first)
    const sortedRows = [...rowsToRender].sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

    const countEl = document.getElementById('expiryCount');
    if (countEl) countEl.innerText = `${sortedRows.length} Items`;

    if (sortedRows.length === 0) {
        expiryTbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-slate-400">No critical expiry alerts found matching filters.</td></tr>';
    } else {
        expiryTbody.innerHTML = sortedRows.map(item => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4">
                    <p class="font-semibold text-slate-800">${item.productName}</p>
                    <p class="text-xs text-slate-400 font-mono">${item.productId}</p>
                </td>
                <td class="px-6 py-4 text-slate-600">${item.location || item.warehouse || 'Main'}</td>
                <td class="px-6 py-4 text-slate-600 font-medium">
                    ${item.inventoryDate && item.inventoryDate !== 'N/A' ? new Date(item.inventoryDate).toLocaleDateString() : 'N/A'}
                </td>
                <td class="px-6 py-4 text-right font-bold ${new Date(item.expiryDate) < new Date() ? 'text-red-600' : 'text-orange-600'}">
                    ${new Date(item.expiryDate).toLocaleDateString()}
                </td>
            </tr>
        `).join('');
    }
}

window.applyExpiryFilters = function () {
    if (!window.allExpiryRows) return;

    const dateFromVal = document.getElementById('expiryDateFrom').value;
    const dateToVal = document.getElementById('expiryDateTo').value;

    const dateFrom = dateFromVal ? new Date(dateFromVal) : null;
    if (dateFrom) dateFrom.setHours(0, 0, 0, 0);

    const dateTo = dateToVal ? new Date(dateToVal) : null;
    if (dateTo) dateTo.setHours(23, 59, 59, 999);

    const filtered = window.allExpiryRows.filter(row => {
        if (!dateFrom && !dateTo) return true;

        const rowDateParsed = parseFlexDate(row.inventoryDate);
        if (!rowDateParsed) return false; // Exclude items with invalid/no inventory date if filtering by date

        if (dateFrom && rowDateParsed < dateFrom) return false;
        if (dateTo && rowDateParsed > dateTo) return false;

        return true;
    });

    renderExpiryTable(filtered);
};

window.clearExpiryFilters = function () {
    document.getElementById('expiryDateFrom').value = '';
    document.getElementById('expiryDateTo').value = '';

    if (window.allExpiryRows) {
        renderExpiryTable(window.allExpiryRows);
    }
};

function updateCategoryChart(products) {
    console.log('📈 updateCategoryChart called', { productsCount: products?.length });

    const mainFilterEl = document.getElementById('categoryInput');
    const currentSelection = mainFilterEl ? mainFilterEl.value || '' : '';
    const isAllCategories = currentSelection === '';

    const aggregation = {}; // { key: { matched: {qty, count}, gain: {qty, count}, loss: {qty, count} } }

    products.forEach(p => {
        const key = isAllCategories ? (p.Category || 'Other') : (p.lastCountDate || 'Unknown');
        if (!aggregation[key]) {
            aggregation[key] = {
                matched: { qty: 0, count: 0 },
                gain: { qty: 0, count: 0 },
                loss: { qty: 0, count: 0 }
            };
        }

        const statusType = getStatusType(p.ProductStatus);
        const qty = parseFloat(p.PhysicalQty) || 0;

        if (statusType === 'Gain') {
            aggregation[key].gain.qty += qty;
            aggregation[key].gain.count++;
        } else if (statusType === 'Loss') {
            aggregation[key].loss.qty += qty;
            aggregation[key].loss.count++;
        } else {
            aggregation[key].matched.qty += qty;
            aggregation[key].matched.count++;
        }
    });

    const sortedKeys = Object.keys(aggregation).sort();

    // Plot Item Count by default
    const matchedData = sortedKeys.map(k => aggregation[k].matched.count);
    const gainData = sortedKeys.map(k => aggregation[k].gain.count);
    const lossData = sortedKeys.map(k => aggregation[k].loss.count);

    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (categoryChart) categoryChart.destroy();

    categoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedKeys,
            datasets: [
                {
                    label: 'Matched',
                    data: matchedData,
                    backgroundColor: '#10b981',
                },
                {
                    label: 'Gain',
                    data: gainData,
                    backgroundColor: '#f59e0b',
                },
                {
                    label: 'Loss',
                    data: lossData,
                    backgroundColor: '#ef4444',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            const index = context.dataIndex;
                            const key = sortedKeys[index];
                            const statusKey = context.dataset.label.toLowerCase(); // 'matched', 'gain', or 'loss'
                            const data = aggregation[key][statusKey];
                            const label = context.dataset.label;

                            // User format: Match = 10 Item = 6000 Unit
                            return `${label} = ${data.count} Item = ${data.qty.toLocaleString()} Unit`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: '#f1f5f9' },
                    title: { display: true, text: 'Number of Items (Count)' }
                },
                x: {
                    stacked: true,
                    grid: { display: false }
                }
            }
        }
    });

    const metaEl = document.getElementById('categoryChartMeta');
    if (metaEl) {
        const displayLabel = isAllCategories ? 'All Categories' : currentSelection;
        metaEl.innerText = `Showing status distribution for "${displayLabel}". Tooltip displays both item counts and total units.`;
    }
    console.log('✅ Category chart updated');
}

function showTrend(product) {
    document.getElementById('chartTitle').innerText = `${product.ProductName} Trend`;

    const ctx = document.getElementById('trendChart').getContext('2d');

    // Sort history by date
    const sortedHistory = [...product.history].sort((a, b) => new Date(a.date) - new Date(b.date));
    const labels = sortedHistory.map(h => h.formattedDate);
    const physicalValues = sortedHistory.map(h => h.quantity);
    const systemValues = sortedHistory.map(h => h.sysQty);
    const statuses = sortedHistory.map(h => getStatusType(h.status));

    // Determine colors for each point based on status
    const pointColors = statuses.map(s => {
        if (s === 'Gain') return '#f59e0b'; // Amber-500
        if (s === 'Loss') return '#ef4444'; // Red-500
        return '#10b981'; // Green-500
    });

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'FinalQTY',
                    data: physicalValues,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: pointColors,
                    pointBorderColor: pointColors,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    zIndex: 2
                },
                {
                    label: 'System Qty',
                    data: systemValues,
                    borderColor: '#94a3b8',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0,
                    zIndex: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 10
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const index = context.dataIndex;
                            const h = sortedHistory[index];
                            const status = getStatusType(h.status);

                            if (context.datasetIndex === 0) {
                                return `Physical: ${h.quantity} (${status})`;
                            } else {
                                return `System: ${h.sysQty}`;
                            }
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: false, grid: { color: '#f1f5f9' } },
                x: { grid: { display: false } }
            },
            interaction: {
                intersect: false,
                mode: 'index',
            }
        }
    });
}

function openHistory(code) {
    const product = allData.find(p => p.ProductCode === code);
    if (!product) return;

    document.getElementById('modalTitle').innerText = product.ProductName;
    document.getElementById('modalSubtitle').innerText = `SKU: ${product.ProductCode} • Total Records: ${product.history.length}`;

    const tbody = document.getElementById('modalTableBody');
    tbody.innerHTML = '';

    // Show latest first
    const history = [...product.history].sort((a, b) => new Date(a.date) - new Date(b.date));

    history.forEach(h => {
        const discrepancy = h.quantity - h.sysQty;
        const diffColor = discrepancy >= 0 ? 'text-green-600' : 'text-red-600';
        const diffSign = discrepancy > 0 ? '+' : '';

        tbody.innerHTML += `
            <tr class="hover:bg-slate-50">
                <td class="py-3 font-mono text-slate-500">${h.formattedDate}</td>
                <td class="py-3 font-bold text-slate-800 text-center">${h.quantity}</td>
                <td class="py-3 font-bold text-slate-600 text-center">${h.sysQty || 0}</td>
                <td class="py-3 font-bold text-center ${diffColor}">${diffSign}${discrepancy}</td>
            </tr>
        `;
    });

    // Show Modal
    const modal = document.getElementById('historyModal');
    modal.classList.remove('hidden');
    // Trigger reflow
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    modal.querySelector('div').classList.remove('scale-95');
    modal.querySelector('div').classList.add('scale-100');
}

function closeHistory() {
    const modal = document.getElementById('historyModal');
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.remove('scale-100');
    modal.querySelector('div').classList.add('scale-95');

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}

function showLocationsModal(productId) {
    const productData = window.productLocationsData[productId];

    if (!productData) {
        console.error('Product data not found:', productId);
        return;
    }

    document.getElementById('locModalTitle').innerText = `Locations for: ${productData.name}`;
    const locationsListBody = document.getElementById('locationsListBody');

    const physicalLocs = productData.physicalDetails || [];
    const systemLocs = productData.systemDetails || [];

    // Build unique location sets
    const physicalLocSet = new Set(physicalLocs.map(d => d.location));
    const systemLocSet = new Set(systemLocs.map(d => d.location));

    // Compare: same vs different
    const sameLocs = [...physicalLocSet].filter(loc => systemLocSet.has(loc));
    const physicalOnlyLocs = [...physicalLocSet].filter(loc => !systemLocSet.has(loc));
    const systemOnlyLocs = [...systemLocSet].filter(loc => !physicalLocSet.has(loc));

    // Compute QTY totals & variance
    const totalFinalQty = physicalLocs.reduce((s, d) => s + (parseFloat(d.finalQty) || 0), 0);
    const totalSysQty = systemLocs.reduce((s, d) => s + (parseFloat(d.quantity) || 0), 0);
    const qtyVariance = totalFinalQty - totalSysQty;
    const varianceColor = qtyVariance === 0 ? 'text-green-700' : qtyVariance > 0 ? 'text-orange-700' : 'text-red-700';
    const varianceSign = qtyVariance > 0 ? '+' : '';

    // Summary header with comparison KPIs
    const summaryHtml = `
        <div class="flex flex-col gap-3 mb-4 p-3 bg-slate-100 rounded-lg">
            <div class="flex justify-center items-center gap-4">
                <div class="text-center">
                    <span class="text-sm font-semibold text-green-600">Match Locs</span>
                    <span class="text-2xl font-bold text-green-700 block">${productData.matchLocs}</span>
                </div>
                <span class="text-slate-400 text-xl">vs</span>
                <div class="text-center">
                    <span class="text-sm font-semibold text-red-600">Miss Match Locs</span>
                    <span class="text-2xl font-bold text-red-700 block">${productData.missMatchLocs}</span>
                </div>
            </div>
            <div class="flex justify-center items-center gap-4 mt-1">
                <div class="text-center">
                    <span class="text-sm font-semibold text-cyan-600">Physical QTY</span>
                    <span class="text-xl font-bold text-slate-800 block">${totalFinalQty.toLocaleString()}</span>
                </div>
                <span class="text-slate-400 text-xl">vs</span>
                <div class="text-center">
                    <span class="text-sm font-semibold text-purple-600">System QTY</span>
                    <span class="text-xl font-bold text-slate-800 block">${totalSysQty.toLocaleString()}</span>
                </div>
                <div class="text-center border-l border-slate-300 pl-4">
                    <span class="text-sm font-semibold text-slate-500">QTY Var</span>
                    <span class="text-xl font-bold ${varianceColor} block">${varianceSign}${qtyVariance.toLocaleString()}</span>
                </div>
            </div>
            <div class="flex justify-center">
                <span class="px-3 py-1 text-sm font-bold rounded ${
                    productData.locationStatus === 'match' ? 'bg-green-100 text-green-700' :
                    'bg-red-100 text-red-700'
                }">${productData.locationStatus === 'match' ? 'MATCH' : 'MISS MATCH'}</span>
            </div>
        </div>
    `;

    // Match locations (exist in both Physical & System)
    let matchHtml = '';
    if (sameLocs.length > 0) {
        matchHtml = `
            <div class="mb-3">
                <h4 class="text-sm font-bold text-green-600 mb-2">Match Locations (${productData.matchLocs})</h4>
                ${sameLocs.map(loc => {
                    const pQty = physicalLocs.filter(d => d.location === loc).reduce((s, d) => s + (d.finalQty || 0), 0);
                    const sQty = systemLocs.filter(d => d.location === loc).reduce((s, d) => s + (d.quantity || 0), 0);
                    const locVar = pQty - sQty;
                    const locVarColor = locVar === 0 ? 'text-green-700' : locVar > 0 ? 'text-orange-700' : 'text-red-700';
                    const locVarSign = locVar > 0 ? '+' : '';
                    return `
                    <div class="p-3 bg-green-50 border border-green-100 rounded-lg mb-2">
                        <p class="font-semibold text-slate-800 mb-1">${loc}</p>
                        <div class="flex gap-4 text-sm">
                            <span class="text-cyan-700 font-bold">Physical Qty: ${pQty}</span>
                            <span class="text-purple-700 font-bold">System Qty: ${sQty}</span>
                            <span class="${locVarColor} font-bold">Var: ${locVarSign}${locVar}</span>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `;
    }

    // Miss Match locations (in one side only)
    const missMatchLocs = [
        ...physicalOnlyLocs.map(loc => ({ loc, source: 'Physical Only' })),
        ...systemOnlyLocs.map(loc => ({ loc, source: 'System Only' }))
    ];
    let missMatchHtml = '';
    if (missMatchLocs.length > 0) {
        missMatchHtml = `
            <div class="mb-3">
                <h4 class="text-sm font-bold text-red-600 mb-2">Miss Match Locations (${productData.missMatchLocs})</h4>
                ${missMatchLocs.map(({ loc, source }) => {
                    const isPhysical = source === 'Physical Only';
                    const qty = isPhysical
                        ? physicalLocs.filter(d => d.location === loc).reduce((s, d) => s + (d.finalQty || 0), 0)
                        : systemLocs.filter(d => d.location === loc).reduce((s, d) => s + (d.quantity || 0), 0);
                    return `
                    <div class="p-3 bg-red-50 border border-red-100 rounded-lg mb-2">
                        <div class="flex justify-between items-center">
                            <div>
                                <p class="font-semibold text-slate-800">${loc}</p>
                                <span class="text-xs font-bold ${isPhysical ? 'text-cyan-600' : 'text-purple-600'}">${source}</span>
                            </div>
                            <span class="text-sm font-bold text-slate-700">Qty: ${qty}</span>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `;
    }

    locationsListBody.innerHTML = summaryHtml + matchHtml + missMatchHtml;

    // Show Modal
    const modal = document.getElementById('locationsModal');
    modal.classList.remove('hidden');
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    modal.querySelector('div').classList.remove('scale-95');
    modal.querySelector('div').classList.add('scale-100');
}

function closeLocationsModal() {
    const modal = document.getElementById('locationsModal');
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.remove('scale-100');
    modal.querySelector('div').classList.add('scale-95');

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}

// Close on backdrop click
document.getElementById('historyModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('historyModal')) closeHistory();
});

document.getElementById('locationsModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('locationsModal')) closeLocationsModal();
});

// Initial Load
switchTab('inventory');
setInterval(() => {
    if (currentTab === 'inventory') fetchData();
    else if (currentTab === 'location') fetchSmartAnalysis();
    else if (currentTab === 'audit') fetchProductivityAnalysis();
}, 60000); // Refresh every minute

// Attach date filter listeners removed as they are unified manually in applyProductivityFilters

// No-op

// Location Table Render Function
function renderLocationTable(data, sortBy = 'matchLocsDesc') {
    const locationTable = document.getElementById('locationDetailsTable');

    let sortedData = [...data];

    // Sort
    if (sortBy === 'matchLocsDesc') {
        sortedData.sort((a, b) => (b.matchLocs || 0) - (a.matchLocs || 0));
    } else if (sortBy === 'missMatchLocsDesc') {
        sortedData.sort((a, b) => (b.missMatchLocs || 0) - (a.missMatchLocs || 0));
    } else if (sortBy === 'gainFirst') {
        sortedData.sort((a, b) => (b.matchLocs || 0) - (a.matchLocs || 0));
    } else if (sortBy === 'lossFirst') {
        sortedData.sort((a, b) => (b.missMatchLocs || 0) - (a.missMatchLocs || 0));
    }

    locationTable.innerHTML = sortedData.map(item => {
        let locStatus = '';
        let locStatusClass = '';
        if (item.locationStatus === 'match') {
            locStatus = 'Match';
            locStatusClass = 'bg-green-100 text-green-700';
        } else {
            locStatus = 'Miss Match';
            locStatusClass = 'bg-red-100 text-red-700';
        }

        // Calculate Total FinalQTY and Total Sys QTY
        const totalFinalQty = (item.physicalDetails || []).reduce((sum, d) => sum + (parseFloat(d.finalQty) || 0), 0);
        const totalSysQty = (item.systemDetails || []).reduce((sum, d) => sum + (parseFloat(d.quantity) || 0), 0);

        let qtyStatus = '';
        let qtyStatusClass = '';
        if (totalFinalQty === totalSysQty) {
            qtyStatus = 'Match';
            qtyStatusClass = 'bg-green-100 text-green-700';
        } else if (totalFinalQty > totalSysQty) {
            qtyStatus = 'Gain';
            qtyStatusClass = 'bg-orange-100 text-orange-700';
        } else {
            qtyStatus = 'Loss';
            qtyStatusClass = 'bg-red-100 text-red-700';
        }

        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 font-bold text-slate-800">${item.name}</td>
                <td class="px-4 py-3 text-center font-mono text-slate-600">${item.itemId}</td>
                <td class="px-4 py-3 text-center">
                    <span class="px-3 py-1 text-sm font-bold text-white bg-green-600 rounded-full">
                        ${item.matchLocs || 0}
                    </span>
                </td>
                <td class="px-4 py-3 text-center">
                    <span class="px-3 py-1 text-sm font-bold text-white bg-red-600 rounded-full">
                        ${item.missMatchLocs || 0}
                    </span>
                </td>
                <td class="px-4 py-3 text-center font-bold text-slate-800">${totalFinalQty.toLocaleString()}</td>
                <td class="px-4 py-3 text-center font-bold text-slate-800">${totalSysQty.toLocaleString()}</td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2 py-1 text-xs font-bold rounded ${qtyStatusClass}">
                        ${qtyStatus}
                    </span>
                </td>
                <td class="px-4 py-3 text-center">
                    <button onclick="showLocationsModal('${item.itemId}')" 
                            class="px-3 py-1 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">
                        View
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Setup Location Filters
function updateLocationKPIs(filtered) {
    const updateEl = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };

    const totalProducts = filtered.length;
    let totalPhysLocs = 0, totalSysLocs = 0;
    const allPhysLocs = new Set();
    const allSysLocs = new Set();

    filtered.forEach(p => {
        const physSet = new Set((p.physicalDetails || []).map(d => d.location));
        const sysSet = new Set((p.systemDetails || []).map(d => d.location));
        totalPhysLocs += physSet.size;
        totalSysLocs += sysSet.size;
        physSet.forEach(l => allPhysLocs.add(l));
        sysSet.forEach(l => allSysLocs.add(l));
    });

    const uniqueAll = new Set([...allPhysLocs, ...allSysLocs]).size;
    const locMatch = [...allPhysLocs].filter(l => allSysLocs.has(l)).length;
    const locMissMatch = [...allPhysLocs].filter(l => !allSysLocs.has(l)).length + [...allSysLocs].filter(l => !allPhysLocs.has(l)).length;
    const locMatchPct = uniqueAll > 0 ? Math.round((locMatch / uniqueAll) * 100) : 0;
    const locMissMatchPct = uniqueAll > 0 ? Math.round((locMissMatch / uniqueAll) * 100) : 0;

    updateEl('locTotalProducts', `${totalProducts}`);
    updateEl('locTotalLocations', `${uniqueAll}`);
    updateEl('locMatchCount', `${locMatch} <span class="text-base text-slate-400 font-normal">/ ${uniqueAll}</span>`);
    updateEl('locMatchPercent', `<span class="inline-block px-2.5 py-1 text-sm font-bold rounded-full bg-green-100 text-green-700">${locMatchPct}%</span>`);
    updateEl('locMissMatchCount', `${locMissMatch} <span class="text-base text-slate-400 font-normal">/ ${uniqueAll}</span>`);
    updateEl('locMissMatchPercent', `<span class="inline-block px-2.5 py-1 text-sm font-bold rounded-full bg-red-100 text-red-700">${locMissMatchPct}%</span>`);

    // Also update chart
    updateLocationStatusChart({ matchCount: locMatch, missMatchCount: locMissMatch });
}

function setupLocationFilters() {
    const productSearch = document.getElementById('locationProductSearch');
    const idSearch = document.getElementById('locationIdSearch');
    const sortBy = document.getElementById('locationSortBy');
    const statusFilter = document.getElementById('locationStatusFilter');
    const applyBtn = document.getElementById('applyLocationFilters');
    const clearBtn = document.getElementById('clearLocationFilters');
    const categoryFilter = document.getElementById('locationCategoryFilter');
    const exportBtn = document.getElementById('exportLocationTable');
    const dateFromInput = document.getElementById('locationDateFrom');
    const dateToInput = document.getElementById('locationDateTo');

    if (!applyBtn) return;

    // Prevent duplicate listeners on repeated calls
    if (applyBtn._locationFiltersSetup) return;
    applyBtn._locationFiltersSetup = true;

    // Populate Categories dynamically
    function populateCategories() {
        if (!categoryFilter) return;
        const categories = [...new Set(window.locationTableFullData.map(item => item.category).filter(Boolean))].sort();
        const currentVal = categoryFilter.value;
        categoryFilter.innerHTML = '<option value="all">All Categories</option>' +
            categories.map(c => `<option value="${c}" ${c === currentVal ? 'selected' : ''}>${c}</option>`).join('');
    }

    function applyFilters() {
        const productTerm = (productSearch?.value || '').toLowerCase();
        const idTerm = (idSearch?.value || '').toLowerCase();
        const categoryVal = categoryFilter?.value || 'all';
        const statusVal = statusFilter?.value || 'all';
        const sortVal = sortBy?.value || 'matchLocsDesc';
        const dateFromVal = dateFromInput?.value || '';
        const dateToVal = dateToInput?.value || '';

        // Parse date boundaries as YYYY-MM-DD strings for safe comparison
        // (avoids timezone issues with Date objects)

        let filtered = window.locationTableFullData.filter(item => {
            const matchesProduct = !productTerm || (item.name || '').toLowerCase().includes(productTerm);
            const matchesId = !idTerm || (item.itemId || '').toLowerCase().includes(idTerm);
            const matchesCategory = categoryVal === 'all' || item.category === categoryVal;
            const matchesStatus = statusVal === 'all' || (statusVal === 'missmatch' ? item.locationStatus === 'mismatch' : item.locationStatus === statusVal);

            // Date filter: check if any physical detail date falls in range
            let matchesDate = true;
            if (dateFromVal || dateToVal) {
                const details = item.physicalDetails || [];
                if (details.length === 0) {
                    matchesDate = false;
                } else {
                    matchesDate = details.some(d => {
                        if (!d.date) return false;
                        // Extract YYYY-MM-DD from ISO string for safe comparison
                        const dateStr = d.date.substring(0, 10);
                        if (dateFromVal && dateStr < dateFromVal) return false;
                        if (dateToVal && dateStr > dateToVal) return false;
                        return true;
                    });
                }
            }

            return matchesProduct && matchesId && matchesCategory && matchesStatus && matchesDate;
        });

        renderLocationTable(filtered, sortVal);

        // Update KPIs + Chart with filtered data
        updateLocationKPIs(filtered);
    }

    applyBtn.addEventListener('click', applyFilters);

    clearBtn?.addEventListener('click', () => {
        if (productSearch) productSearch.value = '';
        if (idSearch) idSearch.value = '';
        if (categoryFilter) categoryFilter.value = 'all';
        if (statusFilter) statusFilter.value = 'all';
        if (sortBy) sortBy.value = 'matchLocsDesc';
        if (dateFromInput) dateFromInput.value = '';
        if (dateToInput) dateToInput.value = '';
        renderLocationTable(window.locationTableFullData, 'matchLocsDesc');

        // Reset KPIs + Chart
        updateLocationKPIs(window.locationTableFullData);
    });

    // Initial population
    populateCategories();

    // Apply on Enter key
    [productSearch, idSearch].forEach(input => {
        input?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') applyFilters();
        });
    });

    exportBtn?.addEventListener('click', () => {
        console.log('📤 Exporting Location Table...');
        exportLocationData();
    });
}

function updateLocationStatusChart(kpis) {
    const matchCount = kpis.matchCount || 0;
    const missMatchCount = kpis.missMatchCount || 0;

    const distCanvas = document.getElementById('statusDistChart');
    if (!distCanvas) return;
    const distCtx = distCanvas.getContext('2d');
    if (auditCharts.distribution) auditCharts.distribution.destroy();
    auditCharts.distribution = new Chart(distCtx, {
        type: 'doughnut',
        data: {
            labels: ['Match', 'Miss Match'],
            datasets: [{
                data: [matchCount, missMatchCount],
                backgroundColor: ['#10b981', '#f59e0b'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: { legend: { position: 'bottom' } }
        }
    });
}
window.updateLocationStatusChart = updateLocationStatusChart;

function exportLocationData() {
    if (!window.locationTableFullData || window.locationTableFullData.length === 0) {
        alert("No data available to export.");
        return;
    }

    console.log('Exporting Location Comparison Report...');

    let csvContent = "\uFEFF"; // BOM for Excel UTF-8

    const headers = [
        "Product Name",
        "Item ID",
        "Category",
        "Physical Locations",
        "System Locations",
        "Loc Status",
        "Total FinalQTY",
        "Total Sys QTY",
        "QTY Variance",
        "QTY Status"
    ];
    csvContent += headers.join(",") + "\n";

    window.locationTableFullData.forEach(item => {
        const totalFinalQty = (item.physicalDetails || []).reduce((sum, d) => sum + (parseFloat(d.finalQty) || 0), 0);
        const totalSysQty = (item.systemDetails || []).reduce((sum, d) => sum + (parseFloat(d.quantity) || 0), 0);
        const qtyVariance = totalFinalQty - totalSysQty;
        let qtyStatus = totalFinalQty === totalSysQty ? 'Match' : totalFinalQty > totalSysQty ? 'Gain' : 'Loss';
        const locStatus = item.locationStatus === 'match' ? 'Match' : 'Miss Match';

        const rowData = [
            `"${String(item.name || '').replace(/"/g, '""')}"`,
            `"${String(item.itemId || '').replace(/"/g, '""')}"`,
            `"${String(item.category || 'Other').replace(/"/g, '""')}"`,
            item.physicalLocations || 0,
            item.systemLocations || 0,
            `"${locStatus}"`,
            totalFinalQty,
            totalSysQty,
            qtyVariance,
            `"${qtyStatus}"`
        ];
        csvContent += rowData.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Location_Comparison_Report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
window.exportLocationData = exportLocationData;

// ═══════════════════════════════════════════════════════════════
// ── Scans Detail Table (raw rows from Scans sheet) ──
// ═══════════════════════════════════════════════════════════════
window.scansFullData = [];
window.scansFilteredData = [];

async function fetchScansRawData() {
    try {
        const userInfo = JSON.parse(localStorage.getItem('userInfo'));
        const res = await fetch('/api/inventory/scans-raw', {
            headers: { 'Authorization': `Bearer ${userInfo?.token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch scans data');
        const data = await res.json();
        window.scansFullData = data.rows || [];
        window.scansFilteredData = [...window.scansFullData];
        populateScansCategoryFilter();
        renderScansDetailTable(window.scansFilteredData);
        setupScansFilters();
    } catch (err) {
        console.error('[ScansTable]', err);
    }
}

function populateScansCategoryFilter() {
    const sel = document.getElementById('scansCategoryFilter');
    if (!sel) return;
    const cats = [...new Set(window.scansFullData.map(r => r.category || 'Other'))].sort();
    sel.innerHTML = '<option value="all">All Categories</option>' +
        cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderScansDetailTable(rows) {
    const tbody = document.getElementById('scansDetailTableBody');
    const empty = document.getElementById('scansDetailEmpty');
    const countEl = document.getElementById('scansRowCount');
    if (!tbody) return;

    if (countEl) countEl.textContent = `(${rows.length} rows)`;

    if (rows.length === 0) {
        tbody.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    // Limit render to 500 for performance
    const display = rows.slice(0, 500);

    tbody.innerHTML = display.map(r => {
        const varClass = r.finalVar > 0 ? 'text-green-600' : r.finalVar < 0 ? 'text-red-600' : 'text-slate-500';
        const varPrefix = r.finalVar > 0 ? '+' : '';
        const locBadge = r.locStatus.toLowerCase().includes('match') && !r.locStatus.toLowerCase().includes('miss')
            ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">Match</span>'
            : '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">' + escHtml(r.locStatus) + '</span>';

        const prodBadge = r.prodStatus.toLowerCase().includes('match') && !r.prodStatus.toLowerCase().includes('miss')
            ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">Match</span>'
            : r.prodStatus === 'N/A'
            ? '<span class="text-xs text-slate-400">N/A</span>'
            : '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">' + escHtml(r.prodStatus) + '</span>';

        const empBadge = r.empAccuracy.toLowerCase().includes('accurate') || r.empAccuracy.toLowerCase().includes('match')
            ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">' + escHtml(r.empAccuracy) + '</span>'
            : r.empAccuracy === 'N/A'
            ? '<span class="text-xs text-slate-400">N/A</span>'
            : '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">' + escHtml(r.empAccuracy) + '</span>';

        return `<tr class="hover:bg-slate-50 transition-colors">
            <td class="px-3 py-2 text-left font-mono text-xs">${escHtml(r.location)}</td>
            <td class="px-3 py-2 text-left font-mono text-xs">${escHtml(r.barcode)}</td>
            <td class="px-3 py-2 text-center font-mono text-xs text-blue-600">${escHtml(r.itemId)}</td>
            <td class="px-3 py-2 text-left text-xs font-medium">${escHtml(r.productName)}</td>
            <td class="px-3 py-2 text-center text-xs">${r.prodDate}</td>
            <td class="px-3 py-2 text-center text-xs">${r.expDate}</td>
            <td class="px-3 py-2 text-center font-bold">${r.finalQty}</td>
            <td class="px-3 py-2 text-center">${r.sysQty}</td>
            <td class="px-3 py-2 text-center font-bold ${varClass}">${varPrefix}${r.finalVar}</td>
            <td class="px-3 py-2 text-center">${locBadge}</td>
            <td class="px-3 py-2 text-center">${prodBadge}</td>
            <td class="px-3 py-2 text-left text-xs">${escHtml(r.userName)}</td>
            <td class="px-3 py-2 text-center">${empBadge}</td>
            <td class="px-3 py-2 text-center text-xs">${escHtml(r.live)}</td>
            <td class="px-3 py-2 text-center text-xs">${escHtml(r.liveWait)}</td>
        </tr>`;
    }).join('');

    if (rows.length > 500) {
        tbody.innerHTML += `<tr><td colspan="15" class="text-center text-xs text-slate-400 py-3">Showing first 500 of ${rows.length} rows. Use filters to narrow results.</td></tr>`;
    }
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setupScansFilters() {
    const applyBtn = document.getElementById('applyScansFilters');
    const clearBtn = document.getElementById('clearScansFilters');
    const exportBtn = document.getElementById('exportScansTable');
    if (!applyBtn || applyBtn._scansFiltersSetup) return;
    applyBtn._scansFiltersSetup = true;

    applyBtn.addEventListener('click', () => {
        const search = (document.getElementById('scansSearch')?.value || '').trim().toLowerCase();
        const category = document.getElementById('scansCategoryFilter')?.value || 'all';
        const dateFrom = document.getElementById('scansDateFrom')?.value || '';
        const dateTo = document.getElementById('scansDateTo')?.value || '';

        let filtered = window.scansFullData;

        if (search) {
            filtered = filtered.filter(r =>
                (r.productName || '').toLowerCase().includes(search) ||
                (r.location || '').toLowerCase().includes(search) ||
                (r.itemId || '').toLowerCase().includes(search) ||
                (r.barcode || '').toLowerCase().includes(search)
            );
        }
        if (category !== 'all') {
            filtered = filtered.filter(r => r.category === category);
        }
        if (dateFrom) {
            filtered = filtered.filter(r => r.date && r.date >= dateFrom);
        }
        if (dateTo) {
            filtered = filtered.filter(r => r.date && r.date <= dateTo);
        }

        window.scansFilteredData = filtered;
        renderScansDetailTable(filtered);
    });

    clearBtn?.addEventListener('click', () => {
        const searchEl = document.getElementById('scansSearch');
        const catEl = document.getElementById('scansCategoryFilter');
        const fromEl = document.getElementById('scansDateFrom');
        const toEl = document.getElementById('scansDateTo');
        if (searchEl) searchEl.value = '';
        if (catEl) catEl.value = 'all';
        if (fromEl) fromEl.value = '';
        if (toEl) toEl.value = '';
        window.scansFilteredData = [...window.scansFullData];
        renderScansDetailTable(window.scansFilteredData);
    });

    exportBtn?.addEventListener('click', () => exportScansCSV());
}

function exportScansCSV() {
    const data = window.scansFilteredData;
    if (!data || data.length === 0) { alert('No data to export'); return; }

    let csv = "\uFEFF";
    const headers = ['Location','Barcode','Item ID','Product Name','Category','Prod. Date','Exp. Date','Final QTY','Sys QTY','Final Var','Loc. Status','Prod. Status','User Name','Employee Accuracy','Live','Live Wait','Date'];
    csv += headers.join(',') + '\n';

    data.forEach(r => {
        const row = [
            `"${String(r.location||'').replace(/"/g,'""')}"`,
            `"${String(r.barcode||'').replace(/"/g,'""')}"`,
            `"${String(r.itemId||'').replace(/"/g,'""')}"`,
            `"${String(r.productName||'').replace(/"/g,'""')}"`,
            `"${String(r.category||'').replace(/"/g,'""')}"`,
            `"${r.prodDate}"`,
            `"${r.expDate}"`,
            r.finalQty,
            r.sysQty,
            r.finalVar,
            `"${String(r.locStatus||'').replace(/"/g,'""')}"`,
            `"${String(r.prodStatus||'').replace(/"/g,'""')}"`,
            `"${String(r.userName||'').replace(/"/g,'""')}"`,
            `"${String(r.empAccuracy||'').replace(/"/g,'""')}"`,
            `"${String(r.live||'').replace(/"/g,'""')}"`,
            `"${String(r.liveWait||'').replace(/"/g,'""')}"`,
            `"${r.date}"`
        ];
        csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Scans_Detail_${new Date().toISOString().split('T')[0]}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function renderGhostTable(items) {
    const ghostTable = document.getElementById('ghostTable');
    if (!ghostTable) return;

    const countDisplay = document.getElementById('ghostResultCount');
    if (countDisplay) countDisplay.innerText = `Showing ${items.length} rows`;

    // Always sort by Found Qty Descending
    const sorted = [...items].sort((a, b) => (parseFloat(b.finalQty) || 0) - (parseFloat(a.finalQty) || 0));

    if (sorted.length === 0) {
        ghostTable.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-slate-400">No matching items found.</td></tr>';
    } else {
        // Limit to 200 for performance
        ghostTable.innerHTML = sorted.slice(0, 200).map(item => `
            <tr class="hover:bg-purple-50 transition-colors">
                <td class="px-6 py-4 font-medium text-slate-700">${item.location || 'Unknown'}</td>
                <td class="px-6 py-4">
                    <p class="font-semibold text-slate-800">${item.product}</p>
                    <p class="text-xs text-slate-400 font-mono">${item.productId}</p>
                </td>
                <td class="px-6 py-4 text-right text-slate-400 font-mono">0</td>
                <td class="px-6 py-4 text-right font-bold text-purple-700">+${item.finalQty || item.physicalQty}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="window.openLocationFilter('${item.location}')" class="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-2 py-1 rounded shadow-sm">
                        Inspect Loc.
                    </button>
                </td>
            </tr>
        `).join('');
    }
}

function applyGhostFilters() {
    if (!window.fullGhostItems) return;

    const categoryInput = document.getElementById('ghostCategoryFilter');
    const dateFromInput = document.getElementById('ghostDateFrom');
    const dateToInput = document.getElementById('ghostDateTo');

    const categoryVal = categoryInput?.value || 'all';
    const dateFromVal = dateFromInput?.value || '';
    const dateToVal = dateToInput?.value || '';

    const hasDateFilter = dateFromVal || dateToVal;
    const startDate = parseInputDate(dateFromVal, false) || new Date(1900, 0, 1);
    const endDate = parseInputDate(dateToVal, true) || new Date(2099, 11, 31);

    const filtered = window.fullGhostItems.filter(item => {
        // Category filter
        const matchesCategory = categoryVal === 'all' || item.category === categoryVal;

        // Date filter
        let matchesDate = true;
        if (hasDateFilter) {
            const recordDate = parseFlexDate(item.dateNow || item.date);
            matchesDate = recordDate && recordDate >= startDate && recordDate <= endDate;
        }

        return matchesCategory && matchesDate;
    });

    // Save for export
    window.ghostItemsData = filtered;
    renderGhostTable(filtered);
}

function clearGhostFilters() {
    const categoryInput = document.getElementById('ghostCategoryFilter');
    const dateFromInput = document.getElementById('ghostDateFrom');
    const dateToInput = document.getElementById('ghostDateTo');

    if (categoryInput) categoryInput.value = 'all';
    if (dateFromInput) dateFromInput.value = '';
    if (dateToInput) dateToInput.value = '';

    window.applyGhostFilters();
}

window.applyGhostFilters = applyGhostFilters;
window.clearGhostFilters = clearGhostFilters;

function exportGhostData() {

    let csvContent = "\uFEFF"; // BOM for Excel UTF-8
    const headers = ["Location", "Product Name", "Product ID", "System Qty", "Found Qty"];
    csvContent += headers.join(",") + "\n";

    ghostItems.forEach(item => {
        const rowData = [
            `"${String(item.location || 'Unknown').replace(/"/g, '""')}"`,
            `"${String(item.product || '').replace(/"/g, '""')}"`,
            `"${String(item.productId || '').replace(/"/g, '""')}"`,
            0,
            parseFloat(item.finalQty || item.physicalQty || 0) || 0
        ];
        csvContent += rowData.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Discrepancy_Locations_Putaway_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
window.exportGhostData = exportGhostData;

// Staff Table
function renderStaffTable(staffData, prodData = {}) {
    const staffTbody = document.getElementById('staffTable');
    if (!staffTbody) {
        console.error('[Staff] staffTable element not found');
        return;
    }

    console.log('[Staff] Rendering staff table with', Object.keys(staffData).length, 'entries');

    staffTbody.innerHTML = Object.entries(staffData)
        .sort((a, b) => b[1].total - a[1].total)
        .filter(([name]) => name !== 'System')
        .map(([name, s]) => {
            const p = prodData[name] || { avgPerHour: '0.0', avgPerDay: '0.0' };
            return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 font-bold text-slate-800">${name}</td>
                <td class="px-6 py-4 text-center font-medium">${s.total}</td>
                <td class="px-6 py-4 text-center text-green-600 font-bold">${s.match}</td>
                <td class="px-6 py-4 text-center text-red-600 font-bold">${s.humanError || 0}</td>
                <td class="px-6 py-4">
                    <div class="flex items-center">
                        <span class="font-bold mr-2 ${s.accuracy > 95 ? 'text-green-600' : s.accuracy > 85 ? 'text-blue-600' : 'text-orange-600'}">
                            ${s.accuracy.toFixed(1)}%
                        </span>
                        <div class="flex-1 bg-slate-100 h-1.5 rounded-full min-w-[60px]">
                            <div class="h-1.5 rounded-full ${s.accuracy > 95 ? 'bg-green-500' : s.accuracy > 85 ? 'bg-blue-500' : 'bg-orange-500'}" style="width: ${s.accuracy}%"></div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
        }).join('');

    const sys = staffData['System'];
    if (sys) {
        staffTbody.innerHTML += `
            <tr class="bg-slate-50 opacity-75">
                <td class="px-6 py-4 italic text-slate-500">System / Unassigned</td>
                <td class="px-6 py-4 text-center font-medium">${sys.total}</td>
                <td class="px-6 py-4 text-center text-green-600 font-bold">${sys.match}</td>
                <td class="px-6 py-4 text-center text-red-600 font-bold">${sys.humanError || 0}</td>
                <td class="px-6 py-4 text-slate-400">N/A</td>
            </tr>
        `;
    }

    // Staff Chart
    renderStaffChart(staffData);
}

function renderStaffChart(staffData) {
    const canvas = document.getElementById('staffProductivityChart');
    if (!canvas) {
        console.error('Staff chart canvas not found');
        return;
    }

    const ctx = canvas.getContext('2d');

    // Destroy old chart
    if (staffProductivityChart) {
        staffProductivityChart.destroy();
    }

    // Sort data by total items (descending)
    const sortedData = Object.entries(staffData)
        .filter(([name]) => name !== 'System')
        .sort((a, b) => b[1].total - a[1].total);

    const labels = sortedData.map(([name]) => name);
    const totalItems = sortedData.map(([_, s]) => s.total);
    const matchedItems = sortedData.map(([_, s]) => s.match);
    const errorItems = sortedData.map(([_, s]) => s.humanError || 0);
    const accuracyData = sortedData.map(([_, s]) => s.accuracy);

    staffProductivityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Total Items',
                    data: totalItems,
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 2
                },
                {
                    label: 'Matched',
                    data: matchedItems,
                    backgroundColor: 'rgba(34, 197, 94, 0.7)',
                    borderColor: 'rgba(34, 197, 94, 1)',
                    borderWidth: 2
                },
                {
                    label: 'Human Error',
                    data: errorItems,
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: { size: 14, weight: 'bold' },
                        padding: 20
                    }
                },
                title: {
                    display: true,
                    text: 'Items Audited per Staff Member',
                    font: { size: 16, weight: 'bold' },
                    padding: { bottom: 25 }
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function (context) {
                            const dataIndex = context.dataIndex;
                            const accuracy = accuracyData[dataIndex];
                            return `Accuracy: ${accuracy.toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Items',
                        font: { size: 14, weight: 'bold' }
                    },
                    ticks: {
                        precision: 0,
                        font: { size: 12 }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Staff Members',
                        font: { size: 14, weight: 'bold' }
                    },
                    ticks: {
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

function filterStaffByDate() {
    const dateFrom = document.getElementById('staffDateFrom')?.value;
    const dateTo = document.getElementById('staffDateTo')?.value;

    if (!window.discrepanciesFullData || window.discrepanciesFullData.length === 0) {
        console.warn('No discrepancy data available for staff filtering.');
        return;
    }

    // If no date selected in the LOCAL staff inputs
    if (!dateFrom && !dateTo) {
        console.log('[Staff] No local dates selected, rendering full data');
        renderStaffTable(window.staffFullData, window.staffProdMetrics || {});
        return;
    }

    const startDate = parseInputDate(dateFrom, false) || new Date(1900, 0, 1, 0, 0, 0);
    const endDate = parseInputDate(dateTo, true) || new Date(2099, 11, 31, 23, 59, 59);

    // Filter discrepancies by date
    const filteredDiscrepancies = window.discrepanciesFullData.filter(d => {
        const dateStr = d.dateNow || d.date || d.inventoryDate || '';
        const recordDate = parseFlexDate(dateStr);
        if (!recordDate || isNaN(recordDate.getTime())) return false;
        return recordDate >= startDate && recordDate <= endDate;
    });

    if (filteredDiscrepancies.length === 0) {
        alert('No records found for selected date range');
        return;
    }

    // Re-calculate staffData from filtered data
    const filteredStaffData = {};
    const filteredStaffProd = {}; // { userName: { totalQty: 0, hours: Set, days: Set } }

    filteredDiscrepancies.forEach((d, index) => {
        const staffName = d.staffName || 'System';
        if (!filteredStaffData[staffName]) {
            filteredStaffData[staffName] = { total: 0, match: 0, gain: 0, loss: 0, accuracy: 0, humanError: 0 };
        }
        if (!filteredStaffProd[staffName]) {
            filteredStaffProd[staffName] = {
                totalQty: 0,
                totalItems: 0,
                hours: new Set(),
                days: new Set(),
                itemsByHour: new Map(),
                itemsByDay: new Map()
            };
        }

        filteredStaffData[staffName].total++;
        const item = d.productId || d.barcode || `row-${index}`;

        // Date/Hour for productivity
        const dateStr = d.dateNow || d.date || '';
        const recordDate = parseFlexDate(dateStr);
        if (recordDate) {
            const dKey = `${recordDate.getMonth() + 1}/${recordDate.getDate()}/${recordDate.getFullYear()}`;
            const hKey = recordDate.getHours();
            const hrSlotKey = `${dKey}|${hKey}`;

            if (!filteredStaffProd[staffName].itemsByHour.has(hrSlotKey)) {
                filteredStaffProd[staffName].itemsByHour.set(hrSlotKey, new Set());
            }
            if (!filteredStaffProd[staffName].itemsByDay.has(dKey)) {
                filteredStaffProd[staffName].itemsByDay.set(dKey, new Set());
            }

            filteredStaffProd[staffName].itemsByHour.get(hrSlotKey).add(item);
            filteredStaffProd[staffName].itemsByDay.get(dKey).add(item);
        }

        // Use the pre-calculated evaluation status from the backend if available, 
        // fallback to localized logic if it's missing (for safety during transition)
        let staffStatus = d.staffEvaluation || 'unknown';

        if (staffStatus === 'unknown') {
            // Re-calculate if backend didn't provide it (e.g. older data or cached response)
            const empStatusStr = d.employeeStatus || d.employeeAccuracy || '';
            const empAccuracyRaw = String(empStatusStr).toLowerCase().trim();
            const systemQty = parseFloat(d.systemQty) || 0;
            const physicalQty = parseFloat(d.finalQty || d.physicalQty) || 0;
            const prodStatusRaw = String(d.productStatus || '').toLowerCase();

            let normalizedStatus = 'unknown';
            if (prodStatusRaw.includes('match') || prodStatusRaw.includes('مطابق') || prodStatusRaw === 'ok') {
                normalizedStatus = 'match';
            } else if (prodStatusRaw.includes('extra') || prodStatusRaw.includes('gain') || prodStatusRaw.includes('زيادة') || prodStatusRaw === '+') {
                normalizedStatus = 'gain';
            } else if (prodStatusRaw.includes('miss') || prodStatusRaw.includes('loss') || prodStatusRaw.includes('ناقص') || prodStatusRaw === '-') {
                normalizedStatus = 'loss';
            } else {
                if (systemQty === physicalQty) normalizedStatus = 'match';
                else if (physicalQty > systemQty) normalizedStatus = 'gain';
                else if (physicalQty < systemQty) normalizedStatus = 'loss';
            }

            staffStatus = normalizedStatus;
            if (empAccuracyRaw !== '' && empAccuracyRaw !== 'n/a') {
                const isExplicitMatch = empAccuracyRaw.includes('match') || empAccuracyRaw.includes('مطابق') || empAccuracyRaw.includes('100') || empAccuracyRaw === 'ok';
                if (isExplicitMatch) staffStatus = 'match';
                else staffStatus = 'error';
            }
        }

        if (staffStatus === 'match') {
            filteredStaffData[staffName].match++;
        } else if (staffStatus === 'error') {
            filteredStaffData[staffName].humanError++;
        } else if (staffStatus === 'gain') {
            filteredStaffData[staffName].gain++;
        } else if (staffStatus === 'loss') {
            filteredStaffData[staffName].loss++;
        }
    });

    const combinedProdMetrics = {};
    // Calculate accuracy and productivity
    Object.keys(filteredStaffData).forEach(name => {
        const s = filteredStaffData[name];
        s.accuracy = s.total > 0 ? (s.match / s.total) * 100 : 0;

        const p = filteredStaffProd[name];
        if (p) {
            let hourSum = 0;
            p.itemsByHour.forEach(set => hourSum += set.size);

            let daySum = 0;
            p.itemsByDay.forEach(set => daySum += set.size);

            combinedProdMetrics[name] = {
                avgPerHour: p.itemsByHour.size > 0 ? (hourSum / p.itemsByHour.size).toFixed(1) : '0.0',
                avgPerDay: p.itemsByDay.size > 0 ? (daySum / p.itemsByDay.size).toFixed(1) : '0.0'
            };
        }
    });

    console.log('Filtered staff:', Object.keys(filteredStaffData));
    renderStaffTable(filteredStaffData, combinedProdMetrics);
}

function clearStaffDateFilter() {
    const fromEl = document.getElementById('staffDateFrom');
    const toEl = document.getElementById('staffDateTo');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
    renderStaffTable(window.staffFullData, window.staffProdMetrics || {});
}

// Expose function to global scope
// Exposure restored
window.clearStaffDateFilter = clearStaffDateFilter;

// Expose ALL functions to global scope (for HTML onclick handlers)
console.log('📦 Exposing functions to window object...');
window.switchTab = switchTab;
window.fetchData = fetchData;
window.clearFilters = clearFilters;
window.fetchSmartAnalysis = fetchSmartAnalysis;
window.showTrend = showTrend;
window.openHistory = openHistory;
window.closeHistory = closeHistory;
window.openLocationsModal = openLocationsModal;
window.closeLocationsModal = closeLocationsModal;
window.showLocationsModal = showLocationsModal;
window.filterStaffByDate = filterStaffByDate;
window.exportPutawayExcel = exportPutawayExcel;
console.log('✅ All functions exposed:', {
    showView: typeof window.showView,
    fetchData: typeof window.fetchData,
    fetchSmartAnalysis: typeof window.fetchSmartAnalysis
});


function renderHourlyProductivityTable(groupedData) {
    const tableBody = document.getElementById('productivityTable');
    const statsDiv = document.getElementById('productivityStats');

    if (!tableBody) {
        console.warn('productivityTable element not found');
        return;
    }

    if (!groupedData || groupedData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-slate-500">No hourly data available.</td></tr>';
        if (statsDiv) statsDiv.innerText = '0 Entries';
        return;
    }

    // Update stats
    if (statsDiv) {
        const totalQty = groupedData.reduce((acc, curr) => acc + (curr.totalQuantity || 0), 0);
        statsDiv.innerText = `${groupedData.length} Entries | Total Qty: ${totalQty.toLocaleString()}`;
    }

    // Generate Rows
    let rowsHTML = '';
    groupedData.forEach(row => {
        // row structure: { employee, date, hour, totalQuantity, uniqueProducts, uniqueLocations }
        const h = parseInt(row.hour);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 || 12;
        const timeStr = `${displayH} ${ampm}`;

        rowsHTML += `
            <tr class="hover:bg-slate-50 border-b border-slate-50">
                <td class="px-6 py-3 font-medium text-slate-800">${row.employee}</td>
                <td class="px-6 py-3 text-slate-600">${row.date}</td>
                <td class="px-6 py-3 text-slate-600">
                    <span class="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold">${timeStr}</span>
                </td>
                <td class="px-6 py-3 text-right font-bold text-blue-600">
                    ${row.uniqueLocations || 0}
                </td>
                <td class="px-6 py-3 text-right">
                    <span class="font-bold text-purple-700">${(row.totalQuantity || 0).toLocaleString()}</span>
                </td>
                <td class="px-6 py-3 text-right">
                    <span class="font-bold text-green-700">${(row.uniqueProducts || 0).toLocaleString()}</span>
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = rowsHTML;
}

// Initialize dashboard on page load
window.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 Dashboard Initialized - DOMContentLoaded fired');
    console.log('📋 Elements check:', {
        lastUpdate: !!document.getElementById('lastUpdate'),
        searchInput: !!document.getElementById('searchInput'),
        inventoryTable: !!document.getElementById('inventoryTable')
    });
    // Load inventory data by default on page load
    fetchData();
});
