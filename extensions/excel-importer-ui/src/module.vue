<template>
  <private-view title="Importador de Excel">
  
    <div class="importer-layout">
      <div v-if="step === 1">
        <v-card>
          <v-card-content>
            <v-select
              v-model="selectedCollection"
              label="Seleccionar Colección de Destino"
              :items="collections"
              item-text="name"
              item-value="collection"
              @update:modelValue="fetchFields"
            />

            <div v-if="selectedCollection" class="file-uploader-container">
                
                <input
                  type="file"
                  id="excel-file-upload"
                  class="file-input-real"
                  @change="onFileChange"
                  :accept="'.xlsx, .xls'"
                />

                <label
                  for="excel-file-upload"
                  class="file-drop-zone"
                  :class="{ 'is-dragging': isDragging }"
                  @dragover.prevent="onDragOver"
                  @dragleave.prevent="onDragLeave"
                  @drop.prevent="onFileDrop"
                >
                  <div v-if="!file" class="upload-prompt">
                    <v-icon name="upload_file" large />
                    <span>Arrastra un archivo .xlsx o haz clic para subir</span>
                    <span class="file-types">XLS, XLSX</span>
                  </div>

                  <div v-else class="file-info">
                    <v-icon name="description" large />
                    <span class="file-name">{{ selectedFileName }}</span>
                    <v-button
                      secondary
                      small
                      icon
                      @click.prevent="clearFile"
                    >
                      <v-icon name="close" />
                    </v-button>
                  </div>
                </label>
              </div>

            <v-button
              class="mt-4"
              :disabled="!file || !selectedCollection"
              @click="readExcelHeaders"
            >
              Siguiente (Mapear Columnas)
            </v-button>
          </v-card-content>
        </v-card>
      </div>

      <div v-if="step === 2">
        <v-card>
          <v-card-title>Mapear Columnas</v-card-title>
          <v-card-content>

            <div class="mapping-layout">
        
              <div class="mapping-table-area">
                <p class="description-text">
                  Asigna las columnas de tu Excel a los campos de la colección <strong>{{ selectedCollection }}</strong>.
                </p>
                
                <table class="mapping-table">
                  <thead>
                    <tr>
                      <th>Columna del Excel</th>
                      <th>Campo en Directus</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="header in excelHeaders" :key="header">
                      <td><strong>{{ header }}</strong></td>
                      <td>
                        <v-select
                          v-model="fieldMappings[header]"
                          placeholder="Ignorar esta columna"
                          :items="collectionFields"
                          item-text="name"
                          item-value="field"
                          clearable
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div class="button-group mt-4">
                  <v-button class="mt-4" :loading="isLoading" @click="startValidation">
                    Validar Datos
                  </v-button>
                  <v-button class="mt-4" secondary @click="reset">
                    Cancelar
                  </v-button>
                </div>
              </div>

              <div class="schema-sidebar-area">
                <div class="schema-sidebar-content">
                  <h4>Campos de la Colección</h4>
                  <p>Usa esto como guía para el mapeo.</p>
                  
                  <ul class="schema-list">
                    <li v-for="field in collectionFieldsInfo" :key="field.field" class="schema-field">
                      <div class="field-name">
                        {{ field.name }}
                        <span v-if="field.required" class="field-required" title="Obligatorio">*</span>
                      </div>
                      <div class="field-type">{{ field.type }}</div>
                      <div v-if="field.meta?.note" class="field-note">{{ field.meta.note }}</div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

          </v-card-content>
        </v-card>
      </div>

      <div v-if="step === 3">
        <v-card>
          <v-card-title>Revisión de la Validación</v-card-title>
          <v-card-content>
            
            <v-notice v-if="validationResult.errorCount === 0" type="success">
              ¡Todo listo! Se encontraron {{ validationResult.validCount }} filas válidas.
            </v-notice>

            <v-notice v-if="validationResult.errorCount > 0 && validationResult.validCount > 0" type="warning">
              Se encontraron {{ validationResult.validCount }} filas válidas y {{ validationResult.errorCount }} filas con errores.
            </v-notice>

            <v-notice v-if="validationResult.validCount === 0" type="danger">
              No se encontraron filas válidas. Por favor, corrige tu archivo y vuelve a intentarlo.
            </v-notice>
            
            <div v-if="validationResult.errors.length > 0" class="error-list mt-4">
              <h4>Errores Encontrados (mostrando los primeros 10):</h4>
              
              <table class="mapping-table"> 
                <thead>
                  <tr>
                    <th>Fila Excel</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(error, index) in validationResult.errors.slice(0, 10)" :key="index">
                    <td>{{ error.row }}</td>
                    <td>{{ error.message }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mt-4">
              <v-button
                v-if="validationResult.validCount > 0 && validationResult.errorCount > 0"
                :loading="isLoading"
                @click="startImport(true)"
                class="mt-4"
              >
                Importar solo las {{ validationResult.validCount }} filas válidas
              </v-button>

              <v-button
                v-if="validationResult.errorCount === 0"
                :loading="isLoading"
                @click="startImport(false)"
                class="mt-4"
              >
                Importar las {{ validationResult.validCount }} filas
              </v-button>

              <v-button class="mt-4" secondary @click="reset">
                Cancelar y subir otro archivo
              </v-button>
            </div>
          </v-card-content>
        </v-card>
      </div>

      <div v-if="step === 4">
        <v-notice type="success">
            ¡Importación completada! Se cargaron <strong>{{ importCount }}</strong> registros.
        </v-notice>
        <v-button class="mt-4" @click="reset">Importar otro archivo</v-button>
      </div>

    </div>

  </private-view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import * as XLSX from 'xlsx';

const api = useApi();
const step = ref(1); // 1: Upload, 2: Map, 3: Review, 4: Done
const isLoading = ref(false);

// Paso 1
const collections = ref<{ name: string; collection: string }[]>([]);
const selectedCollection = ref<string | null>(null);
const collectionFieldsInfo = ref<any[]>([]);
const file = ref<File | null>(null);
const selectedFileName = ref<string>('');
const isDragging = ref<boolean>(false);

// Paso 2
const collectionFields = ref<{ name: string; field: string }[]>([]);
const excelHeaders = ref<string[]>([]);
const fieldMappings = ref<Record<string, string | null>>({});

// Paso 3
type ValidationError = { row: number; message: string };
const validationResult = ref<{
  validCount: number;
  errorCount: number;
  errors: ValidationError[];
}>({ validCount: 0, errorCount: 0, errors: [] });

// Paso 4
const importCount = ref(0);

// Cargar colecciones al iniciar
onMounted(async () => {
  try {
    const response = await api.get('/collections');
    collections.value = response.data.data
      .filter((c: any) => !c.collection.startsWith('directus_'))
      .map((c: any) => ({ name: c.name || c.collection, collection: c.collection }));
  } catch (err) {
    console.error('Error al cargar colecciones', err);
  }
});

// Cargar campos de la colección seleccionada
async function fetchFields() {
  if (!selectedCollection.value) return;
  try {
    const response = await api.get(`/fields/${selectedCollection.value}`);
    const allFieldsData = response.data.data;
    
    collectionFields.value = allFieldsData
      .filter((f: any) => f.meta?.hidden === false && f.meta?.readonly === false)
      .map((f: any) => ({ 
        name: f.name || f.field, 
        field: f.field 
      }));

    collectionFieldsInfo.value = allFieldsData
      .filter((f: any) => f.meta?.hidden === false)
      .map((f: any) => ({
        name: f.name || f.field,
        field: f.field,
        type: f.type,
        required: f.schema?.is_nullable === false && f.schema?.has_auto_increment === false,
        meta: f.meta
      }));
    
    console.log('Campos cargados:', collectionFieldsInfo.value);
  } catch (err) {
    console.error('Error al cargar campos', err);
  }
}

// Función central para manejar el archivo, ya sea por 'change' o 'drop'
function handleFile(selectedFile: File) {
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ];
  
  if (!validTypes.includes(selectedFile.type)) {
    alert('Por favor, selecciona un archivo .xlsx o .xls');
    return;
  }
  
  file.value = selectedFile;
  selectedFileName.value = selectedFile.name;
}

// Se llama cuando el <input type="file"> cambia (al hacer clic)
function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    handleFile(target.files.item(0)!);
  }
  // Limpia el input para que se pueda volver a subir el mismo archivo
  target.value = ''; 
}

// Se llama cuando se suelta un archivo en el drop-zone
function onFileDrop(event: DragEvent) {
  isDragging.value = false;
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    handleFile(event.dataTransfer.files.item(0)!);
  }
}

// Funciones para el efecto visual de "arrastrar"
function onDragOver(_: DragEvent) {
  isDragging.value = true;
}
function onDragLeave(_: DragEvent) {
  isDragging.value = false;
}

// Limpia el archivo seleccionado
function clearFile() {
  file.value = null;
  selectedFileName.value = '';
}

// Leer cabeceras del Excel (SIN subirlo)
async function readExcelHeaders() {
  if (!file.value) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = e.target?.result;
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0]!;
    const worksheet = workbook.Sheets[firstSheetName]!;
    
    // Obtener cabeceras (A1, B1, C1...)
    const headers: string[] = [];
    const range = XLSX.utils.decode_range(worksheet['!ref']!);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
      let hdr = "UNKNOWN " + C;
      if (cell && cell.t) hdr = XLSX.utils.format_cell(cell);
      headers.push(hdr);
    }

    console.log('Cabeceras leídas:', headers);

    excelHeaders.value = headers;
    step.value = 2; // Pasar al siguiente paso
  };
  reader.readAsArrayBuffer(file.value);
}

// Enviar archivo y mapeo al backend para VALIDACIÓN
async function startValidation() {
  if (!file.value) return;
  isLoading.value = true;

  const formData = new FormData();
  formData.append('file', file.value);
  formData.append('collection', selectedCollection.value!);
  formData.append('mappings', JSON.stringify(fieldMappings.value));

  try {
    const response = await api.post('/excel-importer-api/validate', formData);
    
    validationResult.value = response.data;
    step.value = 3; // Pasar al paso de revisión
  } catch (err) {
    console.error('Error en la validación', err);
    // Aquí deberia mostrarse un error al usuario
  } finally {
    isLoading.value = false;
  }
}

// Enviar datos al backend para IMPORTACIÓN FINAL
async function startImport(partial: boolean) {
  if (!file.value) return;
  isLoading.value = true;

  const formData = new FormData();
  formData.append('file', file.value);
  formData.append('collection', selectedCollection.value!);
  formData.append('mappings', JSON.stringify(fieldMappings.value));
  
  // Usamos un parámetro query para decir si es parcial
  const url = `/excel-importer-api/import?partial=${partial}`;

  try {
    const response = await api.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    
    importCount.value = response.data.createdCount;
    step.value = 4; // Pasar al paso final
  } catch (err) {
    console.error('Error en la importación', err);
  } finally {
    isLoading.value = false;
  }
}

// Reiniciar todo
function reset() {
  step.value = 1;
  selectedCollection.value = null;
  file.value = null;
  excelHeaders.value = [];
  collectionFields.value = [];
  fieldMappings.value = {};
  validationResult.value = { validCount: 0, errorCount: 0, errors: [] };
  importCount.value = 0;
}
</script>

<style scoped>
.importer-layout {
  margin-bottom: 30px;
  padding: 0 46px;
}

.importer-layout .v-card {
  max-width: none;
  max-height: none;
  overflow: visible;
}

.v-card {
  margin-bottom: 2rem;
  padding: 1.5rem;
}
.mt-4 {
  margin-top: 1.5rem;
}

.file-uploader-container {
  margin-top: 1.5rem;
}

.file-input-real {
  display: none;
  width: 0;
  height: 0;
  opacity: 0;
}

.file-drop-zone {
  display: block;
  width: 100%;
  padding: 1.5rem;
  border: 2px dashed var(--border-normal);
  border-radius: var(--border-radius);
  background-color: var(--background-subdued);
  cursor: pointer;
  transition: all 0.2s ease;
}

.file-drop-zone:hover {
  background-color: var(--background-normal);
  border-color: var(--border-subdued);
}

.file-drop-zone.is-dragging {
  background-color: var(--primary-a10);
  border-color: var(--primary);
}

.upload-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-normal);
  text-align: center;
}
.upload-prompt .v-icon {
  --v-icon-size: 40px;
  color: var(--text-subdued);
}
.upload-prompt span {
  font-weight: 600;
}
.upload-prompt .file-types {
  font-size: 0.8rem;
  font-weight: normal;
  color: var(--text-subdued);
}

.file-info {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
}
.file-info .v-icon {
  --v-icon-size: 32px;
  color: var(--text-subdued);
  flex-shrink: 0;
}
.file-info .file-name {
  flex-grow: 1;
  font-weight: 600;
  color: var(--text-normal);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-info .v-button {
  flex-shrink: 0;
  --v-button-background-color: var(--background-subdued);
  --v-button-color: var(--text-normal);
}
.file-info .v-button:hover {
  --v-button-background-color: var(--background-normal);
}

.mapping-layout {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
}

.mapping-table-area {
  flex: 3;
  min-width: 400px;
}

.schema-sidebar-area {
  flex: 1;
  min-width: 250px;
}

.schema-sidebar-content {
  border: 1px solid var(--border-normal);
  border-radius: var(--border-radius);
  background: var(--background-subdued);
  padding: 1.25rem;
  position: sticky;
  top: 2rem; 
}
.schema-sidebar-content h4 {
  margin: 0 0 0.25rem 0;
  font-size: 1.1rem;
}
.schema-sidebar-content p {
  font-size: 0.9rem;
  color: var(--text-subdued);
  margin-top: 0;
  margin-bottom: 1rem;
}

.schema-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 500px;
  overflow-y: auto;
}

.schema-field {
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border-subdued);
}
.schema-field:last-of-type {
  border-bottom: none;
}

.field-name {
  font-weight: 600;
  color: var(--text-normal);
}

.field-required {
  color: var(--danger);
  font-weight: 900;
  margin-left: 2px;
}

.field-type {
  font-family: var(--font-family-monospace);
  font-size: 0.8rem;
  color: var(--text-subdued);
  background: var(--background-normal);
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
  margin-top: 4px;
}

.field-note {
  font-size: 0.85rem;
  color: var(--text-subdued);
  font-style: italic;
  margin-top: 4px;
}

.button-group {
  display: flex;
  gap: 0.5rem;
}

.mapping-table {
  width: 100%;
  border: 1px solid var(--border-normal);
  border-collapse: collapse;
  border-radius: var(--border-radius);
  overflow: hidden;
}

.mapping-table th,
.mapping-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--border-normal);
  vertical-align: middle;
}

.mapping-table th {
  background-color: var(--background-normal);
  font-weight: 600;
}

.mapping-table td {
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}

.mapping-table tbody tr:last-of-type td {
  border-bottom: none;
}

.description-text {
  padding: var(--v-card-padding, 16px);
}

.error-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border-normal);
  border-radius: var(--border-radius);
  background-color: var(--background-subdued);
}
</style>