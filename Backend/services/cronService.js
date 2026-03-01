import cron from 'node-cron';
import { getTodayScans } from './excelService.js';
import { generateReportFiles } from './reportService.js';
import { sendDailyReportEmail } from './mailService.js';

export const runDailyJob = async () => {
    try {
        const todayDateStr = new Date().toLocaleDateString('en-US'); // Format: M/D/YYYY
        console.log(`[cronService] Starting daily scan report job for ${todayDateStr}`);

        const scans = await getTodayScans();

        if (!scans || scans.length === 0) {
            console.log(`[cronService] No data for today (${todayDateStr}). Job completed.`);
            return;
        }

        console.log(`[cronService] Found ${scans.length} scans for today. Generating report...`);
        const { excelPath, imagePath, piecesImagePath } = await generateReportFiles(scans, todayDateStr);

        console.log(`[cronService] Report generated. Sending email...`);
        await sendDailyReportEmail(excelPath, imagePath, todayDateStr, piecesImagePath);

        console.log(`[cronService] Daily scan report job completed successfully.`);
    } catch (error) {
        console.error(`[cronService] Error running daily job:`, error);
    }
};

export const startCronJob = () => {
    // Run every day at 9:30 AM Cairo time
    cron.schedule('30 9 * * *', () => {
        runDailyJob();
    }, {
        timezone: "Africa/Cairo"
    });

    console.log('[cronService] Scheduled daily scan report job for 9:30 AM Cairo time.');
};