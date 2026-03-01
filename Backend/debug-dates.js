import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readSheet, clearCache } from './services/sheet.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const debug = async () => {
    clearCache();
    const data = await readSheet(process.env.SPREADSHEET_ID, 'Scans');
    console.log(`Total rows fetched: ${data.length}`);

    if (data.length > 0) {
        console.log('\nAll column keys in first row:');
        console.log(Object.keys(data[0]));
        console.log('\nFirst row values:');
        console.log(data[0]);
        console.log('\nLast row values:');
        console.log(data[data.length - 1]);
    }
    process.exit(0);
};

debug().catch(console.error);
