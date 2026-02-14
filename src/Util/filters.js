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

    // Smart Filters - Sync with KPI logic (text-based status)
    const isExtra = (s) => {
        const status = (s || '').toLowerCase().trim();
        return status.includes('extra') || status.includes('increased') || status.includes('زيادة') || status.includes('فائض') || status.includes('بزيادة') || status === '+';
    };
    const isMissing = (s) => {
        const status = (s || '').toLowerCase().trim();
        return status.includes('missing') || status.includes('decreased') || status.includes('ناقص') || status.includes('عجز') || status.includes('بعجز') || status === '-';
    };

    if (filters.type === 'increased') {
        result = result.filter(p => isExtra(p.ProductStatus));
    } else if (filters.type === 'decreased') {
        result = result.filter(p => isMissing(p.ProductStatus));
    } else if (filters.type === 'stable') {
        result = result.filter(p => !isExtra(p.ProductStatus) && !isMissing(p.ProductStatus));
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
