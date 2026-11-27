import express from 'express';
import cors from 'cors';
import env from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

const app = express();

app.use(cors({ origin: env.clientOrigins }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
