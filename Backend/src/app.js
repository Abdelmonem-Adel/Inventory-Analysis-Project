import express from 'express';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { readSheet } from "../services/sheet.service.js";
import inventoryRoutes from './routes/inventory.routes.js';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import { protect } from './middleware/authMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to Database
connectDB();

const app = express();

app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '../../Frontend/')));

// Routes 
app.use('/api/auth', authRoutes);
app.use('/api/inventory', protect, inventoryRoutes);

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
});


// Middleware
app.use(notFound);
app.use(errorHandler);

export default app;
