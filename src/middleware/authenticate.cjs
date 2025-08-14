const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next){
    // Check for token in cookies
    const token = (req.cookies && req.cookies.token) ||
              (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
    if(!token) return res.status(401).send('No token provided');

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if(err) return res.status(401).send('Invalid or expired token');
        req.user = user;
        next();
    });
}

module.exports = authenticateToken;