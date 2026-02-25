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
        const Quantity = findVal(['finalqty', 'final qty', 'final_qty', 'physicalqty', 'num', 'quantity', 'qty', 'count', 'stockqty']);
        const SystemQuantity = findVal(['sysqty', 'systemqty', 'stockqty', 'logicalqty', 'bookqty', 'logicqty', 'expected', 'expectedqty', 'system']);
        const ProductStatus = findVal(['Product Status', 'Proudact Status', 'proudactstatus', 'status', 'matchstatus', 'discrepancy', 'match/extra/missingstatus', 'inventorystatus', 'notes', 'result', 'auditresult', 'finalstatus', 'adjustment', 'variance', 'audit', 'finalvar', 'firstvar', 'lotatus', 'locationstatus', 'proudactstatus', 'loc.status']);
        const rawCat = findVal(['product/productcategory', 'category', 'type', 'cat']);
        const Category = (rawCat ? String(rawCat) : 'Other').trim();
        const Warehouse = findVal(['warehouse', 'location', 'store']) || 'Main';
        const FinalQTY = findVal(['finalqty', 'final qty', 'final_qty', 'finalqtyoriginal']);

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


        // معالجة التاريخ بشكل ذكي
        let parsedDate = null;
        if (!CountDate) {
            parsedDate = new Date('Invalid');
        } else if (CountDate instanceof Date) {
            parsedDate = CountDate;
        } else if (!isNaN(CountDate) && String(Number(CountDate)).length >= 5) {
            // Excel serial
            const excelSerial = parseFloat(CountDate);
            parsedDate = new Date(Date.UTC(1899, 11, 30) + excelSerial * 86400 * 1000);
        } else if (typeof CountDate === 'string') {
            let str = CountDate.trim();
            // yyyy-mm-dd or yyyy/mm/dd
            if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(str)) {
                parsedDate = new Date(str.replace(/\//g, '-'));
            } else if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/.test(str)) {
                // dd/mm/yyyy or mm/dd/yyyy or dd-mm-yyyy
                const parts = str.split(/[\/\-]/);
                let a = parseInt(parts[0]);
                let b = parseInt(parts[1]);
                let c = parseInt(parts[2]);
                // إذا السنة قصيرة
                if (c < 100) c += 2000;
                // إذا اليوم أكبر من 12 اعتبره يوم
                let day, month, year;
                if (a > 12) {
                    day = a; month = b; year = c;
                } else if (b > 12) {
                    day = b; month = a; year = c;
                } else {
                    // لو الاثنين <= 12 اعتبر الأول شهر
                    month = a; day = b; year = c;
                }
                parsedDate = new Date(year, month - 1, day);
            } else {
                parsedDate = new Date(str);
            }
        } else {
            parsedDate = new Date(CountDate);
        }

        if (isNaN(parsedDate.getTime())) {
            console.warn(`[Analytics] Skipped row due to invalid date: ${CountDate} (Code: ${ProductCode})`);
            skippedDate++;
            return;
        }

        const qty = parseInt(Quantity) || 0;
        const sysQty = parseInt(SystemQuantity) || 0;

        // توحيد قيم ProductStatus
        let statusRaw = String(ProductStatus || '').toLowerCase().replace(/\s/g, '');
        let status = statusRaw;
        if (statusRaw === 'extra') status = 'gain';
        else if (statusRaw === 'missing') status = 'loss';
        else if (statusRaw === 'match') status = 'match';

        const rowData = {
            ProductCode,
            BreadfastID: BreadfastID || '',
            ProductName: ProductName || ProductCode,
            Category,
            Warehouse,
            PhysicalQty: qty,
            SystemQty: sysQty,
            ProductStatus: status,
            FinalQTY: FinalQTY,
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
        // Aggregate history by date
        const aggregatedHistory = {};
        historyMap[key].forEach(record => {
            const fDate = formatLocalDate(record.date);
            if (!aggregatedHistory[fDate]) {
                aggregatedHistory[fDate] = { ...record, quantity: 0, sysQty: 0, formattedDate: fDate };
            }
            aggregatedHistory[fDate].quantity += record.quantity;
            aggregatedHistory[fDate].sysQty += record.sysQty;
        });

        // Convert back to array, sort, and recalculate status & diff
        const sortedAggregated = Object.values(aggregatedHistory).sort((a, b) => a.date - b.date);

        historyMap[key] = sortedAggregated.map((record, index, arr) => {
            const prev = arr[index - 1];
            const diff = prev ? record.quantity - prev.quantity : 0;

            let aggStatus = 'match';
            if (record.quantity > record.sysQty) aggStatus = 'gain';
            else if (record.quantity < record.sysQty) aggStatus = 'loss';

            return {
                ...record,
                status: aggStatus,
                diff
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

    // 1. Get Unique Latest Products First
    const latestProductsMap = new Map();
    products.forEach(p => {
        if (!latestProductsMap.has(p.ProductCode) || p.Date > latestProductsMap.get(p.ProductCode).Date) {
            latestProductsMap.set(p.ProductCode, p);
        }
    });

    const uniqueLatestProducts = Array.from(latestProductsMap.values());

    products.forEach(p => {
        totalQuantity += p.currentQuantity;

        let statusRaw = String(p.ProductStatus || '').toLowerCase().trim();
        let status = statusRaw;
        if (statusRaw === 'extra') status = 'gain';
        else if (statusRaw === 'missing') status = 'loss';
        else if (statusRaw === 'match') status = 'match';

        const isGain = status === 'gain';
        const isLoss = status === 'loss';

        // دعم جميع الأسماء الممكنة لعمود Final QTY

        let finalQty = 0;
        if (p['FinalQTY']) finalQty = parseInt(p['FinalQTY']) || 0;
        else if (p['finalqty']) finalQty = parseInt(p['finalqty']) || 0;
        else if (p['Final QTY']) finalQty = parseInt(p['Final QTY']) || 0;
        else if (p['finalQtyOriginal']) finalQty = parseInt(p['finalQtyOriginal']) || 0;

        // Log للتحقق من القيم
        console.log(`[KPI DEBUG] Product: ${p.ProductName}, Status: ${status}, FinalQTY: ${finalQty}, Raw:`, {
            FinalQTY: p['FinalQTY'],
            finalqty: p['finalqty'],
            Final_QTY: p['Final QTY'],
            finalQtyOriginal: p['finalQtyOriginal']
        });

        if (isGain) {
            increasedCount++;
            sumIncreased += finalQty;
        } else if (isLoss) {
            decreasedCount++;
            sumDecreased += finalQty;
        } else {
            stableCount++;
            sumStable += finalQty;
        }

        if (p.lastDiff > biggestIncrease.val) {
            biggestIncrease = { val: p.lastDiff, product: p.ProductName };
        }
        if (p.lastDiff < biggestDecrease.val) {
            biggestDecrease = { val: p.lastDiff, product: p.ProductName };
        }
    });

    const totalDistinct = uniqueLatestProducts.length;
    const totalRowsCount = products.length; // Keep total rows (audit events) for reference

    const accuracy = totalRowsCount > 0 ? Math.round((stableCount / totalRowsCount) * 100) : 0;

    const percentStable = totalRowsCount > 0 ? Math.round((stableCount / totalRowsCount) * 100) : 0;
    const percentIncreased = totalRowsCount > 0 ? Math.round((increasedCount / totalRowsCount) * 100) : 0;
    const percentDecreased = totalRowsCount > 0 ? Math.round((decreasedCount / totalRowsCount) * 100) : 0;

    // دعم جميع الأسماء الممكنة لعمود Final QTY في إجمالي القطع
    const totalFinalQty = products.reduce((acc, p) => {
        let finalQty = 0;
        if (p['FinalQTY']) finalQty = parseInt(p['FinalQTY']) || 0;
        else if (p['finalqty']) finalQty = parseInt(p['finalqty']) || 0;
        else if (p['Final QTY']) finalQty = parseInt(p['Final QTY']) || 0;
        else if (p['finalQtyOriginal']) finalQty = parseInt(p['finalQtyOriginal']) || 0;
        return acc + finalQty;
    }, 0);

    return {
        totalProducts: totalDistinct, // DISTINCT count as requested
        totalLatestQuantity: totalFinalQty, // إجمالي Final QTY لكل المنتجات
        totalRecords: totalRowsCount,  // RAW row count
        totalCurrentQuantity: totalFinalQty, // إجمالي Final QTY لكل المنتجات
        productsGain: increasedCount,
        productsLoss: decreasedCount,
        productsStable: stableCount,
        sumGain: sumIncreased,
        sumLoss: sumDecreased,
        sumStable,
        percentGain: percentIncreased,
        percentLoss: percentDecreased,
        percentStable,
        accuracy: accuracy,
        biggestDailyIncrease: biggestIncrease,
        biggestDailyDecrease: biggestDecrease
    };
}
