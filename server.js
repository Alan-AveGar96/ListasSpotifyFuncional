process.env.YTDLP_PATH = "/usr/bin/yt-dlp";

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const ytSearch = require('yt-search');
const youtubedl = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 👉 Ruta base (para evitar 404 en Railway)
app.get('/', (req, res) => {
    res.send('Servidor funcionando 🚀');
});

// Carpeta temporal
const TEMP_DIR = path.join(__dirname, 'temp_downloads');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

// 🔍 Obtener canciones desde Spotify
async function getTracksFromSpotify(url) {
    try {
        const res = await fetch(`https://api.spotifydown.com/metadata/playlist?link=${url}`);
        const data = await res.json();

        if (!data || !data.tracks) {
            console.log("Spotify API error:", data);
            return [];
        }

        return data.tracks;
    } catch (err) {
        console.log("Error Spotify:", err.message);
        return [];
    }
}

// 🔎 Buscar en YouTube
async function searchYoutube(query) {
    try {
        const result = await ytSearch(query);
        return result.videos.length > 0 ? result.videos[0].url : null;
    } catch (err) {
        console.log("Error YouTube:", err.message);
        return null;
    }
}

// 🎵 Descargar audio
async function downloadAudio(query, folder) {
    const videoUrl = await searchYoutube(query);
    if (!videoUrl) return false;

    try {
        await youtubedl(videoUrl, {
            extractAudio: true,
            audioFormat: 'mp3',
            output: `${folder}/%(title)s.%(ext)s`
        });
        return true;
    } catch (err) {
        console.log("Error descarga:", err.message);
        return false;
    }
}

// 📦 Crear ZIP
function zipFolder(source, out) {
    return new Promise((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const stream = fs.createWriteStream(out);

        stream.on('close', resolve);
        archive.on('error', reject);

        archive.pipe(stream);
        archive.directory(source, false);
        archive.finalize();
    });
}

// 🚀 ENDPOINT PRINCIPAL
app.post('/descargar', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL requerida' });
        }

        console.log("Procesando:", url);

        const tracks = await getTracksFromSpotify(url);

        if (!tracks.length) {
            return res.status(400).json({ error: 'No se encontraron canciones' });
        }

        const folderName = `lista_${Date.now()}`;
        const folderPath = path.join(TEMP_DIR, folderName);
        fs.mkdirSync(folderPath);

        // Descargar canciones
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            const query = `${track.title} ${track.artists}`;

            console.log(`Descargando: ${query}`);

            await downloadAudio(query, folderPath);
        }

        // Crear ZIP
        const zipPath = path.join(TEMP_DIR, `${folderName}.zip`);
        await zipFolder(folderPath, zipPath);

        // Enviar archivo
        res.download(zipPath, () => {
            fs.rmSync(folderPath, { recursive: true, force: true });
            fs.unlinkSync(zipPath);
        });

    } catch (error) {
        console.error("ERROR GENERAL:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 🟢 INICIAR SERVIDOR
app.listen(PORT, () => {
    console.log(`🚀 Servidor activo en puerto ${PORT}`);
});