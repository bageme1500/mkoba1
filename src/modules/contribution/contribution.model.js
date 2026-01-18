import db from '../../config/db.js';

export const createContribution = async ({ user_id, required_amount, month }) => {
    try {

        const query = `
        INSERT INTO contribution (user_id, required_amount, month)
        VALUES ($1, $2, $3)
        RETURNING *;
      `;
        const values = [user_id, required_amount, month];
        const result = await db.query(query, values);
        return result.rows[0];
    } catch (error) {
        console.log("it is reaching me")
        console.error('Error creating contribution:', error);
        throw error;
    }
};

export const getContributions = async () => {
    const { rows } = await db.query('SELECT * FROM contribution');
    return rows;
};
