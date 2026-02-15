import { readSheet, listSheetTitles } from "../../services/sheet.service.js";
import { processInventoryData, calculateKPIs, getUniqueLatestProducts } from "../Util/analytics.js";
import { applyFilters } from "../Util/filters.js";
import { analyzeInventory } from "../Util/smartAnalysis.js";


export const getInventoryDashboard = async (req, res, next) => {
    try {
        // 1. Fetch data from Google Sheets
        // 1. Identify Target Sheet (Sheet1)
        console.log("[Inventory] identifying data sheet...");
        const titles = await listSheetTitles();
        const targetPattern = /sheet\s*1/i;
        const sheetTitle = titles.find(t => targetPattern.test(t));

        if (!sheetTitle) {
            console.warn("[Inventory] 'Sheet1' not found. Falling back to reading ALL sheets.");
        }

        // 2. Fetch Data
        const rawData = await readSheet(process.env.SPREADSHEET_ID, sheetTitle || null);
        console.log(`[Inventory] Loaded ${rawData ? rawData.length : 0} rows from ${sheetTitle || 'ALL SHEETS'}`);

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

        // 6. Generate Unique Latest Products for Dashboard Table
        const uniqueProducts = getUniqueLatestProducts(filteredProducts);

        // 7. Return Response
        res.json({
            products: filteredProducts,
            uniqueProducts: uniqueProducts,
            kpis: dynamicKPIs,
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

        // Find best match for "locations acu" (case-insensitive)
        const targetPattern = /locations\s*acu/i;
        const bestMatch = titles.find(t => targetPattern.test(t));

        if (!bestMatch) {
            console.error("[Analysis] No valid audit sheet found.");
            return res.json({
                error: `Sheet 'locations acu' not found. Available: ${titles.slice(0, 5).join(", ")}...`,
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

        // Find best match for "Productivity" (case-insensitive)
        const targetPattern = /productivity/i;
        const bestMatch = titles.find(t => targetPattern.test(t));

        if (!bestMatch) {
            console.error("[Productivity] No valid Productivity sheet found.");
            return res.json({
                error: `Sheet 'Productivity' not found. Available: ${titles.slice(0, 5).join(", ")}...`,
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

        const analysisResults = analyzeInventory(rawData);
        res.json(analysisResults);
    } catch (error) {
        console.error("[Productivity Controller Error]", error.message);
        next(error);
    }
};
