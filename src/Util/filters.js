/**
 * Filtering logic for Inventory Dashboard
 */

export function applyFilters(products, filters = {}) {
    let result = [...products];

    // Basic Filters
    if (filters.search) {
        const query = filters.search.toLowerCase();
        result = result.filter(p =>
            (p.ProductCode && p.ProductCode.toLowerCase().includes(query)) ||
            (p.ProductName && p.ProductName.toLowerCase().includes(query)) ||
            (p.BreadfastID && p.BreadfastID.toLowerCase().includes(query))
        );
    }

    if (filters.category) {
        if (filters.category === '(Blank)') {
            result = result.filter(p => !p.Category || p.Category === '' || p.Category === '(Blank)');
        } else {
            result = result.filter(p => p.Category === filters.category);
        }
    }

    if (filters.warehouse) {
        result = result.filter(p => p.Warehouse === filters.warehouse);
    }

    // Smart Filters
    if (filters.type === 'increased') {
        result = result.filter(p => p.lastDiff > 0);
    } else if (filters.type === 'decreased') {
        result = result.filter(p => p.lastDiff < 0);
    } else if (filters.type === 'stable') {
        result = result.filter(p => p.lastDiff === 0);
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
