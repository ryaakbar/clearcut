import { IncomingForm } from "formidable";
import { readFileSync } from "fs";
import path from "path";
import { removeBg } from "../lib/removeBg.js";
import { rateLimit, MAX_FILE_SIZE, MAX_BATCH } from "../middleware/rateLimit.js";

export const config = {
    api: { bodyParser: false },
};

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

export default async function handler(req, res) {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // Rate limit
    if (!rateLimit(req, res)) return;

    try {
        // Parse multipart form
        const form = new IncomingForm({
            maxFileSize: MAX_FILE_SIZE,
            maxFiles: MAX_BATCH,
            allowEmptyFiles: false,
            filter: ({ mimetype }) => ALLOWED_TYPES.includes(mimetype),
        });

        const [, files] = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                else resolve([fields, files]);
            });
        });

        // Normalize: formidable returns array or single
        const fileArray = Array.isArray(files.images)
            ? files.images
            : files.images
            ? [files.images]
            : Object.values(files).flat();

        if (!fileArray.length) {
            return res.status(400).json({ error: "No images provided" });
        }

        if (fileArray.length > MAX_BATCH) {
            return res.status(400).json({ error: `Max ${MAX_BATCH} images per request` });
        }

        // Validate file types
        for (const file of fileArray) {
            if (!ALLOWED_TYPES.includes(file.mimetype)) {
                return res.status(400).json({
                    error: `Unsupported file type: ${file.mimetype}. Use JPG, PNG, or WebP.`,
                });
            }
        }

        // Process all images in parallel
        const results = await Promise.allSettled(
            fileArray.map(async (file) => {
                const buffer = readFileSync(file.filepath);
                const resultBuffer = await removeBg(buffer, file.originalFilename || "image.png");
                return {
                    name: stripExtension(file.originalFilename || "image") + "_nobg.png",
                    size: resultBuffer.length,
                    data: resultBuffer.toString("base64"),
                    originalSize: file.size,
                };
            })
        );

        const succeeded = [];
        const failed = [];

        results.forEach((result, i) => {
            const name = fileArray[i].originalFilename || `image_${i+1}`;
            if (result.status === "fulfilled") {
                succeeded.push(result.value);
            } else {
                failed.push({ name, error: result.reason?.message || "Processing failed" });
            }
        });

        if (!succeeded.length) {
            return res.status(500).json({
                error: "All images failed to process",
                details: failed,
            });
        }

        return res.status(200).json({
            success: true,
            processed: succeeded.length,
            failed: failed.length,
            results: succeeded,
            errors: failed,
        });

    } catch (err) {
        console.error("[remove] Error:", err.message);

        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ error: "File too large. Max 10MB per image." });
        }
        if (err.code === "LIMIT_FILE_COUNT") {
            return res.status(400).json({ error: `Max ${MAX_BATCH} images per request.` });
        }

        return res.status(500).json({ error: "Processing failed: " + err.message });
    }
}

function stripExtension(filename) {
    return filename.replace(/\.[^/.]+$/, "");
}
