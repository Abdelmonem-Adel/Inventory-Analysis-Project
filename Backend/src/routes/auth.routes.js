import express from 'express';
import {
    authUser,
    registerUser,
    getUsers,
    updateUser,
    deleteUser,
} from '../controllers/authController.js';
import { protect, admin, topAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', authUser);
router.route('/users')
    .post(protect, admin, registerUser)
    .get(protect, admin, getUsers);

router.route('/users/:id')
    .put(protect, topAdmin, updateUser)
    .delete(protect, topAdmin, deleteUser);


export default router;
