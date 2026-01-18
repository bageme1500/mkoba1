import express from 'express';
import cors from 'cors';
import userRoutes from './modules/users/user.routes.js';
import planRoutes from './modules/contributionPlan/plan.routes.js';
import contributionRoutes from './modules/contribution/contribution.routes.js';

const app = express();
app.use(express.json());

const corsOptions = {
    origin: 'http://localhost:3000',
    credentials: true
};

app.use(cors(corsOptions));


app.use('/users', userRoutes);
app.use('/plan', planRoutes);
app.use('/contribution', contributionRoutes);


export default app;