import express from 'express';
import * as controller from './user.controller.js';

const router = express.Router();

router.post('/', controller.create);
router.get('/', controller.getAll);

export default router;