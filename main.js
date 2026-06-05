require('dotenv').config();
const mongoose = require('mongoose');
const { kirimEncounter, blukEncounter } = require("./controlers/Encounter");
const { kirimInstuksiDiet } = require("./controlers/Composition");
const { kirimICD10 } = require("./controlers/Condition");
const { kirimICD9 } = require("./controlers/Procedure");
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



(async () => {
    let yearnow = new Date().getFullYear();
    let hariIni = new Date();
    let tanggalLampau = new Date();
    tanggalLampau.setDate(hariIni.getDate() - 1);
    let tanggal = tanggalLampau.getDate();
    let bulan = tanggalLampau.getMonth() + 1;
    try {
        for (let i = 1; i <= tanggal; i++) {
            console.log('run' + i);
            await kirimEncounter(`${yearnow}-${bulan < 10 ? '0' + bulan : bulan}-${i < 10 ? '0' + i : i}`);
            await kirimICD10(`${yearnow}-${bulan < 10 ? '0' + bulan : bulan}-${i < 10 ? '0' + i : i}`);
            await kirimICD9(`${yearnow}-${bulan < 10 ? '0' + bulan : bulan}-${i < 10 ? '0' + i : i}`);
            await kirimInstuksiDiet(`${yearnow}-${bulan < 10 ? '0' + bulan : bulan}-${i < 10 ? '0' + i : i}`);
            console.log(`${yearnow}-${bulan < 10 ? '0' + bulan : bulan}-${i < 10 ? '0' + i : i}`);
        }
    } catch (err) {
        console.error(err);
    }
})();

// kirimEncounter(`2026-06-05`);
// kirimICD9(`2026-04-02`);
