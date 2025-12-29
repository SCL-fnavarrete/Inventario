# Guía de Uso Rápida: Importación con Mantenciones Automáticas

## Para Usuarios del Sistema

### Cómo usar la nueva funcionalidad

#### 1. Preparar el Excel

Asegúrate de que tu archivo Excel tenga estas columnas:

**Columnas Requeridas:**
- Marca
- Modelo
- N° Serie

**Columnas Opcionales (para mantención):**
- **Mantencion** - Fecha de mantención (DD/MM/YYYY)
- **Proxima Mantencion** - Fecha de próxima mantención (DD/MM/YYYY)

**Ejemplo:**

| RUT | Nombre | Marca | Modelo | N° Serie | Mantencion | Proxima Mantencion |
|-----|--------|-------|--------|----------|------------|--------------------|
| 12.345.678-9 | Juan Pérez | HP | EliteBook 840 | SN123 | 15/03/2024 | 15/06/2024 |
| 98.765.432-1 | María López | Dell | Latitude 5420 | SN456 | 20/12/2025 | 20/03/2026 |

#### 2. Importar en el Sistema

1. Ve a **Activos → Importar** (`/activos/importar`)
2. Selecciona tu archivo Excel
3. Elige la hoja del Excel
4. Selecciona la categoría (ej: "Notebook")
5. Mapea las columnas:
   - Encuentra "Mantencion" en la lista de campos opcionales
   - Selecciona la columna correspondiente del Excel
   - Haz lo mismo con "Proxima Mantencion"
6. Haz clic en **Vista Previa** para verificar los datos
7. Haz clic en **Importar**

#### 3. Verificar Resultados

**Ver Mantenciones Creadas:**
- Ve a **Mantenciones** (`/mantenciones`)
- Verás las mantenciones importadas en la lista
- Las fechas pasadas aparecen como "Completadas"
- Las fechas futuras aparecen como "Pendientes"

**Ver en Detalle de Activo:**
- Ve a **Activos** y selecciona un activo
- En la sección "Historial" verás el evento de mantención
- Podrás ver los detalles de la mantención asociada

### Preguntas Frecuentes

**¿Qué pasa si no incluyo fecha de mantención?**
- El activo se importa normalmente, solo no se crea registro de mantención

**¿Qué formato de fecha debo usar?**
- Formato recomendado: DD/MM/YYYY (ej: 15/03/2024)
- También funciona con fechas de Excel (números seriales)

**¿Puedo importar mantenciones pasadas?**
- Sí, el sistema las marca automáticamente como "completadas"

**¿Y mantenciones futuras?**
- Sí, el sistema las marca como "pendientes" y podrás completarlas después

**¿Qué información queda registrada?**
- Activo (marca, modelo, serie)
- Empleado asignado (nombre, RUT, correo)
- Fecha de mantención
- Próxima mantención (si la incluiste)
- Tipo: Preventiva
- Estado: Completada o Pendiente

**¿Puedo ver quién importó los datos?**
- Sí, en el historial del activo aparece el usuario que realizó la importación

### Ejemplos de Uso

#### Ejemplo 1: Importar inventario nuevo con mantención programada
```
Tienes un lote de notebooks nuevos que llegaron con garantía.
Quieres registrar su primera mantención preventiva en 6 meses.

Excel:
- Marca: HP
- Modelo: EliteBook 840
- Serie: SN12345
- Mantencion: 15/06/2025 (fecha futura)
- Proxima Mantencion: 15/12/2025

Resultado:
✓ Activo creado
✓ Mantención programada para 15/06/2025
✓ Próxima mantención: 15/12/2025
```

#### Ejemplo 2: Migrar datos históricos
```
Tienes un Excel con el historial de mantenciones pasadas.
Quieres tener todo centralizado en el nuevo sistema.

Excel:
- Marca: Dell
- Modelo: Latitude 5420
- Serie: SN67890
- Mantencion: 15/03/2024 (fecha pasada)
- Proxima Mantencion: 15/06/2024

Resultado:
✓ Activo creado
✓ Mantención marcada como completada (15/03/2024)
✓ Próxima mantención programada: 15/06/2024
```

#### Ejemplo 3: Importar solo activos (sin mantención)
```
Solo necesitas registrar el inventario, sin mantenciones.

Excel:
- Marca: HP
- Modelo: ProBook 450
- Serie: SN11111
- Mantencion: (vacío)

Resultado:
✓ Activo creado
(No se crea registro de mantención)
```

### Ventajas

1. **Ahorro de tiempo**: No necesitas crear mantenciones manualmente una por una
2. **Datos históricos**: Puedes migrar todo el historial de mantenciones
3. **Planificación**: Programa mantenciones futuras masivamente
4. **Trazabilidad**: Todo queda registrado en el historial
5. **Automatización**: El sistema decide si es pasada o futura automáticamente

### Soporte

Si tienes problemas:
1. Verifica que las fechas estén en formato DD/MM/YYYY
2. Asegúrate de mapear correctamente las columnas
3. Revisa el resultado de la importación para ver errores
4. Consulta la documentación técnica en `MANTENCION_AUTO_IMPORT.md`

---

**Última actualización:** 26 de Noviembre de 2025
**Versión:** 1.0
