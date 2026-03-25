const express = require("express");
const yts = require("yt-search");
const { execSync } = require("child_process");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");

// 🔥 Configuración de Spotify (Carga segura)
let getTracks;
try {
    const fetch = require('node-fetch');
    getTracks = require('spotify-url-info')(fetch).getTracks;
} catch (e) {
    console.log("⚠️ Error cargando Spotify. Asegúrate de instalar: node-fetch@2 spotify-url-info");
}

const app = express();

// 🔥 CONFIGURACIÓN DE CORS (CRÍTICO PARA WORDPRESS)
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

const publicPath = path.resolve(__dirname);
app.use(express.static(publicPath));

const DOWNLOADS_DIR = path.join(publicPath, 'temp_downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR);

// Ruta para la raíz
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// 🔥 PROCESO DE DESCARGA CON PROGRESO (SSE)
app.get("/playlist-progress", async (req, res) => {
    const url = req.query.url;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); 

    const sendProgress = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
        let cancionesParaBuscar = [];
        let esSpotify = url.includes('spotify.com');

        if (esSpotify) {
            if (!getTracks) throw new Error("Librería Spotify no cargada.");
            sendProgress({ status: "Analizando lista de Spotify..." });
            const tracks = await getTracks(url);
            cancionesParaBuscar = tracks.map(t => {
                const n = t.name || "Desconocida";
                const a = (t.artists && t.artists.length > 0) ? t.artists[0].name : "";
                return `${n} ${a}`.trim();
            });
        } else {
            sendProgress({ status: "Analizando YouTube..." });
            const rawIds = execSync(`yt-dlp --get-id --flat-playlist "${url}"`).toString();
            // CORREGIDO AQUÍ:
            cancionesParaBuscar = rawIds.trim().split('\n').map(id => `https://www.youtube.com{id.trim()}`);
        }

        const total = cancionesParaBuscar.length;
        if (total === 0) throw new Error("No hay canciones.");

        const folderName = `list-${Date.now()}`;
        const folderPath = path.join(DOWNLOADS_DIR, folderName);
        fs.mkdirSync(folderPath);

        for (let i = 0; i < total; i++) {
            sendProgress({ status: `Descargando ${i+1}/${total}: ${cancionesParaBuscar[i].substring(0,20)}...`, current: i+1, total });
            
            let q = cancionesParaBuscar[i];
            let cmd = esSpotify 
                ? `yt-dlp -x --audio-format mp3 --no-playlist -o "${folderPath}/%(title)s.%(ext)s" "ytsearch1:${q}"`
                : `yt-dlp -x --audio-format mp3 --no-playlist -o "${folderPath}/%(title)s.%(ext)s" "${q}"`;

            try { execSync(cmd); } catch (e) { console.error("Fallo en canción:", q); }
        }

        sendProgress({ status: "Comprimiendo ZIP..." });
        const zipName = `${folderName}.zip`;
        const zipPath = path.join(DOWNLOADS_DIR, zipName);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            sendProgress({ status: "Completado", file: zipName });
        });

        archive.pipe(output);
        archive.directory(folderPath, false);
        await archive.finalize();

        setTimeout(() => fs.rmSync(folderPath, { recursive: true, force: true }), 2000);

    } catch (error) {
        sendProgress({ status: "Error: " + error.message });
    }
});

// Ruta de descarga del ZIP
app.get("/get-zip", (req, res) => {
    const filePath = path.join(DOWNLOADS_DIR, req.query.file);
    if (fs.existsSync(filePath)) {
        res.download(filePath, (err) => {
            if (!err) setTimeout(() => fs.unlinkSync(filePath), 5000);
        });
    } else {
        res.status(404).send("Archivo no encontrado.");
    }
});

// 🔥 PUERTO Y HOST OBLIGATORIO PARA RAILWAY
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor activo y visible en puerto ${PORT}`);
});