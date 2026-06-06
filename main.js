require('dotenv').config();
const mongoose = require('mongoose');
const cron = require('node-cron');
const { kirimEncounter, updateEncounter, updateEncounterRanap, blukEncounter } = require("./controlers/Encounter");
const { kirimInstuksiDiet } = require("./controlers/Composition");
const { kirimICD10 } = require("./controlers/Condition");
const { kirimICD9 } = require("./controlers/Procedure");
const { kirimObservation } = require("./controlers/Observation");
const { kirimMedicationRequest, kirimMedicationDispense } = require("./controlers/Medication");
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

// console.log(process.env.MONGO_URI)

// (async () => {
//     let yearnow = new Date().getFullYear();
//     let hariIni = new Date();
//     let tanggalLampau = new Date();
//     tanggalLampau.setDate(hariIni.getDate() - 1);
//     let tanggal = tanggalLampau.getDate();
//     let bulan = tanggalLampau.getMonth() + 1;
//     try {
//         for (let i = 1; i <= tanggal; i++) {
//             console.log('run' + i);
//             await kirimEncounter(`${yearnow}-${bulan < 10 ? '0' + bulan : bulan}-${i < 10 ? '0' + i : i}`);
//             await kirimICD10(`${yearnow}-${bulan < 10 ? '0' + bulan : bulan}-${i < 10 ? '0' + i : i}`);
//             await kirimICD9(`${yearnow}-${bulan < 10 ? '0' + bulan : bulan}-${i < 10 ? '0' + i : i}`);
//             await kirimObservation(`${yearnow}-${bulan < 10 ? '0' + bulan : bulan}-${i < 10 ? '0' + i : i}`);
//             await kirimInstuksiDiet(`${yearnow}-${bulan < 10 ? '0' + bulan : bulan}-${i < 10 ? '0' + i : i}`);
//             console.log(`${yearnow}-${bulan < 10 ? '0' + bulan : bulan}-${i < 10 ? '0' + i : i}`);
//         }
//     } catch (err) {
//         console.error(err);
//     }
// })();

function getDate(minDay) {
    let yearnow = new Date().getFullYear();
    let hariIni = new Date();
    let tanggalLampau = new Date();
    tanggalLampau.setDate(hariIni.getDate() - minDay);
    let tanggal = tanggalLampau.getDate();
    let bulan = tanggalLampau.getMonth() + 1;
    return `${yearnow}-${bulan < 10 ? '0' + bulan : bulan}-${tanggal < 10 ? '0' + tanggal : tanggal}`
}
// console.log(getDate(28));
kirimEncounter(getDate(1));

cron.schedule('0 18 * * *', async () => {
    await kirimEncounter(getDate(0));
    await kirimEncounter(getDate(2));
    console.log('Job Jam 18 Selesai ' + getDate(0));
});

cron.schedule('0 4 * * *', async () => {
    await kirimObservation(getDate(1));
    await kirimInstuksiDiet(getDate(1));
    await kirimICD10(getDate(1));
    await updateEncounter(getDate(2));
    await kirimICD10(getDate(10));
    await kirimICD9(getDate(10));
    await kirimMedicationRequest(getDate(2));
    await kirimMedicationDispense(getDate(2));
    console.log('Job Jam 4 Selesai ' + getDate(0));
});

// kirimObservation(`2026-06-05`);
// kirimICD10(`2026-04-02`);
// kirimICD9(`2026-04-02`);
