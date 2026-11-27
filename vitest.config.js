import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) {
    throw new Error('Set TEST_DATABASE_URL in .env to a database the tests are allowed to wipe.');
}
if (testDb === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must be different from DATABASE_URL: the tests delete all data in it.');
}

// The tests (and the global setup that rebuilds the schema) only ever see the test database.
process.env.DATABASE_URL = testDb;
process.env.JWT_SECRET = 'test-secret';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        globalSetup: './tests/globalSetup.js',
        env: { DATABASE_URL: testDb, JWT_SECRET: 'test-secret' },
        // API tests share one database, so run files one after another.
        fileParallelism: false,
    },
});
