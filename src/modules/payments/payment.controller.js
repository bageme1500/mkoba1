import *  as Payment from './payment.model.js';


//creating a new payment

export const createPayment = async (req, res, next) => {
    try {
        const payment = await Payment.createPayment(req.body);
        res.status(201).json(payment)
    } catch (error) {
        console.error('Error creating payment', error);
        next(error);
    }
};


//getting all the payments

export const getPayments = async (req, res, next) => {
    try {
        const payments = await Payment.getPayments();
        res.json(payments);
    } catch (error) {
        console.error('Error failed to fetch the payments:', error);
        next(error);
    }
};