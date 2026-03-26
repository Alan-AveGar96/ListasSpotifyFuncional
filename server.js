const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const ytSearch = require('yt-search');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

// 🧠 Logs globales (IMPORTANTE)
process.on('uncaughtException', err => {
    console.error('ERROR GLOBAL:', err);
});

process.on('unhandledRejection', err => {
    console.error('PROMISE ERROR:', err);
});

// 📁 Carpeta temporal
const TEMP_DIR = path.join(__dirname, 'temp_downloads');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);


// 🔍 Obtener canciones desde Spotify
async function getTracksFromSpotify(url) {
    try {
        const res = await fetch(`https://api.spotifydown.com/metadata/playlist?link=${url}`);
        const data = await res.json();
        return data.tracks || [];
    } catch (err) {
        console.error("Error obteniendo Spotify:", err.message);
        return [];
    }
}


// 🔎 Buscar en YouTube
async function searchYoutube(query) {
    try {
        const result = await ytSearch(query);
        return result.videos.length > 0 ? result.videos[0].url : null;
    } catch (err) {
        console.error("Error buscando en YouTube:", err.message);
        return null;
    }
}


// 🎵 SIMULACIÓN de descarga (NO rompe Railway)
async function downloadAudio(query, folder) {
    const videoUrl = await searchYoutube(query);
    if (!videoUrl) return null;

    console.log("🎵 Encontrado:", videoUrl);

    // 🔥 Simulación: crea archivo falso
    const fakeFile = path.join(folder, `${query.replace(/[^\w\s]/gi, '')}.txt`);
    fs.writeFileSync(fakeFile, `Simulación de descarga:\n${videoUrl}`);

    return true;
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


// 🧪 Endpoint de prueba
app.get('/test', (req, res) => {
    res.send("Servidor funcionando OK 🚀");
});


// 🚀 ENDPOINT PRINCIPAL
app.post('/descargar', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });

        console.log("📥 URL recibida:", url);

        const tracks = await getTracksFromSpotify(url);

        if (!tracks.length) {
            return res.status(400).json({ error: 'No se encontraron canciones' });
        }

        const folderName = `lista_${Date.now()}`;
        const folderPath = path.join(TEMP_DIR, folderName);
        fs.mkdirSync(folderPath);

        // Descargar (simulado)
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            const query = `${track.title} ${track.artists}`;

            console.log(`🔄 Procesando: ${query}`);

            try {
                await downloadAudio(query, folderPath);
            } catch (err) {
                console.log("❌ Error en descarga:", err.message);
            }
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
        console.error("🔥 ERROR GENERAL:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// 🟢 INICIAR SERVIDOR
app.listen(PORT, () => {
    console.log(`🚀 Servidor activo en puerto ${PORT}`);
});