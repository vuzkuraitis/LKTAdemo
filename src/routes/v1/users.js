const express = require('express');
const fetch = require('node-fetch');
const mysql = require('mysql2/promise');
const Joi = require('joi');
const bcrypt = require('bcrypt');
const jsonwebtoken = require('jsonwebtoken');

const { mysqlConfig, jwtSecret, mailServer, mailServerPassword } = require('../../config');
const validation = require('../../middleware/validation');
const isLoggedIn = require('../../middleware/auth');

const router = express.Router();

const registrationSchema = Joi.object({
  name: Joi.string().trim().required(),
  surname: Joi.string().trim().required(),
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
});

const userLoginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
});

const newPassword = Joi.object({
  email: Joi.string().email().lowercase().required(),
  token: Joi.string().required(),
  password: Joi.string().required(),
});

const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string().required(),
});

router.get('/', async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(`SELECT * FROM bbasketball_users2 WHERE name LIKE '%${req.query.name}%'`);
    await con.end();

    return res.send(data);
  } catch (err) {
    return res.status(500).send({ err: 'Server issue occured. Please try again later' });
  }
});

router.get('/selected_user', async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(`
    SELECT *  
    FROM bbasketball_users2 
    WHERE id = ${mysql.escape(req.query.id)} 
    LIMIT 1`);
    await con.end();

    if (data.length === 0) {
      return res.status(400).send({ err: 'User Not Found' });
    }

    return res.send(data);
    // return res.send({ msg: 'Succesfully found a user' });
  } catch (err) {
    return res.status(500).send({ err: 'A server issue has occured. Please try again later' });
  }
});

router.get('/account', isLoggedIn, async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(
      `SELECT id, name, surname, email, license_nr FROM bbasketball_users2 WHERE id = ${req.user.accountId}`,
    );
    await con.end();

    return res.send(data);
  } catch (err) {
    return res.status(500).send({ err: 'Server issue occured. Please try again later' });
  }
});

router.get('/account-payment', isLoggedIn, async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(
      `SELECT * FROM bbasketball_transactions LEFT JOIN bbasketball_users2 ON bbasketball_transactions.user_id = bbasketball_users2.id WHERE user_id = ${req.user.accountId}`,
    );
    await con.end();

    if (data[0].status !== 'success') {
      const JWTPayload = jsonwebtoken.sign(
        {
          projectId: 1,
          amount: 0.01,
          currency: 'EUR',
          transactionId: 'TS837',
          paymentPurpose: 'Anual License Fee',
          clientRedirectUrl: 'http://localhost:3000/account',
        },
        jwtSecret,
      );
      data.push({ JWTPayload });
      const newData = data.reduce((r, c) => Object.assign(r, c), {});
      return res.send([newData]);
    } else {
      return res.send(data);
    }
  } catch (err) {
    return res.status(500).send({ err: 'Server issue occured. Please try again later' });
  }
});

router.post('/register', validation(registrationSchema), async (req, res) => {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth()).padStart(2, '0');
  const day = String(new Date().getDay()).padStart(2, '0');
  const hours = String(new Date().getHours()).padStart(2, '0');
  const minutes = String(new Date().getMinutes()).padStart(2, '0');
  const seconds = String(new Date().getSeconds()).padStart(2, '0');

  const licenseNr = [day, month, year, hours, minutes, seconds].join('');
  console.log(licenseNr);

  try {
    const hash = bcrypt.hashSync(req.body.password, 10);

    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(`
    INSERT INTO bbasketball_users2 (name, surname, email, password, license_nr)
    VALUES (${mysql.escape(req.body.name)}, ${mysql.escape(req.body.surname)},
    ${mysql.escape(req.body.email)}, '${hash}', '${licenseNr}')
    `);
    await con.end();

    console.log(data);

    if (!data.insertId || data.affectedRows !== 1) {
      return res.status(500).send({ err: 'A server issue has occured. Please try again later' });
    }

    const response = await fetch(mailServer, {
      method: 'POST',
      body: JSON.stringify({
        auth: mailServerPassword,
        to: req.body.email,
        subject: 'NO-REPLY: Confirmation Event Registration',
        html: `<h3> Dear ${req.body.name}</h3>
                <p>Here by we confirm that you have succesfully Registered with email: ${req.body.email} to a LKTA .</p>
                <br><br>
                <p>Your license number is : ${licenseNr}<p>
                <br><br>
                <img/ src='cid:logo' style='width: 200px'>
        `,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const json = await response.json();

    console.log(response);
    console.log(json);

    if (!json.id) {
      return res.status(500).send({ err: 'Server issue occured. Please try again later' });
    }

    return res.send({ msg: 'Succesfully created account', accountId: data.insertId });
  } catch (err) {
    return res.status(500).send({ err: 'A server issue has occured. Please try again later' });
  }
});

router.post('/login', validation(userLoginSchema), async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(`
    SELECT id, email, password 
    FROM bbasketball_users2 
    WHERE email = ${mysql.escape(req.body.email)} 
    LIMIT 1`);
    await con.end();

    if (data.length === 0) {
      return res.status(400).send({ err: 'User Not Found' });
    }

    if (!bcrypt.compareSync(req.body.password, data[0].password)) {
      return res.status(400).send({ err: 'Incorrect username or password' });
    }

    const token = jsonwebtoken.sign({ accountId: data[0].id }, jwtSecret);

    return res.send({ msg: 'Succesfully logged in', token });
  } catch (err) {
    return res.status(500).send({ err: 'A server issue has occured. Please try again later' });
  }
});

router.post('/reset-password', validation(resetPasswordSchema), async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data1] = await con.execute(
      `SELECT id, name FROM bbasketball_users2 WHERE email = ${mysql.escape(req.body.email)} LIMIT 1`,
    );

    if (data1.length !== 1) {
      await con.end();
      return res.send({ msg: 'If your email is correct you will shortly get a message' });
    }

    const randomCode = Math.random()
      .toString(36)
      .replace(/[^a-z]+/g, '');

    const [data2] = await con.execute(`
    INSERT INTO reset_tokens (email, code)
    VALUES (${mysql.escape(req.body.email)}, '${randomCode}')
   `);

    if (!data2.insertId) {
      return res.status(500).send({ msg: 'Server issue occured. Please try again later' });
    }

    const response = await fetch(mailServer, {
      method: 'POST',
      body: JSON.stringify({
        auth: mailServerPassword,
        to: req.body.email,
        subject: 'NO-REPLY: New Password',
        html: `<h3> Dear ${data1[0].name}</h3>
        <p>It seems that you have requested for a new password. To change password you will need this code:<br><br> 
        <span style="color: #636dd1; font-size: 1.5rem;">${randomCode}<span></p>
        <br><br>
        <img/ src='cid:logo' style='width: 200px'>`,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const json = await response.json();

    if (!json.id) {
      return res.status(500).send({ err: 'Server issue occured. Please try again later' });
    }
    return res.send({ msg: 'If your email is correct you will shortly get a message' });
  } catch (err) {
    return res.status(500).send({ err: 'Server issue occured. Please try again later' });
  }
});

router.post('/new-password', validation(newPassword), async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(`
    SELECT *
    FROM reset_tokens
    WHERE email = ${mysql.escape(req.body.email)}
    AND code = ${mysql.escape(req.body.token)}
    LIMIT 1
    `);

    if (data.length !== 1) {
      await con.end();
      return res.status(400).send({ err: 'Invalid change password request. Please try again' });
    }

    if ((new Date().getTime() - new Date(data[0].timestamp).getTime()) / 60000 > 250) {
      await con.end();
      return res.status(400).send({ err: 'Invalid change password request. Please try again' });
    }

    const hashedPassword = bcrypt.hashSync(req.body.password, 10);

    const [changeResponse] = await con.execute(`
    UPDATE bbasketball_users2
    SET password = ${mysql.escape(hashedPassword)}
    WHERE email = ${mysql.escape(req.body.email)}
    `);

    if (!changeResponse.affectedRows) {
      await con.end();
      return res.status(500).send({ err: 'Server issue occured. Please try again later' });
    }

    await con.execute(`
    DELETE FROM reset_tokens
    WHERE id = ${data[0].id}
    `);

    await con.end();
    return res.send({ msg: 'Password has been changed' });
  } catch (err) {
    return res.status(500).send({ err: 'Server issue occured. Please try again later' });
  }
});

router.post('/change-password', isLoggedIn, validation(changePasswordSchema), async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(`
    SELECT id, email, password 
    FROM bbasketball_users2 
    WHERE id = ${mysql.escape(req.user.accountId)}
    LIMIT 1
    `);

    const checkHash = bcrypt.compareSync(req.body.oldPassword, data[0].password);

    if (!checkHash) {
      await con.end();
      return res.status(400).send({ err: 'Incorrect Old Password' });
    }

    const newPasswordHash = bcrypt.hashSync(req.body.newPassword, 10);

    const changePassDBRes = await con.execute(
      `UPDATE bbasketball_users2 
      SET password = ${mysql.escape(newPasswordHash)} 
      WHERE id = ${mysql.escape(req.user.accountId)}`,
    );

    await con.end();
    if (!changePassDBRes) {
      return res.send({ msg: 'Something went wrong, please try again' });
    }
    return res.send({ msg: 'Password has been changed' });
  } catch (err) {
    return res.status(500).send({ err: 'Server issue occured. Please try again later' });
  }
});

module.exports = router;
