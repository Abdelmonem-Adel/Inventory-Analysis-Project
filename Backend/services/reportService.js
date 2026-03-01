import ExcelJS from 'exceljs';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateReportFiles = async (todayScans, dateString) => {
    const safeDateStr = dateString.replace(/\//g, '-');
    const tempDir = path.join(__dirname, '../temp');

    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const excelPath = path.join(tempDir, `daily_report_${safeDateStr}.xlsx`);
    const imagePath = path.join(tempDir, `daily_chart_items_${safeDateStr}.png`);
    const piecesImagePath = path.join(tempDir, `daily_chart_pieces_${safeDateStr}.png`);

    try {
        // 1. Generate Excel Report
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Today Items');

        if (todayScans.length > 0) {
            // Extract headers from the first object
            const columns = Object.keys(todayScans[0]).map(key => ({ header: key, key: key }));
            worksheet.columns = columns;

            todayScans.forEach(scan => {
                worksheet.addRow(scan);
            });
        }

        await workbook.xlsx.writeFile(excelPath);

        // 2. Generate Chart Images
        const width = 800;
        const height = 450;
        const chartCallback = (ChartJS) => { 
            // Register datalabels plugin globally within this canvas instance
            ChartJS.register(ChartDataLabels);
        };
        const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, chartCallback, backgroundColour: 'white' });

        // Maps for Items (count) and Pieces (quantity sum)
        const itemCategoryMap = {};
        const pieceCategoryMap = {};
        
        // Debugging: let's see what keys are available in the first row
        if (todayScans.length > 0) {
            console.log(`[reportService] Available keys in scan object:`, Object.keys(todayScans[0]));
            // Also let's try to find a key that looks like 'locatonstatus' but might be formatted differently
            const sampleRow = todayScans[0];
            const statusKey = Object.keys(sampleRow).find(k => k.includes('status') || k.includes('location'));
            console.log(`[reportService] Detected status key candidate: "${statusKey}" with value: "${sampleRow[statusKey]}"`);
        }

        for (const scan of todayScans) {
            const cat = scan['category'] || 'Unknown';
            // User clarified the column name is exactly "item status"
            // The formatRows.js utility removes spaces and lowercases keys: "itemstatus"
            const rawStatusValue = scan['itemstatus'] || scan['item status'] || scan['locatonstatus'] || '';
            let rawStatus = (rawStatusValue).toString().toLowerCase().trim();
            let status = '';
            
            if (rawStatus === 'match') status = 'match';
            else if (rawStatus === 'gain' || rawStatus === 'extra') status = 'extra';
            else if (rawStatus === 'loss' || rawStatus === 'missing') status = 'loss';

            // User specified to sum numbers from "Final QTY" column for pieces
            // formatRows utility maps "Final QTY" to "finalqty"
            const qtyStr = scan['finalqty'] || scan['Final QTY'] || scan['quantity'] || scan['qty'] || 0;
            const qty = isNaN(parseFloat(qtyStr)) ? 0 : parseFloat(qtyStr);

            if (!itemCategoryMap[cat]) itemCategoryMap[cat] = { match: 0, extra: 0, loss: 0 };
            if (!pieceCategoryMap[cat]) pieceCategoryMap[cat] = { match: 0, extra: 0, loss: 0 };

            if (status === 'match') {
                itemCategoryMap[cat].match++;
                pieceCategoryMap[cat].match += qty;
            } else if (status === 'extra') {
                itemCategoryMap[cat].extra++;
                pieceCategoryMap[cat].extra += qty;
            } else if (status === 'loss') {
                itemCategoryMap[cat].loss++;
                pieceCategoryMap[cat].loss += qty;
            } else if (rawStatus !== '') {
                // If status is something else and not empty, log it for debugging
                console.log(`[reportService] Unknown status value found in sheet: "${rawStatus}" for category ${cat}`);
            }
        }

        const labels = Object.keys(itemCategoryMap);
        console.log(`[reportService] Generating charts for categories:`, labels);
        console.log(`[reportService] Data summary:`, JSON.stringify(itemCategoryMap, null, 2));

        if (labels.length === 0) {
            console.warn(`[reportService] WARNING: No categories found, chart will be empty.`);
        }

        // Helper to generate chart images
        const createChart = async (labels, dataMap, title, outputPath) => {
            const configuration = {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        { 
                            label: 'Match', 
                            data: labels.map(l => dataMap[l].match), 
                            backgroundColor: '#36f06a',
                            datalabels: { align: 'end', anchor: 'end' }
                        },
                        { 
                            label: 'Gain', 
                            data: labels.map(l => dataMap[l].extra), 
                            backgroundColor: '#f0e636',
                            datalabels: { align: 'end', anchor: 'end' }
                        },
                        { 
                            label: 'Loss', 
                            data: labels.map(l => dataMap[l].loss), 
                            backgroundColor: '#f03636',
                            datalabels: { align: 'end', anchor: 'end' }
                        }
                    ]
                },
                options: {
                    plugins: { 
                        title: { display: true, text: title, font: { size: 18 } },
                        // Enable datalabels plugin to show numbers on top of bars
                        datalabels: {
                            color: '#444',
                            anchor: 'end',
                            align: 'top',
                            offset: 4,
                            font: { weight: 'bold' },
                            formatter: (value) => (value > 0 ? value : '') // Only show if > 0
                        }
                    },
                    scales: { 
                        y: { 
                            beginAtZero: true,
                            grace: '15%' // Add space at top for labels
                        } 
                    }
                }
                // Removed 'plugins: [...]' here because we register it in chartCallback
            };
            const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
            fs.writeFileSync(outputPath, buffer);
        };

        // Create Item Chart
        await createChart(labels, itemCategoryMap, `Today's Scans by Categories (Item Count) - ${dateString}`, imagePath);

        // Create Pieces Chart
        await createChart(labels, pieceCategoryMap, `Today's Scans by Categories (Total Pieces) - ${dateString}`, piecesImagePath);

        return { excelPath, imagePath, piecesImagePath };
    } catch (err) {
        console.error(`[reportService] Error generating report files:`, err.message);
        throw err;
    }
};
