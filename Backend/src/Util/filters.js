/**
 * Filtering logic for Inventory Dashboard
 */

export function applyFilters(products, filters = {}) {
    let result = [...products];

    // Basic Filters
    if (filters.search) {
        const query = filters.search.toLowerCase();
        result = result.filter(p =>
            (p.ProductCode && String(p.ProductCode).toLowerCase().includes(query)) ||
            (p.ProductName && String(p.ProductName).toLowerCase().includes(query)) ||
            (p.BreadfastID && String(p.BreadfastID).toLowerCase().includes(query))
        );
    }

    if (filters.category) {
        if (filters.category === '(Blank)') {
            result = result.filter(p => !p.Category || String(p.Category).trim() === '' || p.Category === '(Blank)');
        } else {
            const filterCat = String(filters.category).trim().toLowerCase();
            result = result.filter(p => p.Category && String(p.Category).trim().toLowerCase() === filterCat);
        }
    }

    if (filters.warehouse) {
        result = result.filter(p => p.Warehouse === filters.warehouse);
    }

    // 3. Smart Filters - Product-Aware Status Filtering
    const isGain = (s) => {
        const status = (s || '').toLowerCase().trim();
        return status.includes('extra') || status.includes('increased') || status.includes('gain') || status.includes('زيادة') || status.includes('فائض') || status.includes('بزيادة') || status === '+';
    };
    const isLoss = (s) => {
        const status = (s || '').toLowerCase().trim();
        return status.includes('missing') || status.includes('decreased') || status.includes('loss') || status.includes('ناقص') || status.includes('عجز') || status.includes('بعجز') || status === '-';
    };

    if (filters.type && (filters.type === 'increased' || filters.type === 'top_gain' || filters.type === 'decreased' || filters.type === 'top_loss' || filters.type === 'stable' || filters.type === 'top_match')) {
        // First, get the latest record for each product code within the current result set
        const latestStatusMap = new Map();
        result.forEach(p => {
            const currentLatest = latestStatusMap.get(p.ProductCode);
            if (!currentLatest || p.Date > currentLatest.Date) {
                latestStatusMap.set(p.ProductCode, p);
            }
        });

        // Filter out product groups based on the status of their LATEST record
        result = result.filter(p => {
            const latest = latestStatusMap.get(p.ProductCode);
            if (!latest) return false;

            const latestStatus = latest.ProductStatus;

            if (filters.type === 'increased' || filters.type === 'top_gain') {
                return isGain(latestStatus);
            } else if (filters.type === 'decreased' || filters.type === 'top_loss') {
                return isLoss(latestStatus);
            } else if (filters.type === 'stable' || filters.type === 'top_match') {
                return !isGain(latestStatus) && !isLoss(latestStatus);
            }
            return true;
        });
    }

    if (filters.highMovement) {
        const threshold = parseInt(filters.highMovement) || 0;
        result = result.filter(p => Math.abs(p.lastDiff) > threshold);
    }

    if (filters.continuousDecreaseDays) {
        const days = parseInt(filters.continuousDecreaseDays) || 3;
        result = result.filter(p => {
            const history = p.history.slice(-days);
            if (history.length < days) return false;
            return history.every(record => record.diff < 0);
        });
    }

    return result;
}
