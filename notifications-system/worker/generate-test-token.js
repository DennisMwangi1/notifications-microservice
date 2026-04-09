const jwt = require('jsonwebtoken');
require('dotenv').config();

const secret = process.env.CENTRIFUGO_SECRET;
if (!secret) {
    console.error("Please set CENTRIFUGO_SECRET in your .env file");
    process.exit(1);
}
// A test user ID. In a real app, this comes from an auth system. We'll use this when emitting testing payload too.
const userId = "b5dae3e8-2d5d-6f3c-cd3c-3c4d5e6f7a8b";

const token = jwt.sign({
    sub: userId,
    channels: [`personal_events#${userId}`]
}, secret, { expiresIn: '1y' });

console.log("-----------------------------------------");
console.log(`Client JWT Token for User ${userId}:`);
console.log(token);
console.log("-----------------------------------------");
