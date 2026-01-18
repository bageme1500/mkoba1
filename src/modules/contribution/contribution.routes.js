import express from 'express';
import * as controller from './contribution.controller.js';

const router = express.Router();




router.post('/', controller.createContribution);
router.get('/', controller.getContributions);

export default router;
