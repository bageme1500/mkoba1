import express from 'express';
import * as controller from './cashbook.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

const router = express.Router();

router.use(requireAuth, requireRole('admin', 'leader'));

router.get('/summary', controller.summary);
router.get('/report', controller.report);
router.get('/entries', controller.listEntries);
router.post('/entries', controller.createEntry);
router.post('/entries/:id/approve', controller.approve);
router.post('/entries/:id/reject', controller.reject);
router.delete('/entries/:id', controller.remove);
router.get('/checks', controller.listChecks);
router.post('/checks', controller.createCheck);

export default router;
