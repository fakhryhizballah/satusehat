const Org_id = process.env.Organization_id_SATUSEHAT
function ClinicalProcedure(config = {}) {
    this.resourceType = "Procedure";
    this.status = "completed";

    this.category = {
        "coding": [
            {
                "system": "http://snomed.info/sct",
                "code": "103693007",
                "display": "Diagnostic procedure"
            }
        ],
        "text": "Diagnostic procedure"
    };

    this.code = {
        coding: [
            {
                system: "http://hl7.org/fhir/sid/icd-9-cm",
                code: config.icd9Code || "",
                display: config.icd9Display || ""
            }
        ]
    };

    this.subject = {
        reference: `Patient/${config.patientId || ''}`,
        display: config.patientName || ''
    };
    this.identifier = [
        {

            "system": "http://sys-ids.kemkes.go.id/procedure/" + Org_id,
            "use": "official",
            "value": config.procedureValue || ''
        }
    ];

    this.encounter = {
        reference: `Encounter/${config.encounterId || ''}`,
        display: config.encounterDisplay || ''
    };
}
module.exports = {ClinicalProcedure};