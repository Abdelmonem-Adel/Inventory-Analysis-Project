import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { startCronJob } from '../services/cronService.js';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    // Start the automated mailer (cron jobs)
    startCronJob();
});
