import express from 'express';
import * as controller from './payment.controller.js';

const router = express.Router();


router.post('/', controller.createPayment);
router.get('/', controller.getPayments);

export default router;