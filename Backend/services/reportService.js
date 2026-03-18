import ExcelJS from 'exceljs';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processInventoryData } from '../src/Util/analytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateReportFiles = async (todayScans, dateString, scansSheetData = null) => {
    const safeDateStr = dateString.replace(/\//g, '-');
    const tempDir = path.join(__dirname, '../temp');

    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const excelPath = path.join(tempDir, `daily_report_${safeDateStr}.xlsx`);
    const imagePath = path.join(tempDir, `daily_chart_items_${safeDateStr}.png`);
    const piecesImagePath = path.join(tempDir, `daily_chart_pieces_${safeDateStr}.png`);

    try {
        // 1. Generate Excel Report (from Items sheet data)
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Today Items');

        if (todayScans.length > 0) {
            const columns = Object.keys(todayScans[0]).map(key => ({ header: key, key: key }));
            worksheet.columns = columns;
            todayScans.forEach(scan => {
                worksheet.addRow(scan);
            });
        }

        await workbook.xlsx.writeFile(excelPath);

        // 2. Generate Chart Images using Scans sheet data + analytics.js (same as Inventory View)
        const width = 800;
        const height = 450;
        const chartCallback = (ChartJS) => {
            ChartJS.register(ChartDataLabels);
        };
        const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, chartCallback, backgroundColour: 'white' });

        // Use Scans sheet data processed through the same analytics.js pipeline as Inventory View
        const chartSource = scansSheetData || todayScans;
        
        // Filter for today's date using processInventoryData (same logic as dashboard)
        const todayDate = new Date();
        const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
        
        const processed = processInventoryData(chartSource, todayStr, todayStr);
        const products = processed ? processed.products : [];
        
        console.log(`[reportService] Processed ${products.length} products from Scans sheet for today (${todayStr}) using analytics.js`);

        // Maps for Items (count) and Pieces (quantity sum) — built from analytics.js processed data
        const itemCategoryMap = {};
        const pieceCategoryMap = {};

        for (const p of products) {
            const cat = p.Category || 'Unknown';
            const status = p.ProductStatus; // Already normalized by analytics.js: match/gain/loss
            const qty = p.PhysicalQty || 0;

            if (!itemCategoryMap[cat]) itemCategoryMap[cat] = { match: 0, extra: 0, loss: 0 };
            if (!pieceCategoryMap[cat]) pieceCategoryMap[cat] = { match: 0, extra: 0, loss: 0 };

            if (status === 'match') {
                itemCategoryMap[cat].match++;
                pieceCategoryMap[cat].match += qty;
            } else if (status === 'gain') {
                itemCategoryMap[cat].extra++;
                pieceCategoryMap[cat].extra += qty;
            } else if (status === 'loss') {
                itemCategoryMap[cat].loss++;
                pieceCategoryMap[cat].loss += qty;
            }
        }

        const labels = Object.keys(itemCategoryMap);
        console.log(`[reportService] Generating charts for ${labels.length} categories (from Scans/analytics.js):`, labels);
        console.log(`[reportService] KPI summary:`, JSON.stringify(itemCategoryMap, null, 2));

        if (labels.length === 0) {
            console.warn(`[reportService] WARNING: No categories found for today, chart will be empty.`);
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
