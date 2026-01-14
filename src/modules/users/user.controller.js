import * as User from './user.model.js';

export const create = async (req, res, next) => {
    try {
        const user = await User.createUser(req.body);
        res.status(201).json(user);

    } catch (err) {
        next(err);
    }
};
export const getAll = async (req, res, next) => {
    try {
        const users = await User.getAllUsers();
        res.status(200).json(users);
    } catch (err) {
        next(err);
    }
};