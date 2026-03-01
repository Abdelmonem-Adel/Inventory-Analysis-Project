/**
 * Smart Inventory Analysis Engine
 * Processes inventory audit data to generate insights, KPIs, and alerts.
 */

export function analyzeInventory(data) {
    if (!data || data.length === 0) return null;

    const analysis = {
        locationReport: {},
        productReport: {},
        staffReport: {},
        discrepancies: [],
        kpis: {
            overallAccuracy: 0,
            totalMatched: 0,
            totalGain: 0,
            totalLoss: 0,
            totalRows: 0,
            totalDistinctProducts: 0, // Added for dual-level logic
            physicalQtyMatched: 0,
            physicalQtyGain: 0,
            physicalQtyLoss: 0,
            physicalQtyTotal: 0,
            // Total System Qty
            systemQtyTotal: 0,
            // Percentages
            matchedPercentage: 0,
            gainPercentage: 0,
            lossPercentage: 0,
            trends: {
                daily: {},
                weekly: {}
            }
        },
        expiryAnalysis: {
            expired: [],
            expiring7Days: [],
            expiring30Days: [],
            alerts: []
        },
        insights: [],
        alerts: [],
        chartData: {
            locationAccuracy: { labels: [], datasets: [] },
            statusDistribution: { labels: ['Matched', 'Gain', 'Loss'], datasets: [] },
            expirySeverity: { labels: ['Critical (Expired)', 'Warning (7d)', 'Info (30d)'], datasets: [] }
        }
    };

    const now = new Date();
    const mid7Days = new Date();
    mid7Days.setDate(now.getDate() + 7);
    const mid30Days = new Date();
    mid30Days.setDate(now.getDate() + 30);

    data.forEach(row => {
        // Normalize keys once
        const rowKeys = Object.keys(row).map(k => ({
            original: k,
            normalized: k.toLowerCase().replace(/[^a-z0-9]/gi, '')
        }));

        const findVal = (possibleKeys) => {
            for (const pKey of possibleKeys) {
                const match = rowKeys.find(rk => rk.normalized === pKey);
                if (match) return row[match.original];
            }
            return null;
        };

        // Map to actual locations acu column names - prioritize "Location" column
        const location = findVal(['location', 'productlocation', 'warehouse', 'store', 'loc', 'aisle', 'bin', 'branch', 'site', 'wh']) || row._sheetName || 'Unknown';
        const productName = findVal(['productname', 'name', 'item', 'product', 'description', 'desc']);
        let productId = findVal(['itemid', 'productid', 'sku', 'barcode', 'productcode', 'code', 'id', 'breadfastid', 'ean']);
        if (productId) productId = String(productId).trim().toLowerCase();

        const category = findVal(['category', 'group', 'class', 'family', 'dept', 'department']) || 'General';
        let staffName = findVal(['username']) || findVal(['user', 'agent', 'staff', 'worker', 'doneby', 'checkedby', 'counter', 'auditor', 'employee', 'namecountedby', 'ceraited', 'ceraitedby']) || 'System';
        staffName = staffName.trim();

        // If it's an email, extract the name part before @
        if (staffName.includes('@')) {
            staffName = staffName.split('@')[0].replace(/[._-]/g, ' ').trim();
        }

        // Capitalize first letters
        // Capitalize first letters and handle multiple spaces
        staffName = staffName.split(/\s+/).filter(Boolean).map(word =>
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');

        if (!staffName || staffName.toLowerCase() === 'null' || staffName === '0' || staffName === '') {
            staffName = 'System';
        }


        const systemQty = parseFloat(findVal(['sysqty', 'systemqty', 'stockqty', 'logicalqty', 'bookqty', 'logicqty', 'expected', 'expectedqty', 'system'])) || 0;
        const physicalQty = parseFloat(findVal(['finalqty', 'physicalqty', 'physqty', 'countqty', 'actualqty', 'quantity', 'qty', 'count', 'num', 'actual', 'physical', 'counted'])) || 0;
        const status = String(findVal(['productstatus', 'status', 'matchstatus', 'discrepancy', 'match/extra/missingstatus', 'inventorystatus', 'notes', 'result', 'auditresult', 'finalstatus', 'adjustment', 'variance', 'audit', 'finalvar', 'firstvar', 'lotatus', 'locationstatus']) || '').toLowerCase();
        const expiryDateStr = findVal(['expirationdate']);
        const inventoryDateStr = findVal(['date', 'inventorydate', 'datenow', 'invdate', 'countdate', 'datecounted', 'timestamp', 'productiondate']);

        // Skip rows that don't look like audit records or have junk IDs
        const junkValues = ['0', '(blank)', 'null', 'undefined', '-', 'nan', 'n/a', ''];
        if (!productId || junkValues.includes(productId) || (!status && isNaN(systemQty) && isNaN(physicalQty))) return;

        // 1. Normalize Status for KPIs
        const productStatusRaw = String(findVal(['productstatus', 'status', 'matchstatus', 'discrepancy']) || '').toLowerCase();
        const empAccuracyRaw = String(findVal(['employeeaccuracy', 'employeestatus', 'staffstatus', 'staffaccuracy', 'workeraccuracy']) || '').toLowerCase().trim();

        let normalizedStatus = 'unknown';

        // KPI Status Logic (Global KPIs still use these)
        if (productStatusRaw.includes('match') || productStatusRaw.includes('مطابق') || productStatusRaw === 'ok') {
            normalizedStatus = 'match';
        } else if (productStatusRaw.includes('extra') || productStatusRaw.includes('gain') || productStatusRaw.includes('زيادة') || productStatusRaw === '+') {
            normalizedStatus = 'gain';
        } else if (productStatusRaw.includes('miss') || productStatusRaw.includes('loss') || productStatusRaw.includes('ناقص') || productStatusRaw === '-') {
            normalizedStatus = 'loss';
        } else {
            // Fallback to quantity comparison if Product Status is empty
            if (systemQty === physicalQty) normalizedStatus = 'match';
            else if (physicalQty > systemQty) normalizedStatus = 'gain';
            else if (physicalQty < systemQty) normalizedStatus = 'loss';
        }

        // Staff Analysis Status (Based on Employee Accuracy column, fallback to normalizedStatus)
        let staffStatus = normalizedStatus; // Default to normalizedStatus
        if (empAccuracyRaw !== '') {
            const isExplicitMatch = empAccuracyRaw.includes('match') || empAccuracyRaw.includes('مطابق') || empAccuracyRaw.includes('100') || empAccuracyRaw === 'ok';
            if (isExplicitMatch) {
                staffStatus = 'match';
            } else {
                // Anything written in the column that is NOT a match is a Human Error
                staffStatus = 'error';
            }
        }

        // 2. Location Analysis
        if (!analysis.locationReport[location]) {
            analysis.locationReport[location] = {
                totalItems: 0,
                matched: 0,
                gain: 0,
                loss: 0,
                accuracy: 0,
                riskScore: 0,
                locationStatuses: []
            };
        }
        const loc = analysis.locationReport[location];

        // Capture location status from the row
        const locationStatus = findVal(['locatonstatus', 'locationstatus', 'locstatus', 'locaton status', 'location status']);
        if (locationStatus) {
            loc.locationStatuses.push(locationStatus);
        }

        loc.totalItems++;
        if (normalizedStatus === 'match') loc.matched++;
        else if (normalizedStatus === 'gain') loc.gain++;
        else if (normalizedStatus === 'loss') loc.loss++;

        // 3. Product Analysis - Use composite key to treat different names with same ID as separate items
        const productNameNormalized = (productName || '').trim().toLowerCase();
        const productKey = `${productId}|${productNameNormalized}`;

        if (!analysis.productReport[productKey]) {
            analysis.productReport[productKey] = {
                name: productName || productId,
                itemId: productId || 'N/A',
                totalAudits: 0,
                locations: [],
                issues: { match: 0, gain: 0, loss: 0 },
                issueFrequency: 0
            };
        }
        const prod = analysis.productReport[productKey];
        prod.totalAudits++;
        prod.issues[normalizedStatus]++;
        prod.issueFrequency = ((prod.issues.gain + prod.issues.loss) / prod.totalAudits) * 100;

        // Track locations for each product
        if (!prod.locations.includes(location)) {
            prod.locations.push(location);
        }

        // track duplicates for expiry
        if (!analysis.expiryProductKeys) {
            analysis.expiryProductKeys = new Set();
        }

        // 4. Expiry Analysis
        if (expiryDateStr && !analysis.expiryProductKeys.has(productKey)) {
            const expDate = parseFlexDate(expiryDateStr);
            if (expDate && !isNaN(expDate.getTime())) {
                analysis.expiryProductKeys.add(productKey);
                // Keep only the numeric date part for stable sorting or comparison later if needed
                let parsedInvDateStr = 'N/A';
                const parsedInvDate = parseFlexDate(inventoryDateStr);
                if (parsedInvDate && !isNaN(parsedInvDate.getTime())) {
                    parsedInvDateStr = parsedInvDate.toISOString();
                }

                const item = {
                    productId,
                    productName: prod.name,
                    location,
                    expiryDate: expDate.toISOString(),
                    inventoryDate: parsedInvDateStr
                };
                if (expDate < now) {
                    analysis.expiryAnalysis.expired.push(item);
                } else if (expDate <= mid7Days) {
                    analysis.expiryAnalysis.expiring7Days.push(item);
                } else if (expDate <= mid30Days) {
                    analysis.expiryAnalysis.expiring30Days.push(item);
                }
            }
        }

        // 5. Global Trends
        if (inventoryDateStr) {
            const invDate = parseFlexDate(inventoryDateStr);
            if (invDate && !isNaN(invDate.getTime())) {
                const dayKey = invDate.toISOString().split('T')[0];
                const weekKey = getWeekNumber(invDate);

                if (!analysis.kpis.trends.daily[dayKey]) analysis.kpis.trends.daily[dayKey] = { total: 0, matched: 0 };
                analysis.kpis.trends.daily[dayKey].total++;
                if (normalizedStatus === 'match') analysis.kpis.trends.daily[dayKey].matched++;

                if (!analysis.kpis.trends.weekly[weekKey]) analysis.kpis.trends.weekly[weekKey] = { total: 0, matched: 0 };
                analysis.kpis.trends.weekly[weekKey].total++;
                if (normalizedStatus === 'match') analysis.kpis.trends.weekly[weekKey].matched++;
            }
        }

        // Global Totals
        analysis.kpis.totalRows++;
        analysis.kpis.physicalQtyTotal += physicalQty;
        analysis.kpis.systemQtyTotal += systemQty;

        if (normalizedStatus === 'match') {
            analysis.kpis.totalMatched++;
            analysis.kpis.physicalQtyMatched += physicalQty;
        } else if (normalizedStatus === 'gain') {
            analysis.kpis.totalGain++;
            analysis.kpis.physicalQtyGain += physicalQty;
        } else if (normalizedStatus === 'loss') {
            analysis.kpis.totalLoss++;
            analysis.kpis.physicalQtyLoss += physicalQty;
        }

        // 6. Staff Performance Tracking
        if (!analysis.staffReport[staffName]) {
            analysis.staffReport[staffName] = { total: 0, match: 0, gain: 0, loss: 0, accuracy: 0, humanError: 0 };
        }
        analysis.staffReport[staffName].total++;
        if (staffStatus === 'match') analysis.staffReport[staffName].match++;
        else if (staffStatus === 'error') analysis.staffReport[staffName].humanError++;
        else if (staffStatus === 'gain') analysis.staffReport[staffName].gain++;
        else if (staffStatus === 'loss') analysis.staffReport[staffName].loss++;
        else if (staffStatus === 'unknown') {
            // Unlabeled non-match. If the user wants to see it as error, it could go to humanError.
            // But usually 'error' is for explicit human errors.
        }

        // 7. Discrepancy Drill-down (Now includes all rows per user request)
        if (true) {

            const barcode = findVal(['barcode', 'ean', 'upc']);
            const itemId = findVal(['itemid', 'productid', 'sku', 'id']);
            const lotSerial = findVal(['lotserialnumber', 'lotserial', 'lot', 'serial', 'batch']);
            const productionDateRaw = findVal(['productiondate']);
            const expirationDateRaw = findVal(['expirationdate']);

            const firstQty = findVal(['firstqty', 'initialqty', 'startqty']);
            const finalQty = findVal(['finalqty', 'endqty', 'closingqty']);
            const firstVar = findVal(['firstvar', 'initialvar', 'startvar', 'variance1']);
            const finalVar = findVal(['finalvar', 'endvar', 'closingvar', 'variance2']);
            const locationStatus = findVal(['locatonstatus', 'locationstatus', 'locstatus']);
            const lotStatus = findVal(['lotstatus', 'batchstatus']);
            const productStatus = findVal(['productstatus', 'itemstatus']);
            const createdBy = findVal(['creaitedby', 'createdby', 'ceraitedby', 'addedby']);
            const employeeAccuracyRaw = findVal(['employeeaccuracy']);
            const employeeStatus = findVal(['employeestatus', 'empstatus', 'staffstatus']);
            const liveRaw = findVal(['live']);
            const liveWaitRaw = findVal(['livewait']);

            const formatDate = (val) => {
                if (!val) return 'N/A';
                const d = parseFlexDate(val);
                return d && !isNaN(d.getTime()) ? d.toLocaleDateString() : val;
            };

            analysis.discrepancies.push({
                // Core identification
                location,
                category,
                product: productName || itemId || 'Unknown Product',
                productId: itemId || productId || 'N/A',
                barcode: barcode || 'N/A',

                // Lot & Dates
                lotSerial: lotSerial || 'N/A',
                productionDate: formatDate(productionDateRaw),
                expirationDate: formatDate(expirationDateRaw),

                // Quantities
                firstQty: firstQty || 'N/A',
                finalQty: finalQty || physicalQty,
                systemQty,
                physicalQty,
                diff: physicalQty - systemQty,

                // Variances & Statuses
                firstVar: firstVar || 'N/A',
                finalVar: finalVar || 'N/A',
                locationStatus: locationStatus || 'N/A',
                lotStatus: lotStatus || 'N/A',
                productStatus: productStatus || status,

                // Staff & Audit Info
                createdBy: createdBy || 'N/A',
                staffName,
                staffEvaluation: staffStatus,
                employeeAccuracy: (employeeAccuracyRaw !== null && employeeAccuracyRaw !== undefined && employeeAccuracyRaw !== '') ? employeeAccuracyRaw : 'N/A',
                employeeStatus: employeeStatus || 'N/A',

                // Live Status
                live: (liveRaw !== null && liveRaw !== undefined && liveRaw !== '') ? liveRaw : 'N/A',
                dateNow: inventoryDateStr && parseFlexDate(inventoryDateStr)
                    ? (() => {
                        const d = parseFlexDate(inventoryDateStr);
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        return `${day}/${month}/${d.getFullYear()}`;
                    })()
                    : (inventoryDateStr || 'N/A'),
                liveWait: (liveWaitRaw !== null && liveWaitRaw !== undefined && liveWaitRaw !== '') ? liveWaitRaw : 'N/A'
            });
        }
    });


    // Calculate KPI Percentages (Based on record counts/rows for consistency)
    if (analysis.kpis.totalRows > 0) {
        analysis.kpis.matchedPercentage = Math.round((analysis.kpis.totalMatched * 100) / analysis.kpis.totalRows);
        analysis.kpis.gainPercentage = Math.round((analysis.kpis.totalGain * 100) / analysis.kpis.totalRows);
        analysis.kpis.lossPercentage = Math.round((analysis.kpis.totalLoss * 100) / analysis.kpis.totalRows);

        // Count distinct products across all processed audit records
        const distinctIDs = new Set();
        Object.keys(analysis.productReport).forEach(key => {
            const [id] = key.split('|');
            distinctIDs.add(id);
        });
        analysis.kpis.totalDistinctProducts = distinctIDs.size;
    }

    // Finalize Location Metrics
    Object.keys(analysis.locationReport).forEach(name => {
        const loc = analysis.locationReport[name];
        loc.accuracy = (loc.matched / loc.totalItems) * 100;
        loc.riskScore = ((loc.loss * 3) + (loc.gain * 1)) / loc.totalItems;

        // Calculate most common location status
        if (loc.locationStatuses && loc.locationStatuses.length > 0) {
            const statusCounts = {};
            loc.locationStatuses.forEach(status => {
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            });
            loc.mostCommonStatus = Object.keys(statusCounts).reduce((a, b) =>
                statusCounts[a] > statusCounts[b] ? a : b
            );
        } else {
            loc.mostCommonStatus = 'N/A';
        }

        analysis.chartData.locationAccuracy.labels.push(name);
        analysis.chartData.locationAccuracy.datasets.push(loc.accuracy);

        if (loc.accuracy < 85) {
            analysis.insights.push({
                type: 'location_issue',
                message: `Location "${name}" has low accuracy (${loc.accuracy.toFixed(1)}%).`,
                severity: 'warning'
            });
        }
    });

    // Finalize Staff Performance
    Object.keys(analysis.staffReport).forEach(name => {
        const s = analysis.staffReport[name];
        s.accuracy = (s.match / s.total) * 100;
    });

    // Sort discrepancies by absolute difference
    analysis.discrepancies.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    analysis.discrepanciesArr = analysis.discrepancies; // Return all locations without limit

    // Finalize Global KPIs
    analysis.kpis.overallAccuracy = Math.round((analysis.kpis.totalMatched / analysis.kpis.totalRows) * 100);

    // Generate Alerts
    if (analysis.expiryAnalysis.expired.length > 0) {
        analysis.alerts.push({
            type: 'critical',
            message: `${analysis.expiryAnalysis.expired.length} items have EXPIRED. Remove immediately.`,
            action: 'Urgent Audit & Removal'
        });
    }

    // Accuracy alert disabled
    // if (analysis.kpis.overallAccuracy < 90) {
    //     analysis.alerts.push({
    //         type: 'warning',
    //         message: `Global accuracy is below target (${analysis.kpis.overallAccuracy.toFixed(1)}%).`,
    //         action: 'Blind Recount Implementation'
    //     });
    // }

    // Chart Data Status Distribution
    analysis.chartData.statusDistribution.datasets = [
        analysis.kpis.totalMatched,
        analysis.kpis.totalGain,
        analysis.kpis.totalLoss
    ];

    analysis.chartData.expirySeverity.datasets = [
        analysis.expiryAnalysis.expired.length,
        analysis.expiryAnalysis.expiring7Days.length,
        analysis.expiryAnalysis.expiring30Days.length
    ];

    // Identify problematic products
    const problematicProds = Object.entries(analysis.productReport)
        .filter(([id, data]) => data.issueFrequency > 20)
        .sort((a, b) => b[1].issueFrequency - a[1].issueFrequency)
        .slice(0, 5);

    if (problematicProds.length > 0) {
        analysis.insights.push({
            type: 'product_stability',
            message: `Found ${problematicProds.length} products with frequent discrepancy issues.`,
            details: problematicProds.map(p => p[1].name)
        });
    }

    return analysis;
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo}`;
}

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
