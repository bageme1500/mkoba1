import express from 'express';
import * as controller from './plan.controller.js';

const router = express.Router();

router.post('/', controller.create);
router.get('/', controller.getPlanContributions);

export default router;