<template>
  <private-view title="Importador de Excel">
  
    <div class="importer-layout">
      <div v-if="step === 1">
        <v-card>
          <v-card-title>Seleccionar Archivo y Colección</v-card-title>
          <v-card-content>
            <div class="intro-text">
              Bienvenido al importador de Excel. Sigue estos pasos para cargar datos:
              <ol>
                <li>Selecciona la <strong>colección de destino</strong> donde se guardarán los datos.</li>
                <li>Sube tu archivo Excel (<strong>.xlsx</strong> o <strong>.xls</strong>).</li>
                <li>Haz clic en "Siguiente" para configurar el mapeo de columnas.</li>
              </ol>
            </div>

            <label
              for="collection-select"
              class="label"
            >
              Colección de Destino
            </label>
            
            <v-select
              id="collection-select"
              v-model="selectedCollection"
              :items="collections"
              item-text="name"
              item-value="collection"
              @update:modelValue="fetchFields"
              class="mb-4"
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
                  </div>

                  <div v-else class="file-info">
                    <v-icon name="description" large />
                    <span class="file-name">{{ selectedFileName }}</span>
                    <v-button
                      secondary
                      small
                      icon
                      @click.prevent="clearFile"
                      class="close-file-btn"
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
              Siguiente (Configurar y Mapear Columnas)
            </v-button>
          </v-card-content>
        </v-card>
      </div>

      <div v-if="step === 2">
        <v-card>
          <v-card-title>Configuración de Importación</v-card-title>
          <v-card-content>
            
            <div class="grid-configs">
                <div class="field">
                    <label class="label">Campo Identificador (Único)</label>
                    <v-select
                        v-model="identifierField"
                        :items="collectionFields"
                        item-text="name"
                        item-value="field"
                        placeholder="-- Ninguno (Siempre crear nuevos) --"
                        clearable
                    />
                    <div class="note">
                        Campo usado para detectar si el registro ya existe en la base de datos.
                    </div>
                </div>

                <div class="field" v-if="identifierField">
                    <label class="label">Si ya existe el registro...</label>
                    <v-select
                        v-model="importStrategy"
                        :items="strategyOptions"
                        item-text="text"
                        item-value="value"
                    />
                </div>
            </div>

          </v-card-content>
        </v-card>

        <v-card>
          <v-card-title>Mapear Columnas</v-card-title>
          <v-card-content>

            <p class="intro-text">
              Asigna las columnas de tu archivo Excel a los campos correspondientes en la colección <strong>{{ selectedCollection }}</strong>. Usa la lista de campos a la derecha como referencia.
            </p>

            <div class="mapping-layout">
              <div class="mapping-table-area">
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
                  <h4>Campos de la Colección ({{ selectedCollection }})</h4>
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
          <v-card-title>Resultados de la Validación</v-card-title>
          <v-card-content>

            <div class="stats-container">
                <div class="stat-box success">
                    <div class="number">{{ validationResult.validCount }}</div>
                    <div class="label">Nuevos a Crear</div>
                </div>
                <div class="stat-box info" v-if="validationResult.updatedCount > 0">
                    <div class="number">{{ validationResult.updatedCount }}</div>
                    <div class="label">A Actualizar</div>
                </div>
                <div class="stat-box warning" v-if="validationResult.skippedCount > 0">
                    <div class="number">{{ validationResult.skippedCount }}</div>
                    <div class="label">A Omitir (Duplicados)</div>
                </div>
                <div class="stat-box danger" v-if="validationResult.errorCount > 0">
                    <div class="number">{{ validationResult.errorCount }}</div>
                    <div class="label">Con Errores</div>
                </div>
            </div>

            <v-notice v-if="validationResult.errorCount > 0" type="danger" class="mt-4">
                No se pueden importar las filas con errores.
            </v-notice>
            
            <div v-if="validationResult.errors.length > 0" class="error-list mt-4">
              <table class="mapping-table"> 
                <thead>
                  <tr>
                    <th>Fila Excel</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(error, index) in validationResult.errors.slice(0, 50)" :key="index">
                    <td>{{ error.row }}</td>
                    <td>{{ error.message }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="validationResult.errors.length > 50" style="padding: 10px; color: var(--text-subdued);">
                ... y {{ validationResult.errors.length - 50 }} errores más.
              </div>
            </div>

            <div class="mt-4 action-buttons">
              <v-button
                v-if="(validationResult.validCount > 0 || validationResult.updatedCount > 0) && validationResult.errorCount > 0"
                :loading="isLoading"
                @click="startImport(true)"
              >
                Importar Parcialmente (Ignorar Errores)
              </v-button>

              <v-button
                v-if="validationResult.errorCount === 0 && (validationResult.validCount > 0 || validationResult.updatedCount > 0)"
                :loading="isLoading"
                @click="startImport(false)"
              >
                Confirmar e Importar
              </v-button>

             <v-button secondary @click="reset">
                Cancelar
              </v-button>
            </div>
          </v-card-content>
        </v-card>
      </div>

      <div v-if="step === 4">
        <v-notice type="success">
            <h3>¡Proceso Completado!</h3>
            <ul>
                <li>Creados: <strong>{{ importResult.createdCount }}</strong></li>
                <li>Actualizados: <strong>{{ importResult.updatedCount }}</strong></li>
                <li>Omitidos: <strong>{{ importResult.skippedCount }}</strong></li>
            </ul>
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
const collections = ref<any[]>([]);
const selectedCollection = ref<string | null>(null);
const collectionFieldsInfo = ref<any[]>([]);
const file = ref<File | null>(null);
const selectedFileName = ref<string>('');
const isDragging = ref(false);

// Paso 2
const collectionFields = ref<any[]>([]);
const excelHeaders = ref<string[]>([]);
const fieldMappings = ref<Record<string, string | null>>({});
const identifierField = ref<string | null>(null);
const importStrategy = ref<string>('error');

const strategyOptions = [
    { text: 'Mostrar Error (No importar)', value: 'error' },
    { text: 'Omitir (No hacer nada)', value: 'skip' },
    { text: 'Actualizar registro existente', value: 'update' }
];

// Paso 3
type ValidationError = { row: number; message: string };
const validationResult = ref({
  validCount: 0,
  updatedCount: 0,
  skippedCount: 0,
  errorCount: 0,
  errors: [] as ValidationError[]
});

// Paso 4
const importResult = ref({
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0
});

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

function getFormData() {
    const formData = new FormData();
    formData.append('file', file.value!);
    formData.append('collection', selectedCollection.value!);
    formData.append('mappings', JSON.stringify(fieldMappings.value));
    
    if (identifierField.value) {
        formData.append('identifierField', identifierField.value);
        formData.append('importStrategy', importStrategy.value);
    }
    return formData;
}

// Enviar archivo y mapeo al backend para VALIDACIÓN
async function startValidation() {
  if (!file.value) return;
  isLoading.value = true;

  try {
    const response = await api.post('/excel-importer-api/validate', getFormData());
    
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

  try {
    const formData = getFormData();
    const response = await api.post(`/excel-importer-api/import?partial=${partial}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    
    importResult.value = response.data;
    step.value = 4;
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
  identifierField.value = null;
  importStrategy.value = 'error';
  fieldMappings.value = {};
  validationResult.value = { validCount: 0, updatedCount: 0, skippedCount: 0, errorCount: 0, errors: [] };
}
</script>

<style scoped>
.importer-layout {
  padding: 0 46px;
  margin-bottom: 30px;
}

.importer-layout .v-card {
  max-width: none;
  max-height: none;
  overflow: visible;
}

.v-card {
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.v-card-title {
  padding-left: 0px !important;
}

.mt-4 {
  margin-top: 1.5rem;
}

.mb-4 {
  margin-bottom: 1.5rem;
}

.intro-text {
  color: var(--text-normal);
  margin-bottom: 1.5rem;
  line-height: 1.5;
}

.intro-text ol {
  margin-top: 0.5rem;
  margin-bottom: 0;
  padding-left: 1.5rem;
}

.intro-text li {
  margin-bottom: 0.25rem;
}

.file-drop-zone {
  border: 2px dashed var(--border-normal);
  padding: 2rem;
  text-align: center;
  cursor: pointer;
}

.file-drop-zone.is-dragging {
  border-color: var(--primary);
  background: var(--primary-10);
}

.file-input-real {
  display: none;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.close-file-btn {
  margin-left: auto;
  flex-shrink: 0;
}

.grid-configs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.label {
  font-weight: 600;
  margin-bottom: 8px;
  display: block;
}

.note {
  font-size: 0.85rem;
  color: var(--text-subdued);
  margin-top: 4px;
}

.mapping-layout {
  display: flex;
  gap: 20px;
}

.mapping-table-area {
  flex: 3;
}

.schema-sidebar-area {
  flex: 1;
}

.mapping-table {
  width: 100%;
  border-collapse: collapse;
}

.mapping-table th, .mapping-table td {
  padding: 10px;
  border-bottom: 1px solid var(--border-subdued);
  text-align: left;
}

.mapping-table th {
  background: var(--background-subdued);
  font-weight: 600;
}

.stats-container {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
}

.stat-box {
  flex: 1;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid transparent;
  text-align: center;
}

.stat-box .number {
  font-size: 1.8rem;
  font-weight: bold;
}

.stat-box .label {
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-box.success {
  background-color: var(--success-10);
  border-color: var(--success);
  color: var(--success);
}
.stat-box.info {
  background-color: var(--primary-10);
  border-color: var(--primary);
  color: var(--primary);
}

.stat-box.warning {
  background-color: var(--warning-10);
  border-color: var(--warning);
  color: var(--warning);
}

.stat-box.danger {
  background-color: var(--danger-10);
  border-color: var(--danger);
  color: var(--danger);
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.error-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border-subdued);
}
</style>