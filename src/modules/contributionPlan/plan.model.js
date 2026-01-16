import db from '../../config/db.js';
export const createPlan = async ({
    user_id,
    start_date,
    end_date,
    amount_per_month
}) => {
    const { rows } = await db.query(
        `INSERT INTO contribution_plans (user_id, start_date, end_date, amount_per_month) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [user_id, start_date, end_date, amount_per_month]
    );
    return rows[0];
};

export const getPlans = async () => {
    const { rows } = await db.query('SELECT * FROM contribution_plans');
    return rows;
};