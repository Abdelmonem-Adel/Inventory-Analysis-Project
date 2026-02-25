import express from 'express';
import {
    getInventoryDashboard,
    getInventoryAnalysis,
    getProductivityAnalysis
} from '../controllers/inventoryController.js';
import { listSheetTitles, readSheet } from '../../services/sheet.service.js';

const router = express.Router();

router.get('/dashboard', getInventoryDashboard);
router.get('/analysis', getInventoryAnalysis);
router.get('/productivity', getProductivityAnalysis);

// Verification endpoint
router.get('/verify-locations-acu', async (req, res) => {
    try {
        const sheetTitle = 'Scans';
        const data = await readSheet(process.env.SPREADSHEET_ID, sheetTitle);

        res.json({
            success: true,
            sheetName: sheetTitle,
            rowCount: data.length,
            sampleHeaders: Object.keys(data[0] || {}).slice(0, 15)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
