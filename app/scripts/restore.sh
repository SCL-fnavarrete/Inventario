#!/bin/bash

# ================================================
# Script de Restauración para Sistema de Inventario IT
# ================================================
#
# Uso:
#   ./restore.sh backup_20240101.sql.gz
#
# ADVERTENCIA: Este script BORRA todos los datos existentes
#

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Verificar argumentos
if [ -z "$1" ]; then
    log_error "Uso: $0 <archivo_backup.sql.gz>"
    log_info "Ejemplo: $0 backups/backup_20240101_020000.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"

# Verificar que el archivo existe
if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Archivo no encontrado: $BACKUP_FILE"
    exit 1
fi

# Verificar DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    if [ -f ".env" ]; then
        export $(grep -v '^#' .env | xargs)
    fi
fi

if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL no está configurada"
    exit 1
fi

# Confirmar restauración
log_warn "=========================================="
log_warn "ADVERTENCIA: Esta operación BORRARÁ TODOS"
log_warn "los datos existentes en la base de datos"
log_warn "=========================================="
echo ""
read -p "¿Estás seguro de que deseas continuar? (escribir 'SI' para confirmar): " CONFIRM

if [ "$CONFIRM" != "SI" ]; then
    log_info "Operación cancelada"
    exit 0
fi

log_info "Iniciando restauración desde: $BACKUP_FILE"

# Determinar si es .gz o .sql
if [[ "$BACKUP_FILE" == *.gz ]]; then
    log_info "Descomprimiendo y restaurando..."
    gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
else
    log_info "Restaurando..."
    psql "$DATABASE_URL" < "$BACKUP_FILE"
fi

# Verificar resultado
if [ $? -eq 0 ]; then
    log_info "Restauración completada exitosamente"
else
    log_error "Error durante la restauración"
    exit 1
fi

log_info "Proceso de restauración finalizado"
