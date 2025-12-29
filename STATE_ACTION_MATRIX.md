# Asset State-to-Action Matrix

Complete reference for available actions by asset state in the Inventory Management System.

---

## Current Implementation (As of 2025-11-29)

### Action Availability Matrix

| Asset State | Editar | Asignar a Empleado | Registrar Devolución | Enviar a Mantención | Marcar como Disponible |
|-------------|--------|-------------------|---------------------|---------------------|----------------------|
| **disponible** | ✅ Yes | ✅ **Yes** | ❌ No | ✅ Yes | ⚪ N/A (already disponible) |
| **asignado** | ✅ Yes | ❌ No | ✅ **Yes** | ✅ Yes | ❌ No |
| **reutilizable** | ✅ Yes | ❌ **No** ⚠️ | ❌ No | ✅ Yes | ❌ **No** ⚠️ |
| **en_mantencion** | ✅ Yes | ❌ No | ❌ No | ✅ Yes | ❌ No |
| **baja** | ✅ Yes | ❌ No | ❌ No | ✅ Yes | ❌ No |
| **vendido** | ✅ Yes | ❌ No | ❌ No | ✅ Yes | ❌ No |

⚠️ = **Critical UX Gap** - Missing expected action

---

## Proposed Implementation

### Enhanced Action Availability Matrix

| Asset State | Editar | Asignar a Empleado | Registrar Devolución | Enviar a Mantención | Marcar como Disponible | Revisar Asset |
|-------------|--------|-------------------|---------------------|---------------------|----------------------|--------------|
| **disponible** | ✅ Yes | ✅ **Yes** | ❌ No | ✅ Yes | ⚪ N/A | ❌ No |
| **asignado** | ✅ Yes | ❌ No | ✅ **Yes** | ✅ Yes | ❌ No | ❌ No |
| **reutilizable** | ✅ Yes | ⚠️ **Yes (with warning)** | ❌ No | ✅ Yes | ✅ **Yes** | ✅ **Yes** |
| **en_mantencion** | ✅ Yes | ❌ No | ❌ No | ⚪ N/A (already in maintenance) | ⚠️ Yes (after completion) | ❌ No |
| **baja** | ⚠️ Limited | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| **vendido** | ⚠️ Limited | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |

✅ = Available action
❌ = Not available (correct behavior)
⚪ = Not applicable
⚠️ = Available with special conditions/warnings

---

## State Transition Flows

### 1. Disponible (Available)

```
Current State: disponible
Condition: Any (nuevo, usado, dañado)
Employee Assigned: None

Available Actions:
├─ Asignar a Empleado → Changes to "asignado"
├─ Enviar a Mantención → Changes to "en_mantencion"
└─ Editar → Updates asset details

Expected Next States:
- asignado (via assignment)
- en_mantencion (via maintenance)
- baja (via manual state change)
```

**Business Logic:**
- Asset is ready for assignment
- No employee assigned
- No blocking conditions

**Code Location:**
- `app\src\app\(dashboard)\activos\[id]\page.tsx` lines 366-372

---

### 2. Asignado (Assigned)

```
Current State: asignado
Condition: Any (nuevo, usado, dañado)
Employee Assigned: Yes (required)

Available Actions:
├─ Registrar Devolución → Changes to "disponible" or "reutilizable"
├─ Enviar a Mantención → Changes to "en_mantencion"
└─ Editar → Updates asset details

Expected Next States:
- disponible (via return as "OK")
- reutilizable (via return as "damaged" or "incomplete")
- en_mantencion (via maintenance)
```

**Business Logic:**
- Asset is actively assigned to employee
- Employee has custody
- Must be returned before reassignment

**Code Location:**
- `app\src\app\(dashboard)\activos\[id]\page.tsx` lines 374-381

**Return State Logic:**
- `app\src\app\api\asignaciones\[id]\route.ts` lines 88-94

---

### 3. Reutilizable (Reusable) ⚠️ PROBLEM STATE

```
Current State: reutilizable
Condition: Usually "dañado" or "usado"
Employee Assigned: None

Current Available Actions:
├─ Enviar a Mantención → Changes to "en_mantencion"
└─ Editar → Updates asset details

MISSING Actions (Proposed):
├─ Marcar como Disponible → Changes to "disponible"
├─ Asignar a Empleado (with warning) → Changes to "asignado"
└─ Revisar Asset → Opens review modal

Expected Next States:
- disponible (after review)
- asignado (if approved with warning)
- en_mantencion (via maintenance)
```

**Business Logic:**
- Asset was returned with observations
- Requires review before normal use
- Should be assignable with proper warning
- Should allow state transition to "disponible"

**Current Problem:**
- No way to transition back to "disponible" without DB access
- Cannot assign even if functional
- Creates workflow bottleneck

**Code Location:**
- Currently NO specific handling for reutilizable in `page.tsx`
- This is the core issue

---

### 4. En Mantención (In Maintenance)

```
Current State: en_mantencion
Condition: Any
Employee Assigned: None

Available Actions:
├─ Enviar a Mantención → Updates existing maintenance ticket
└─ Editar → Updates asset details

Expected Next States:
- disponible (after maintenance completion)
- reutilizable (if issues found during maintenance)
- baja (if irreparable)
```

**Business Logic:**
- Asset is being repaired/maintained
- Cannot be assigned until maintenance complete
- Maintenance completion triggers state change

**Code Location:**
- Maintenance completion: `app\src\app\api\mantenciones\[id]\completar\route.ts`

---

### 5. Baja (Written Off)

```
Current State: baja
Condition: Usually "dañado"
Employee Assigned: None

Available Actions:
├─ Enviar a Mantención → (questionable - why maintain written-off asset?)
└─ Editar → Limited updates

Expected Next States:
- vendido (if sold)
- [rarely] disponible (if reinstated)
```

**Business Logic:**
- Asset is written off
- No longer in active inventory
- Minimal actions available

---

### 6. Vendido (Sold)

```
Current State: vendido
Condition: Any
Employee Assigned: None

Available Actions:
└─ Editar → Very limited updates (documentation only)

Expected Next States:
- None (terminal state)
```

**Business Logic:**
- Asset sold/disposed
- Historical record only
- No state changes allowed

---

## Return State Decision Logic

When an asset is returned, the system determines new state based on return condition:

### Current Logic (API)

File: `app\src\app\api\asignaciones\[id]\route.ts` (lines 88-94)

```typescript
let nuevoEstadoActivo: "disponible" | "reutilizable" | "baja" = "reutilizable";

if (data.estadoDevolucion === "ok") {
  nuevoEstadoActivo = "disponible";
} else if (data.estadoDevolucion === "danado") {
  nuevoEstadoActivo = "reutilizable";
}
// Note: "incompleto" also defaults to "reutilizable"
```

### State Mapping Table

| Return Condition | New Asset State | New Asset Condition | Can Reassign Immediately? |
|-----------------|-----------------|-------------------|--------------------------|
| **OK** | disponible | usado | ✅ Yes |
| **Dañado** | reutilizable | dañado | ❌ No (Current) / ⚠️ With Warning (Proposed) |
| **Incompleto** | reutilizable | depends | ❌ No (Current) / ⚠️ With Warning (Proposed) |

### Proposed Enhanced Logic

```typescript
let nuevoEstadoActivo: "disponible" | "reutilizable" | "en_mantencion" = "reutilizable";

if (data.estadoDevolucion === "ok") {
  nuevoEstadoActivo = "disponible";
} else if (data.estadoDevolucion === "danado" && data.requiereMaintenance) {
  nuevoEstadoActivo = "en_mantencion";
  // Auto-create maintenance ticket
} else if (data.estadoDevolucion === "danado") {
  nuevoEstadoActivo = "reutilizable";
  // Can still be assigned with warning
}
```

---

## Action Buttons - Visual Reference

### Code Implementation by State

#### Disponible (Working Correctly)

```typescript
// File: app\src\app\(dashboard)\activos\[id]\page.tsx
// Lines: 366-372

{asset.estado === "disponible" && (
  <Link
    href={`/asignaciones/nueva?activoId=${asset.id}`}
    className="block w-full py-2 px-4 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-center transition-colors"
  >
    Asignar a empleado
  </Link>
)}
```

**Visual Result:**
```
┌────────────────────────────┐
│  👤 Asignar a empleado     │
└────────────────────────────┘
```

---

#### Asignado (Working Correctly)

```typescript
// File: app\src\app\(dashboard)\activos\[id]\page.tsx
// Lines: 374-381

{asset.estado === "asignado" && (
  <Link
    href={`/asignaciones/devolucion?id=${asset.assignments[0]?.id}`}
    className="block w-full py-2 px-4 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 text-center transition-colors"
  >
    Registrar devolución
  </Link>
)}
```

**Visual Result:**
```
┌────────────────────────────┐
│  🔄 Registrar devolución   │
└────────────────────────────┘
```

---

#### Reutilizable (BROKEN - Missing Actions)

**Current Implementation:**
```typescript
// File: app\src\app\(dashboard)\activos\[id]\page.tsx
// Lines: 366-388

// NO SPECIFIC HANDLING FOR "reutilizable"
// Only shows the generic "Enviar a mantención" button
```

**Current Visual Result:**
```
┌────────────────────────────┐
│  🔧 Enviar a mantención    │
└────────────────────────────┘
```

**Proposed Implementation:**
```typescript
{asset.estado === "reutilizable" && (
  <>
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-3">
      <p className="text-sm text-purple-800 mb-1 font-medium">
        <AlertCircle className="h-4 w-4 inline mr-1" />
        Estado: Reutilizable
      </p>
      <p className="text-xs text-purple-600">
        Equipo devuelto con observaciones. Revisar antes de asignar.
      </p>
    </div>

    <button
      onClick={() => handleMarkAvailable()}
      className="block w-full py-2 px-4 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 text-center transition-colors mb-2"
    >
      ✓ Marcar como Disponible
    </button>

    <Link
      href={`/asignaciones/nueva?activoId=${asset.id}&warning=reutilizable`}
      className="block w-full py-2 px-4 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-center transition-colors mb-2"
    >
      👤 Asignar a empleado (con revisión)
    </Link>
  </>
)}
```

**Proposed Visual Result:**
```
┌────────────────────────────────────────┐
│ ℹ️  Estado: Reutilizable               │
│    Equipo devuelto con observaciones.  │
│    Revisar antes de asignar.           │
└────────────────────────────────────────┘

┌────────────────────────────┐
│  ✓ Marcar como Disponible  │
└────────────────────────────┘

┌────────────────────────────────────┐
│  👤 Asignar a empleado             │
│     (con revisión)                 │
└────────────────────────────────────┘

┌────────────────────────────┐
│  🔧 Enviar a mantención    │
└────────────────────────────┘
```

---

#### All States (Always Shown)

```typescript
// File: app\src\app\(dashboard)\activos\[id]\page.tsx
// Lines: 382-387

<Link
  href={`/mantenciones/programar?activoId=${asset.id}`}
  className="block w-full py-2 px-4 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 text-center transition-colors"
>
  Enviar a mantención
</Link>
```

**Note:** This button appears for ALL states, which is questionable for some states (baja, vendido, en_mantencion).

---

## Condition vs State

Important distinction:

### Estado (State) - Workflow Status
- disponible, asignado, reutilizable, en_mantencion, baja, vendido
- Defines what actions are available
- Changes based on asset lifecycle

### Condición (Condition) - Physical Status
- nuevo, usado, dañado
- Describes physical state
- Informational, does not affect actions

### Combination Examples

| Estado | Condición | Meaning | Can Assign? |
|--------|-----------|---------|-------------|
| disponible | nuevo | Brand new asset ready to assign | ✅ Yes |
| disponible | usado | Used asset, ready to assign | ✅ Yes |
| disponible | dañado | Damaged but marked as available | ✅ Yes (questionable) |
| reutilizable | usado | Used, needs review | ❌ No (Current) |
| reutilizable | dañado | Damaged, needs review | ❌ No (Current) |
| asignado | nuevo | Brand new, assigned to employee | ⚪ N/A (already assigned) |
| asignado | dañado | Assigned but damaged | ⚪ N/A (already assigned) |

**Key Insight:** Current system allows "disponible" + "dañado" assignment but blocks "reutilizable" + "dañado" - this is inconsistent.

---

## User Journey Comparison

### Journey 1: Return as "OK" (Works Well)

```
1. Employee returns notebook
   └─ Select: "Buen Estado"
   └─ Add notes

2. System processes return
   └─ Asset state → "disponible"
   └─ Asset condition → "usado"

3. User views asset detail
   └─ Sees: "Asignar a empleado" button ✅

4. User assigns to new employee
   └─ Asset state → "asignado"
   └─ New employee receives equipment

✅ Smooth workflow, < 5 minutes
```

---

### Journey 2: Return as "Damaged" (BROKEN)

```
1. Employee returns notebook
   └─ Select: "Dañado"
   └─ Add notes: "Small scratch on screen"

2. System processes return
   └─ Asset state → "reutilizable"
   └─ Asset condition → "dañado"

3. User views asset detail
   └─ Sees: Only "Enviar a mantención" ❌
   └─ Does NOT see: "Asignar a empleado"

4. User is stuck
   └─ Option A: Send to maintenance (overkill for minor damage)
   └─ Option B: Contact IT admin to change state manually
   └─ Option C: Incorrectly mark as "OK" next time

❌ Workflow blocked, requires workaround
```

---

### Journey 3: Return as "Damaged" (PROPOSED FIX)

```
1. Employee returns notebook
   └─ Select: "Dañado"
   └─ Add notes: "Small scratch on screen"

2. System processes return
   └─ Asset state → "reutilizable"
   └─ Asset condition → "dañado"

3. User views asset detail
   └─ Sees info: "Equipo requiere revisión"
   └─ Sees: "Marcar como Disponible" ✅
   └─ Sees: "Asignar a empleado (con revisión)" ✅
   └─ Sees: "Enviar a mantención"

4. User chooses action
   ├─ Option A: Click "Marcar como Disponible"
   │   └─ Reviews asset condition
   │   └─ Confirms it's OK for use
   │   └─ Asset state → "disponible"
   │   └─ Can now assign normally
   │
   ├─ Option B: Click "Asignar a empleado (con revisión)"
   │   └─ Warning shown about condition
   │   └─ Assigns to employee anyway
   │   └─ Asset state → "asignado"
   │   └─ Note logged about condition
   │
   └─ Option C: Click "Enviar a mantención"
       └─ Creates maintenance ticket
       └─ Asset state → "en_mantencion"
       └─ Properly tracked repair

✅ User has options, can choose best path
✅ Workflow unblocked, < 5 minutes
✅ Data integrity maintained
```

---

## Metrics to Track

After implementing fix, monitor:

1. **Workflow Efficiency**
   - Average time asset spends in "reutilizable" state
   - Target: < 24 hours

2. **User Behavior**
   - % of "reutilizable" assets marked as "disponible" vs sent to maintenance
   - % assigned directly with warning vs marked available first

3. **Data Quality**
   - Reduction in assets incorrectly marked as "OK" on return
   - Accuracy of condition field

4. **Support Tickets**
   - Reduction in tickets about "missing assign button"
   - Reduction in requests for manual state changes

5. **Inventory Health**
   - Count of assets stuck in "reutilizable" > 7 days
   - % of total inventory in each state

---

## Conclusion

The current implementation creates a critical UX gap for assets in "reutilizable" state. The proposed enhancements provide users with clear action paths while maintaining data integrity and audit trails.

**Critical Files to Modify:**
1. `app\src\app\(dashboard)\activos\[id]\page.tsx` - Add reutilizable actions
2. `app\src\app\api\activos\[id]\route.ts` - Add PATCH endpoint for state changes

**Estimated Implementation Time:**
- Quick fix (Option 1): 30 minutes
- Full solution (Option 2): 2-4 hours
- Enhanced with modal: 4-6 hours

**Impact:**
- Unblocks critical workflow
- Reduces support overhead
- Improves user satisfaction
- Maintains data integrity
