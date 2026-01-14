import db from '../../config/db.js';

export const createUser = async ({ name, email, role }) => {
    const result = await db.query(
        `INSERT INTO users (name, email, role) VALUES ($1, $2, $3) RETURNING *`,
        [name, email, role]
    );
    return result.rows[0];
};

export const getAllUsers = async () => {
    const result = await db.query(
        `SELECT * FROM users`,
    );
    return result.rows;
};