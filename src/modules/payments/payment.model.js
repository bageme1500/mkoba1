import db from '../../config/db.js';

// creating a new payment


export const createPayment = async ({ user_id, contribution_id, amount, date }) => {
    try {
        const query = `
        INSERT INTO payment (user_id,contribution_id, amount, date)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
        const values = [user_id, contribution_id, amount, date];
        const result = await db.query(query, values);
        return result.rows[0];
    } catch (error) {
        console.error('Error creating payment:', error);
        throw error;
    }
};


// getting all the payments

export const getPayments = async () => {
    const { rows } = await db.query('SELECT * FROM payment');
    return rows;
}

