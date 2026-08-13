const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || 'dev-secret-for-local-only-replace-in-prod-32chars';
const token = jwt.sign(
  {
    sub: 'cmsr5eeun0000l8m7iz0ud2wm',
    type: 'ACCESS',
    userType: 'ADMIN',
    version: 1
  },
  secret,
  { expiresIn: '1h' }
);
console.log('TOKEN=' + token);
