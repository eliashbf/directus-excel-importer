import { defineEndpoint } from '@directus/extensions-sdk';
import type { Accountability, SchemaOverview } from '@directus/types';
import type { Services } from '@directus/api/services';
import type { Knex } from 'knex';
import busboy from 'busboy';
import * as XLSX from 'xlsx';

type ItemsService = InstanceType<Services['ItemsService']>;

export default defineEndpoint((router, { services, database, getSchema }) => {
  const { ItemsService } = services;

  /**
   * RUTA DE VALIDACIÓN
   * Usa una transacción con ROLLBACK para simular la importación.
   */
  router.post('/validate', async (req: any, res) => {
    try {
      const { collection, mappings, fileBuffer, identifierField, importStrategy } = await parseFormData(req);

      const schema = await getSchema();

      const { validData, errors, updatedCount, skippedCount } = await processExcel(
        fileBuffer,
        collection,
        mappings,
        schema,
        services,
        req.accountability,
        database,
        true,
        identifierField,
        importStrategy
      );

      res.json({
        validCount: validData.length,
        updatedCount,
        skippedCount,
        errorCount: errors.length,
        errors: errors,
      });

    } catch (err: any) {
      console.error('[EXCEL-IMPORTER-API] ERROR en /validate:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /**
   * RUTA DE IMPORTACIÓN
   * Llama al mismo procesador, pero esta vez comitea los cambios.
   */
  router.post('/import', async (req: any, res) => {
    const isPartialImport = req.query.partial === 'true';

    try {
      const { collection, mappings, fileBuffer, identifierField, importStrategy } = await parseFormData(req);
      const schema = await getSchema();

      const { validData, errors, updatedCount, skippedCount } = await processExcel(
        fileBuffer,
        collection,
        mappings,
        schema,
        services,
        req.accountability,
        database,
        false,
        identifierField,
        importStrategy
      );

      // Si NO es importación parcial y hay errores, rechazar.
      if (!isPartialImport && errors.length > 0) {
        return res.status(400).json({ error: 'Hay errores, no se puede importar.' });
      }

      return res.json({
        createdCount: validData.length,
        updatedCount: updatedCount,
        skippedCount: skippedCount,
        errors: errors
      });

    } catch (err: any) {
      console.error('[EXCEL-IMPORTER-API] ERROR en /import:', err);
      return res.status(500).json({ error: (err as Error).message });
    }
  });
});


/**
 * Parsea el 'multipart/form-data' desde el stream req y bufferea el archivo.
 */
function parseFormData(req: any): Promise<{
  collection: string,
  mappings: Record<string, string>,
  fileBuffer: Buffer,
  identifierField: string | null,
  importStrategy: string
}> {
  return new Promise((resolve, reject) => {

    const bb = busboy({ headers: req.headers });
    let collection: string = '';
    let mappings: Record<string, string> = {};
    let identifierField: string | null = null;
    let importStrategy: string = 'error'; // Por defecto
    let fileBuffer: Buffer | null = null;

    bb.on('file', (name, file, _) => {
      if (name === 'file') {
        const buffers: any[] = [];
        file.on('data', (data) => { buffers.push(data); });
        file.on('end', () => {
          fileBuffer = Buffer.concat(buffers);
        });
        file.on('error', (err) => { reject(new Error(`Error en el stream del archivo: ${err.message}`)); });
      }
    });
    bb.on('field', (name, val) => {
      if (name === 'collection') collection = val;
      if (name === 'mappings') mappings = JSON.parse(val);
      if (name === 'identifierField') identifierField = val === 'null' || val === '' ? null : val;
      if (name === 'importStrategy') importStrategy = val;
    });
    bb.on('close', () => {
      if (!fileBuffer || !collection || !mappings) {
        return reject(new Error('Faltan datos en el formulario (archivo, colección, mapeo o archivo vacío).'));
      }
      resolve({ collection, mappings, fileBuffer, identifierField, importStrategy });
    });
    bb.on('error', reject);
    req.pipe(bb);
  });
}


/**
 * Función principal que lee el Excel y usa una transacción para validar.
 */
async function processExcel(
  fileBuffer: Buffer,
  collection: string,
  mappings: Record<string, string>,
  schema: SchemaOverview,
  services: any,
  accountability: Accountability | null,
  database: Knex,
  isValidationOnly: boolean,
  identifierField: string | null,
  importStrategy: string
) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0]!;
  const worksheet = workbook.Sheets[sheetName]!;
  let jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

  jsonData = jsonData.filter(row => {
    if (!row || row.length === 0) return false;
    return row.some(cell => cell !== null && cell !== undefined && cell !== '');
  });

  if (jsonData.length < 2) throw new Error('El archivo Excel está vacío o no tiene cabeceras válidas.');

  const headers = jsonData[0] as string[];
  const rows = jsonData.slice(1);

  const validData: any[] = [];
  const errors: { row: number; message: string }[] = [];
  let updatedCount = 0;
  let skippedCount = 0;

  const collectionSchema = schema.collections[collection];
  if (!collectionSchema) throw new Error(`Colección "${collection}" no encontrada.`);

  const readOnlyServiceFactory = (collectionName: string): ItemsService => {
    return new services.ItemsService(collectionName, {
      schema: schema,
      accountability: accountability,
      knex: database
    });
  };

  // Cache para recordar lo que acabamos de procesar en este loop
  // Key: Valor del Identificador (ej: el RUT), Value: El ID primario (ID de la BD)
  const processedCache = new Map<string, string | number>();

  const trx = await database.transaction();
  const readService = readOnlyServiceFactory(collection);

  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as any[];
      const excelRowNumber = i + 2;

      const { item, errorMessages: prepErrors } = await prepareRow(
        row, headers, mappings, collectionSchema, readOnlyServiceFactory
      );

      if (prepErrors.length > 0) {
        errors.push(...prepErrors.map(msg => ({ row: excelRowNumber, message: msg })));
        continue;
      }

      let existingId: string | number | null = null;

      if (identifierField && item[identifierField] !== undefined) {
        const idValue = String(item[identifierField]); // Convertimos a string para usar de Key

        // Primero buscamos en nuestra caché local (¿Lo acabamos de insertar/ver?)
        if (processedCache.has(idValue)) {
          existingId = processedCache.get(idValue)!;
        } else {
          // Si no, buscamos en la BD real
          try {
            const existingRecords = await readService.readByQuery({
              filter: { [identifierField]: { _eq: item[identifierField] } },
              limit: 1,
              fields: [collectionSchema.primary]
            });
            if (existingRecords.length > 0) {
              existingId = existingRecords[0][collectionSchema.primary];
              // Lo guardamos en caché para la próxima vez que aparezca en este Excel
              processedCache.set(idValue, existingId!);
            }
          } catch (e: any) {
            errors.push({ row: excelRowNumber, message: `Error buscando duplicados: ${e.message}` });
            continue;
          }
        }
      }

      try {
        await trx.transaction(async (rowTrx) => {
          const rowService = new services.ItemsService(collection, {
            schema: schema,
            accountability: accountability,
            knex: rowTrx
          });

          if (existingId) {
            // ESTRATEGIA: ACTUALIZAR O SALTAR
            if (importStrategy === 'error') {
              throw new Error(`Registro duplicado (Campo: ${identifierField}, Valor: ${item[identifierField]})`);
            } else if (importStrategy === 'skip') {
              return;
            } else if (importStrategy === 'update') {
              await rowService.updateOne(existingId, item);
            }
          } else {
            // ESTRATEGIA: CREAR NUEVO
            // Guardamos el resultado para obtener el ID generado
            const newId = await rowService.createOne(item);

            // Agregamos este nuevo registro a la caché local.
            // Si otra fila más abajo tiene el mismo RUT, ahora sabrá que ya existe (y su ID).
            if (identifierField && item[identifierField]) {
              processedCache.set(String(item[identifierField]), newId);
            }
          }
        });

        if (existingId) {
          if (importStrategy === 'update') updatedCount++;
          if (importStrategy === 'skip') skippedCount++;
        } else {
          validData.push(item);
        }

      } catch (err: any) {
        const msg = (err.message || String(err)).replace('Validation failed. ', '');
        if (importStrategy === 'error' && existingId) {
          errors.push({ row: excelRowNumber, message: msg });
        } else {
          errors.push({ row: excelRowNumber, message: msg });
        }
      }
    }

    if (isValidationOnly) {
      await trx.rollback();
    } else {
      await trx.commit();
    }

  } catch (globalErr: any) {
    if (!trx.isCompleted()) await trx.rollback();
    if (!isValidationOnly) throw globalErr;
  }

  return { validData, errors, updatedCount, skippedCount };
}

/**
 * Prepara la fila (mapea, convierte tipos, busca relaciones)
 */
async function prepareRow(
  row: any[],
  headers: string[],
  mappings: Record<string, string>,
  collectionSchema: any,
  readOnlyServiceFactory: (collection: string) => ItemsService
): Promise<{ item: any; errorMessages: string[] }> {

  const item: any = {};
  const errorMessages: string[] = [];

  for (const excelHeader of headers) {
    const directusField = mappings[excelHeader];
    if (directusField) {
      const cellValue = row[headers.indexOf(excelHeader)];
      item[directusField] = cellValue;
    }
  }

  for (const fieldName in item) {
    if (!collectionSchema.fields[fieldName]) continue;

    const fieldSchema = collectionSchema.fields[fieldName];
    let value = item[fieldName];

    if (value === null || value === undefined || value === '') {
      item[fieldName] = null;
      continue;
    }

    try {
      switch (fieldSchema.type) {
        case 'integer':
        case 'bigInteger':
          if (isNaN(Number(value)) || !Number.isInteger(Number(value))) {
            throw new Error(`Debe ser un número entero (ej: 123). Valor: "${value}".`);
          }
          item[fieldName] = Number(value);
          break;

        case 'float':
        case 'decimal':
          if (isNaN(Number(value))) {
            throw new Error(`Debe ser un número (ej: 123.45). Valor: "${value}".`);
          }
          item[fieldName] = Number(value);
          break;
        case 'boolean':
          const lowerVal = String(value).toLowerCase().trim();
          if (!['true', 'false', '1', '0', 'si', 'no', 'sí'].includes(lowerVal)) {
            throw new Error(`Debe ser un valor booleano (ej: true, false, 1, 0). Valor: "${value}".`);
          }
          item[fieldName] = (lowerVal === 'true' || lowerVal === '1' || lowerVal === 'si' || lowerVal === 'sí');
          break;
        case 'json':
          if (typeof value === 'string') {
            item[fieldName] = JSON.parse(value);
          }
          break;
        case 'date':
        case 'dateTime':
        case 'timestamp':
          if (typeof value === 'number' && value > 10000) {
            const excelDate = new Date(Math.round((value - 25569) * 86400 * 1000));
            if (isNaN(excelDate.getTime())) {
              throw new Error(`El número de serie de Excel no es una fecha válida. Valor: "${value}".`);
            }
            item[fieldName] = excelDate.toISOString();
          } else {
            const date = new Date(value);
            if (isNaN(date.getTime())) {
              throw new Error(`No es una fecha válida. Valor: "${value}".`);
            }
            item[fieldName] = date.toISOString();
          }
          break;
      }
    } catch (e: any) {
      errorMessages.push(`Campo "${fieldName}": ${e.message}`);
      continue;
    }

    const isM2O = fieldSchema.special?.includes('m2o');
    const relatedCollection = fieldSchema.meta?.related_collection;

    if (isM2O && relatedCollection) {
      const relatedService = readOnlyServiceFactory(relatedCollection);

      try {
        let foundItem: any = null;
        try { foundItem = await relatedService.readOne(value); } catch (e) { }
        if (!foundItem) {
          const items = await relatedService.readByQuery({ filter: { name: { _eq: value } }, limit: 1 });
          if (items.length > 0) foundItem = items[0];
        }
        if (!foundItem) {
          const items = await relatedService.readByQuery({ filter: { sku: { _eq: value } }, limit: 1 });
          if (items.length > 0) foundItem = items[0];
        }

        if (foundItem) {
          item[fieldName] = foundItem.id;
        } else {
          errorMessages.push(`Campo "${fieldName}": El valor "${value}" no se encontró en la colección "${relatedCollection}".`);
        }
      } catch (e: any) {
        console.error(e);
        errorMessages.push(`Campo "${fieldName}": Error al buscar la relación: ${e.message}`);
      }
    }
  }

  return { item, errorMessages };
}