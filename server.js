const express = require('express');
const app = express();

app.use(function(req, res, next) {
    res.header("Cross-Origin-Embedder-Policy", "require-corp");
    res.header("Cross-Origin-Opener-Policy", "same-origin");
    next();
});

app.use(express.static(__dirname));


const PORT = process.env.PORT || 8080;


app.listen(PORT, function () {
    const host = 'localhost';
    console.log('listening on http://'+host+':'+PORT+'/');
});
