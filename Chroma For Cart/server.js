const http = require("http");
const fs = require("fs");
const path = require("path");

// CONFIG
const CHROMA_HOST = "localhost";
const CHROMA_PORT = 54235; // example Chroma port
const MOD_PORT = 8360;     // CFC server port

// FILE PATHS
const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "Latest_log.txt");
const LOOKUP_FILE = path.join(__dirname, "lookup.json");
const SHUTDOWN_FILE = path.join(__dirname, "shutdown_payload.json");

// STATE
let chromaReady = false;
let modConnected = false;
let shuttingDown = false;

// ---------- UTIL: LOGGING ----------

function ensureLogFolder() {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(LOG_FILE, ""); // clear log on startup
}

function formatTimestamp() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);

    let hours = d.getHours();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const hh = String(hours).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");

    return `${dd}/${mm}/${yy},${hh}:${min}${ampm}`;
}

function logLine(source, receiver, method, data) {
    const line = `[${source} --> ${receiver},${method}] [${formatTimestamp()}] ${data}\n`;
    fs.appendFileSync(LOG_FILE, line);
    console.log(line.trim());
}

// ---------- CHROMA COMMUNICATION ----------

function chromaRequest(path, method = "POST", body = {}) {
    return new Promise((resolve, reject) => {
        const json = JSON.stringify(body);
        const options = {
            hostname: CHROMA_HOST,
            port: CHROMA_PORT,
            path,
            method,
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(json)
            }
        };

        const req = http.request(options, res => {
            let data = "";
            res.on("data", chunk => (data += chunk));
            res.on("end", () => {
                logLine("CFC", "Chroma", method, json);
                try {
                    resolve(JSON.parse(data || "{}"));
                } catch {
                    resolve({});
                }
            });
        });

        req.on("error", err => {
            logLine("CFC", "Chroma", method, `ERROR: ${err.message}`);
            reject(err);
        });

        req.write(json);
        req.end();
    });
}

async function initChroma() {
    try {
        const res = await chromaRequest("/heartbeat", "POST", {});
        chromaReady = res.result === 1;
        logLine("Chroma", "CFC", "POST", `result: ${res.result || 0}`);
    } catch {
        chromaReady = false;
    }
}

// ---------- SHUTDOWN LOGIC ----------

function sendShutdownToMod(server) {
    try {
        const payload = fs.readFileSync(SHUTDOWN_FILE, "utf8");
        logLine("CFC", "MC-MOD", "PUT", payload);

        const req = http.request(
            {
                hostname: "localhost",
                port: MOD_PORT,
                path: "/shutdown",
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payload)
                }
            },
            res => res.resume()
        );

        req.on("error", () => {});
        req.write(payload);
        req.end();
    } catch (e) {
        logLine("CFC", "MC-MOD", "PUT", `ERROR reading shutdown_payload.json: ${e.message}`);
    }

    logLine("CFC", "CFC", "PUT", "error code : 1");
    shuttingDown = true;
    server.close(() => process.exit(0));
}

// ---------- LOOKUP TABLE ----------

function loadLookup() {
    try {
        return JSON.parse(fs.readFileSync(LOOKUP_FILE, "utf8"));
    } catch (e) {
        logLine("CFC", "CFC", "GET", `ERROR reading lookup.json: ${e.message}`);
        return {};
    }
}

function loadEventFile(eventPath) {
    try {
        return JSON.parse(fs.readFileSync(eventPath, "utf8"));
    } catch (e) {
        logLine("CFC", "CFC", "GET", `ERROR reading event file: ${e.message}`);
        return null;
    }
}

// ---------- MOD SERVER ----------

const server = http.createServer(async (req, res) => {
    if (shuttingDown) {
        res.writeHead(503);
        return res.end();
    }

    // MOD → CFC handshake
    if (req.method === "POST" && req.url === "/connect") {
        logLine("MC-MOD", "CFC", "POST", "connect signal");
        modConnected = true;

        if (!chromaReady) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ result: 0 }));
            return sendShutdownToMod(server);
        }

        const payload = JSON.stringify({ result: 1 });
        logLine("CFC", "MC-MOD", "PUT", payload);

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(payload);
    }

    // MOD → CFC event
    if (req.method === "POST" && req.url === "/event") {
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", async () => {
            logLine("MC-MOD", "CFC", "POST", body);

            let data;
            try {
                data = JSON.parse(body);
            } catch {
                data = {};
            }

            const lookup = loadLookup();
            const key = data.event;
            const eventFileName = lookup[key];

            if (!eventFileName) {
                logLine("CFC", "CFC", "GET", `No mapping for event: ${key}`);
                res.writeHead(400);
                return res.end();
            }

            const eventPath = path.join(__dirname, "Events", eventFileName);
            const eventJson = loadEventFile(eventPath);

            if (!eventJson) {
                res.writeHead(500);
                return res.end();
            }

            let chromaRes = {};
            let timedOut = false;

            const timeout = setTimeout(() => {
                timedOut = true;
            }, 3000);

            try {
                chromaRes = await chromaRequest("/effect", "PUT", eventJson);
            } catch {
                chromaRes = { result: 0 };
            } finally {
                clearTimeout(timeout);
            }

            if (timedOut || chromaRes.result !== 1) {
                sendShutdownToMod(server);
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ result: 0 }));
            }

            const forward = JSON.stringify({ result: 1 });
            logLine("CFC", "MC-MOD", "PUT", forward);

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(forward);
        });
        return;
    }

    res.writeHead(404);
    res.end();
});

// ---------- STARTUP ----------

(async () => {
    ensureLogFolder();

    logLine("CFC", "Chroma", "POST", "init heartbeat");
    await initChroma();

    server.listen(MOD_PORT, () => {
        logLine("CFC", "CFC", "PUT", `Server listening on port ${MOD_PORT}`);
    });
})();
