require('dotenv').config()
const mongoose = require('mongoose');
const Practitioner = require("../modelsMongoose/Practitioner");
const Patient = require("../modelsMongoose/Patient");
const Encounter = require("../modelsMongoose/Encounter");
const Observation = require("../modelsMongoose/Observation");
const Careplan = require("../modelsMongoose/CarePlan");
const {pemeriksaan_ralan, pemeriksaan_ranap, pegawai, } = require("../models");
const { fetchSatusehat, fetchSatusehatPatch, fetchSatusehatBatch } = require("../helpersfetch/satusehat");
const { HeartRateObservation, BloodPressureObservation, BodyTemperatureObservation, RespiratoryRateObservation, BodyWeightObservation, OxygenSaturationObservation } = require("../template/Observation");
const { ClinicalCarePlan } = require("../template/CarePlan");
const { getPractitioner } = require("./identitas");
const crypto = require('crypto');
// Helper function to check if entry already exists in bundel
function isEntryDuplicate(bundel, newEntry) {
    const newResource = newEntry.resource;

    return bundel.entry.some(existingEntry => {
        const existingResource = existingEntry.resource;

        // Compare key identifying properties
        return (
            existingResource.code?.coding?.[0]?.code === newResource.code?.coding?.[0]?.code &&
            existingResource.subject?.reference === newResource.subject?.reference &&
            existingResource.encounter?.reference === newResource.encounter?.reference &&
            existingResource.effectiveDateTime === newResource.effectiveDateTime &&
            JSON.stringify(existingResource.value) === JSON.stringify(newResource.value)
        );
    });
}

async function kirimObservation(date) {
    let dateFormatted = date.split("-").join("/").replace(/-/g, "/");
    console.log("Processing Observation Date/No Rawat:", dateFormatted);
    const encounters = await Encounter.find({
        'identifier.value': { $regex: new RegExp(`^${dateFormatted}`) }
    });
    let mapEncounter = encounters.map(encounter => encounter.id)

    // Batch query: find all observations for all encounters at once
    const allObservations = await Observation.find({
        'encounter.reference': {
            $in: mapEncounter.map(id => `Encounter/${id}`)
        }
    });

    // Create a map of observations by encounter reference for quick lookup
    const observationsByEncounter = new Map();
    allObservations.forEach(obs => {
        const key = obs.encounter.reference;
        if (!observationsByEncounter.has(key)) {
            observationsByEncounter.set(key, []);
        }
        observationsByEncounter.get(key).push(obs);
    });
    let ranap = 0;
    let ralan = 0;

    for (let x of encounters) {
        let findObservation = observationsByEncounter.get(`Encounter/${x.id}`) || []
        if (findObservation.length === 0) {
            let findObservationSatuSehat = await fetchSatusehat('GET', `Observation?encounter=Encounter/${x.id}`)
            if (findObservationSatuSehat.total !== 0) {
                const bulkOps = findObservationSatuSehat.entry.map(item => ({
                    replaceOne: {
                        filter: { id: item.resource.id },
                        replacement: item.resource,
                        upsert: true
                    }
                }));
                let saverecoll = await Observation.bulkWrite(bulkOps);
                console.log('Data Di simpan dari satu sehat' + saverecoll);
                continue
            }
            let norawat = x.identifier[0].value
            let bundel = {
                "resourceType": "Bundle",
                "type": "transaction",
                "entry": []
            }
            if (x.class.code === 'AMB' || x.class.code === 'EMER') {
                let findperawatan = await pemeriksaan_ralan.findAll({
                    where: {
                        no_rawat: norawat
                    },
                    include: [{
                        model: pegawai,
                        as: 'pegawai',
                        attributes: ['nama', 'no_ktp']
                    }],
                    order: [
                        ['jam_rawat', 'DESC'], ['jam_rawat', 'DESC']
                    ],
                })
                if (findperawatan.length === 0) {
                    continue
                }
                const mapTampung = new Map();

                findperawatan.forEach(item => {
                    const ktp = item.pegawai?.no_ktp;

                    // Jika KTP ada dan belum pernah dimasukkan ke mapTampung, maka simpan
                    if (ktp && !mapTampung.has(ktp)) {
                        mapTampung.set(ktp, item);
                    }
                });

                const hasilFilter = Array.from(mapTampung.values());
                console.log("jumlah perawatan " + findperawatan.length);
                console.log("jumlah awal " + hasilFilter.length);
                let mapnama = hasilFilter.map((item) => item.pegawai?.nama)
                // Ensure patient has consent before creating observations
                const patientId = x.subject.reference.split("/")[1];

                for (let i of hasilFilter) {
                    let ihsPetugas = await getPractitioner(i.pegawai.no_ktp, 'id name')
                    if (ihsPetugas === false) {
                        continue;
                    }
                    const sharedConfig = {
                        patientId: x.subject.reference.split("/")[1],
                        patientDisplay: x.subject.display,
                        encounterId: x.id,
                        practitionerId: ihsPetugas.id,
                        practitionerDisplay: ihsPetugas.name[0].text,
                        dateTime: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00",
                        issued: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00"
                    };
                    if (i.nadi != '' && i.nadi != 0) {
                        let dataHeartRateObservation = new HeartRateObservation({
                            ...sharedConfig,
                            encounterDisplay: "Pemeriksaan Fisik Nadi pada pasien " + x.subject.display + " pada tanggal " + i.tgl_perawatan + " " + i.jam_rawat + " no rawat " + norawat,
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00",

                            heartRate: i.nadi
                        });
                        const heartRateEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": dataHeartRateObservation,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };
                        if (!isEntryDuplicate(bundel, heartRateEntry)) {
                            bundel.entry.push(heartRateEntry);
                        }
                    }
                    if (i.tekanan_darah != '') {
                        // Generate resource Sistolik
                        const systolicResource = new BloodPressureObservation({
                            ...sharedConfig,
                            type: 'systolic',
                            value: i.tensi.split("/")[0],
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00"
                        });

                        // Generate resource Diastolik
                        const diastolicResource = new BloodPressureObservation({
                            ...sharedConfig,
                            type: 'diastolic',
                            value: i.tensi.split("/")[1],
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00"
                        });

                        const systolicEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": systolicResource,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };

                        const diastolicEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": diastolicResource,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };

                        if (!isEntryDuplicate(bundel, systolicEntry)) {
                            bundel.entry.push(systolicEntry);
                        }
                        if (!isEntryDuplicate(bundel, diastolicEntry)) {
                            bundel.entry.push(diastolicEntry);
                        }
                    }
                    if (i.suhu_tubuh != '' && i.suhu_tubuh != 0) {
                        let dataTemperatureObservation = new BodyTemperatureObservation({
                            ...sharedConfig,
                            encounterDisplay: "Pemeriksaan Fisik Suhu Tubuh pada pasien " + x.subject.display + " pada tanggal " + i.tgl_perawatan + " " + i.jam_rawat + " no rawat " + norawat,
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00",

                            temperature: i.suhu_tubuh
                        });
                        const temperatureEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": dataTemperatureObservation,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };
                        if (!isEntryDuplicate(bundel, temperatureEntry)) {
                            bundel.entry.push(temperatureEntry);
                        }
                    }
                    if (i.respirasi != '' && i.respirasi != 0) {
                        let dataRespiratoryRateObservation = new RespiratoryRateObservation({
                            ...sharedConfig,
                            encounterDisplay: "Pemeriksaan Fisik Respirasi pada pasien " + x.subject.display + " pada tanggal " + i.tgl_perawatan + " " + i.jam_rawat + " no rawat " + norawat,
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00",

                            respiratoryRate: i.respirasi
                        });
                        const respiratoryEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": dataRespiratoryRateObservation,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };
                        if (!isEntryDuplicate(bundel, respiratoryEntry)) {
                            bundel.entry.push(respiratoryEntry);
                        }
                    }
                    if (i.berat != '' && i.berat != 0) {
                        let dataBodyWeightObservation = new BodyWeightObservation({
                            ...sharedConfig,
                            encounterDisplay: "Pemeriksaan Fisik SPO2 pada pasien " + x.subject.display + " pada tanggal " + i.tgl_perawatan + " " + i.jam_rawat + " no rawat " + norawat,
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00",

                            bodyWeight: i.spo2
                        });
                        const bodyWeightEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": dataBodyWeightObservation,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };
                        if (!isEntryDuplicate(bundel, bodyWeightEntry)) {
                            bundel.entry.push(bodyWeightEntry);
                        }
                    }
                    if (i.spo2 != '' && i.spo2 != 0) {
                        let dataOxygenSaturationObservation = new OxygenSaturationObservation({
                            ...sharedConfig,
                            encounterDisplay: "Pemeriksaan Fisik SPO2 pada pasien " + x.subject.display + " pada tanggal " + i.tgl_perawatan + " " + i.jam_rawat + " no rawat " + norawat,
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00",

                            oxygenSaturation: i.spo2
                        });
                        const oxygenEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": dataOxygenSaturationObservation,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };
                        if (!isEntryDuplicate(bundel, oxygenEntry)) {
                            bundel.entry.push(oxygenEntry);
                        }
                    }
                    if (i.intruksi != '') {
                        let dataClinicalCarePlan = new ClinicalCarePlan({
                            ...sharedConfig,
                            description: `instruksi: ${i.intruksi} RTL: ${i.rtl}`,
                            encounterDisplay: "Pemeriksaan Fisik Intruksi dan RTL pada pasien " + x.subject.display + " pada tanggal " + i.tgl_perawatan + " " + i.jam_rawat + " no rawat " + norawat,
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00"
                        });
                        const carePlanEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": dataClinicalCarePlan,
                            "request": {
                                "method": "POST",
                                "url": "CarePlan"
                            }
                        };
                        if (!isEntryDuplicate(bundel, carePlanEntry)) {
                            bundel.entry.push(carePlanEntry);
                        }
                    }
                }

                let kirimObservation = await fetchSatusehatBatch("POST", bundel);


                if (kirimObservation.total === 0) {
                    console.log(JSON.stringify(kirimObservation.response.issue, null, 2));
                    return

                }
                ralan++
                console.log('kirimObservation ralan', ralan);
                for (let i = 0; i < bundel.entry.length; i++) {
                    if (kirimObservation.entry[i] && kirimObservation.entry[i].response) {
                        if (kirimObservation.entry[i].response.resourceType === 'Observation') {
                            let dataobservation = bundel.entry[i].resource;
                            dataobservation.id = kirimObservation.entry[i].response.resourceID;
                            let x = await Observation.create(dataobservation)

                        }
                        if (kirimObservation.entry[i].response.resourceType === 'CarePlan') {
                            let dataobservation = bundel.entry[i].resource;
                            dataobservation.id = kirimObservation.entry[i].response.resourceID;
                            let x = await Careplan.create(dataobservation)
                        }
                    }
                }
            }
            if (x.class.code === 'IMP') {
                let findperawatan = await pemeriksaan_ranap.findAll({
                    where: {
                        no_rawat: norawat
                    },
                    include: [{
                        model: pegawai,
                        as: 'pegawai',
                        attributes: ['nama', 'no_ktp']
                    }],
                    order: [
                        ['tgl_perawatan', 'DESC'], ['jam_rawat', 'DESC']
                    ],
                })
                if (findperawatan.length === 0) {
                    continue
                }
                const mapTampung = new Map();

                findperawatan.forEach(item => {
                    const ktp = item.pegawai?.no_ktp;

                    // Jika KTP ada dan belum pernah dimasukkan ke mapTampung, maka simpan
                    if (ktp && !mapTampung.has(ktp)) {
                        mapTampung.set(ktp, item);
                    }
                });

                const hasilFilter = Array.from(mapTampung.values());
                console.log("jumlah perawatan " + findperawatan.length);
                console.log("jumlah awal " + hasilFilter.length);
                let mapnama = hasilFilter.map((item) => item.pegawai?.nama)
                // Ensure patient has consent before creating observations
                const patientId = x.subject.reference.split("/")[1];

                for (let i of hasilFilter) {
                    let ihsPetugas = await getPractitioner(i.pegawai.no_ktp, 'id name')
                    if (ihsPetugas === false) {
                        continue;
                    }
                    const sharedConfig = {
                        patientId: x.subject.reference.split("/")[1],
                        patientDisplay: x.subject.display,
                        encounterId: x.id,
                        practitionerId: ihsPetugas.id,
                        practitionerDisplay: ihsPetugas.name[0].text,
                        dateTime: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00",
                        issued: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00"
                    };
                    if (i.nadi != '' && i.nadi != 0) {
                        let dataHeartRateObservation = new HeartRateObservation({
                            ...sharedConfig,
                            encounterDisplay: "Pemeriksaan Fisik Nadi pada pasien " + x.subject.display + " pada tanggal " + i.tgl_perawatan + " " + i.jam_rawat + " no rawat " + norawat,
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00",

                            heartRate: i.nadi
                        });
                        const heartRateEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": dataHeartRateObservation,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };
                        if (!isEntryDuplicate(bundel, heartRateEntry)) {
                            bundel.entry.push(heartRateEntry);
                        }
                    }
                    if (i.tekanan_darah != '') {
                        // Generate resource Sistolik
                        const systolicResource = new BloodPressureObservation({
                            ...sharedConfig,
                            type: 'systolic',
                            value: i.tensi.split("/")[0],
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00"
                        });

                        // Generate resource Diastolik
                        const diastolicResource = new BloodPressureObservation({
                            ...sharedConfig,
                            type: 'diastolic',
                            value: i.tensi.split("/")[1],
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00"
                        });

                        const systolicEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": systolicResource,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };

                        const diastolicEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": diastolicResource,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };

                        if (!isEntryDuplicate(bundel, systolicEntry)) {
                            bundel.entry.push(systolicEntry);
                        }
                        if (!isEntryDuplicate(bundel, diastolicEntry)) {
                            bundel.entry.push(diastolicEntry);
                        }
                    }
                    if (i.suhu_tubuh != '' && i.suhu_tubuh != 0) {
                        let dataTemperatureObservation = new BodyTemperatureObservation({
                            ...sharedConfig,
                            encounterDisplay: "Pemeriksaan Fisik Suhu Tubuh pada pasien " + x.subject.display + " pada tanggal " + i.tgl_perawatan + " " + i.jam_rawat + " no rawat " + norawat,
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00",

                            temperature: i.suhu_tubuh
                        });
                        const temperatureEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": dataTemperatureObservation,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };
                        if (!isEntryDuplicate(bundel, temperatureEntry)) {
                            bundel.entry.push(temperatureEntry);
                        }
                    }
                    if (i.respirasi != '' && i.respirasi != 0) {
                        let dataRespiratoryRateObservation = new RespiratoryRateObservation({
                            ...sharedConfig,
                            encounterDisplay: "Pemeriksaan Fisik Respirasi pada pasien " + x.subject.display + " pada tanggal " + i.tgl_perawatan + " " + i.jam_rawat + " no rawat " + norawat,
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00",

                            respiratoryRate: i.respirasi
                        });
                        const respiratoryEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": dataRespiratoryRateObservation,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };
                        if (!isEntryDuplicate(bundel, respiratoryEntry)) {
                            bundel.entry.push(respiratoryEntry);
                        }
                    }
                    if (i.berat != '' && i.berat != 0) {
                        let dataBodyWeightObservation = new BodyWeightObservation({
                            ...sharedConfig,
                            encounterDisplay: "Pemeriksaan Fisik SPO2 pada pasien " + x.subject.display + " pada tanggal " + i.tgl_perawatan + " " + i.jam_rawat + " no rawat " + norawat,
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00",

                            bodyWeight: i.spo2
                        });
                        const bodyWeightEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": dataBodyWeightObservation,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };
                        if (!isEntryDuplicate(bundel, bodyWeightEntry)) {
                            bundel.entry.push(bodyWeightEntry);
                        }
                    }
                    if (i.spo2 != '' && i.spo2 !== 0) {
                        let dataOxygenSaturationObservation = new OxygenSaturationObservation({
                            ...sharedConfig,
                            encounterDisplay: "Pemeriksaan Fisik SPO2 pada pasien " + x.subject.display + " pada tanggal " + i.tgl_perawatan + " " + i.jam_rawat + " no rawat " + norawat,
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00",

                            oxygenSaturation: i.spo2
                        });
                        const oxygenEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": dataOxygenSaturationObservation,
                            "request": {
                                "method": "POST",
                                "url": "Observation"
                            }
                        };
                        if (!isEntryDuplicate(bundel, oxygenEntry)) {
                            bundel.entry.push(oxygenEntry);
                        }
                    }
                    if (i.intruksi != '') {
                        let dataClinicalCarePlan = new ClinicalCarePlan({
                            ...sharedConfig,
                            description: `instruksi: ${i.intruksi} RTL: ${i.rtl}`,
                            encounterDisplay: "Pemeriksaan Fisik Intruksi dan RTL pada pasien " + x.subject.display + " pada tanggal " + i.tgl_perawatan + " " + i.jam_rawat + " no rawat " + norawat,
                            effectiveDate: i.tgl_perawatan + "T" + i.jam_rawat + "+07:00"
                        });
                        const carePlanEntry = {
                            "fullUrl": "urn:uuid:" + crypto.randomUUID(),
                            "resource": dataClinicalCarePlan,
                            "request": {
                                "method": "POST",
                                "url": "CarePlan"
                            }
                        };
                        if (!isEntryDuplicate(bundel, carePlanEntry)) {
                            bundel.entry.push(carePlanEntry);
                        }
                    }
                }

                let kirimObservation = await fetchSatusehatBatch("POST", bundel);
                console.log(kirimObservation)


                if (kirimObservation.total === 0) {
                    console.log(JSON.stringify(kirimObservation.response.issue, null, 2));
                    // return

                }
                ranap++
                console.log('kirim observation rawat inap: ' + ranap);
                for (let i = 0; i < bundel.entry.length; i++) {
                    if (kirimObservation.entry[i] && kirimObservation.entry[i].response) {
                        if (kirimObservation.entry[i].response.resourceType === 'Observation') {
                            let dataobservation = bundel.entry[i].resource;
                            dataobservation.id = kirimObservation.entry[i].response.resourceID;
                            let x = await Observation.create(dataobservation)
                            console.log(x)

                        }
                        if (kirimObservation.entry[i].response.resourceType === 'CarePlan') {
                            let dataobservation = bundel.entry[i].resource;
                            dataobservation.id = kirimObservation.entry[i].response.resourceID;
                            let x = await Careplan.create(dataobservation)
                            console.log(x)
                        }
                    }
                }
                if (kirimObservation.error) {
                    console.log(kirimObservation.error);
                    // return;
                }
                // return;

            }
        }
    }
    console.log('selesai kirim observation rawat inap: ' + ranap + ' ralan: ' + ralan);
    return
}

module.exports = {
    kirimObservation
}