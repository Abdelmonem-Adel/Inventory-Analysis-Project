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
        console.log("[Location] Fetching Scans, sys stocks, total location status, and location per items data...");

        const [scansData, sysStocksData, totalLocStatusData, locPerItemsData] = await Promise.all([
            readSheet(process.env.SPREADSHEET_ID, 'Scans'),
            readSheet(process.env.SPREADSHEET_ID, 'sys stocks'),
            readSheet(process.env.SPREADSHEET_ID, 'total location status').catch(err => {
                console.warn(`[Location] Could not read 'total location status' sheet: ${err.message}`);
                return null;
            }),
            readSheet(process.env.SPREADSHEET_ID, 'location per items').catch(err => {
                console.warn(`[Location] Could not read 'location per items' sheet: ${err.message}`);
                return null;
            })
        ]);

        console.log(`[Location] Scans: ${scansData?.length || 0} rows, Sys Stocks: ${sysStocksData?.length || 0} rows, TotalLocStatus: ${totalLocStatusData?.length || 0} rows, LocPerItems: ${locPerItemsData?.length || 0} rows`);
        if (totalLocStatusData && totalLocStatusData.length > 0) {
            console.log(`[Location] total location status sample row keys:`, Object.keys(totalLocStatusData[0]));
            console.log(`[Location] total location status last row:`, JSON.stringify(totalLocStatusData[totalLocStatusData.length - 1]));
        }
        if (locPerItemsData && locPerItemsData.length > 0) {
            console.log(`[Location] location per items sample row keys:`, Object.keys(locPerItemsData[0]));
            console.log(`[Location] location per items first row:`, JSON.stringify(locPerItemsData[0]));
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

        // Parse date helper
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

        // 1. Build Physical locations from Scans sheet (per product ID)
        const physicalMap = {}; // { itemId: { name, category, locations: Set, details: [] } }

        const junkValues = ['0', '(blank)', 'null', 'undefined', '-', 'nan', 'n/a', ''];

        (scansData || []).forEach(row => {
            let itemId = findVal(row, ['itemid', 'productid', 'sku', 'barcode', 'breadfastid', 'id']);
            if (itemId) itemId = String(itemId).trim().toLowerCase();
            if (!itemId || junkValues.includes(itemId)) return;

            const location = findVal(row, ['productlocation', 'location', 'warehouse', 'store', 'loc']) || 'Unknown';
            const productName = findVal(row, ['productname', 'name', 'item', 'product']);
            const rawCat = findVal(row, ['category', 'type', 'cat']);
            const category = (rawCat ? String(rawCat) : 'Other').trim().replace(/\s+\d+$/, '');
            const finalQty = parseFloat(findVal(row, ['finalqty', 'physicalqty', 'qty', 'quantity']) || 0) || 0;
            const sysQty = parseFloat(findVal(row, ['sysqty', 'systemqty', 'logicalqty']) || 0) || 0;
            const locStatus = findVal(row, ['locatonstatus', 'locationstatus', 'locstatus']) || '';
            const prodStatus = findVal(row, ['productstatus', 'status']) || '';
            const dateStr = findVal(row, ['date', 'datenow', 'countdate']);
            const parsedDate = parseFlexDate(dateStr);

            if (!physicalMap[itemId]) {
                physicalMap[itemId] = {
                    name: productName,
                    category,
                    locations: new Set(),
                    details: []
                };
            }

            physicalMap[itemId].locations.add(location);
            if (!physicalMap[itemId].name && productName) physicalMap[itemId].name = productName;

            physicalMap[itemId].details.push({
                location,
                finalQty,
                sysQty,
                locationStatus: locStatus,
                productStatus: prodStatus,
                date: parsedDate ? parsedDate.toISOString() : null
            });
        });

        // 2. Build System locations from sys stocks sheet (per product ID)
        const systemMap = {}; // { itemId: { locations: Set, details: [] } }

        (sysStocksData || []).forEach(row => {
            let itemId = findVal(row, ['itemid', 'productid', 'sku', 'barcode', 'breadfastid', 'id']);
            if (itemId) itemId = String(itemId).trim().toLowerCase();
            if (!itemId || junkValues.includes(itemId)) return;

            const location = findVal(row, ['productlocation', 'location', 'warehouse', 'store', 'loc']) || 'Unknown';
            const qty = parseFloat(findVal(row, ['quantity', 'qty', 'sysqty', 'systemqty']) || 0) || 0;
            const productName = findVal(row, ['productname', 'name', 'item', 'product']);

            if (!systemMap[itemId]) {
                systemMap[itemId] = {
                    name: productName,
                    locations: new Set(),
                    details: []
                };
            }

            systemMap[itemId].locations.add(location);
            if (!systemMap[itemId].name && productName) systemMap[itemId].name = productName;

            systemMap[itemId].details.push({
                location,
                quantity: qty
            });
        });

        // 2b. Build locPerItems map from "location per items" sheet
        const locPerItemsMap = {};
        if (locPerItemsData && locPerItemsData.length > 0) {
            locPerItemsData.forEach(row => {
                let itemId = findVal(row, ['itemid', 'productid', 'sku', 'barcode', 'breadfastid', 'id']);
                if (itemId) itemId = String(itemId).trim().toLowerCase();
                if (!itemId) return;
                if (!locPerItemsMap[itemId]) {
                    locPerItemsMap[itemId] = { matchLocs: 0, missMatchLocs: 0 };
                }
                locPerItemsMap[itemId].matchLocs += parseInt(findVal(row, ['match']) || 0) || 0;
                locPerItemsMap[itemId].missMatchLocs += parseInt(findVal(row, ['totalmissmatch', 'totalmismatch']) || 0) || 0;
            });
            console.log(`[Location] Built locPerItems map for ${Object.keys(locPerItemsMap).length} items`);
        }

        // 3. Merge: for each product, calculate physical vs system location counts
        const allItemIds = new Set([...Object.keys(physicalMap), ...Object.keys(systemMap)]);
        const products = [];

        let totalPhysicalLocs = 0;
        let totalSystemLocs = 0;
        const allPhysicalLocations = new Set();
        const allSystemLocations = new Set();

        allItemIds.forEach(itemId => {
            const physical = physicalMap[itemId];
            const system = systemMap[itemId];

            const physicalLocCount = physical ? physical.locations.size : 0;
            const systemLocCount = system ? system.locations.size : 0;
            const name = (physical?.name || system?.name || itemId);
            const category = physical?.category || 'Other';

            // Determine location status (compare actual location values)
            const physLocs = physical ? physical.locations : new Set();
            const sysLocs = system ? system.locations : new Set();
            const locsMatch = physLocs.size === sysLocs.size && [...physLocs].every(l => sysLocs.has(l));
            const locStatus = locsMatch ? 'match' : 'mismatch';

            totalPhysicalLocs += physicalLocCount;
            totalSystemLocs += systemLocCount;

            if (physical) physical.locations.forEach(l => allPhysicalLocations.add(l));
            if (system) system.locations.forEach(l => allSystemLocations.add(l));

            // Latest date from physical (scans)
            let latestDate = null;
            if (physical?.details) {
                physical.details.forEach(d => {
                    if (d.date) {
                        const dt = new Date(d.date);
                        if (!latestDate || dt > latestDate) latestDate = dt;
                    }
                });
            }

            const locPerItem = locPerItemsMap[itemId] || { matchLocs: 0, missMatchLocs: 0 };

            products.push({
                itemId,
                name,
                category,
                physicalLocations: physicalLocCount,
                systemLocations: systemLocCount,
                matchLocs: locPerItem.matchLocs,
                missMatchLocs: locPerItem.missMatchLocs,
                locationStatus: locStatus,
                physicalDetails: physical?.details || [],
                systemDetails: system?.details || [],
                latestDate: latestDate ? latestDate.toISOString() : null
            });
        });

        // 4. KPIs
        const totalProducts = products.length;
        const matchProducts = products.filter(p => p.locationStatus === 'match').length;
        const missMatchProducts = products.filter(p => p.locationStatus === 'mismatch').length;

        // Parse "total location status" sheet for location KPIs
        // Columns: date | Location | Extra | Missing | total miss match | Match | total locations
        let sheetTotalLocations = 0;
        let sheetLocMatch = 0;
        let sheetLocMissMatch = 0;

        if (totalLocStatusData && totalLocStatusData.length > 0) {
            // Total locations = number of rows in the sheet
            sheetTotalLocations = totalLocStatusData.length;
            // Sum match and miss match from all rows
            totalLocStatusData.forEach(row => {
                sheetLocMatch += parseInt(findVal(row, ['match']) || 0) || 0;
                sheetLocMissMatch += parseInt(findVal(row, ['totalmissmatch', 'totalmismatch']) || 0) || 0;
            });
            console.log(`[Location] From 'total location status' sheet (${totalLocStatusData.length} rows): Total=${sheetTotalLocations}, Match=${sheetLocMatch}, MissMatch=${sheetLocMissMatch}`);
        } else {
            // Fallback to calculated values if sheet not available
            sheetTotalLocations = new Set([...allPhysicalLocations, ...allSystemLocations]).size;
            sheetLocMatch = [...allPhysicalLocations].filter(l => allSystemLocations.has(l)).length;
            sheetLocMissMatch = [...allPhysicalLocations].filter(l => !allSystemLocations.has(l)).length + [...allSystemLocations].filter(l => !allPhysicalLocations.has(l)).length;
            console.log(`[Location] 'total location status' sheet not found, using calculated values`);
        }

        const kpis = {
            totalProducts,
            rawPhysicalLocations: totalPhysicalLocs,
            rawSystemLocations: totalSystemLocs,
            rawTotalLocations: totalPhysicalLocs + totalSystemLocs,
            totalPhysicalLocations: allPhysicalLocations.size,
            totalSystemLocations: allSystemLocations.size,
            totalLocations: sheetTotalLocations,
            // Location-based match/miss match (from sheet)
            locMatchCount: sheetLocMatch,
            locMissMatchCount: sheetLocMissMatch,
            // Product-based
            matchCount: matchProducts,
            missMatchCount2: missMatchProducts,
            matchPercent: totalProducts > 0 ? Math.round((matchProducts / totalProducts) * 100) : 0,
            missMatchPercent: totalProducts > 0 ? Math.round((missMatchProducts / totalProducts) * 100) : 0,
        };

        console.log(`[Location] Analysis complete: ${totalProducts} products, Physical: ${totalPhysicalLocs}, System: ${totalSystemLocs}`);
        console.log(`[Location] Match: ${sheetLocMatch}, MissMatch: ${sheetLocMissMatch}`);

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
