import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './modules/auth/auth.routes.js';
import groupRoutes from './modules/groups/group.routes.js';
import userRoutes from './modules/users/user.routes.js';
import dueRoutes from './modules/dues/due.routes.js';
import paymentRoutes from './modules/payments/payment.routes.js';
import importRoutes from './modules/imports/import.routes.js';
import cashbookRoutes from './modules/cashbook/cashbook.routes.js';
import { mySubmissionRoutes, submissionRoutes } from './modules/submissions/submission.routes.js';
import { meRoutes, reportRoutes } from './modules/reports/report.routes.js';

const app = express();

// Set TRUST_PROXY=1 when running behind a proxy/load balancer so rate limits see real client IPs.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(helmet());
app.use(cors({ origin: env.clientOrigins }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/groups', groupRoutes);
app.use('/users', userRoutes);
app.use('/dues', dueRoutes);
app.use('/payments', paymentRoutes);
app.use('/imports', importRoutes);
app.use('/cashbook', cashbookRoutes);
app.use('/submissions', submissionRoutes);
app.use('/me', mySubmissionRoutes);
app.use('/reports', reportRoutes);
app.use('/me', meRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
