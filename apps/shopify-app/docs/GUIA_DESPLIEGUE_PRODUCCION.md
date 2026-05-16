# Guía Detallada de Despliegue en Producción

## 1. Configuración con Nginx (recomendado)

### a) Instala Nginx en tu servidor
- Ubuntu: `sudo apt update && sudo apt install nginx`

### b) Configura un archivo de sitio para tu app
```
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
- Guarda como `/etc/nginx/sites-available/vittostore` y enlaza con `sudo ln -s /etc/nginx/sites-available/vittostore /etc/nginx/sites-enabled/`
- Reinicia Nginx: `sudo systemctl restart nginx`

### c) Habilita HTTPS con Certbot (Let’s Encrypt)
- `sudo apt install certbot python3-certbot-nginx`
- `sudo certbot --nginx -d tu-dominio.com`

---

## 2. Configuración con Traefik (Docker)

### a) Agrega Traefik a tu docker-compose.yml
```
  traefik:
    image: traefik:v2.10
    command:
      - --api.insecure=true
      - --providers.docker=true
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.httpchallenge=true
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
      - --certificatesresolvers.letsencrypt.acme.email=tu@email.com
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080" # Dashboard
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./letsencrypt:/letsencrypt
```

### b) Etiqueta tu servicio app en docker-compose:
```
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.vitto.rule=Host(`tu-dominio.com`)"
      - "traefik.http.routers.vitto.entrypoints=web,websecure"
      - "traefik.http.routers.vitto.tls.certresolver=letsencrypt"
```

---

## 3. Despliegue en proveedores específicos

### a) AWS EC2
- Lanza una instancia Ubuntu.
- Instala Docker y Docker Compose.
- Sube tu proyecto y archivos .env.
- Abre puertos 80 y 443 en el Security Group.
- Ejecuta `docker compose up -d`.
- Configura Nginx o Traefik según lo anterior.

### b) DigitalOcean Droplet
- Crea un Droplet Ubuntu.
- Instala Docker y Docker Compose.
- Sube tu proyecto y archivos .env.
- Abre puertos 80 y 443 en el firewall.
- Ejecuta `docker compose up -d`.
- Configura Nginx o Traefik.

### c) Otros proveedores (Linode, GCP, etc.)
- El proceso es similar: crea una VM, instala Docker, sube tu código, configura proxy inverso y certificados.

---

## 4. Verificación final
- Accede a tu dominio y verifica que la app responde por HTTPS.
- Prueba endpoints, monitoreo y feedback.
- Habilita backups y monitoreo de logs.

¿Necesitas ejemplos de archivos completos o ayuda con un proveedor específico? ¡Avísame!
