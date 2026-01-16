import db from '../../config/db.js';

export const createUser = async (data) => {
    const { name, email, role } = data;

    //console.log('INSERTING USER:', name, email, role);

    const result = await db.query(
        `INSERT INTO users (name, email, role)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [name, email, role]
    );

    //console.log('DB RESULT:', result.rows[0]);

    return result.rows[0];
};


export const getAllUsers = async () => {
    const result = await db.query(`SELECT * FROM users`);
    return result.rows;
};
