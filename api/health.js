export default function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
        status: "ok",
        service: "ClearCut API",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        uptime: process.uptime ? Math.floor(process.uptime()) : 0,
    });
}
