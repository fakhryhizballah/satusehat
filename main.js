require('dotenv').config();
const mongoose = require('mongoose');
const { kirimEncounter } = require("./controlers/Encounter");
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Terhubung ke MongoDB!'))
    .catch(err => console.error('Gagal terhubung ke MongoDB:', err));
// mongoose.connection.on('connected', () => {
//     console.log('Mongoose connected to DB');
// });

mongoose.connection.on('error', (err) => {
    console.log('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('Mongoose disconnected from DB');
});

// kirimEncounter('x')