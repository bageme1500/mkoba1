import env from './config/env.js';
import app from './app.js';

app.listen(env.port, () => {
    console.log(`M-Koba API running on http://localhost:${env.port}`);
});
