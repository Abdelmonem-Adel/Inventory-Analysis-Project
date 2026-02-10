import express from 'express';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { readSheet } from "../services/sheet.service.js";
import inventoryRoutes from './routes/inventory.routes.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/inventory', inventoryRoutes);

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
});

// Middleware
app.use(notFound);
app.use(errorHandler);

export default app;
