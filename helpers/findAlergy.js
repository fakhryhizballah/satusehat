require("dotenv").config();
const OpenAI = require("openai");
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "Qwen3-Embedding-4B-4bit-DWQ";
const VECTOR_DIM = parseInt(process.env.EMBEDDING_DIM || "768", 10); // Sesuaikan dimensi model Qwen (e.g., 1536/4096)
const INDEX_NAME = "idx:memory_alergies";
const { createClient } = require("redis");
const client = createClient({
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_URL || "127.0.0.1",
        port: parseInt(process.env.REDIS_URL_PORT || "6379", 10),
    },
    database: 0,
});
const openaiEmbeddings = new OpenAI({
    apiKey: process.env.EMBEDDING_API_KEY || "",
    baseURL: process.env.EMBEDDING_BASE_URL || "http://localhost:8080/v1",
});
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
function float32Buffer(arr) {
    return Buffer.from(new Float32Array(arr).buffer);
}
async function retrieveContextAlergy(query, topK = 2, scoreThreshold = 0.3) {
    await client.connect();
    const queryEmbedding = await getEmbedding(query);
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
                data: doc.value,
                score: similarity,
            };
        })
        .filter((item) => item.score > scoreThreshold);

    if (relevant.length === 0) return null;
    client.disconnect();
    return relevant;
}
module.exports = { retrieveContextAlergy };