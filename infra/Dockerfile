# Dockerfile para VittoStore Shopify App (Node.js/Express)
FROM node:20-alpine

# Crear directorio de la app
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json primero para aprovechar cache
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production

# Copiar el resto del código
COPY . .

# No copiar archivos sensibles ni node_modules locales
RUN rm -rf node_modules tests scripts docs/*.md

# Exponer el puerto
EXPOSE 3000

# Comando de inicio
CMD ["node", "server.js"]
