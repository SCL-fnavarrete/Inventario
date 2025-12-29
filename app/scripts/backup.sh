#!/bin/bash

# ================================================
# Script de Backup para Sistema de Inventario IT
# ================================================
#
# Uso:
#   ./backup.sh                    # Backup completo
#   ./backup.sh --tables-only      # Solo estructura de tablas
#   ./backup.sh --data-only        # Solo datos
#
# Configuración:
#   Editar las variables DATABASE_URL y BACKUP_DIR
#
# Programar con cron (backup diario a las 2:00 AM):
#   0 2 * * * /path/to/backup.sh >> /var/log/backup.log 2>&1
#

# Configuración
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_${DATE}.sql"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funciones
log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Verificar que DATABASE_URL está configurada
if [ -z "$DATABASE_URL" ]; then
    # Intentar cargar desde .env
    if [ -f ".env" ]; then
        export $(grep -v '^#' .env | xargs)
    fi
fi

if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL no está configurada"
    log_info "Configurar variable de entorno DATABASE_URL o crear archivo .env"
    exit 1
fi

# Crear directorio de backup si no existe
mkdir -p "$BACKUP_DIR"

log_info "Iniciando backup de base de datos..."
log_info "Destino: $BACKUP_DIR/$BACKUP_FILE.gz"

# Opciones según argumentos
PG_DUMP_OPTIONS=""
case "$1" in
    --tables-only)
        PG_DUMP_OPTIONS="--schema-only"
        BACKUP_FILE="backup_schema_${DATE}.sql"
        log_info "Modo: Solo estructura de tablas"
        ;;
    --data-only)
        PG_DUMP_OPTIONS="--data-only"
        BACKUP_FILE="backup_data_${DATE}.sql"
        log_info "Modo: Solo datos"
        ;;
    *)
        log_info "Modo: Backup completo (estructura + datos)"
        ;;
esac

# Ejecutar pg_dump
pg_dump "$DATABASE_URL" $PG_DUMP_OPTIONS | gzip > "$BACKUP_DIR/$BACKUP_FILE.gz"

# Verificar resultado
if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE.gz" | cut -f1)
    log_info "Backup completado exitosamente"
    log_info "Tamaño del archivo: $BACKUP_SIZE"
else
    log_error "Error al crear backup"
    exit 1
fi

# Limpiar backups antiguos
log_info "Limpiando backups antiguos (más de $RETENTION_DAYS días)..."
DELETED=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
log_info "Archivos eliminados: $DELETED"

# Listar backups actuales
log_info "Backups disponibles:"
ls -lh "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null || log_warn "No hay backups disponibles"

log_info "Proceso de backup finalizado"
