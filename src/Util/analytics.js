/**
 * Analytics logic for Inventory Dashboard
 */

export function processInventoryData(data, startDate = null, endDate = null) {

    if (!data || data.length === 0) return null;

    // Group by ProductCode
    const products = {};

    data.forEach(row => {
        // Normalize keys and find matching properties
        const findVal = (possibleKeys) => {
            const key = Object.keys(row).find(k => possibleKeys.includes(k.toLowerCase().replace(/\s/g, '')));
            return key ? row[key] : null;
        };

        let ProductCode = findVal(['sku', 'productcode', 'code', 'id', 'breadfastid']);
        const BreadfastID = findVal(['breadfastid', 'bfid', 'itemid']);
        const ProductName = findVal(['productname', 'name', 'item']);
        const CountDate = findVal(['date', 'countdate']);
        const Quantity = findVal(['physicalqty', 'num', 'quantity', 'qty', 'count', 'stockqty']);
        const Category = findVal(['product/productcategory', 'category', 'type', 'cat']) || 'Other';
        const Warehouse = findVal(['warehouse', 'location', 'store']) || 'Main';

        if (!ProductCode) ProductCode = BreadfastID;

        if (!ProductCode || !CountDate) return;

        if (!products[ProductCode]) {
            products[ProductCode] = {
                ProductCode,
                BreadfastID: BreadfastID || '',
                ProductName: ProductName || ProductCode,
                Category,
                Warehouse,
                history: []
            };
        }

        let parsedDate = new Date(CountDate);

        // Handle Excel Serial Dates (if applicable)
        if (isNaN(parsedDate.getTime()) && !isNaN(CountDate)) {
            const excelSerial = parseFloat(CountDate);
            parsedDate = new Date(Date.UTC(1899, 11, 30) + excelSerial * 86400 * 1000);
        }

        // Fix Date For standard parser
        if (typeof CountDate === 'string' && CountDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // "2023-10-27" -> "2023/10/27" to force local time parsing or add time
            parsedDate = new Date(CountDate + 'T00:00:00');
        }

        // Handle explicit mm/dd/yyyy string
        if (isNaN(parsedDate.getTime()) && typeof CountDate === 'string' && CountDate.includes('/')) {
            const parts = CountDate.split('/');
            if (parts.length === 3) {
                const mm = parseInt(parts[0]) - 1;
                const dd = parseInt(parts[1]);
                const yyyy = parseInt(parts[2]);
                parsedDate = new Date(yyyy, mm, dd);
            }
        }

        if (isNaN(parsedDate.getTime())) {
            
            return;
        }

        products[ProductCode].history.push({
            date: parsedDate,
            quantity: parseInt(Quantity) || 0
        });
    });

    const processedProducts = Object.values(products).map(product => {
        // Sort history by date ASC
        product.history.sort((a, b) => a.date - b.date);

        // ALWAYS Calculate Standard Daily Shifts (Last - Prev)
        product.history = product.history.map((record, index) => {
            const prev = product.history[index - 1];
            const diff = prev ? record.quantity - prev.quantity : 0;
            return {
                ...record,
                diff,
                formattedDate: record.date.toISOString().split('T')[0]
            };
        });

        // Determine which history subset to use for Reporting (Badge & Current Qty)
        let reportHistory = product.history;
        let lastDiff = 0;

        // Apply Date Filtering for the *Reported Metrics* IF date range provided
        if (startDate || endDate) {
            // Parse filters as Local Time
            const start = startDate ? new Date(startDate + 'T00:00:00') : new Date(0);
            const end = endDate ? new Date(endDate + 'T23:59:59') : new Date(8640000000000000);

            reportHistory = product.history.filter(h => h.date >= start && h.date <= end);

            if (reportHistory.length > 0) {
                if (reportHistory.length === 1) {
                    // Single day selected: Use the daily shift calculated from previous record in full history
                    lastDiff = reportHistory[0].diff;
                } else {
                    // Range selected: Net change (Last in range - First in range)
                    const firstRec = reportHistory[0];
                    const lastRec = reportHistory[reportHistory.length - 1];
                    lastDiff = lastRec.quantity - firstRec.quantity;
                }
            }
        } else {
            // Default Mode (No dates): Standard Daily Shift
            if (product.history.length > 0) {
                const latest = product.history[product.history.length - 1];
                lastDiff = latest.diff;
            }
        }

        const lastRec = reportHistory.length > 0 ? reportHistory[reportHistory.length - 1] : null;

        return {
            ...product,
            history: reportHistory, // Return filtered history
            currentQuantity: lastRec ? lastRec.quantity : 0,
            lastCountDate: lastRec ? lastRec.date.toISOString().split('T')[0] : null,
            lastDiff: lastDiff,
            latestTrend: reportHistory.slice(-7).map(h => ({
                ...h,
                formattedDate: h.date.toISOString().split('T')[0]
            }))
        };
    });

    // Filter out products that have no records in the selected period
    const productsInPeriod = processedProducts.filter(p => p.history && p.history.length > 0);

    // KPIs should only count products present in the selected period
    const kpis = calculateKPIs(productsInPeriod);

    console.log(`[Analytics] Processed ${Object.keys(products).length} products.`);
    return {
        products: productsInPeriod,
        kpis
    };
}

function calculateKPIs(products) {
    let totalQuantity = 0;
    let increasedCount = 0;
    let decreasedCount = 0;
    let biggestIncrease = { val: 0, product: '' };
    let biggestDecrease = { val: 0, product: '' };

    products.forEach(p => {
        totalQuantity += p.currentQuantity;
        if (p.lastDiff > 0) increasedCount++;
        if (p.lastDiff < 0) decreasedCount++;

        if (p.lastDiff > biggestIncrease.val) {
            biggestIncrease = { val: p.lastDiff, product: p.ProductName };
        }
        if (p.lastDiff < biggestDecrease.val) {
            biggestDecrease = { val: p.lastDiff, product: p.ProductName };
        }
    });

    return {
        totalProducts: products.length,
        totalCurrentQuantity: totalQuantity,
        productsIncreased: increasedCount,
        productsDecreased: decreasedCount,
        biggestDailyIncrease: biggestIncrease,
        biggestDailyDecrease: biggestDecrease
    };
}
