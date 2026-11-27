import express from 'express';
import * as controller from './report.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

export const reportRoutes = express.Router();
reportRoutes.use(requireAuth, requireRole('admin', 'leader'));
reportRoutes.get('/monthly', controller.monthly);
reportRoutes.get('/yearly', controller.yearly);
reportRoutes.get('/reminders', controller.reminders);
reportRoutes.get('/members/:id', controller.memberSummary);

export const meRoutes = express.Router();
meRoutes.use(requireAuth);
meRoutes.get('/summary', controller.mySummary);
