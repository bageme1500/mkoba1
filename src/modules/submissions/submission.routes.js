import express from 'express';
import * as controller from './submission.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

// Leaders review what members reported.
export const submissionRoutes = express.Router();
submissionRoutes.use(requireAuth, requireRole('admin', 'leader'));
submissionRoutes.get('/', controller.list);
submissionRoutes.get('/counts', controller.counts);
submissionRoutes.post('/:id/approve', controller.approve);
submissionRoutes.post('/:id/reject', controller.reject);

// Mounted under /me: a member reports their own payment.
export const mySubmissionRoutes = express.Router();
mySubmissionRoutes.get('/submissions', requireAuth, controller.mine);
mySubmissionRoutes.post('/submissions', requireAuth, controller.submit);
