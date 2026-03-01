import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { runDailyJob } from './services/cronService.js';
import { clearCache } from './services/sheet.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const testJob = async () => {
    console.log("=== Manual Test Execution of Daily Report ===");

    // Clear Google Sheets cache to ensure we fetch the latest data
    clearCache();

    try {
        await runDailyJob();
    } catch (err) {
        console.error("Test failed: ", err);
    }
    console.log("=== Manual Test Execution Finished ===");
    process.exit(0);
};

testJob();
