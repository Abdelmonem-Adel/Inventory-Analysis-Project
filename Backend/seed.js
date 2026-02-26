import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import User from './src/models/user.model.js';
import connectDB from './src/config/db.js';

dotenv.config();

const seedAdmin = async () => {
    try {
        await connectDB();

        const adminExists = await User.findOne({ username: 'topadmin' });

        if (adminExists) {
            console.log('Top Admin user already exists');
            process.exit();
        }

        const admin = new User({
            username: 'topadmin',
            password: 'topadminpassword', // Change this!
            role: 0,
        });

        await admin.save();

        console.log('Top Admin user created successfully');
        console.log('Username: topadmin');
        console.log('Password: topadminpassword');
        process.exit();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

seedAdmin();
