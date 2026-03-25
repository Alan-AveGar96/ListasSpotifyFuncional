const express = require("express");
const yts = require("yt-search");
const { execSync } = require("child_process");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");

// 🔥 1. Configuración de Spotify (Asegúrate de que 'node-fetch@2' esté en package.json)
let getTracks;
try {
    const fetch = require('node-fetch');
    // Nota: spotify-url-info requiere fetch v2 en CommonJS
    getTracks = require('spotify-url-info')(fetch).getTracks;
} catch (e) {
    console.log("⚠️ Error cargando librerías de Spotify. Verifica la instalación.");
}

const app = express();

// 🔥 2. CORS dinámico para permitir tu WordPress
app.use(cors({
    origin: '*', // Esto permite que spot2mp3.com lea los datos de Railway sin errores
    methods: ['GET', 'POST']
}));
const publicPath = path.resolve(__dirname);
app.use(express.static(publicPath));

// Directorio de descargas compatible con Railway (/tmp es mejor para archivos efímeros)
const DOWNLOADS_DIR = path.join(publicPath, 'temp_downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR);

app.get('/', (req, res) => {
    // Si tu archivo se llama index.html en lugar de prueba.html, cámbialo aquí
    res.sendFile(path.join(publicPath, 'index.html')); 
});

app.get("/playlist-progress", async (req, res) => {
    const url = req.query.url;
    
    // Configuración de Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // 🔥 Importante para que los mensajes lleguen en tiempo real en la nube

    const sendProgress = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        let cancionesParaBuscar = [];
        let esSpotify = url.includes('spotify.com');

        if (esSpotify) {
            if (!getTracks) throw new Error("Librería Spotify no instalada.");
            sendProgress({ status: "Analizando lista de Spotify..." });
            const tracks = await getTracks(url);
            
            cancionesParaBuscar = tracks.map(t => {
                const nombreCancion = t.name || "Canción desconocida";
                const nombreArtista = (t.artists && t.artists.length > 0) ? t.artists[0].name : "";
                return `${nombreCancion} ${nombreArtista}`.trim();
            });
        } else {
            sendProgress({ status: "Analizando lista de YouTube..." });
            // yt-dlp debe estar instalado en el entorno de Railway (Nixpack lo hace solo)
            const rawIds = execSync(`yt-dlp --get-id --flat-playlist "${url}"`).toString();
            cancionesParaBuscar = rawIds.trim().split('\n').map(id => `https://www.youtube.com/watch?v=${id.trim()}`);
        }

        const total = cancionesParaBuscar.length;
        if (total === 0) throw new Error("No se encontraron canciones.");

        const folderName = `lista-${Date.now()}`;
        const folderPath = path.join(DOWNLOADS_DIR, folderName);
        fs.mkdirSync(folderPath);

        for (let i = 0; i < total; i++) {
            sendProgress({ 
                status: `Descargando ${i + 1} de ${total}: ${cancionesParaBuscar[i].substring(0, 25)}...`, 
                current: i + 1, 
                total: total 
            });
            
            let query = cancionesParaBuscar[i];
            let comando = esSpotify 
                ? `yt-dlp -x --audio-format mp3 --no-playlist -o "${folderPath}/%(title)s.%(ext)s" "ytsearch1:${query}"`
                : `yt-dlp -x --audio-format mp3 --no-playlist -o "${folderPath}/%(title)s.%(ext)s" "${query}"`;

            try {
                execSync(comando);
            } catch (e) {
                console.error(`Error en: ${query}`);
            }
        }

        sendProgress({ status: "Comprimiendo archivos..." });
        const zipName = `${folderName}.zip`;
        const zipPath = path.join(DOWNLOADS_DIR, zipName);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.on('error', (err) => { throw err; });
        output.on('close', () => {
            sendProgress({ status: "Completado", file: zipName });
        });

        archive.pipe(output);
        archive.directory(folderPath, false);
        await archive.finalize();

        // Limpieza de carpeta original
        setTimeout(() => {
            fs.rmSync(folderPath, { recursive: true, force: true });
        }, 1000);

    } catch (error) {
        console.error("ERROR:", error.message);
        sendProgress({ status: "Error: " + error.message });
    }
});

app.get("/get-zip", (req, res) => {
    const fileName = req.query.file;
    const filePath = path.join(DOWNLOADS_DIR, fileName);
    
    if (fs.existsSync(filePath)) {
        res.download(filePath, (err) => {
            if (!err) {
                // Borrado seguro después de la descarga
                setTimeout(() => {
                    if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
                }, 5000);
            }
        });
    } else {
        res.status(404).send("Archivo no encontrado.");
    }
});

// 🔥 3. PUERTO DINÁMICO (Fundamental para Railway)
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor activo y visible en puerto ${PORT}`);
});