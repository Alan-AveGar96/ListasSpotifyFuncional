FROM node:18

# Instalar dependencias del sistema: ffmpeg, python3, pip
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Instalar yt-dlp con pip
RUN pip3 install yt-dlp

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de Node
RUN npm install

# Copiar el resto del código
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]