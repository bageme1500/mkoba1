import express from 'express';
import multer from 'multer';
import * as controller from './import.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const router = express.Router();

router.use(requireAuth, requireRole('admin', 'leader'));

router.post('/preview', upload.single('file'), controller.preview);
router.post('/', upload.single('file'), controller.create);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/rows/:rowId/assign', controller.assignRow);
router.post('/rows/:rowId/skip', controller.skipRow);

export default router;
