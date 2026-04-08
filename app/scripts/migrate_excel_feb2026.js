/**
 * Migración de datos Excel Febrero 2026 a Producción
 *
 * Lee: excel/Consolidado inventario Notebook_23022026.xlsx (230 notebooks)
 * Borra: todos los datos excepto system_users y welcome_kit_items
 * Inserta: categoría, 158 empleados, 230 activos, ~159 asignaciones, ~165 mantenciones
 *
 * Ejecutar: cd app && node scripts/migrate_excel_feb2026.js
 */

const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const path = require('path');

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null;
  return new Date((serial - 25569) * 86400000);
}

function normalizeRut(rut) {
  if (!rut) return '';
  return String(rut).trim().toUpperCase();
}

function trimStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function mapCondicion(estado) {
  const s = trimStr(estado).toLowerCase();
  if (s === 'nuevo') return 'nuevo';
  if (s === 'seminuevo') return 'usado';
  if (s === 'usado') return 'usado';
  return 'usado'; // empty → usado (per plan decision)
}

function mapEstadoActivo(idInterno) {
  const s = trimStr(idInterno);
  if (s === 'Disponible') return 'disponible';
  if (s === 'Mantención') return 'en_mantencion';
  if (s === 'Baja') return 'baja';
  // Everything else: Activo, No devuelto, No esta en oficina, Equipo Gerente,
  // Usuario Local, hostname patterns, person names → asignado
  return 'asignado';
}

function mapMicrosoft365(val) {
  return trimStr(val).toLowerCase() === 'premium';
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Migración Excel Febrero 2026 ===\n');

  // 1. Read Excel
  const excelPath = path.resolve(__dirname, '../../excel/Consolidado inventario Notebook_23022026.xlsx');
  console.log('Leyendo Excel:', excelPath);
  const wb = XLSX.readFile(excelPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log(`Filas leídas: ${rows.length}\n`);

  // 2. Delete existing data (FK order)
  console.log('--- PASO 1: Limpieza de datos ---');
  const deleteOps = [
    { name: 'dispatch_guide_items', op: () => prisma.dispatchGuideItem.deleteMany() },
    { name: 'dispatch_guides', op: () => prisma.dispatchGuide.deleteMany() },
    { name: 'kit_assignments', op: () => prisma.kitAssignment.deleteMany() },
    { name: 'terminations', op: () => prisma.termination.deleteMany() },
    { name: 'asset_history', op: () => prisma.assetHistory.deleteMany() },
    { name: 'maintenances', op: () => prisma.maintenance.deleteMany() },
    { name: 'assignments', op: () => prisma.assignment.deleteMany() },
    { name: 'purchase_assets', op: () => prisma.purchaseAsset.deleteMany() },
    { name: 'purchases', op: () => prisma.purchase.deleteMany() },
    { name: 'suppliers', op: () => prisma.supplier.deleteMany() },
    { name: 'assets', op: () => prisma.asset.deleteMany() },
    { name: 'asset_categories', op: () => prisma.assetCategory.deleteMany() },
    { name: 'employees', op: () => prisma.employee.deleteMany() },
  ];

  for (const { name, op } of deleteOps) {
    const result = await op();
    console.log(`  DELETE ${name}: ${result.count} registros`);
  }
  console.log('Limpieza completada.\n');

  // 3. Insert "Notebook" category
  console.log('--- PASO 2: Insertar categoría ---');
  const categoria = await prisma.assetCategory.create({
    data: {
      nombre: 'Notebook',
      descripcion: 'Computador portátil',
      requiereSerie: true,
      requiereImei: false,
    },
  });
  console.log(`  Categoría creada: ${categoria.nombre} (${categoria.id})\n`);

  // 4. Deduplicate and insert employees
  console.log('--- PASO 3: Insertar empleados ---');
  const employeeMap = new Map(); // normalizedRut → employee record

  for (const row of rows) {
    const rut = trimStr(row['RUT']);
    if (!rut) continue;

    const normalizedRut = normalizeRut(rut);
    if (employeeMap.has(normalizedRut)) continue; // already processed

    const correo = trimStr(row['Correo']);
    const nombres = trimStr(row['Nombre']);
    const apellidoPaterno = trimStr(row['Apellido P.']);
    const apellidoMaterno = trimStr(row['Apellido M.']) || null;
    const cargo = trimStr(row['Cargo']) || null;
    const jefatura = trimStr(row['Jefatura']) || null;
    const supervisor = trimStr(row['Supervisor']) || null;
    const ubicacion = trimStr(row['Comuna']) || null;

    // Generate placeholder email for employees without one
    const finalCorreo = correo || `sin.correo.${rut.replace(/\./g, '').replace(/-/g, '')}@placeholder.scl`;

    employeeMap.set(normalizedRut, {
      rut: rut, // preserve original format
      nombres,
      apellidoPaterno,
      apellidoMaterno,
      correo: finalCorreo,
      cargo,
      jefatura,
      supervisor,
      ubicacion,
      tipoContrato: 'planta',
      estado: 'activo',
    });
  }

  console.log(`  Empleados únicos encontrados: ${employeeMap.size}`);

  // Check for email duplicates before inserting
  const emailSet = new Set();
  for (const [rut, emp] of employeeMap) {
    const emailLower = emp.correo.toLowerCase();
    if (emailSet.has(emailLower)) {
      console.log(`  WARN: Email duplicado "${emp.correo}" para RUT ${rut}, generando alternativo`);
      emp.correo = `${emailLower.split('@')[0]}.${rut.replace(/\./g, '').replace(/-/g, '')}@sclconsultores.com`;
    }
    emailSet.add(emailLower);
  }

  // Insert employees
  const rutToDbId = new Map(); // normalizedRut → db uuid
  let empCount = 0;
  for (const [normalizedRut, emp] of employeeMap) {
    const created = await prisma.employee.create({ data: emp });
    rutToDbId.set(normalizedRut, created.id);
    empCount++;
  }
  console.log(`  Empleados insertados: ${empCount}\n`);

  // 5. Insert assets
  console.log('--- PASO 4: Insertar activos ---');
  const assetSerieToDbId = new Map(); // serie → { dbId, rowRut }
  let assetCount = 0;
  const assetErrors = [];

  for (const row of rows) {
    const numeroSerie = trimStr(row['N° Serie']) || null;
    const marca = trimStr(row['Marca']);
    const modelo = trimStr(row['Modelo']);
    const nombreEquipo = trimStr(row['Nombre Equipo']) || null;
    const procesador = trimStr(row['Procesador ']) || null; // note trailing space in column name
    const discoDuro = trimStr(row['Disco Duro']) || null;
    const ram = trimStr(row['RAM']) || null;
    const sistemaOperativo = trimStr(row['O.S.']) || null;
    const microsoft365 = mapMicrosoft365(row['Microsoft 365 Empresa']);
    const antivirus = trimStr(row['Antivirus']) || null;
    const observaciones = trimStr(row['Comentario']) || null;
    const condicion = mapCondicion(row['Estado']);
    const estado = mapEstadoActivo(row['ID-Interno']);

    // Link to employee if row has RUT
    const rut = trimStr(row['RUT']);
    const normalizedRut = normalizeRut(rut);
    const empleadoActualId = normalizedRut ? (rutToDbId.get(normalizedRut) || null) : null;

    if (!marca || !modelo) {
      assetErrors.push(`  Fila sin marca/modelo: Serie=${numeroSerie}`);
      continue;
    }

    try {
      const asset = await prisma.asset.create({
        data: {
          categoriaId: categoria.id,
          numeroSerie,
          marca,
          modelo,
          nombreEquipo,
          procesador,
          discoDuro,
          ram,
          sistemaOperativo,
          microsoft365,
          antivirus,
          observaciones,
          condicion,
          estado,
          empleadoActualId,
        },
      });

      if (numeroSerie) {
        assetSerieToDbId.set(numeroSerie, { dbId: asset.id, rowRut: normalizedRut });
      }
      assetCount++;
    } catch (err) {
      assetErrors.push(`  Error insertando activo Serie=${numeroSerie}: ${err.message}`);
    }
  }

  console.log(`  Activos insertados: ${assetCount}`);
  if (assetErrors.length > 0) {
    console.log(`  Errores: ${assetErrors.length}`);
    assetErrors.forEach(e => console.log(e));
  }
  console.log();

  // 6. Insert assignments (only rows with RUT + fecha de entrega)
  console.log('--- PASO 5: Insertar asignaciones ---');
  let assignCount = 0;
  const assignErrors = [];

  for (const row of rows) {
    const rut = trimStr(row['RUT']);
    const fechaSerial = row['Fecha de entrega'];
    const serie = trimStr(row['N° Serie']);

    if (!rut || !fechaSerial || !serie) continue;

    const normalizedRut = normalizeRut(rut);
    const employeeId = rutToDbId.get(normalizedRut);
    const assetEntry = assetSerieToDbId.get(serie);

    if (!employeeId || !assetEntry) {
      assignErrors.push(`  Sin match para asignación: RUT=${rut}, Serie=${serie}`);
      continue;
    }

    const fechaEntrega = excelDateToJS(fechaSerial);
    if (!fechaEntrega) {
      assignErrors.push(`  Fecha inválida para asignación: Serie=${serie}, Fecha=${fechaSerial}`);
      continue;
    }

    try {
      await prisma.assignment.create({
        data: {
          assetId: assetEntry.dbId,
          employeeId,
          fechaEntrega,
          tipoMovimiento: 'ingreso',
          activo: true,
        },
      });
      assignCount++;
    } catch (err) {
      assignErrors.push(`  Error asignación Serie=${serie}: ${err.message}`);
    }
  }

  console.log(`  Asignaciones insertadas: ${assignCount}`);
  if (assignErrors.length > 0) {
    console.log(`  Errores: ${assignErrors.length}`);
    assignErrors.forEach(e => console.log(e));
  }
  console.log();

  // 7. Insert maintenances
  console.log('--- PASO 6: Insertar mantenciones ---');
  let maintCount = 0;
  const maintErrors = [];

  for (const row of rows) {
    const mantSerial = row['Mantencion'];
    const serie = trimStr(row['N° Serie']);

    if (!mantSerial || !serie) continue;

    const assetEntry = assetSerieToDbId.get(serie);
    if (!assetEntry) {
      maintErrors.push(`  Sin match para mantención: Serie=${serie}`);
      continue;
    }

    const fechaRealizada = excelDateToJS(mantSerial);
    if (!fechaRealizada) {
      maintErrors.push(`  Fecha mantención inválida: Serie=${serie}, Val=${mantSerial}`);
      continue;
    }

    const proxSerial = row['Proxima Mantencion'];
    const proximaMantencion = excelDateToJS(proxSerial);

    try {
      await prisma.maintenance.create({
        data: {
          assetId: assetEntry.dbId,
          tipo: 'preventiva',
          descripcion: 'Mantención preventiva',
          fechaRealizada,
          proximaMantencion,
          estado: 'completada',
        },
      });
      maintCount++;
    } catch (err) {
      maintErrors.push(`  Error mantención Serie=${serie}: ${err.message}`);
    }
  }

  console.log(`  Mantenciones insertadas: ${maintCount}`);
  if (maintErrors.length > 0) {
    console.log(`  Errores: ${maintErrors.length}`);
    maintErrors.forEach(e => console.log(e));
  }
  console.log();

  // 8. Summary
  console.log('=== RESUMEN ===');
  console.log(`  Categorías:    1`);
  console.log(`  Empleados:     ${empCount}`);
  console.log(`  Activos:       ${assetCount}`);
  console.log(`  Asignaciones:  ${assignCount}`);
  console.log(`  Mantenciones:  ${maintCount}`);
  console.log(`  Errores total: ${assetErrors.length + assignErrors.length + maintErrors.length}`);
  console.log('\n=== Migración completada ===');
}

main()
  .catch((err) => {
    console.error('ERROR FATAL:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
