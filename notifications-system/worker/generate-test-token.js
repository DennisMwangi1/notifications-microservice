const jwt = require('jsonwebtoken');

const secret = "84f0ecda97c5eebd8f1c0de8f468703660f0fb165c54d01d7fc672d2baa2adc6";
// A test user ID. In a real app, this comes from an auth system. We'll use this when emitting testing payload too.
const userId = "b5dae3e8-2d5d-6f3c-cd3c-3c4d5e6f7a8b";

const token = jwt.sign({ sub: userId }, secret, { expiresIn: '1y' });

console.log("-----------------------------------------");
console.log(`Client JWT Token for User ${userId}:`);
console.log(token);
console.log("-----------------------------------------");
