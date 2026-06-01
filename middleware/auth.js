const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

module.exports = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if(!token) {
        return res.status(401).json({message: 'No token, authorization denied'});
    }

    try {
        const decode = jwt.verify(token, JWT_SECRET);
        req.userId = decode.userId;
        next();
    } catch(error) {
        res.status(401).json({error: 'Invalid token'});
    }
};