# Instrucciones para configurar DNS

1. Ingresa al panel de tu proveedor de dominio (ej: Namecheap, GoDaddy, Google Domains).
2. Crea un registro tipo A apuntando tu dominio (ej: tu-app.shopify.com o tu-dominio.com) a la IP pública de tu servidor (Droplet, EC2, etc).
3. Espera la propagación (puede tardar minutos u horas).
4. Verifica con: `ping tu-app.shopify.com` o usando https://dnschecker.org
5. Una vez propagado, puedes emitir certificados SSL con Certbot o usar Traefik para HTTPS automático.
