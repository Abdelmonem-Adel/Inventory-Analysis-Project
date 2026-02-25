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


