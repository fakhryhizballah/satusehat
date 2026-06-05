function ClinicalProcedure(config = {}) {
    this.resourceType = "Procedure";
    this.status = "completed";

    this.category = {
        coding: [
            {
                system: "http://snomed.info/sct",
                code: config.categoryCode || "103693007",
                display: config.categoryDisplay || "Diagnostic procedure"
            }
        ],
        text: config.categoryText || "Prosedur Diagnostik"
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

    this.encounter = {
        reference: `Encounter/${config.encounterId || ''}`
    };
}
module.exports = {ClinicalProcedure};