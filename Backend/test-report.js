import dotenv from 'dotenv';
dotenv.config();

import { runDailyJob } from './services/cronService.js';

console.log('[test-report] Triggering daily report job manually...');
runDailyJob().then(() => {
    console.log('[test-report] Done.');
    process.exit(0);
}).catch((err) => {
    console.error('[test-report] Failed:', err);
    process.exit(1);
});
