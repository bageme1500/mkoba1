import express from 'express';
import * as controller from './payment.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.list);
router.post('/', requireRole('admin', 'leader'), controller.create);
router.get('/:id', controller.get);
router.put('/:id', requireRole('admin', 'leader'), controller.update);
router.delete('/:id', requireRole('admin', 'leader'), controller.remove);

export default router;
