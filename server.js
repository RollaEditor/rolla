const express = require('express');
const app = express();

app.use(express.static(__dirname));

app.use((req, res, next) => {
    res.header('Cross-Origin-Opener-Policy', 'same-origin');
    res.header('Cross-Origin-Embedder-Policy', 'require-corp');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin'); // might not be needed
    next();
});


const PORT = process.env.PORT || 8080;



app.listen(PORT, function () {
    const host = 'localhost';
    console.log('listening on http://'+host+':'+PORT+'/');
});

