require("dotenv").config();
const { createClient } = require("redis");
const mongoose = require("mongoose");
const Alergi = require("../modelsMongoose/Alergi");
const OpenAI = require("openai");

const REDIS_DB = parseInt(process.env.REDIS_DB || "0", 10);
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "Qwen3-Embedding-4B-4bit-DWQ";
const VECTOR_DIM = parseInt(process.env.EMBEDDING_DIM || "768", 10); // Sesuaikan dimensi model Qwen (e.g., 1536/4096)
const INDEX_NAME = "idx:memory_alergies";
const PREFIX = "alergies:";

const client = createClient({
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_URL || "127.0.0.1",
        port: parseInt(process.env.REDIS_URL_PORT || "6379", 10),
    },
    database: 0,
});
// client.connect().catch(console.error).finally(() => console.log("[Redis] Connected."));
client.on("error", (err) => console.error("[Redis Error]", err));

const openaiEmbeddings = new OpenAI({
    apiKey: process.env.EMBEDDING_API_KEY || "",
    baseURL: process.env.EMBEDDING_BASE_URL || "http://localhost:8080/v1",
});

/**
 * Buffer conversion function for Redis FLOAT32 vector store
 */
function float32Buffer(arr) {
    return Buffer.from(new Float32Array(arr).buffer);
}

/**
 * Inisialisasi RediSearch Index jika belum ada
 */
async function initVectorIndex() {
    try {
        const indices = await client.ft._list();
        const exists = indices.includes(INDEX_NAME);
        // try { await client.ft.dropIndex(INDEX_NAME); } catch (e) { }
        if (!exists) {
            console.log(`[Redis] Creating Vector Search Index: ${INDEX_NAME}...`);
            await client.ft.create(
                INDEX_NAME,
                {
                    content: { type: "TEXT" },
                    category: { type: "TAG" },
                    coding_system: { type: "TAG" },
                    coding_code: { type: "TAG" },
                    coding_display: { type: "TEXT" },
                    text: { type: "TEXT" },
                    embedding: {
                        type: "VECTOR",
                        ALGORITHM: "HNSW", // Menggunakan String "HNSW" || Flat (Exact Search) IVF (Inverted File)
                        TYPE: "FLOAT32",
                        DIM: VECTOR_DIM,
                        DISTANCE_METRIC: "COSINE",
                    },
                },
                {
                    ON: "HASH",
                    PREFIX: PREFIX,
                }
            );
            console.log("[Redis] Vector Search Index Created Successfully.");
        } else {
            console.log(`[Redis] Index ${INDEX_NAME} already exists.`);
        }
    } catch (err) {
        console.error("[Redis] Error during index initialization:", err);
        throw err;
    }
}

async function getEmbedding(text) {
    const response = await openaiEmbeddings.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,

    });
    const embedding = response.data[0].embedding;

    if (embedding.length !== VECTOR_DIM) {
        throw new Error(
            `Embedding dimension mismatch: expected ${VECTOR_DIM}, got ${embedding.length}`
        );
    }

    console.log(
        `[Embedding] tokens=${response.usage?.total_tokens ?? 0}, dim=${embedding.length}`
    );

    return embedding;
}

async function saveChunkToRedis(id, data, embeddingArray) {
    const key = `${PREFIX}${id}`;
    const vectorBuffer = float32Buffer(embeddingArray);
    await client.hSet(key, {
        content: data.content || "",
        category: data.category || "",
        coding_system: data.coding_system || "",
        coding_code: data.coding_code || "",
        coding_display: data.coding_display || "",
        text: data.text || "",
        embedding: float32Buffer(embeddingArray),
    });
}

async function SetData() {
    await mongoose.connect(process.env.MONGO_URI);
    const findAlergy = await Alergi.find({});

    for (let x of findAlergy) {
        console.log(`Processing: ${x._id}`);
        const content = `${x.text} ${x.keyword}`.replace(/[()[\]{}]|[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim().toLowerCase().replace(/\s+/g, " ");;
        console.log(content);
        const embedding = await getEmbedding(content);

        await saveChunkToRedis(
            x._id.toString(),
            {
                content,
                category: x.category,
                coding_system: x.coding_system,
                coding_code: x.coding_code,
                coding_display: x.coding_display,
                text: x.text,
            },
            embedding
        );
    }

    await mongoose.disconnect();
    console.log("[System] Data Migration Completed.");
}

async function retrieveContext(query, topK = 2, scoreThreshold = 0.3) {

    const queryEmbedding = await getEmbedding(query.toLowerCase().replace(/[()[\]{}]|[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ""));
    const queryBuffer = float32Buffer(queryEmbedding);

    // Jalankan KNN query
    const searchResult = await client.ft.search(
        INDEX_NAME,
        `*=>[KNN ${topK} @embedding $BLOB AS vector_score]`,
        {
            PARAMS: {
                BLOB: queryBuffer,
            },
            SORTBY: {
                BY: "vector_score",
                DIRECTION: "ASC",
            },
            DIALECT: 2,
            RETURN: ["content", "category", "coding_system", "coding_code", "coding_display", "text", "vector_score"],
        }
    );

    if (searchResult.total === 0) return "Belum ada memori tersimpan di database.";

    const relevant = searchResult.documents
        .map((doc) => {
            const distance = parseFloat(doc.value.vector_score);
            const similarity = 1 - distance; // Convert Cosine Distance ke Similarity
            return {
                content: doc.value.content,
                score: similarity,
                category: doc.value.category,
                coding_system: doc.value.coding_system,
                coding_code: doc.value.coding_code,
                coding_display: doc.value.coding_display,
                text: doc.value.text
            };
        })
        .filter((item) => item.score > scoreThreshold);

    if (relevant.length === 0) return "Tidak ada context yang relevan.";
    console.log(relevant);
    return relevant.map((r) => r.content).join("\n---\n");
}

async function find_alerg(nama) {
    const result = await retrieveContext(nama, 5);
    console.log("Result:\n", result);
    return result;
}

async function main() {
    await client.connect();
    await initVectorIndex();

// Jalankan sekali jika perlu migrasi dari Mongo ke Redis
// await SetData();

    await find_alerg("Gurita");
    await client.disconnect();
} 

main().catch(console.error);