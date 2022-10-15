const validation = (schema) => async (req, res, next) => {
  try {
    req.body = await schema.validateAsync(req.body);
    return next();
  } catch (err) {
    return res.status(400).send({ err: 'Incorrect data sent' });
  }
};
module.exports = validation;
