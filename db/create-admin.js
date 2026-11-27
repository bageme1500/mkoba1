// Creates a system admin (can see and manage every group).
// Usage: npm run create-admin -- "Full Name" 0712345678 "a-strong-password"
import bcrypt from 'bcryptjs';
import pool from '../src/config/db.js';
import { normalizePhone } from '../src/utils/phone.js';

const [name, rawPhone, password] = process.argv.slice(2);
const phone = normalizePhone(rawPhone);

if (!name || !phone || !password || password.length < 6) {
    console.error('Usage: npm run create-admin -- "Full Name" 0712345678 "password (6+ characters)"');
    process.exit(1);
}

try {
    const { rows } = await pool.query(
        `INSERT INTO users (name, phone, role, password_hash) VALUES ($1, $2, 'admin', $3) RETURNING id`,
        [name, phone, await bcrypt.hash(password, 10)],
    );
    console.log(`Admin created (id ${rows[0].id}). Log in with phone ${phone}.`);
} catch (err) {
    console.error(err.code === '23505' ? 'A user with that phone number already exists.' : err.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
