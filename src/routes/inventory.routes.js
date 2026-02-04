import express from 'express';
import { getInventoryDashboard, getInventoryAnalysis } from '../controllers/inventoryController.js';
import { listSheetTitles, readSheet } from '../../services/sheet.service.js';

const router = express.Router();

router.get('/dashboard', getInventoryDashboard);
router.get('/analysis', getInventoryAnalysis);

// Verification endpoint to check sheet2 connection
router.get('/verify-sheet2', async (req, res) => {
    try {
        const titles = await listSheetTitles();
        const pattern = /sheet\s*2/i;
        const match = titles.find(t => pattern.test(t));

        if (!match) {
            return res.json({
                success: false,
                message: 'Sheet2 not found',
                availableSheets: titles
            });
        }

        const data = await readSheet(process.env.SPREADSHEET_ID, match);

        res.json({
            success: true,
            sheetName: match,
            rowCount: data.length,
            sampleHeaders: Object.keys(data[0] || {}).slice(0, 15),
            availableSheets: titles
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
