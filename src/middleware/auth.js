const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');

const isLoggedIn = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch (err) {
    return res.status(400).send({ err: 'User is not loggen in' });
  }
};

module.exports = isLoggedIn;
