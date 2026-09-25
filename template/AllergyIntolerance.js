/**
 * FHIR AllergyIntolerance Constructor
 * @param {Object} config - Konfigurasi data alergi pasien
 * @param {string} config.allergyValue - Nomor rekam alergi dari SIMRS (misal: '2024011234')
 * @param {string} [config.category] - Kategori alergi: 'food', 'medication', 'environment', atau 'biologic' (default: 'food')
 * @param {string} config.snomedCode - Kode SNOMED CT allergen (misal: '226963000')
 * @param {string} config.snomedDisplay - Display SNOMED CT allergen (misal: 'Duck - meat')
 * @param {string} [config.textNote] - Catatan narasi alergi (misal: 'Alergi daging bebek sejak umur 10 tahun')
 * @param {string} config.patientId - ID Pasien dari SatuSehat
 * @param {string} config.patientName - Nama Pasien
 * @param {string} config.encounterId - UUID Encounter
 * @param {string} config.practitionerId - ID Praktisi / Dokter (Recorder)
 * @param {string} config.practitionerName - Nama Praktisi / Dokter
 * @param {string} [config.recordedDate] - Waktu rekam data (Format ISO, default: sekarang)
 */
const Org_id = process.env.Organization_id_SATUSEHAT
function PatientAllergyIntolerance(config = {}) {
    const nowIsoStr = new Date().toISOString();

    this.resourceType = "AllergyIntolerance";

    this.identifier = [
        {
            system: `http://sys-ids.kemkes.go.id/allergy/${Org_id}`,
            use: "official",
            value: config.allergyValue || ''
        }
    ];

    this.clinicalStatus = {
        coding: [
            {
                system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                code: "active",
                display: "Active"
            }
        ]
    };

    this.verificationStatus = {
        coding: [
            {
                system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
                code: "confirmed",
                display: "Confirmed"
            }
        ]
    };

    this.category = [config.category || "food"];

    this.code = {
        coding: [
            {
                system: "http://snomed.info/sct",
                code: config.snomedCode || "",
                display: config.snomedDisplay || ""
            }
        ],
        text: config.textNote || ""
    };

    this.patient = {
        reference: `Patient/${config.patientId || ''}`,
        display: config.patientName || ''
    };

    this.encounter = {
        reference: `Encounter/${config.encounterId || ''}`,
        display: `${config.encounterDisplay || ''}`
    };

    this.recordedDate = config.recordedDate || nowIsoStr;

    this.recorder = {
        reference: `Practitioner/${config.practitionerId || ''}`,
        display: config.practitionerName || ''
    };
}

module.exports = PatientAllergyIntolerance;