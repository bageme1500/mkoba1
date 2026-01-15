import express from 'express';
import cors from 'cors';
import userRoutes from './modules/users/user.routes.js';

const app = express();


const corsOptions = {
    origin: 'http://localhost:3000',
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/users', userRoutes);

export default app;