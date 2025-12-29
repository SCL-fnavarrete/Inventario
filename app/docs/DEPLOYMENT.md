# Guía de Deployment - Sistema de Inventario IT

## Contenido
1. [Requisitos Previos](#requisitos-previos)
2. [Deployment en Vercel](#deployment-en-vercel)
3. [Deployment en Railway](#deployment-en-railway)
4. [Configuración de Base de Datos](#configuración-de-base-de-datos)
5. [Variables de Entorno](#variables-de-entorno)
6. [Migraciones de Base de Datos](#migraciones-de-base-de-datos)
7. [Monitoreo y Logs](#monitoreo-y-logs)
8. [Backup y Recuperación](#backup-y-recuperación)
9. [Troubleshooting](#troubleshooting)

---

## Requisitos Previos

### Antes del deployment, asegurarse de:

1. **Código listo para producción**
   ```bash
   npm run build        # Verificar que compila sin errores
   npm run lint         # Sin errores de linting
   npm run test         # Tests pasando
   npm run typecheck    # Sin errores de TypeScript
   ```

2. **Base de datos PostgreSQL lista**
   - Instancia de PostgreSQL 14+ accesible
   - Usuario con permisos de lectura/escritura
   - Base de datos creada

3. **Variables de entorno configuradas**
   - `DATABASE_URL` con conexión a PostgreSQL
   - `NEXTAUTH_SECRET` generado de forma segura
   - `NEXTAUTH_URL` con el dominio de producción

---

## Deployment en Vercel

### Paso 1: Preparar el repositorio

1. Asegurar que el código está en GitHub/GitLab/Bitbucket
2. Crear archivo `vercel.json` en la raíz del proyecto:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

### Paso 2: Conectar con Vercel

1. Ir a [vercel.com](https://vercel.com) y crear cuenta
2. Click en "New Project"
3. Importar repositorio de GitHub
4. Configurar variables de entorno:
   - `DATABASE_URL`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL`

### Paso 3: Configurar base de datos

Opciones recomendadas:
- **Vercel Postgres** (integrado)
- **Supabase** (capa gratuita generosa)
- **Railway** (PostgreSQL gestionado)
- **Neon** (serverless PostgreSQL)

### Paso 4: Ejecutar migraciones

Después del deploy inicial:
```bash
npx prisma migrate deploy
```

O configurar en `vercel.json`:
```json
{
  "buildCommand": "npx prisma generate && npx prisma migrate deploy && npm run build"
}
```

---

## Deployment en Railway

### Paso 1: Crear proyecto en Railway

1. Ir a [railway.app](https://railway.app)
2. Crear nuevo proyecto
3. Seleccionar "Deploy from GitHub repo"

### Paso 2: Agregar PostgreSQL

1. En el proyecto, click "New"
2. Seleccionar "Database" > "PostgreSQL"
3. Railway proveerá automáticamente `DATABASE_URL`

### Paso 3: Configurar variables de entorno

En el servicio de Next.js:
- `DATABASE_URL` (usar la referencia de Railway: `${{Postgres.DATABASE_URL}}`)
- `NEXTAUTH_SECRET` (generar con `openssl rand -base64 32`)
- `NEXTAUTH_URL` (ej: `https://tu-app.up.railway.app`)

### Paso 4: Configurar build command

```bash
npm run build
```

### Paso 5: Configurar start command

```bash
npm run start
```

---

## Configuración de Base de Datos

### Supabase (Recomendado para proyectos nuevos)

1. Crear cuenta en [supabase.com](https://supabase.com)
2. Crear nuevo proyecto
3. Ir a Settings > Database
4. Copiar connection string (URI)
5. Reemplazar `[YOUR-PASSWORD]` con la contraseña del proyecto

**Connection string formato:**
```
postgresql://postgres.[project-id]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

### Neon (Serverless PostgreSQL)

1. Crear cuenta en [neon.tech](https://neon.tech)
2. Crear nuevo proyecto
3. Copiar connection string desde Dashboard
4. Agregar `?sslmode=require` al final si es necesario

### Amazon RDS

1. Crear instancia PostgreSQL en RDS
2. Configurar Security Groups para acceso
3. Crear base de datos
4. Usar endpoint en `DATABASE_URL`

---

## Variables de Entorno

### Variables requeridas

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Connection string PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `NEXTAUTH_SECRET` | Secret para JWT | Generar con `openssl rand -base64 32` |
| `NEXTAUTH_URL` | URL base de la aplicación | `https://inventario.empresa.cl` |

### Variables opcionales

| Variable | Descripción | Default |
|----------|-------------|---------|
| `NODE_ENV` | Ambiente de ejecución | `production` |

### Generar NEXTAUTH_SECRET

```bash
# En Linux/Mac
openssl rand -base64 32

# En Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

---

## Migraciones de Base de Datos

### Antes del primer deployment

1. Verificar que las migraciones están en `prisma/migrations/`
2. Ejecutar en producción:
```bash
npx prisma migrate deploy
```

### Durante el CI/CD

Agregar al build command:
```bash
npx prisma generate && npx prisma migrate deploy && npm run build
```

### Crear nueva migración (desarrollo)

```bash
npm run db:migrate -- --name nombre_de_la_migracion
```

### Aplicar migraciones pendientes (producción)

```bash
npm run db:migrate:prod
```

---

## Monitoreo y Logs

### Vercel

- Logs en tiempo real en el dashboard de Vercel
- Analytics integrados (Pro plan)
- Alertas configurables

### Railway

- Logs en tiempo real en el dashboard
- Métricas de uso de recursos
- Health checks configurables

### Logs de aplicación

La aplicación incluye logs básicos:
- Errores de API en consola
- Errores de autenticación

Para monitoreo avanzado, considerar:
- **Sentry** para error tracking
- **LogRocket** para session replay
- **Datadog** para APM

---

## Backup y Recuperación

### Backup manual de PostgreSQL

```bash
# Crear backup
pg_dump -h [HOST] -U [USER] -d [DATABASE] > backup_$(date +%Y%m%d_%H%M%S).sql

# Con compresión
pg_dump -h [HOST] -U [USER] -d [DATABASE] | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Restaurar backup

```bash
# Desde archivo SQL
psql -h [HOST] -U [USER] -d [DATABASE] < backup.sql

# Desde archivo comprimido
gunzip -c backup.sql.gz | psql -h [HOST] -U [USER] -d [DATABASE]
```

### Backup automatizado (cron)

Crear script `backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DATABASE_URL="postgresql://user:pass@host:5432/db"

pg_dump $DATABASE_URL | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Mantener solo últimos 7 días
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
```

Agregar al crontab:
```bash
# Backup diario a las 2:00 AM
0 2 * * * /path/to/backup.sh
```

### Servicios de backup gestionados

- **Supabase**: Backups automáticos diarios (punto en el tiempo)
- **Railway**: Backups automáticos
- **AWS RDS**: Snapshots automatizados configurables

---

## Troubleshooting

### Error: "PrismaClientInitializationError"

**Causa**: No se puede conectar a la base de datos

**Solución**:
1. Verificar `DATABASE_URL` está correctamente configurada
2. Verificar que la base de datos está accesible desde el servidor
3. Verificar que el SSL está configurado si es requerido
   ```
   DATABASE_URL="postgresql://...?sslmode=require"
   ```

### Error: "NextAuth NEXTAUTH_SECRET missing"

**Causa**: Variable de entorno no configurada

**Solución**:
1. Generar secret: `openssl rand -base64 32`
2. Agregar a variables de entorno
3. Reiniciar la aplicación

### Error: "Build failed - Module not found"

**Causa**: Dependencias no instaladas

**Solución**:
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Error: "Migration failed"

**Causa**: Schema de base de datos desincronizado

**Solución**:
1. Verificar que todas las migraciones están en el repositorio
2. Si es base de datos nueva:
   ```bash
   npx prisma migrate reset
   npx prisma migrate deploy
   ```
3. Si hay datos existentes:
   ```bash
   npx prisma db push --force-reset
   ```
   **ADVERTENCIA**: Esto borra todos los datos

### Rendimiento lento

**Verificar**:
1. Índices de base de datos están creados
2. Connection pooling configurado (PgBouncer o similar)
3. Consultas N+1 (usar Prisma con `include`)

---

## Checklist de Deployment

- [ ] Código compila sin errores (`npm run build`)
- [ ] Tests pasan (`npm run test`)
- [ ] Variables de entorno configuradas
- [ ] Base de datos accesible
- [ ] Migraciones ejecutadas
- [ ] Seed inicial ejecutado (si aplica)
- [ ] SSL/HTTPS configurado
- [ ] Dominio configurado
- [ ] Backups configurados
- [ ] Monitoreo activado

---

## Contacto y Soporte

Para problemas de deployment, verificar:
1. Logs de la plataforma (Vercel/Railway)
2. Logs de la aplicación
3. Estado de la base de datos
4. Documentación de la plataforma

---

Última actualización: 2025
