import { google } from "googleapis";
import { formatRows } from "../src/Util/formatRows.js";

export async function readSheet(spreadsheetId = process.env.SPREADSHEET_ID, range = null) {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  try {
    let allData = [];
    let rangesToFetch = [];
    // 1. Get spreadsheet metadata to find all available sheets
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
    });
    const availableSheets = metadata.data.sheets.map(s => s.properties.title);
    console.log(`[Google Sheets] Spreadsheet contains: ${availableSheets.join(", ")}`);

    if (range) {
      rangesToFetch = [range];
      if (!availableSheets.includes(range)) {
        console.warn(`[Google Sheets] Warning: Requested range "${range}" not found in available sheets.`);
      }
    } else {
      rangesToFetch = availableSheets;
    }

    // 2. Fetch and format data from each sheet/range
    for (const sheetName of rangesToFetch) {
      console.log(`[Google Sheets] Reading from ID: ${spreadsheetId}, Range: "${sheetName}"`);

      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: spreadsheetId,
          range: sheetName,
        });

        if (res.data.values && res.data.values.length > 0) {
          const formatted = formatRows(res.data.values, sheetName);
          console.log(`[Google Sheets]   -> Successfully fetched ${formatted.length} data rows from "${sheetName}".`);
          allData = allData.concat(formatted);
        } else {
          console.warn(`[Google Sheets]   -> Range "${sheetName}" is empty.`);
        }
      } catch (innerError) {
        console.error(`[Google Sheets] Error reading sheet "${sheetName}":`, innerError.message);
        // Continue to next sheet instead of failing entirely
      }
    }

    console.log(`[Google Sheets] Total data rows combined: ${allData.length}`);
    return allData;

  } catch (error) {
    console.error("[Google Sheets Exception]", error.message);
    throw error;
  }
}
export async function listSheetTitles(spreadsheetId = process.env.SPREADSHEET_ID) {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  return metadata.data.sheets.map(s => s.properties.title);
}
