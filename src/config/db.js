import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'saccoss_system',
    password: '0000',
    port: 5433,
});

export default pool;