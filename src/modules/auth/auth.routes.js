import express from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import * as controller from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { normalizePhone } from '../../utils/phone.js';

const tooMany = (message) => (req, res) => res.status(429).json({ error: message });

// Failed logins per device + phone number. Successful logins don't count.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.LOGIN_RATE_LIMIT) || 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${normalizePhone(req.body?.phone) ?? ''}`,
    handler: tooMany('Too many login attempts. Wait 15 minutes and try again.'),
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: Number(process.env.REGISTER_RATE_LIMIT) || 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooMany('Too many sign-ups from this device. Try again later.'),
});

const router = express.Router();

router.post('/login', loginLimiter, controller.login);
router.post('/register-group', registerLimiter, controller.registerGroup);
router.get('/me', requireAuth, controller.me);
router.patch('/me', requireAuth, controller.updateMe);
router.post('/change-password', requireAuth, controller.changePassword);
router.post('/logout-all', requireAuth, controller.logoutAll);

export default router;
