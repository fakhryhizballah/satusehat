require('dotenv').config()
const mongoose = require('mongoose');
const Practitioner = require("../modelsMongoose/Practitioner");
const Patient = require("../modelsMongoose/Patient");
const Encounter = require("../modelsMongoose/Encounter");
const Location = require("../modelsMongoose/Location");
const { pegawai, pasien } = require("../models");
const { Op } = require("sequelize");
const { getPesertabyKatu } = require("../helpersfetch/bpjs");
const { fetchSatusehat, fetchSatusehatPatch } = require("../helpersfetch/satusehat");


const client = require("../config/redis");

async function getPractitioner(nik, attributes) {
    let isexist = await Practitioner.findOne({
        'identifier.value': nik
    }, attributes)
    if (isexist) {
        return isexist
    } else {
        let cariIHSnumber = await fetchSatusehat("GET", `/Practitioner?identifier=https://fhir.kemkes.go.id/id/nik|${nik}`)
        console.log(nik)
        if (cariIHSnumber.total > 0) {
            console.log(cariIHSnumber.entry[0].resource.id);
            let dataIHSnumber = await fetchSatusehat("GET", `/Practitioner/${cariIHSnumber.entry[0].resource.id}`)
            let findPegawai = await pegawai.findOne({
                attributes: ['no_ktp', 'nama', 'nik'],
                where: {
                    no_ktp: nik
                },
            })
            dataIHSnumber.identifier.push({
                "system": "https://fhir.kemkes.go.id/id/rsid",
                "value": findPegawai.nik
            })
            await Practitioner.create(dataIHSnumber);
            return dataIHSnumber
        }
        return false
    }
}
async function getPatient(nik, attributes) {
    let isexist = await Patient.findOne({
        'identifier.value': nik
    }, attributes)
    if (isexist) {
        return isexist
    }
    let getIHS = await client.json.get('satusehat:null:Patient:' + nik);
    if (getIHS) {
        return false
    }
    let cariIHSnumber = await fetchSatusehat("GET", `/Patient?identifier=https://fhir.kemkes.go.id/id/nik|${nik}`)
    if (cariIHSnumber.total > 0) {
        let findPatient = await pasien.findOne({
            attributes: ['nm_pasien', 'no_ktp'],
            where: {
                no_ktp: nik
            },
        })
        // console.log(findPatient);
        let dataIHSnumber = cariIHSnumber.entry[0].resource
        // 1. Cari indeks tempat NIK berada
        let nikIndex = dataIHSnumber.identifier.findIndex(id =>
            id.system === "https://fhir.kemkes.go.id/id/nik"
        );
        if (nikIndex !== -1) {
            dataIHSnumber.identifier[nikIndex].value = nik;
        }
        if (!findPatient) {
            await Patient.create(dataIHSnumber);
            return dataIHSnumber
        }

        dataIHSnumber.name[0].text = findPatient.nm_pasien
        await Patient.create(dataIHSnumber);
        return dataIHSnumber
    }
    else {
        await client.json.set('satusehat:null:Patient:' + nik, '$', 'false');
        await client.expire('satusehat:null:Patient:' + nik, 60 * 60 * 24 * 7);
    }
    return false
}

// updateEncounterRanap('2026-02-04');
module.exports = {
    getPractitioner,
    getPatient
}

