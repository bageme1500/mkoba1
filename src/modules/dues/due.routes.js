import express from 'express';
import * as controller from './due.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

router.post('/generate', requireRole('admin', 'leader'), controller.generate);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.put('/:id', requireRole('admin', 'leader'), controller.update);
router.delete('/:id', requireRole('admin', 'leader'), controller.remove);

export default router;
