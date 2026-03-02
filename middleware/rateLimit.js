/**
 * Simple in-memory rate limiter for Vercel Edge
 * Limits: 10 requests per IP per minute
 */

const store = new Map();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10;      // per window
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_BATCH = 5;          // max files per batch

function getClientIp(req) {
    return (
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.headers["x-real-ip"] ||
        req.socket?.remoteAddress ||
        "unknown"
    );
}

export function rateLimit(req, res) {
    const ip = getClientIp(req);
    const now = Date.now();

    if (!store.has(ip)) {
        store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        return true;
    }

    const entry = store.get(ip);

    if (now > entry.resetAt) {
        store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        return true;
    }

    if (entry.count >= MAX_REQUESTS) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.setHeader("Retry-After", retryAfter);
        res.status(429).json({
            error: "Too many requests. Please wait a moment.",
            retryAfter,
        });
        return false;
    }

    entry.count++;
    return true;
}

export { MAX_FILE_SIZE, MAX_BATCH };
