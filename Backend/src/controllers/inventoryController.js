import { readSheet, listSheetTitles } from "../../services/sheet.service.js";
import { processInventoryData, calculateKPIs, getUniqueLatestProducts } from "../Util/analytics.js";
import { applyFilters } from "../Util/filters.js";
import { analyzeInventory } from "../Util/smartAnalysis.js";
import { processProductivityData, calculateProductivityOverview } from "../Util/productivityAnalytics.js";


export const getInventoryDashboard = async (req, res, next) => {
    try {
        // 1. Fetch data from Google Sheets

        // 1. Identify Target Sheet (Scans)
        const sheetTitle = 'Scans';
        console.log(`[Inventory] Fetching data from sheet: ${sheetTitle}`);

        // 2. Fetch Data
        const rawData = await readSheet(process.env.SPREADSHEET_ID, sheetTitle);
        console.log(`[Inventory] Loaded ${rawData ? rawData.length : 0} rows from ${sheetTitle}`);

        // 3. Check for Empty Data
        if (!rawData || rawData.length === 0) {
            console.log('--- Sheets returned empty. ---');
            return res.json({ products: [], kpis: { totalProducts: 0, totalCurrentQuantity: 0 } });
        }

        // 3. Process Analytics
        const { startDate, endDate } = req.query;
        const processed = processInventoryData(rawData, startDate, endDate);

        if (!processed) {
            console.log('--- Analytics returning null (check logs) ---');
            return res.json({ products: [], kpis: { totalProducts: 0, totalCurrentQuantity: 0 } });
        }

        // 4. Apply Filters
        const filteredProducts = applyFilters(processed.products, req.query);

        // 5. Recalculate KPIs based on Filtered Data
        const dynamicKPIs = calculateKPIs(filteredProducts);

        // 6. Generate Expiry Analysis (Smart Analysis on Sheet 1 Data)
        // This will find expiry dates if columns like 'Expiration Date', 'Expiry' exist in Sheet 1
        console.log("[Inventory] Running Expiry Analysis on Sheet 1 data...");
        const smartAnalysis = analyzeInventory(rawData);
        const expiryAnalysis = smartAnalysis ? smartAnalysis.expiryAnalysis : { expired: [], expiring7Days: [], alerts: [] };
        console.log(`[Inventory] Expiry Analysis: ${expiryAnalysis.expired.length} expired, ${expiryAnalysis.expiring7Days.length} expiring soon.`);

        // 7. Generate Unique Latest Products for Dashboard Table
        let uniqueProducts = getUniqueLatestProducts(filteredProducts);

        // 7.1 Sort Unique Products based on "Top" Filters
        const { type } = req.query;
        if (type === 'top_gain') {
            uniqueProducts.sort((a, b) => ((b.PhysicalQty || 0) - (b.SystemQty || 0)) - ((a.PhysicalQty || 0) - (a.SystemQty || 0)));
        } else if (type === 'top_loss') {
            uniqueProducts.sort((a, b) => ((a.SystemQty || 0) - (a.PhysicalQty || 0)) - ((b.SystemQty || 0) - (b.PhysicalQty || 0)));
        }

        // 8. Return Response
        res.json({
            products: filteredProducts,
            uniqueProducts: uniqueProducts,
            kpis: dynamicKPIs,
            expiryAnalysis: expiryAnalysis, // Added to response
            meta: {
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getInventoryAnalysis = async (req, res, next) => {
    try {
        console.log("[Analysis] Identifying Audit sheet...");
        const titles = await listSheetTitles();
        console.log("[Analysis] Spreadsheet titles:", titles.join(", "));

        // Find best match for "Scans" (case-insensitive)
        const targetPattern = /scans/i;
        const bestMatch = titles.find(t => targetPattern.test(t));

        if (!bestMatch) {
            console.error("[Analysis] No valid audit sheet found.");
            return res.json({
                error: `Sheet 'Scans' not found. Available: ${titles.slice(0, 5).join(", ")}...`,
                kpis: { overallAccuracy: 0, totalMatched: 0, totalExtra: 0, totalMissing: 0 },
                alerts: [],
                chartData: { locationAccuracy: { labels: [], datasets: [] }, statusDistribution: { labels: [], datasets: [] } },
                expiryAnalysis: { expired: [], expiring7Days: [], expiring30Days: [] },
                insights: [],
                staffReport: {},
                discrepanciesArr: []
            });
        }

        console.log(`[Analysis] ✓ Found match: "${bestMatch}". Loading data...`);
        const rawData = await readSheet(process.env.SPREADSHEET_ID, bestMatch);

        if (!rawData || rawData.length === 0) {
            console.warn(`[Analysis] ✗ Sheet "${bestMatch}" is empty or has no data rows.`);
            return res.json({ error: `Sheet "${bestMatch}" is empty.` });
        }

        console.log(`[Analysis] ✓ Successfully loaded ${rawData.length} rows from "${bestMatch}"`);
        console.log(`[Analysis] Sample headers:`, Object.keys(rawData[0] || {}).slice(0, 10).join(', '));

        const analysisResults = analyzeInventory(rawData);
        res.json(analysisResults);
    } catch (error) {
        console.error("[Analysis Controller Error]", error.message);
        next(error);
    }
};

export const getProductivityAnalysis = async (req, res, next) => {
    try {
        console.log("[Productivity] Identifying Productivity sheet...");
        const titles = await listSheetTitles();
        console.log("[Productivity] Spreadsheet titles:", titles.join(", "));

        // Find best match for "Scans" (case-insensitive)
        const targetPattern = /scans/i;
        const bestMatch = titles.find(t => targetPattern.test(t));

        if (!bestMatch) {
            console.error("[Productivity] No valid Productivity sheet found.");
            return res.json({
                error: `Sheet 'Scans' not found. Available: ${titles.slice(0, 5).join(", ")}...`,
                kpis: { overallAccuracy: 0, totalMatched: 0, totalExtra: 0, totalMissing: 0 },
                alerts: [],
                chartData: { locationAccuracy: { labels: [], datasets: [] }, statusDistribution: { labels: [], datasets: [] } },
                expiryAnalysis: { expired: [], expiring7Days: [], expiring30Days: [] },
                insights: [],
                staffReport: {},
                discrepanciesArr: []
            });
        }

        console.log(`[Productivity] ✓ Found match: "${bestMatch}". Loading data...`);
        const rawData = await readSheet(process.env.SPREADSHEET_ID, bestMatch);

        if (!rawData || rawData.length === 0) {
            console.warn(`[Productivity] ✗ Sheet "${bestMatch}" is empty or has no data rows.`);
            return res.json({ error: `Sheet "${bestMatch}" is empty.` });
        }

        console.log(`[Productivity] ✓ Successfully loaded ${rawData.length} rows from "${bestMatch}"`);
        console.log(`[Productivity] Sample headers:`, Object.keys(rawData[0] || {}).slice(0, 10).join(', '));

        // 1. Existing Analysis (Staff Error, Discrepancies, etc.)
        const analysisResults = analyzeInventory(rawData);

        // 2. New Hourly Productivity Analysis (Grouped by User/Date/Hour)
        const hourlyProductivity = processProductivityData(rawData);
        const productivityKPIs = calculateProductivityOverview(rawData);
        console.log(`[Productivity] Processed ${hourlyProductivity.length} grouped hourly entries.`);

        // Merge results
        res.json({
            ...analysisResults, // spread existing results (staffReport, etc.)
            hourlyProductivity: hourlyProductivity, // add new data
            productivityKPIs: productivityKPIs, // add new KPIs
            meta: {
                timestamp: new Date().toISOString(),
                sheetName: bestMatch,
                count: rawData.length
            }
        });
    } catch (error) {
        console.error("[Productivity Controller Error]", error.message);
        next(error);
    }
};

/**
 * Location View: Cross-references Scans and Sys Stocks sheets
 * For each product ID, counts unique locations in each sheet
 * to determine Physical vs System location counts.
 */
export const getLocationAnalysis = async (req, res, next) => {
    try {
        console.log("[Location] Fetching data from 'total locations & items' sheet...");

        const rawData = await readSheet(process.env.SPREADSHEET_ID, 'total locations & items');
        console.log(`[Location] Loaded ${rawData?.length || 0} rows from 'total locations & items'`);

        if (!rawData || rawData.length === 0) {
            return res.json({ products: [], kpis: { totalProducts: 0, totalLocations: 0 }, meta: { timestamp: new Date().toISOString() } });
        }

        if (rawData.length > 0) {
            console.log(`[Location] Sample row keys:`, Object.keys(rawData[0]));
        }

        // Helper: normalize keys and find value
        const findVal = (row, possibleKeys) => {
            const rowKeys = Object.keys(row).map(k => ({
                original: k,
                normalized: k.toLowerCase().replace(/[^a-z0-9]/gi, '')
            }));
            for (const pKey of possibleKeys) {
                const match = rowKeys.find(rk => rk.normalized === pKey);
                if (match) return row[match.original];
            }
            return null;
        };

        // Parse date helper (handles Excel serial numbers and various date formats)
        const parseFlexDate = (dateVal) => {
            if (!dateVal || dateVal === 'N/A' || dateVal === '') return null;
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
                    else { d = v1; m = v2; }
                } else {
                    let v1 = Number(parts[0]); let v2 = Number(parts[1]); y = Number(parts[2]) + 2000;
                    if (v1 > 12) { d = v1; m = v2; }
                    else if (v2 > 12) { m = v1; d = v2; }
                    else { d = v1; m = v2; }
                }
                if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m - 1, d, 12, 0, 0);
            }
            return null;
        };

        const junkValues = ['0', '(blank)', 'null', 'undefined', '-', 'nan', 'n/a', ''];

        // Group rows by item ID
        const itemMap = {}; // { itemId: { name, category, locations: { locName: { qtyphy, qtysys, vr, locationstatus, productstatus, date } } } }
        const allLocations = new Set();

        rawData.forEach(row => {
            let itemId = findVal(row, ['id', 'itemid', 'productid', 'sku', 'breadfastid']);
            if (itemId) itemId = String(itemId).trim().toLowerCase();
            if (!itemId || junkValues.includes(itemId)) return;

            const location = findVal(row, ['location', 'productlocation', 'warehouse', 'loc']) || 'Unknown';
            const productName = findVal(row, ['productname', 'name', 'product']);
            const rawCat = findVal(row, ['category', 'type', 'cat']);
            const category = (rawCat ? String(rawCat) : 'Other').trim().replace(/\s+\d+$/, '');
            const qtyPhy = parseFloat(findVal(row, ['qtyphy', 'physicalqty', 'finalqty', 'qty']) || 0) || 0;
            const qtySys = parseFloat(findVal(row, ['qtysys', 'systemqty', 'sysqty']) || 0) || 0;
            const locStatus = String(findVal(row, ['locationstatus', 'locatonstatus', 'locstatus']) || '').trim();
            const prodStatus = String(findVal(row, ['productstatus', 'status']) || '').trim();
            const dateVal = findVal(row, ['date', 'datenow', 'countdate']);
            const parsedDate = parseFlexDate(dateVal);

            allLocations.add(location);

            if (!itemMap[itemId]) {
                itemMap[itemId] = {
                    name: productName,
                    category,
                    rows: []
                };
            }
            if (!itemMap[itemId].name && productName) itemMap[itemId].name = productName;

            itemMap[itemId].rows.push({
                location,
                qtyPhy,
                qtySys,
                locationStatus: locStatus,
                productStatus: prodStatus,
                date: parsedDate ? parsedDate.toISOString() : null
            });
        });

        // Build products array matching frontend expectations
        const products = [];
        let totalLocMatchCount = 0;
        let totalLocMissMatchCount = 0;

        Object.entries(itemMap).forEach(([itemId, item]) => {
            const locSet = new Set(item.rows.map(r => r.location));

            // Count match/mismatch locations from the locationstatus column
            let matchLocs = 0;
            let missMatchLocs = 0;
            item.rows.forEach(r => {
                const st = r.locationStatus.toLowerCase();
                if (st === 'match') {
                    matchLocs++;
                } else if (st === 'extra' || st === 'missing' || st === 'mismatch' || st === 'miss match') {
                    missMatchLocs++;
                }
            });

            // Overall product location status
            const locStatus = missMatchLocs === 0 ? 'match' : 'mismatch';

            // physicalDetails: every row acts as a physical detail (qtyphy = finalQty, qtysys = sysQty)
            const physicalDetails = item.rows.map(r => ({
                location: r.location,
                finalQty: r.qtyPhy,
                sysQty: r.qtySys,
                locationStatus: r.locationStatus,
                productStatus: r.productStatus,
                date: r.date
            }));

            // systemDetails: build per-location system qty from the same rows
            const sysByLoc = {};
            item.rows.forEach(r => {
                if (!sysByLoc[r.location]) sysByLoc[r.location] = 0;
                sysByLoc[r.location] += r.qtySys;
            });
            const systemDetails = Object.entries(sysByLoc).map(([loc, qty]) => ({
                location: loc,
                quantity: qty
            }));

            // Latest date
            let latestDate = null;
            item.rows.forEach(r => {
                if (r.date) {
                    const dt = new Date(r.date);
                    if (!latestDate || dt > latestDate) latestDate = dt;
                }
            });

            totalLocMatchCount += matchLocs;
            totalLocMissMatchCount += missMatchLocs;

            products.push({
                itemId,
                name: item.name || itemId,
                category: item.category,
                physicalLocations: locSet.size,
                systemLocations: locSet.size,
                matchLocs,
                missMatchLocs,
                locationStatus: locStatus,
                physicalDetails,
                systemDetails,
                latestDate: latestDate ? latestDate.toISOString() : null
            });
        });

        // KPIs
        const totalProducts = products.length;

        // Product Status KPIs: unique products from productstatus column
        // A product is Match if ALL its rows have productstatus=Match, otherwise MissMatch
        let prodStatusMatch = 0;
        let prodStatusMissMatch = 0;
        products.forEach(p => {
            const hasMiss = (p.physicalDetails || []).some(d => {
                const st = (d.productStatus || '').toLowerCase();
                return st === 'extra' || st === 'missing' || st === 'mismatch' || st === 'miss match';
            });
            if (hasMiss) prodStatusMissMatch++;
            else prodStatusMatch++;
        });

        // Location Status KPIs: unique locations from locationstatus column
        // A location is Match if ALL its rows have locationstatus=Match, otherwise MissMatch
        const locStatusMap = {}; // { location: hasMiss }
        products.forEach(p => {
            (p.physicalDetails || []).forEach(d => {
                const loc = d.location;
                if (!loc) return;
                const st = (d.locationStatus || '').toLowerCase();
                const isMiss = st === 'extra' || st === 'missing' || st === 'mismatch' || st === 'miss match';
                if (!(loc in locStatusMap)) locStatusMap[loc] = false;
                if (isMiss) locStatusMap[loc] = true;
            });
        });
        let locStatusMatch = 0;
        let locStatusMissMatch = 0;
        Object.values(locStatusMap).forEach(hasMiss => {
            if (hasMiss) locStatusMissMatch++;
            else locStatusMatch++;
        });

        const kpis = {
            totalProducts,
            totalLocations: allLocations.size,
            locMatchCount: locStatusMatch,
            locMissMatchCount: locStatusMissMatch,
            prodStatusMatch,
            prodStatusMissMatch,
        };

        console.log(`[Location] Analysis complete: ${totalProducts} products, ${allLocations.size} unique locations`);
        console.log(`[Location] Location Match: ${totalLocMatchCount}, MissMatch: ${totalLocMissMatchCount}`);

        res.json({
            products,
            kpis,
            meta: {
                timestamp: new Date().toISOString(),
            }
        });
    } catch (error) {
        console.error("[Location Controller Error]", error.message);
        next(error);
    }
};

// ── Scans Raw Table (for Location View Detail Table) ──
export const getScansRawData = async (req, res, next) => {
    try {
        console.log("[ScansRaw] Fetching Scans sheet data...");
        const scansData = await readSheet(process.env.SPREADSHEET_ID, 'Scans');
        console.log(`[ScansRaw] Loaded ${scansData?.length || 0} rows`);

        const findVal = (row, possibleKeys) => {
            const rowKeys = Object.keys(row).map(k => ({
                original: k,
                normalized: k.toLowerCase().replace(/[^a-z0-9]/gi, '')
            }));
            for (const pKey of possibleKeys) {
                const match = rowKeys.find(rk => rk.normalized === pKey);
                if (match) return row[match.original];
            }
            return null;
        };

        const parseFlexDate = (dateVal) => {
            if (!dateVal || dateVal === 'N/A' || dateVal === '') return null;
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
                    else { d = v1; m = v2; }
                } else {
                    let v1 = Number(parts[0]); let v2 = Number(parts[1]); y = Number(parts[2]) + 2000;
                    if (v1 > 12) { d = v1; m = v2; }
                    else if (v2 > 12) { m = v1; d = v2; }
                    else { d = v1; m = v2; }
                }
                if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m - 1, d, 12, 0, 0);
            }
            return null;
        };

        const formatDate = (raw) => {
            const d = parseFlexDate(raw);
            if (!d) return 'N/A';
            return d.toISOString().split('T')[0];
        };

        const junkValues = ['0', '(blank)', 'null', 'undefined', '-', 'nan', 'n/a', ''];
        const rows = [];

        (scansData || []).forEach(row => {
            let itemId = findVal(row, ['itemid', 'productid', 'sku', 'breadfastid', 'id']);
            if (itemId) itemId = String(itemId).trim();
            if (!itemId || junkValues.includes(String(itemId).toLowerCase())) return;

            const location = findVal(row, ['productlocation', 'location', 'warehouse', 'store', 'loc']) || 'Unknown';
            const barcode = findVal(row, ['barcode', 'ean', 'upc']) || '';
            const productName = findVal(row, ['productname', 'name', 'item', 'product']) || '';
            const rawCat = findVal(row, ['category', 'type', 'cat']);
            const category = (rawCat ? String(rawCat) : 'Other').trim().replace(/\s+\d+$/, '');
            const finalQty = parseFloat(findVal(row, ['finalqty', 'physicalqty', 'qty', 'quantity']) || 0) || 0;
            const sysQty = parseFloat(findVal(row, ['sysqty', 'systemqty', 'logicalqty']) || 0) || 0;
            const finalVar = finalQty - sysQty;
            const locStatus = findVal(row, ['locatonstatus', 'locationstatus', 'locstatus']) || 'N/A';
            const prodStatus = findVal(row, ['productstatus', 'status']) || 'N/A';
            const userName = findVal(row, ['username', 'user', 'agent', 'staff', 'worker', 'doneby', 'checkedby', 'counter', 'auditor', 'employee', 'namecountedby', 'ceraited', 'ceraitedby']) || 'N/A';
            const empAccuracy = findVal(row, ['employeeaccuracy', 'employeestatus', 'staffstatus', 'staffaccuracy']) || 'N/A';
            const live = findVal(row, ['live']);
            const liveWait = findVal(row, ['livewait']);
            const dateRaw = findVal(row, ['date', 'datenow', 'countdate']);
            const prodDateRaw = findVal(row, ['productiondate', 'proddate']);
            const expDateRaw = findVal(row, ['expirationdate', 'expirydate', 'expdate']);

            rows.push({
                location,
                barcode: String(barcode),
                itemId,
                productName: String(productName),
                category,
                prodDate: formatDate(prodDateRaw),
                expDate: formatDate(expDateRaw),
                finalQty,
                sysQty,
                finalVar,
                locStatus: String(locStatus),
                prodStatus: String(prodStatus),
                userName: String(userName),
                empAccuracy: String(empAccuracy),
                live: (live !== null && live !== undefined && live !== '') ? String(live) : 'N/A',
                liveWait: (liveWait !== null && liveWait !== undefined && liveWait !== '') ? String(liveWait) : 'N/A',
                date: formatDate(dateRaw)
            });
        });

        console.log(`[ScansRaw] Returning ${rows.length} rows`);
        res.json({ rows, meta: { timestamp: new Date().toISOString() } });
    } catch (error) {
        console.error("[ScansRaw Error]", error.message);
        next(error);
    }
};
