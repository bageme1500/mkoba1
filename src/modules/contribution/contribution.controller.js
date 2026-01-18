import * as Contribution from './contribution.model.js';

// Create a new contribution
export const createContribution = async (req, res, next) => {
    try {
        console.log("it is reaching me");
        const contribution = await Contribution.createContribution(req.body);
        res.status(201).json(contribution);
    } catch (error) {
        console.log("it is not reaching me");
        console.error('Error creating contribution:', error);
        next(error);
    }
};

// Get all contributions
export const getContributions = async (req, res, next) => {
    try {
        const contributions = await Contribution.getContributions();
        res.json(contributions);
    } catch (error) {
        console.error('Error fetching contributions:', error);
        next(error);
    }
};
