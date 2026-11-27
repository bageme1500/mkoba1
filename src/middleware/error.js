import { ZodError } from 'zod';
import multer from 'multer';
import { HttpError } from '../utils/httpError.js';

export function notFoundHandler(req, res) {
    res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

// Every error leaves the API as JSON: { error, details? }.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
    if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err instanceof ZodError) {
        return res.status(400).json({
            error: 'Invalid input',
            details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        });
    }
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Request body is not valid JSON' });
    }
    // Postgres constraint errors.
    if (err.code === '23505') {
        return res.status(409).json({ error: uniqueMessage(err.constraint) });
    }
    if (err.code === '23503') {
        return res.status(400).json({ error: 'Linked record does not exist' });
    }
    if (err.code === '23514' || err.code === '22P02' || err.code === '22007' || err.code === '22008') {
        return res.status(400).json({ error: 'Invalid value' });
    }

    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
}

function uniqueMessage(constraint = '') {
    if (constraint.includes('phone')) return 'A user with this phone number already exists';
    if (constraint.includes('reference')) return 'A payment with this reference is already recorded';
    if (constraint.includes('period')) return 'This month already exists for this member';
    return 'Already exists';
}
