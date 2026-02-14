/**
 * Analytics logic for Inventory Dashboard
 */

export function processInventoryData(data, startDate = null, endDate = null) {

    if (!data || data.length === 0) return null;

    // Helper: format date as YYYY-MM-DD in LOCAL time (not UTC)
    // Prevents off-by-one errors caused by toISOString() converting to UTC
    const formatLocalDate = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    // 1. Build historical context per ProductID
    const historyMap = {};
    const results = [];

    let skippedNoCode = 0;
    let skippedDate = 0;

    data.forEach(row => {
        // Normalize keys once
        const rowKeys = Object.keys(row).map(k => ({
            original: k,
            normalized: k.toLowerCase().replace(/\s/g, '')
        }));

        const findVal = (possibleKeys) => {
            for (const key of possibleKeys) {
                const normalizedKey = key.toLowerCase().replace(/\s/g, '');
                const match = rowKeys.find(rk => rk.normalized === normalizedKey);
                if (match) return row[match.original];
            }
            return null;
        };

        let ProductCode = findVal(['breadfastid', 'sku', 'productcode', 'code', 'id']);
        let BreadfastID = findVal(['breadfastid', 'bfid', 'itemid']);
        let ProductName = findVal(['productname', 'name', 'item']);
        const CountDate = findVal(['date', 'countdate']);
        const Quantity = findVal(['physicalqty', 'num', 'quantity', 'qty', 'count', 'stockqty']);
        const SystemQuantity = findVal(['sysqty', 'systemqty', 'stockqty', 'logicalqty', 'bookqty', 'logicqty', 'expected', 'expectedqty', 'system']);
        const ProductStatus = findVal(['Proudact Status', 'proudactstatus', 'status', 'matchstatus', 'discrepancy', 'match/extra/missingstatus', 'inventorystatus', 'notes', 'result', 'auditresult', 'finalstatus', 'adjustment', 'variance', 'audit', 'finalvar', 'firstvar', 'lotatus', 'locationstatus', 'proudactstatus', 'loc.status']);
        const rawCat = findVal(['product/productcategory', 'category', 'type', 'cat']);
        const Category = (rawCat ? String(rawCat) : 'Other').trim();
        const Warehouse = findVal(['warehouse', 'location', 'store']) || 'Main';

        if (ProductCode) ProductCode = String(ProductCode).trim().toLowerCase();
        if (BreadfastID) BreadfastID = String(BreadfastID).trim().toLowerCase();
        if (ProductName) ProductName = String(ProductName).trim();

        if (!ProductCode) ProductCode = BreadfastID;

        // Junk Filter: Skip rows with invalid or placeholder IDs
        const junkValues = ['0', '(blank)', 'null', 'undefined', '-', 'nan', 'n/a', ''];
        if (!ProductCode || junkValues.includes(ProductCode)) {
            skippedNoCode++;
            return;
        }

        const ProductNameKey = ProductName ? ProductName.trim().toLowerCase() : '';
        const productKey = `${ProductCode}|${ProductNameKey}`;

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
            console.warn(`[Analytics] Skipped row due to invalid date: ${CountDate} (Code: ${ProductCode})`);
            skippedDate++;
            return;
        }

        const qty = parseInt(Quantity) || 0;
        const sysQty = parseInt(SystemQuantity) || 0;
        const status = ProductStatus || 'Matched';

        const rowData = {
            ProductCode,
            BreadfastID: BreadfastID || '',
            ProductName: ProductName || ProductCode,
            Category,
            Warehouse,
            PhysicalQty: qty,
            SystemQty: sysQty,
            ProductStatus: status,
            Date: parsedDate,
            productKey: ProductCode,
            currentQuantity: qty,
            lastCountDate: formatLocalDate(parsedDate),
        };

        results.push(rowData);

        // Add to history map for trend analysis
        if (!historyMap[ProductCode]) historyMap[ProductCode] = [];
        historyMap[ProductCode].push({
            date: parsedDate,
            quantity: qty,
            sysQty: sysQty,
            status: status
        });
    });

    console.log(`[Analytics] Data Import Summary:`);
    console.log(`   - Total Rows Input: ${data.length}`);
    console.log(`   - Valid Records: ${results.length}`);

    // 2. Process History and attach to results
    Object.keys(historyMap).forEach(key => {
        historyMap[key].sort((a, b) => a.date - b.date);
        historyMap[key] = historyMap[key].map((record, index, arr) => {
            const prev = arr[index - 1];
            const diff = prev ? record.quantity - prev.quantity : 0;
            return {
                ...record,
                diff,
                formattedDate: formatLocalDate(record.date)
            };
        });
    });

    // 3. Enrich rows with their specific history entry's diff
    const finalResults = results.map(row => {
        const fullHistory = historyMap[row.productKey] || [];
        // Match by date and quantity to find the specific audit event in history
        const histEntry = fullHistory.find(h => h.date.getTime() === row.Date.getTime() && h.quantity === row.PhysicalQty) || {};

        return {
            ...row,
            lastDiff: histEntry.diff || 0,
            history: fullHistory,
            latestTrend: fullHistory.slice(-7)
        };
    });

    // Apply Date Filtering
    let filteredResults = finalResults;
    if (startDate || endDate) {
        const start = startDate ? new Date(startDate + 'T00:00:00') : new Date(0);
        const end = endDate ? new Date(endDate + 'T23:59:59') : new Date(8640000000000000);
        filteredResults = finalResults.filter(r => r.Date >= start && r.Date <= end);
    }

    console.log(`[Analytics] Processed ${filteredResults.length} rows.`);
    return {
        products: filteredResults,
        kpis: calculateKPIs(filteredResults)
    };
}

export function getUniqueLatestProducts(products) {
    if (!products || products.length === 0) return [];
    // Sort DESC by Date to ensure newest record for each product code is FIRST
    const sorted = [...products].sort((a, b) => (b.Date?.getTime() || 0) - (a.Date?.getTime() || 0));
    const uniqueMap = new Map();
    sorted.forEach(r => {
        if (!uniqueMap.has(r.ProductCode)) {
            uniqueMap.set(r.ProductCode, r);
        }
    });
    return Array.from(uniqueMap.values());
}

export function calculateKPIs(products) {
    let totalQuantity = 0;
    let increasedCount = 0;
    let decreasedCount = 0;
    let stableCount = 0; // Matched

    let sumIncreased = 0;
    let sumDecreased = 0;
    let sumStable = 0;

    let biggestIncrease = { val: 0, product: '' };
    let biggestDecrease = { val: 0, product: '' };

    products.forEach(p => {
        totalQuantity += p.currentQuantity;

        const status = (p.ProductStatus || '').toLowerCase().trim();

        const isExtra = status.includes('extra') || status.includes('increased') || status.includes('زيادة') || status.includes('فائض') || status.includes('بزيادة') || status === '+';
        const isMissing = status.includes('missing') || status.includes('decreased') || status.includes('ناقص') || status.includes('عجز') || status.includes('بعجز') || status === '-';

        if (isExtra) {
            increasedCount++;
            sumIncreased += p.currentQuantity || 0;
        } else if (isMissing) {
            decreasedCount++;
            sumDecreased += p.currentQuantity || 0;
        } else {
            stableCount++; // Any other status is Matched (e.g., 'Matched', 'Match', 'Ok', 'مطابق', or even empty)
            sumStable += p.currentQuantity || 0;
        }

        if (p.lastDiff > biggestIncrease.val) {
            biggestIncrease = { val: p.lastDiff, product: p.ProductName };
        }
        if (p.lastDiff < biggestDecrease.val) {
            biggestDecrease = { val: p.lastDiff, product: p.ProductName };
        }
    });

    const distinctProducts = new Set(products.map(p => p.ProductCode));
    const totalRowsCount = products.length;
    const totalDistinct = distinctProducts.size;

    // Accuracy and percentages should be based on total records/audits performed
    const accuracy = totalRowsCount > 0 ? Math.round((stableCount / totalRowsCount) * 100) : 0;

    const percentStable = totalRowsCount > 0 ? Math.round((stableCount / totalRowsCount) * 100) : 0;
    const percentIncreased = totalRowsCount > 0 ? Math.round((increasedCount / totalRowsCount) * 100) : 0;
    const percentDecreased = totalRowsCount > 0 ? Math.round((decreasedCount / totalRowsCount) * 100) : 0;

    const latestMap = new Map();
    products.forEach(p => {
        const existing = latestMap.get(p.ProductCode);
        if (!existing || p.Date > existing.date) {
            latestMap.set(p.ProductCode, { date: p.Date, qty: p.currentQuantity });
        }
    });
    let sumLatestTotal = 0;
    latestMap.forEach(v => sumLatestTotal += v.qty);

    return {
        totalProducts: totalDistinct, // DISTINCT count as requested
        totalLatestQuantity: sumLatestTotal, // Sum of LATEST pieces per item
        totalRecords: totalRowsCount,  // RAW row count
        totalCurrentQuantity: totalQuantity,
        productsIncreased: increasedCount,
        productsDecreased: decreasedCount,
        productsStable: stableCount,
        sumIncreased,
        sumDecreased,
        sumStable,
        percentIncreased,
        percentDecreased,
        percentStable,
        accuracy: accuracy,
        biggestDailyIncrease: biggestIncrease,
        biggestDailyDecrease: biggestDecrease
    };
}
