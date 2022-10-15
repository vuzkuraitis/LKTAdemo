const express = require('express');
const cors = require('cors');

const UserRoutes = require('./routes/v1/users');

const { serverPort } = require('./config');

const app = express();

app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
  res.send({ msg: 'Server is running' });
});

app.use('/v1/users/', UserRoutes);

app.all('*', (req, res) => {
  res.status(404).send({ error: 'Page not found' });
});

app.listen(serverPort, () => console.log(`Server is running on port ${serverPort}`));
