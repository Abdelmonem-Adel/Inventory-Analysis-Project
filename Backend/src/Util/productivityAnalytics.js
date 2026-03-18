/**
 * Productivity Analysis Logic
 * Processes data from Google Sheets 'Productivity' tab.
 */

function formatBackendDate(dateInput) {
    if (!dateInput) return { dateStr: null, hour: null };

    let dateObj;

    // 1. Handle Excel Serial Numbers (e.g., 46055.45)
    const num = parseFloat(dateInput);
    if (!isNaN(num) && num > 30000 && num < 60000) {
        // Excel serial date to JS date
        dateObj = new Date((num - 25569) * 86400 * 1000);
    } else {
        dateObj = new Date(dateInput);
    }

    if (!isNaN(dateObj.getTime())) {
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        return {
            dateStr: `${day}/${month}/${dateObj.getFullYear()}`,
            hour: String(dateObj.getHours()).padStart(2, '0')
        };
    }

    // 2. Fallback for non-standard formats (e.g. DD/MM/YYYY or strings Node's Date() can't parse)
    const inputStr = String(dateInput).trim();
    const parts = inputStr.split(' ');
    const datePart = parts[0];
    const timePart = parts[1] || '00:00';
    const hour = String(parseInt(timePart.split(':')[0], 10)).padStart(2, '0');

    // Expected formats: DD/MM/YYYY, MM/DD/YYYY, YYYY/MM/DD
    const dParts = datePart.split(/[\/\-\.]/);
    if (dParts.length === 3) {
        let first = dParts[0], second = dParts[1], third = dParts[2];

        // YYYY/MM/DD
        if (first.length === 4) {
            return { dateStr: `${third.padStart(2, '0')}/${second.padStart(2, '0')}/${first}`, hour };
        }

        // Check if likely MM/DD or DD/MM
        // If first is > 12, it's definitely DD (assuming DD/MM)
        // If second is > 12, it's definitely MM/DD (so swap to DD/MM)
        const v1 = parseInt(first);
        const v2 = parseInt(second);

        if (v1 <= 12 && v2 > 12) {
            // MM/DD -> DD/MM
            return { dateStr: `${second.padStart(2, '0')}/${first.padStart(2, '0')}/${third}`, hour };
        }

        // Default to DD/MM/YYYY
        return { dateStr: `${first.padStart(2, '0')}/${second.padStart(2, '0')}/${third}`, hour };
    }

    return { dateStr: datePart, hour };
}

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
        const { dateStr, hour } = formatBackendDate(dateInput);

        // Skip invalid rows
        if (!userName || !dateStr) return;

        // Grouping Key
        const groupKey = `${userName}|${dateStr}|${hour}`;

        // Initialize quantity and item variables
        const qtyKey = findKey('Final QTY') || findKey('Physical Qty') || findKey('Quantity') || findKey('QTY');
        const qty = qtyKey ? (parseFloat(row[qtyKey]) || 0) : 0;

        const itemKey = findKey('Barcode') || findKey('Item ID') || findKey('Product Code');
        const item = itemKey ? String(row[itemKey]).trim() : `row-${index}`;

        // Track Locations
        const locKey = findKey('Location') || findKey('Product Location') || findKey('Loc') || findKey('Aisle');
        const loc = locKey ? String(row[locKey]).trim() : 'Unknown';

        if (groupMap.has(groupKey)) {
            const entry = groupMap.get(groupKey);
            entry.count++;
            entry.totalQty += qty;
            entry.uniqueSet.add(item);
            entry.locSet.add(loc);
        } else {
            groupMap.set(groupKey, {
                count: 1,
                totalQty: qty,
                uniqueSet: new Set([item]),
                locSet: new Set([loc])
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
            uniqueProducts: data.uniqueSet.size,
            uniqueLocations: data.locSet.size
        });
    });

    // Sort
    result.sort((a, b) => {
        if (a.employee !== b.employee) return a.employee.localeCompare(b.employee);

        const parseD = (s) => {
            const p = s.split('/');
            return new Date(p[2], p[1] - 1, p[0]);
        };
        const da = parseD(a.date);
        const db = parseD(b.date);
        if (da - db !== 0) return da - db;
        return parseInt(a.hour) - parseInt(b.hour);
    });

    return result;
}

/**
 * Calculates high-level KPI overview from raw productivity rows
 */
export function calculateProductivityOverview(rawData) {
    if (!rawData || rawData.length === 0) {
        return { avgPerHour: 0, avgPerDay: 0, avgLocsPerHour: 0, avgLocsPerDay: 0, totalItems: 0, staffProductivity: {} };
    }

    const findKey = (row, target) => Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === target.toLowerCase().replace(/\s/g, ''));

    const globalUniqueItems = new Set();
    const workerHourSlots = new Map(); // "userName|date|hour" => Set(items)
    const workerDaySlots = new Map();  // "userName|date" => Set(items)
    const workerHourLocs = new Map();  // "userName|date|hour" => Set(locations)
    const workerDayLocs = new Map();   // "userName|date" => Set(locations)
    const staffTracking = {}; // userName => { totalUnique: Set }

    rawData.forEach((row, index) => {
        const rowKeys = Object.keys(row);
        const userNameKey = rowKeys.find(k => k.toLowerCase().replace(/\s/g, '') === 'username');
        const dateInputKey = rowKeys.find(k => k.toLowerCase().replace(/\s/g, '') === 'dateinput');

        const userName = userNameKey ? String(row[userNameKey]).trim() : null;
        const dateInput = dateInputKey ? row[dateInputKey] : null;

        if (!userName || !dateInput) return;

        // Item ID
        const itemKey = findKey(row, 'Barcode') || findKey(row, 'Item ID') || findKey(row, 'Product Code');
        const item = itemKey ? String(row[itemKey]).trim() : `row-${index}`;
        globalUniqueItems.add(item);

        // Location
        const locKey = findKey(row, 'Location') || findKey(row, 'Product Location') || findKey(row, 'Loc') || findKey(row, 'Aisle');
        const loc = locKey ? String(row[locKey]).trim() : 'Unknown';

        // Parse Date/Hour
        const { dateStr, hour } = formatBackendDate(dateInput);
        if (!dateStr) return;

        const hrKey = `${userName}|${dateStr}|${hour}`;
        const dayKey = `${userName}|${dateStr}`;

        if (!workerHourSlots.has(hrKey)) workerHourSlots.set(hrKey, new Set());
        if (!workerDaySlots.has(dayKey)) workerDaySlots.set(dayKey, new Set());
        if (!workerHourLocs.has(hrKey)) workerHourLocs.set(hrKey, new Set());
        if (!workerDayLocs.has(dayKey)) workerDayLocs.set(dayKey, new Set());

        workerHourSlots.get(hrKey).add(item);
        workerDaySlots.get(dayKey).add(item);
        workerHourLocs.get(hrKey).add(loc);
        workerDayLocs.get(dayKey).add(loc);

        if (!staffTracking[userName]) staffTracking[userName] = { totalUnique: new Set() };
        staffTracking[userName].totalUnique.add(item);
    });

    // Global averages for items
    let totalHourItems = 0;
    workerHourSlots.forEach(set => totalHourItems += set.size);
    const avgPerHour = workerHourSlots.size > 0 ? (totalHourItems / workerHourSlots.size).toFixed(1) : 0;

    let totalDayItems = 0;
    workerDaySlots.forEach(set => totalDayItems += set.size);
    const avgPerDay = workerDaySlots.size > 0 ? (totalDayItems / workerDaySlots.size).toFixed(1) : 0;

    // Global averages for locations
    let totalHourLocs = 0;
    workerHourLocs.forEach(set => totalHourLocs += set.size);
    const avgLocsPerHour = workerHourLocs.size > 0 ? (totalHourLocs / workerHourLocs.size).toFixed(1) : 0;

    let totalDayLocs = 0;
    workerDayLocs.forEach(set => totalDayLocs += set.size);
    const avgLocsPerDay = workerDayLocs.size > 0 ? (totalDayLocs / workerDayLocs.size).toFixed(1) : 0;

    const staffProductivity = {};
    Object.keys(staffTracking).forEach(user => {
        const userHours = [...workerHourSlots.entries()].filter(([key]) => key.startsWith(user + '|'));
        const userDays = [...workerDaySlots.entries()].filter(([key]) => key.startsWith(user + '|'));

        let userHrSum = 0;
        userHours.forEach(([_, set]) => userHrSum += set.size);

        let userDaySum = 0;
        userDays.forEach(([_, set]) => userDaySum += set.size);

        staffProductivity[user] = {
            totalItems: staffTracking[user].totalUnique.size,
            avgPerHour: userHours.length > 0 ? (userHrSum / userHours.length).toFixed(1) : 0,
            avgPerDay: userDays.length > 0 ? (userDaySum / userDays.length).toFixed(1) : 0
        };
    });

    return {
        totalItems: globalUniqueItems.size,
        avgPerHour,
        avgPerDay,
        avgLocsPerHour,
        avgLocsPerDay,
        staffProductivity
    };
}
