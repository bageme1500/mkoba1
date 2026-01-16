import express from 'express';
import * as controller from './plan.controller.js';

const router = express.Router();

router.post('/plan', controller.create);
router.get('/plan', controller.getPlanContributions);

export default router;