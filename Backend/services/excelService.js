import { readSheet, clearCache } from './sheet.service.js';

/**
 * Converts an Excel date serial number to a JS Date object.
 * Excel serial 1 = Jan 1, 1900. There's also a known Excel leap year bug 
 * where 1900 is treated as a leap year, hence the -2 adjustment.
 */
const excelSerialToDate = (serial) => {
    const date = new Date((serial - 25569) * 86400 * 1000);
    return date;
};

/**
 * Reads data from the 'Items' Google Sheet and filters rows matching today's date.
 * Relies on the 'date' column in the 'Items' sheet.
 * 
 * @returns {Promise<Array<Object>|null>} Array of row objects or null if no data
 */
export const getTodayScans = async () => {
    try {
        // Always clear cache to get the latest data
        clearCache();
        // Updated to read from 'Items' sheet as per user request
        const sheetData = await readSheet(process.env.SPREADSHEET_ID, 'Items');

        if (!sheetData || sheetData.length === 0) {
            console.log("[excelService] No data found in 'Items' sheet.");
            return null;
        }

        const todayDateStr = new Date().toLocaleDateString('en-US'); // Format: M/D/YYYY
        console.log(`[excelService] Filtering for date: "${todayDateStr}"`);
        const filteredRows = [];

        for (const row of sheetData) {
            const rawDate = row['date'];
            if (rawDate === undefined || rawDate === null || rawDate === '') continue;

            let rowDateStr = '';

            if (typeof rawDate === 'number') {
                // Excel serial number -> convert to JS Date -> format as M/D/YYYY
                const jsDate = excelSerialToDate(rawDate);
                rowDateStr = jsDate.toLocaleDateString('en-US');
            } else {
                // String date: handle "M/D/YYYY" or "M/D/YYYY HH:mm:ss"
                const str = rawDate.toString().trim();
                const datePart = str.includes(' ') ? str.split(' ')[0] : str;
                try {
                    const parsed = new Date(datePart);
                    if (!isNaN(parsed.getTime())) {
                        rowDateStr = parsed.toLocaleDateString('en-US');
                    } else {
                        rowDateStr = datePart;
                    }
                } catch {
                    rowDateStr = datePart;
                }
            }

            if (rowDateStr === todayDateStr) {
                filteredRows.push(row);
            }
        }

        if (filteredRows.length === 0) {
            console.log(`[excelService] No data for today (${todayDateStr}) in Items sheet.`);
            return null;
        }

        console.log(`[excelService] Found ${filteredRows.length} rows for today in Items sheet.`);
        return filteredRows;
    } catch (error) {
        console.error(`[excelService] Error reading Google Sheet:`, error.message);
        throw error;
    }
};
