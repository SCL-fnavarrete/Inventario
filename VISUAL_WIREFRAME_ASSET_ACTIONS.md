# Visual Wireframe: Asset Detail Page - Actions by State

## Current Implementation vs Proposed Solution

---

## CURRENT: Asset in "Reutilizable" State (PROBLEM)

```
┌──────────────────────────────────────────────────────────────────┐
│  Asset Detail Page                                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ← Back to Assets                                   [Edit] ✏️   │
│                                                                  │
│  📱  HP EliteBook 840 G7                                        │
│      Notebook • S/N: ABC123456                                  │
│                                                                  │
│  ┌────────────┬────────────┬──────────────┬──────────────┐     │
│  │ Estado     │ Condición  │ Asignado a   │ Fecha Compra │     │
│  │ [Reutiliz] │ Dañado     │ Sin asignar  │ 15/03/2024   │     │
│  └────────────┴────────────┴──────────────┴──────────────┘     │
│                                                                  │
│  [General Info Section]                                         │
│  [Technical Specs Section]                                      │
│  [Assignment History]                                           │
│                                                                  │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ ACCIONES RÁPIDAS                                    │       │
│  ├─────────────────────────────────────────────────────┤       │
│  │                                                      │       │
│  │  ⚠️ Enviar a mantención                             │  ←--- ONLY THIS!
│  │                                                      │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                  │
│  [Event History Timeline]                                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

❌ PROBLEM: User cannot assign this asset to another employee
❌ PROBLEM: No way to mark as "disponible" again
❌ PROBLEM: No guidance on what to do next
```

---

## PROPOSED SOLUTION 1: Add Review Action (Recommended)

```
┌──────────────────────────────────────────────────────────────────┐
│  Asset Detail Page                                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ← Back to Assets                                   [Edit] ✏️   │
│                                                                  │
│  📱  HP EliteBook 840 G7                                        │
│      Notebook • S/N: ABC123456                                  │
│                                                                  │
│  ┌────────────┬────────────┬──────────────┬──────────────┐     │
│  │ Estado     │ Condición  │ Asignado a   │ Fecha Compra │     │
│  │ [Reutiliz] │ Dañado     │ Sin asignar  │ 15/03/2024   │     │
│  └────────────┴────────────┴──────────────┴──────────────┘     │
│                                                                  │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ ℹ️  ESTADO: REUTILIZABLE                            │  ←--- NEW!
│  │ Este equipo fue devuelto con daños y requiere       │       │
│  │ revisión antes de ser asignado nuevamente.          │       │
│  │                                                      │       │
│  │ Último evento: Devuelto por Juan Pérez (25/11/2025) │       │
│  │ Estado de devolución: Dañado                         │       │
│  │ Observaciones: "Pantalla con rayón menor"           │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                  │
│  [General Info Section]                                         │
│  [Technical Specs Section]                                      │
│                                                                  │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ ACCIONES RÁPIDAS                                    │       │
│  ├─────────────────────────────────────────────────────┤       │
│  │                                                      │       │
│  │  ✅ Marcar como Disponible                          │  ←--- NEW!
│  │     Revisar y aprobar para asignación               │       │
│  │                                                      │       │
│  │  👤 Asignar a empleado (con revisión)               │  ←--- NEW!
│  │     ⚠️ El equipo tiene daños reportados             │       │
│  │                                                      │       │
│  │  🔧 Enviar a mantención                             │       │
│  │     Reparar antes de asignar                        │       │
│  │                                                      │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                  │
│  [Assignment History]                                           │
│  [Event History Timeline]                                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

✅ SOLUTION: Clear guidance on asset state
✅ SOLUTION: Multiple action paths available
✅ SOLUTION: User can make informed decision
```

---

## PROPOSED MODAL: Review Asset

```
┌────────────────────────────────────────────────────────┐
│  Revisar y Marcar como Disponible              [X]    │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Equipo: HP EliteBook 840 G7 (S/N: ABC123456)        │
│  Estado actual: Reutilizable → Disponible             │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │ REVISIÓN FÍSICA                                  │ │
│  ├──────────────────────────────────────────────────┤ │
│  │ ☑️ Carcasa sin daños severos                     │ │
│  │ ☑️ Pantalla funcional                            │ │
│  │ ☑️ Teclado completo y funcional                  │ │
│  │ ☑️ Puertos USB funcionando                       │ │
│  │ ☐ Batería en buen estado                        │ │
│  │ ☑️ Cargador incluido                             │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  Revisado por: *                                      │
│  ┌──────────────────────────────────────────────────┐ │
│  │ María González                                   │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  Nueva condición: *                                   │
│  ┌──────────────────────────────────────────────────┐ │
│  │ ⚪ Nuevo                                          │ │
│  │ 🔘 Usado                                          │ │
│  │ ⚪ Dañado                                         │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  Notas de revisión:                                   │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Rayón menor en pantalla no afecta              │ │
│  │ funcionalidad. Batería al 85% capacidad.       │ │
│  │ Listo para asignar.                             │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ☑️ Marcar como DISPONIBLE                            │
│     (Desmarcar para mantener como Reutilizable)       │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │ ℹ️  Esta acción registrará la revisión en el    │ │
│  │    historial del activo.                         │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│            [Cancelar]        [Guardar Revisión]       │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## COMPARISON: Asset in "Disponible" State (WORKING CORRECTLY)

```
┌──────────────────────────────────────────────────────────────────┐
│  Asset Detail Page                                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ← Back to Assets                                   [Edit] ✏️   │
│                                                                  │
│  💻  Dell Latitude 5420                                         │
│      Notebook • S/N: XYZ789012                                  │
│                                                                  │
│  ┌────────────┬────────────┬──────────────┬──────────────┐     │
│  │ Estado     │ Condición  │ Asignado a   │ Fecha Compra │     │
│  │ [Disponib] │ Usado      │ Sin asignar  │ 20/08/2024   │     │
│  └────────────┴────────────┴──────────────┴──────────────┘     │
│                                                                  │
│  [General Info Section]                                         │
│  [Technical Specs Section]                                      │
│                                                                  │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ ACCIONES RÁPIDAS                                    │       │
│  ├─────────────────────────────────────────────────────┤       │
│  │                                                      │       │
│  │  👤 Asignar a empleado                              │  ✅ Works!
│  │                                                      │       │
│  │  🔧 Enviar a mantención                             │       │
│  │                                                      │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                  │
│  [Event History Timeline]                                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

✅ WORKING: Clear action available for assignment
```

---

## COMPARISON: Asset in "Asignado" State (WORKING CORRECTLY)

```
┌──────────────────────────────────────────────────────────────────┐
│  Asset Detail Page                                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ← Back to Assets                                   [Edit] ✏️   │
│                                                                  │
│  📱  iPhone 13 Pro                                              │
│      Celular • IMEI: 123456789012345                            │
│                                                                  │
│  ┌────────────┬────────────┬──────────────┬──────────────┐     │
│  │ Estado     │ Condición  │ Asignado a   │ Fecha Compra │     │
│  │ [Asignado] │ Usado      │ Pedro López  │ 10/01/2024   │     │
│  └────────────┴────────────┴──────────────┴──────────────┘     │
│                                                                  │
│  [General Info Section]                                         │
│  [Current Assignment Details]                                   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ ACCIONES RÁPIDAS                                    │       │
│  ├─────────────────────────────────────────────────────┤       │
│  │                                                      │       │
│  │  🔄 Registrar devolución                            │  ✅ Works!
│  │                                                      │       │
│  │  🔧 Enviar a mantención                             │       │
│  │                                                      │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                  │
│  [Assignment History]                                           │
│  [Event History Timeline]                                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

✅ WORKING: Clear action for return
```

---

## WORKFLOW DIAGRAM: Return to Reassignment

### Current Flow (BROKEN)

```
Employee returns asset as "Damaged"
         │
         ▼
   ┌─────────────┐
   │ Asset state │
   │ = asignado  │
   └──────┬──────┘
          │
          ▼
   [Return Process]
   - Select "Dañado"
   - Add notes
          │
          ▼
   ┌──────────────┐
   │ Asset state  │
   │ = reutiliz   │
   │ condition =  │
   │ dañado       │
   └──────┬───────┘
          │
          ▼
   ┌─────────────────────┐
   │ User views asset    │
   │ detail page         │
   └─────────┬───────────┘
             │
             ▼
   ┌───────────────────────┐
   │ Only sees:            │
   │ "Enviar a mantención" │  ❌ STUCK HERE!
   └───────────────────────┘
             │
             ▼
   ❌ Cannot assign to employee
   ❌ Cannot mark as available
   ❌ Must contact IT/Admin
```

### Proposed Flow (FIXED)

```
Employee returns asset as "Damaged"
         │
         ▼
   ┌─────────────┐
   │ Asset state │
   │ = asignado  │
   └──────┬──────┘
          │
          ▼
   [Return Process]
   - Select "Dañado"
   - Add notes
          │
          ▼
   ┌──────────────┐
   │ Asset state  │
   │ = reutiliz   │
   │ condition =  │
   │ dañado       │
   └──────┬───────┘
          │
          ▼
   ┌─────────────────────┐
   │ User views asset    │
   │ detail page         │
   └─────────┬───────────┘
             │
             ├──────────────┬──────────────┐
             ▼              ▼              ▼
   ┌──────────────┐  ┌──────────┐  ┌──────────────┐
   │ Mark as      │  │ Assign   │  │ Send to      │
   │ Available    │  │ anyway   │  │ Maintenance  │
   │              │  │ (warning)│  │              │
   └──────┬───────┘  └────┬─────┘  └──────┬───────┘
          │               │               │
          ▼               │               ▼
   [Review Modal]         │        [Maintenance]
   - Check condition      │        - Create ticket
   - Update state         │        - Track repair
   - Log review           │               │
          │               │               │
          ▼               ▼               ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │ disponible  │  │ asignado    │  │ en_manten   │
   └─────────────┘  └─────────────┘  └─────────────┘

   ✅ Multiple paths forward
   ✅ User has control
   ✅ Clear guidance
```

---

## STATE BADGE DESIGN

### Current State Badges (Reference)

```css
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Disponible   │  │  Asignado    │  │ En Mantención│
│ (Green bg)   │  │  (Blue bg)   │  │ (Yellow bg)  │
└──────────────┘  └──────────────┘  └──────────────┘
bg-green-100       bg-blue-100       bg-yellow-100
text-green-800     text-blue-800     text-yellow-800

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Reutilizable │  │    Baja      │  │   Vendido    │
│ (Purple bg)  │  │  (Red bg)    │  │  (Gray bg)   │
└──────────────┘  └──────────────┘  └──────────────┘
bg-purple-100      bg-red-100        bg-gray-100
text-purple-800    text-red-800      text-gray-800
```

### Proposed: Enhanced Reutilizable Badge

```
┌─────────────────────────────────┐
│ 🔄 Reutilizable                 │
│    (Requiere revisión)          │  ← Add subtitle
│    (Purple bg with info icon)  │
└─────────────────────────────────┘

On hover:
┌────────────────────────────────────────────────┐
│ Este activo fue devuelto con observaciones.   │
│ Debe ser revisado antes de ser asignado       │
│ nuevamente o enviado a mantención.            │
└────────────────────────────────────────────────┘
```

---

## MOBILE RESPONSIVE CONSIDERATIONS

### Asset Detail - Mobile View (320px)

```
┌─────────────────────────┐
│ ← Asset Detail          │
├─────────────────────────┤
│                         │
│ 📱 HP EliteBook 840    │
│    S/N: ABC123456       │
│                         │
│ Estado: [Reutilizable]  │
│ Condición: Dañado       │
│ Asignado: Sin asignar   │
│                         │
│ ℹ️  Requiere revisión   │
│    antes de asignar     │
│                         │
│ ▼ ACCIONES              │
│ ┌─────────────────────┐ │
│ │ ✅ Marcar como      │ │
│ │    Disponible       │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ 👤 Asignar          │ │
│ │    (con revisión)   │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ 🔧 Enviar a         │ │
│ │    Mantención       │ │
│ └─────────────────────┘ │
│                         │
│ [General Info]          │
│ [Specs]                 │
│ [History]               │
│                         │
└─────────────────────────┘

✅ Stack buttons vertically
✅ Clear touch targets (min 44px)
✅ Icons + text for clarity
```

---

## ACCESSIBILITY ANNOTATIONS

### ARIA Labels and Roles

```html
<!-- State Badge -->
<span
  class="badge badge-reutilizable"
  role="status"
  aria-label="Estado del activo: Reutilizable, requiere revisión antes de asignación"
>
  Reutilizable
</span>

<!-- Action Buttons -->
<button
  onClick={handleMarkAvailable}
  aria-label="Revisar y marcar activo como disponible para asignación"
  aria-describedby="review-action-description"
>
  Marcar como Disponible
</button>

<p id="review-action-description" class="sr-only">
  Abre un formulario para revisar el estado del equipo y marcarlo como
  disponible para nuevas asignaciones
</p>

<!-- Disabled Action with Tooltip -->
<button
  disabled
  aria-disabled="true"
  aria-label="Asignar a empleado - No disponible: el activo debe ser revisado primero"
  title="Este activo requiere revisión antes de poder ser asignado"
>
  Asignar a empleado
</button>
```

### Keyboard Navigation Flow

```
Tab Order on Asset Detail Page:
1. Back to Assets link
2. Edit button
3. Mark as Available button ← NEW
4. Assign to Employee button ← NEW
5. Send to Maintenance button
6. (rest of page content)

Enter/Space: Activate button
Esc: Close modal if open
```

### Color Contrast Verification

```
Current Purple Badge:
- Background: #F3E8FF (purple-100)
- Text: #6B21A8 (purple-800)
- Contrast Ratio: 7.1:1 ✅ Passes WCAG AA (4.5:1)

Proposed Info Panel:
- Background: #DBEAFE (blue-50)
- Text: #1E3A8A (blue-900)
- Contrast Ratio: 12.1:1 ✅ Passes WCAG AAA (7:1)
```

---

## IMPLEMENTATION NOTES

### Component Structure

```
app/src/app/(dashboard)/activos/[id]/
├── page.tsx                    (Modified - add reutilizable actions)
└── components/
    └── ReviewAssetModal.tsx    (New - review and state change)

app/src/components/
└── AssetStateInfo.tsx          (New - state explanation panel)

app/src/app/api/activos/
└── [id]/
    └── review/
        └── route.ts            (New - handle state transition)
```

### State Management

```typescript
// In page.tsx
const [showReviewModal, setShowReviewModal] = useState(false);
const [isUpdating, setIsUpdating] = useState(false);

// Modal callback
async function handleReviewComplete(reviewData) {
  setIsUpdating(true);
  try {
    const res = await fetch(`/api/activos/${asset.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewData),
    });

    if (!res.ok) throw new Error('Failed to update asset');

    // Refresh page data
    router.refresh();
    setShowReviewModal(false);
  } catch (error) {
    // Handle error
  } finally {
    setIsUpdating(false);
  }
}
```

---

## CONCLUSION

The wireframes demonstrate the critical UX gap: assets in "reutilizable" state have no clear path forward for users. The proposed solution adds multiple action paths while maintaining data integrity and providing clear guidance on next steps.

Key improvements:
1. **Visibility**: State explanation panel clarifies situation
2. **Guidance**: Multiple action buttons with clear descriptions
3. **Control**: User can choose appropriate action path
4. **Safety**: Review modal ensures conscious decision-making
5. **Accessibility**: All actions keyboard-navigable and screen-reader friendly

This design maintains the integrity of the asset lifecycle while removing the current workflow bottleneck.
