import express from 'express';
import cors from 'cors';
import env from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './modules/auth/auth.routes.js';
import groupRoutes from './modules/groups/group.routes.js';
import userRoutes from './modules/users/user.routes.js';
import dueRoutes from './modules/dues/due.routes.js';
import paymentRoutes from './modules/payments/payment.routes.js';
import importRoutes from './modules/imports/import.routes.js';
import { meRoutes, reportRoutes } from './modules/reports/report.routes.js';

const app = express();

app.use(cors({ origin: env.clientOrigins }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/groups', groupRoutes);
app.use('/users', userRoutes);
app.use('/dues', dueRoutes);
app.use('/payments', paymentRoutes);
app.use('/imports', importRoutes);
app.use('/reports', reportRoutes);
app.use('/me', meRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
