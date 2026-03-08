import cron from 'node-cron';
import { getTodayScans, getAllScans } from './excelService.js';
import { generateReportFiles } from './reportService.js';
import { sendDailyReportEmail } from './mailService.js';
import { analyzeInventory } from '../src/Util/smartAnalysis.js';

export const runDailyJob = async () => {
    try {
        const todayDateStr = new Date().toLocaleDateString('en-US'); // Format: M/D/YYYY
        console.log(`[cronService] Starting daily scan report job for ${todayDateStr}`);

        // Fetch ALL data to find expirations across the whole inventory
        const allScans = await getAllScans();
        const todayScans = await getTodayScans();

        if (!allScans || allScans.length === 0) {
            console.log(`[cronService] No data found in the sheet. Job completed.`);
            return;
        }

        console.log(`[cronService] Analyzing full inventory for expiry alerts...`);
        const analysis = analyzeInventory(allScans);
        
        // Items that are either already expired or will expire within 7 days
        const criticalExpiries = analysis ? [...analysis.expiryAnalysis.expired, ...analysis.expiryAnalysis.expiring7Days] : [];
        console.log(`[cronService] Found ${criticalExpiries.length} critical expiry items.`);

        if (!todayScans || todayScans.length === 0) {
            console.log(`[cronService] No new scans for today (${todayDateStr}). Report generation skipped.`);
            // Optionally, we could still send an email if there are critical expiries
            if (criticalExpiries.length > 0) {
                console.log(`[cronService] Sending standalone critical expiry alert email...`);
                await sendDailyReportEmail(null, null, todayDateStr, null, criticalExpiries);
            }
            return;
        }

        console.log(`[cronService] Found ${todayScans.length} scans for today. Generating report...`);
        const { excelPath, imagePath, piecesImagePath } = await generateReportFiles(todayScans, todayDateStr, allScans);

        console.log(`[cronService] Sending email with today's report and full inventory expiry alerts...`);
        await sendDailyReportEmail(excelPath, imagePath, todayDateStr, piecesImagePath, criticalExpiries);

        console.log(`[cronService] Daily scan report job completed successfully.`);
    } catch (error) {
        console.error(`[cronService] Error running daily job:`, error);
    }
};

export const startCronJob = () => {
    // Run every day at 10:00 AM Cairo time
    cron.schedule('20 10 * * *', () => {
        runDailyJob();
    }, {
        timezone: "Africa/Cairo"
    });

    console.log('[cronService] Scheduled daily scan report job for 10:00 AM Cairo time.');
}