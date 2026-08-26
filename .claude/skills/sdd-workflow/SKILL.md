---
name: sdd-workflow
description: Proceso SDD de este repo - versionado del SPEC_SISTEMA_INVENTARIO_IT.md, checklist antes de cambiar el modelo de datos, checklist antes de mergear un cambio de API, y donde van los tests de comportamiento. Usar al modificar el schema de Prisma, agregar una API route, cambiar reglas de negocio o actualizar el SPEC.
---

# Proceso SDD (Spec Driven Design)

La **regla de oro** vive en `CLAUDE.md` y siempre esta cargada: el SPEC se
actualiza primero, o en el mismo commit. Nunca despues.

### Versionado del SPEC

El SPEC mantiene un `## Changelog SPEC` al final. Cada actualización significativa agrega una entrada:

```
- v1.x (YYYY-MM-DD): descripción concisa del cambio
```

La versión actual es **v1.1 (2026-04-07)**.

### Checklist antes de implementar un cambio de modelo

```
□ ¿Está el nuevo campo/modelo documentado en SPEC con tipo, restricciones y propósito?
□ ¿Si el campo cambia una restricción existente (ej: NOT NULL → nullable), está la razón documentada?
□ ¿Si hay reglas de negocio asociadas, están en la sección correspondiente del SPEC?
□ ¿Si el cambio afecta al sistema de solicitudes (Workflow), está la sección 2.5 del SPEC actualizada?
□ ¿Se actualizó el Changelog del SPEC con la versión y fecha?
```

### Checklist antes de hacer merge de un cambio a API

```
□ ¿Existe al menos un test que valide el comportamiento de negocio (no solo el tipo Zod)?
□ ¿El test cubre el caso feliz y al menos un caso de error de negocio?
□ ¿Las reglas de negocio del test coinciden con lo documentado en SPEC?
□ ¿`npm run test` pasa sin fallos?
```

### Dónde van los tests de comportamiento

- **Validaciones Zod:** `app/src/__tests__/lib/validations/` — ya existen para asset, employee, assignment, maintenance, rut, workflow
- **Lógica de servicios puros:** `app/src/__tests__/lib/services/` — para funciones sin Prisma (ej: `workflowStateMachine.ts`)
- **API routes:** Excluidas de cobertura por decisión (ver `jest.config.ts`)
