import { createPlan, getPlanContribution } from './plan.model.js';

export const create = async (req, res) => {
    try {
        console.log("your request is reaaching me");
        const plan = await createPlan(req.body);
        res.status(201).json(plan);
    } catch (error) {
        console.log("your request is not reaaching me");
        res.status(400).json({ error: error.message });
    }
};

export const getPlanContributions = async (req, res) => {
    try {
        const plans = await getPlanContribution();
        res.json(plans);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};