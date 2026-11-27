import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    return value;
};

const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT) || 4000,
    databaseUrl: required('DATABASE_URL'),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    // Comma-separated list of frontend origins allowed by CORS.
    clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    timezone: process.env.APP_TIMEZONE || 'Africa/Dar_es_Salaam',
};

export default env;
