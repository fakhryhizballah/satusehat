require('dotenv').config()
const { createClient } = require("redis");
const REDIS_DB = process.env.REDIS_DB || 0;
const client = createClient({
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_URL,
        port: process.env.REDIS_URL_PORT,
    },
    database: REDIS_DB, // letakkan di sini, bukan dalam socket
});
client.connect();

module.exports = client