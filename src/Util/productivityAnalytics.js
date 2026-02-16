/**
 * Productivity Analysis Logic
 * Processes data from Google Sheets 'Productivity' tab.
 */

export function processProductivityData(data) {
    if (!data || data.length === 0) return [];

    const groupMap = new Map();

    data.forEach((row, index) => {
        // Normalize keys to find 'User Name' and 'date input'
        const rowKeys = Object.keys(row);
        
        // Helper to find key case-insensitively
        const findKey = (target) => rowKeys.find(k => k.toLowerCase().replace(/\s/g, '') === target.toLowerCase().replace(/\s/g, ''));

        const userNameKey = findKey('User Name');
        const dateInputKey = findKey('date input');

        const userName = userNameKey ? String(row[userNameKey]).trim() : null;
        const dateInput = dateInputKey ? row[dateInputKey] : null;

        // Skip invalid rows
        if (!userName || !dateInput) return;

        // Extract Date and Hour
        let dateStr, hour;

        try {
            // Check if dateInput is excel serial date (though Google Sheets usually returns formatted strings or ISO)
            // Google Sheets V4 API with valueRenderOption 'FORMATTED_VALUE' usually returns strings like "2/13/2026 0:42:16"
            
            const dateObj = new Date(dateInput);
            
            if (isNaN(dateObj.getTime())) {
                // Try parsing manual string format if new Date() fails
                // Expecting "M/D/YYYY H:MM:SS" or similar
                const parts = String(dateInput).split(' ');
                dateStr = parts[0];
                const timePart = parts[1] || '00:00';
                hour = String(parseInt(timePart.split(':')[0], 10));
            } else {
                // Successfully parsed as Date object
                // Format date as M/D/YYYY to match previous specific requirement
                dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;
                hour = String(dateObj.getHours());
            }

        } catch (e) {
            console.warn(`[Productivity] Error parsing date row ${index}: ${dateInput}`);
            return;
        }

        // Grouping Key
        const groupKey = `${userName}|${dateStr}|${hour}`;

        // Initialize quantity and item variables
        const qtyKey = findKey('Final QTY') || findKey('Physical Qty') || findKey('Quantity') || findKey('QTY');
        const qty = qtyKey ? (parseFloat(row[qtyKey]) || 0) : 0;

        const itemKey = findKey('Barcode') || findKey('Item ID') || findKey('Product Code');
        const item = itemKey ? String(row[itemKey]).trim() : `row-${index}`;

        if (groupMap.has(groupKey)) {
            const entry = groupMap.get(groupKey);
            entry.count++;
            entry.totalQty += qty;
            entry.uniqueSet.add(item);
        } else {
            groupMap.set(groupKey, {
                count: 1,
                totalQty: qty,
                uniqueSet: new Set([item])
            });
        }
    });

    // Convert to Array
    const result = [];
    groupMap.forEach((data, key) => {
        const [employee, date, hour] = key.split('|');
        result.push({
            employee,
            date,
            hour,
            totalTasks: data.count,
            totalQuantity: data.totalQty,
            uniqueProducts: data.uniqueSet.size
        });
    });

    // Sort
    result.sort((a, b) => {
        if (a.employee !== b.employee) return a.employee.localeCompare(b.employee);
        if (a.date !== b.date) return new Date(a.date) - new Date(b.date);
        return parseInt(a.hour) - parseInt(b.hour);
    });

    return result;
}
