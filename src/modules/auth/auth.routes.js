import express from 'express';
import * as controller from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.js';

const router = express.Router();

router.post('/login', controller.login);
router.post('/register-group', controller.registerGroup);
router.get('/me', requireAuth, controller.me);
router.post('/change-password', requireAuth, controller.changePassword);

export default router;
