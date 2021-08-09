const express = require('express'); // Module for Main Server
const path = require('path'); // Module to get parent path + join path

const app = express();

app.use((req, res, next) => {
  res.header('Cross-Origin-Opener-Policy', 'same-origin');
  res.header('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

app.use(express.static(__dirname));

const PORT = process.env.PORT || 8080;

app.listen(PORT, function () {
  const host = 'localhost';
  console.log('listening on http://'+host+':'+PORT+'/');
});
