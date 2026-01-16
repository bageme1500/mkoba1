//uncomment the dotenv lines when using environment variables

// import dotenv from 'dotenv';
import app from './app.js';

// dotenv.config();

// const PORT = process.env.PORT || 3000;
const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});