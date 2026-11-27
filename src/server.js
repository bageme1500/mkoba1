import env from './config/env.js';
import app from './app.js';
import { scheduleAutoStart } from './jobs/autoStart.js';

app.listen(env.port, () => {
    console.log(`M-Koba API running on http://localhost:${env.port}`);
    if (env.nodeEnv !== 'test') scheduleAutoStart();
});
