import { google } from "googleapis";
import { formatRows } from "../src/Util/formatRows.js";

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });

const CACHE_TTL_MS = 300000;
const sheetCache = new Map();

function columnToLetter(columnNumber) {
  let result = "";
  let n = columnNumber;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function buildBoundedRange(sheetTitle, gridProps) {
  const rowCount = Math.max(1, gridProps?.rowCount || 1);
  const colCount = Math.max(1, gridProps?.columnCount || 1);
  const lastCol = columnToLetter(colCount);
  return `${sheetTitle}!A1:${lastCol}${rowCount}`;
}

function parseSheetName(range) {
  const bangIndex = range.indexOf("!");
  if (bangIndex === -1) return range;
  return range.slice(0, bangIndex);
}

function isBoundedA1Range(range) {
  const bangIndex = range.indexOf("!");
  if (bangIndex === -1) return false;
  const a1 = range.slice(bangIndex + 1);
  return /:[A-Za-z]+\d+$/.test(a1);
}

function getCacheKey(spreadsheetId, range) {
  return `${spreadsheetId}::${range || "__ALL__"}`;
}

export async function readSheet(spreadsheetId = process.env.SPREADSHEET_ID, range = null) {
  try {
    const cacheKey = getCacheKey(spreadsheetId, range);
    const cached = sheetCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    let allData = [];
    let rangesToFetch = [];
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
    });
    const sheetEntries = metadata.data.sheets.map(s => ({
      title: s.properties.title,
      gridProps: s.properties.gridProperties,
    }));
    const availableSheets = sheetEntries.map(s => s.title);
    console.log(`[Google Sheets] Spreadsheet contains: ${availableSheets.join(", ")}`);

    if (range) {
      const rangeSheetName = parseSheetName(range);
      const sheetEntry = sheetEntries.find(s => s.title === rangeSheetName);
      if (!availableSheets.includes(rangeSheetName)) {
        console.warn(`[Google Sheets] Warning: Requested range "${range}" not found in available sheets.`);
      }
      if (sheetEntry) {
        const boundedRange = isBoundedA1Range(range)
          ? range
          : buildBoundedRange(sheetEntry.title, sheetEntry.gridProps);
        rangesToFetch = [{ title: sheetEntry.title, range: boundedRange }];
      } else {
        rangesToFetch = [{ title: rangeSheetName, range: range }];
      }
    } else {
      rangesToFetch = sheetEntries.map(s => ({
        title: s.title,
        range: buildBoundedRange(s.title, s.gridProps),
      }));
    }

    const ranges = rangesToFetch.map(r => r.range);
    if (ranges.length === 0) {
      sheetCache.set(cacheKey, { timestamp: Date.now(), data: [] });
      return [];
    }

    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: spreadsheetId,
      ranges: ranges,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const valueRanges = res.data.valueRanges || [];
    valueRanges.forEach((valueRange, index) => {
      const sheetName = rangesToFetch[index]?.title || parseSheetName(valueRange.range || "");
      const values = valueRange.values;
      if (values && values.length > 0) {
        const formatted = formatRows(values, sheetName);
        console.log(`[Google Sheets]   -> Successfully fetched ${formatted.length} data rows from "${sheetName}".`);
        allData = allData.concat(formatted);
      } else {
        console.warn(`[Google Sheets]   -> Range "${sheetName}" is empty.`);
      }
    });

    console.log(`[Google Sheets] Total data rows combined: ${allData.length}`);
    sheetCache.set(cacheKey, { timestamp: Date.now(), data: allData });
    return allData;
  } catch (error) {
    console.error("[Google Sheets Exception]", error.message);
    throw error;
  }
}

export async function listSheetTitles(spreadsheetId = process.env.SPREADSHEET_ID) {
  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  return metadata.data.sheets.map(s => s.properties.title);
}

export function clearCache() {
  sheetCache.clear();
  console.log('[sheet.service] Cache cleared.');
}
