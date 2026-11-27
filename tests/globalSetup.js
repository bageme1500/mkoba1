// Rebuilds the test database schema from the migrations once before all tests.
export default async function setup() {
    const { default: pool } = await import('../src/config/db.js');
    const { migrate } = await import('../db/migrate.js');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate({ log: () => {} });
    await pool.end();
}
