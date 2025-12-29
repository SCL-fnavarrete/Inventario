# Quick Fix Guide: Enable Assignment of Reutilizable Assets

## Problem Statement

When a user returns an asset marked as "damaged", the system sets it to "reutilizable" state. Users can only see "Enviar a Mantención" button and cannot reassign the asset to another employee.

## Root Cause

File: `app\src\app\(dashboard)\activos\[id]\page.tsx` (Lines 360-388)

Only shows "Asignar a empleado" button when `asset.estado === "disponible"`

```typescript
{asset.estado === "disponible" && (
  <Link href={`/asignaciones/nueva?activoId=${asset.id}`}>
    Asignar a empleado
  </Link>
)}
```

Does not provide any action for `asset.estado === "reutilizable"`

## Recommended Quick Fix (30 minutes implementation)

### Option 1: Simple - Allow Assignment with Warning

Add this code block after line 372 in `page.tsx`:

```typescript
{asset.estado === "reutilizable" && (
  <>
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
      <p className="text-sm text-amber-800">
        <AlertCircle className="h-4 w-4 inline mr-1" />
        Este equipo fue devuelto con observaciones. Revisar condición antes de asignar.
      </p>
    </div>
    <Link
      href={`/asignaciones/nueva?activoId=${asset.id}&warning=reutilizable`}
      className="block w-full py-2 px-4 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-center transition-colors"
    >
      Asignar a empleado (requiere revisión)
    </Link>
  </>
)}
```

**Result**: Users can assign "reutilizable" assets with a visible warning.

---

### Option 2: Better - Add State Change Action

Create a new button to transition reutilizable → disponible:

#### Step 1: Add state to page component (after line 97)

```typescript
const [showStateChangeDialog, setShowStateChangeDialog] = useState(false);
const [isChangingState, setIsChangingState] = useState(false);
```

#### Step 2: Add action button (after line 372)

```typescript
{asset.estado === "reutilizable" && (
  <>
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-3">
      <p className="text-sm text-purple-800 mb-1 font-medium">
        <AlertCircle className="h-4 w-4 inline mr-1" />
        Estado: Reutilizable
      </p>
      <p className="text-xs text-purple-600">
        Este equipo fue devuelto con observaciones y requiere revisión antes de ser asignado.
      </p>
    </div>

    <button
      onClick={() => setShowStateChangeDialog(true)}
      className="block w-full py-2 px-4 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 text-center transition-colors mb-2"
    >
      ✓ Marcar como Disponible
    </button>

    <Link
      href={`/asignaciones/nueva?activoId=${asset.id}&warning=reutilizable`}
      className="block w-full py-2 px-4 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-center transition-colors"
    >
      Asignar a empleado (con revisión)
    </Link>
  </>
)}
```

#### Step 3: Add dialog before closing div (before line 393)

```typescript
{showStateChangeDialog && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <h3 className="text-lg font-semibold mb-4">Marcar como Disponible</h3>

      <p className="text-gray-600 mb-4">
        ¿Confirma que este equipo ha sido revisado y está listo para ser asignado?
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
        <p className="text-sm text-blue-800">
          <strong>Equipo:</strong> {asset.marca} {asset.modelo}<br />
          <strong>Estado actual:</strong> Reutilizable → Disponible<br />
          <strong>Condición:</strong> {asset.condicion}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setShowStateChangeDialog(false)}
          disabled={isChangingState}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={async () => {
            setIsChangingState(true);
            try {
              const res = await fetch(`/api/activos/${asset.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  estado: 'disponible',
                  observaciones: (asset.observaciones || '') +
                    `\n[${new Date().toLocaleDateString()}] Revisado y marcado como disponible desde estado reutilizable.`
                }),
              });

              if (!res.ok) throw new Error('Error al actualizar');

              window.location.reload();
            } catch (error) {
              alert('Error al cambiar estado: ' + error.message);
            } finally {
              setIsChangingState(false);
            }
          }}
          disabled={isChangingState}
          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {isChangingState ? 'Actualizando...' : 'Confirmar'}
        </button>
      </div>
    </div>
  </div>
)}
```

#### Step 4: Update API route to handle PATCH

File: `app\src\app\api\activos\[id]\route.ts`

Add PATCH method handler:

```typescript
// PATCH /api/activos/[id] - Partial update (including state change)
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const asset = await prisma.asset.findUnique({
      where: { id },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Activo no encontrado" },
        { status: 404 }
      );
    }

    // Allow state changes
    const updatedAsset = await prisma.$transaction(async (tx) => {
      // Update asset
      const updated = await tx.asset.update({
        where: { id },
        data: body,
        include: {
          categoria: true,
          empleadoActual: true,
        },
      });

      // Log state change if estado was updated
      if (body.estado && body.estado !== asset.estado) {
        await tx.assetHistory.create({
          data: {
            assetId: id,
            tipoEvento: "cambio_estado",
            descripcion: `Estado cambiado de ${asset.estado} a ${body.estado}`,
            datosAnteriores: { estado: asset.estado },
            datosNuevos: { estado: body.estado },
            usuarioSistema: "Usuario Web",
          },
        });
      }

      return updated;
    });

    return NextResponse.json(updatedAsset);
  } catch (error) {
    console.error("Error updating asset:", error);
    return NextResponse.json(
      { error: "Error al actualizar activo" },
      { status: 500 }
    );
  }
}
```

---

## Testing Checklist

After implementing the fix:

1. ✅ Find an asset in "reutilizable" state
2. ✅ Navigate to asset detail page
3. ✅ Verify new action buttons are visible
4. ✅ Test "Marcar como Disponible" flow
5. ✅ Verify asset state changes to "disponible"
6. ✅ Verify asset history logs the state change
7. ✅ Verify "Asignar a empleado" button appears after state change
8. ✅ Test assignment flow works normally
9. ✅ Check responsive design on mobile
10. ✅ Test keyboard navigation (Tab, Enter, Esc)

---

## Impact Analysis

### Files Modified
1. `app\src\app\(dashboard)\activos\[id]\page.tsx` - Add UI for reutilizable state
2. `app\src\app\api\activos\[id]\route.ts` - Add PATCH method for state updates

### Risk Level
**LOW** - Changes are isolated to asset detail view and state management

### User Impact
**HIGH POSITIVE** - Unblocks critical workflow, reduces support tickets

### Data Integrity
**MAINTAINED** - All state changes are logged in asset history

---

## Alternative: Temporary Workaround (No Code Changes)

If you cannot deploy code changes immediately:

### Manual Database Update

```sql
-- Find assets stuck in reutilizable
SELECT id, marca, modelo, numero_serie, estado, condicion
FROM assets
WHERE estado = 'reutilizable';

-- Change specific asset to disponible
UPDATE assets
SET estado = 'disponible'
WHERE id = 'ASSET_ID_HERE';

-- Log the change in history
INSERT INTO asset_history (
  id, asset_id, tipo_evento, descripcion,
  datos_anteriores, datos_nuevos, usuario_sistema, created_at
) VALUES (
  gen_random_uuid(),
  'ASSET_ID_HERE',
  'cambio_estado',
  'Estado cambiado manualmente de reutilizable a disponible',
  '{"estado": "reutilizable"}',
  '{"estado": "disponible"}',
  'Admin (Manual)',
  NOW()
);
```

---

## Long-term Recommendations

1. **Add Bulk State Management**
   - Dashboard widget showing count of "reutilizable" assets
   - Filter view for assets needing review
   - Bulk action to mark multiple as "disponible"

2. **Enhanced Review Workflow**
   - Checklist modal for asset review
   - Photo upload for condition verification
   - Required reviewer signature

3. **State Analytics**
   - Track average time in "reutilizable" state
   - Alert if asset stuck > 7 days
   - Report on return condition accuracy

4. **Process Documentation**
   - Add help text explaining "reutilizable" state
   - Link to SOP for asset review
   - Train users on proper return classification

---

## Questions & Answers

**Q: Should all "reutilizable" assets be assignable?**
A: Yes, with a warning. The state name means "reusable" - it should not block assignment, just warn the user.

**Q: What if the asset is severely damaged?**
A: Users should send it to maintenance first, which will properly track the repair.

**Q: Will this affect data integrity?**
A: No - all state changes are logged in asset history, maintaining full audit trail.

**Q: Can we prevent users from marking as disponible without review?**
A: The current simple fix allows it. For enforced review, implement Option 2 with a more detailed ReviewAssetModal component.

---

## Support

If you encounter issues after implementing this fix:

1. Check browser console for JavaScript errors
2. Verify API route is responding (check Network tab)
3. Check asset history table for state change logs
4. Review server logs for backend errors

For questions, refer to:
- `UX_ANALYSIS_RETURNED_ASSETS.md` - Full UX analysis
- `VISUAL_WIREFRAME_ASSET_ACTIONS.md` - Visual design reference
