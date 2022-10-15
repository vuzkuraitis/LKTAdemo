const express = require('express');
const fetch = require('node-fetch');
const mysql = require('mysql2/promise');
const Joi = require('joi');

const { mysqlConfig, mailServer, mailServerPassword } = require('../../config');
const validation = require('../../middleware/validation');

const router = express.Router();

const registrationSchema = Joi.object({
  name: Joi.string().trim().required(),
  surname: Joi.string().trim().required(),
  email: Joi.string().email().lowercase().trim().required(),
});

router.get('/', async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(`SELECT * FROM bbasketball_users2 WHERE name LIKE '%${req.query.name}%'`);
    await con.end();

    console.log(data);
    console.log(req.query);
    return res.send(data);
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
    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(`
    INSERT INTO bbasketball_users2 (name, surname, email, license_nr)
    VALUES (${mysql.escape(req.body.name)}, ${mysql.escape(req.body.surname)},
    ${mysql.escape(req.body.email)}, ${licenseNr})
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

router.get('/selected_user', async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(`
    SELECT *  
    FROM bbasketball_users2 
    WHERE id = ${mysql.escape(req.query.id)} 
    LIMIT 1`);
    await con.end();

    console.log(data);

    if (data.length === 0) {
      return res.status(400).send({ err: 'User Not Found' });
    }

    return res.send(data);
    // return res.send({ msg: 'Succesfully found a user' });
  } catch (err) {
    return res.status(500).send({ err: 'A server issue has occured. Please try again later' });
  }
});

module.exports = router;
