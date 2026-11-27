import pkg from 'pg';
import env from './env.js';

const { Pool, types } = pkg;

// Return NUMERIC as JS numbers (amounts fit comfortably) and DATE as 'YYYY-MM-DD'
// strings so dates never shift with the server's timezone.
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
types.setTypeParser(types.builtins.DATE, (v) => v);

const pool = new Pool({
    connectionString: env.databaseUrl,
    // "Today" in SQL (deadlines, fines) follows the group's local time.
    options: `-c timezone=${env.timezone}`,
});

// Run fn(client) inside a transaction.
export async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export default pool;
