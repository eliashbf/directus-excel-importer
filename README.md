# Extensión de Importación de Excel para Directus

Esta extensión añade la funcionalidad de importar datos masivos desde archivos Excel (`.xlsx`, `.xls`) a cualquier colección de Directus. Incluye una interfaz de usuario (Módulo) para gestionar el proceso y una API (Endpoint) que maneja la validación y creación de registros.

## 🚀 Funcionalidades

- **Interfaz Intuitiva:** Módulo personalizado en el panel de administración.

- **Carga de Archivos:** Soporte para arrastrar y soltar archivos Excel.

- **Mapeo de Columnas:** Interfaz visual para asignar columnas del Excel a campos de Directus.

- **Validación Inteligente:**

    *  Verifica tipos de datos (Números, Fechas, Booleanos).

    * **Relaciones (M2O):** Busca automáticamente el ID de un registro relacionado basándose en el valor de la celda (busca por ID, o campos comunes como name o sku).

    * Simulación de importación (Transacción SQL con Rollback) para detectar errores sin corromper la base de datos.

- **Importación Flexible:** Opción para importar todo o solo las filas válidas (importación parcial).

## 📂 Estructura del Proyecto

```plaintext
.
├── docker-compose.yml          # Orquestación para desarrollo local
├── Dockerfile                  # Definición de la imagen para producción
├── extensions/
│   ├── excel-importer-api/     # Backend
│   └── excel-importer-ui/      # Frontend
└── production-extensions/      # Carpeta generada para el build (se crea manualmente)
```

## 🛠️ Desarrollo en Local

Sigue estos pasos para levantar el entorno de desarrollo y trabajar en la extensión con recarga automática (hot-reload) cuando sea posible o reconstrucción rápida.

**1. Instalación de Dependencias**

Debes instalar las dependencias de Node tanto para la API como para la UI.

```bash
# Instalar dependencias API
cd extensions/excel-importer-api
npm install

# Instalar dependencias UI
cd ../excel-importer-ui
npm install

# Volver a la raíz para levantar Docker
cd ../../
docker-compose up
```

**2. Compilación en modo Desarrollo**

Para que Directus detecte los cambios, necesitas compilar el TypeScript a JavaScript. Se recomienda usar el **Modo Observador** para mantener la compilación activa mientras programas.

Abre dos terminales separadas:

**Terminal 1 (API):**

```bash
cd extensions/excel-importer-api
npm run dev
```

**Terminal 2 (UI):**

```bash
cd extensions/excel-importer-ui
npm run dev
```

**3. Levantar Directus**

Con Docker Compose, levantamos una instancia de Directus que monta la carpeta `./extensions` localmente.

```bash
# Desde la raíz del proyecto
docker-compose up
```

- **Directus URL:** `http://localhost:8055`

- **Email:** `admin@mail.com`

- **Password:** `123456`

**Nota:** Si haces cambios en la configuración del `package.json` o dependencias de la API, es posible que necesites reiniciar el contenedor de Directus (`docker-compose restart`).

## 📦 Construcción para Producción (Docker Image)

Tu `Dockerfile` está configurado para copiar las extensiones desde una carpeta llamada `production-extensions`. Dado que el código fuente está en TypeScript, primero debemos compilar ("buildear") las extensiones y organizar los archivos resultantes en esa estructura.

**1. Compilar las Extensiones**

Ejecuta el script de build en ambas extensiones para generar la carpeta `dist/`.

```bash
# Build API
cd extensions/excel-importer-api
npm run build

# Build UI
cd ../excel-importer-ui
npm run build

# Volver a la raíz
cd ../../
```

**2. Preparar la carpeta** `production-extensions`

El `Dockerfile` espera encontrar los archivos compilados (`index.js`) y los `package.json` en una estructura específica. Ejecuta estos comandos para crearla:

```bash
# Crear estructura de directorios
mkdir -p production-extensions/excel-importer-api
mkdir -p production-extensions/excel-importer-ui

# --- API ---
# Copiar package.json
cp extensions/excel-importer-api/package.json production-extensions/excel-importer-api/
# Copiar el index.js compilado (OJO: El Dockerfile espera index.js en la raíz de la carpeta de la extensión para luego moverlo a dist)
cp extensions/excel-importer-api/dist/index.js production-extensions/excel-importer-api/

# --- UI ---
# Copiar package.json
cp extensions/excel-importer-ui/package.json production-extensions/excel-importer-ui/
# Copiar el index.js compilado
cp extensions/excel-importer-ui/dist/index.js production-extensions/excel-importer-ui/
```

**3. Crear la Imagen Docker**

Ahora que la carpeta `production-extensions` tiene los archivos compilados, puedes construir la imagen final.

```bash
docker build -t directus-con-excel-importer:latest -f Dockerfile .
```

**4. Ejecutar la Imagen de Producción**

```bash
docker run -p 8055:8055 \
  -e KEY=tu-key-segura \
  -e SECRET=tu-secret-seguro \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD=password \
  -e DB_CLIENT=sqlite3 \
  -e DB_FILENAME=/directus/database/data.db \
  directus-con-excel-importer:latest
```

## 📖 Cómo Usar la Extensión

1. Inicia sesión en Directus.

2. En la barra lateral izquierda, busca el icono **"Subir desde Excel"** (Icono: sheets_rtl).

    - **Importante:** Si no ves el icono, ve a **Configuración > Módulos** (Settings > Modules) en el panel de administración y asegúrate de activar el módulo "Subir desde Excel" (checkbox activado).

3. **Paso 1:** Selecciona la Colección de destino en el menú desplegable y carga tu archivo `.xlsx`.

4. **Paso 2:** El sistema leerá las cabeceras de tu Excel. Mapea cada columna del Excel con el campo correspondiente en Directus.

    - Tip: Si dejas una columna en blanco, esa columna del Excel será ignorada.

5. **Paso 3 (Validación):** Haz clic en "Validar Datos". El sistema procesará el archivo sin guardarlo.

    -  Si hay errores (ej. texto en un campo numérico o una relación no encontrada), te mostrará en qué filas ocurren.

6. **Paso 4 (Importación):**

    -  Si todo es correcto, pulsa "Importar".

    -  Si hay errores parciales, puedes elegir "Importar solo filas válidas".

## ⚙️ Detalles Técnicos del Backend

La extensión utiliza dos rutas principales definidas en `src/index.ts`:

1. `POST /excel-importer-api/validate`:

    - Inicia una transacción de base de datos.

    - Procesa el Excel e intenta insertar los registros.

    - Captura errores por fila.

    - **Siempre hace ROLLBACK** de la transacción al final, por lo que no se guardan datos, solo se verifica la integridad.

2. `POST /excel-importer-api/import`:

    - Realiza el mismo proceso que la validación.

    - Si la validación es exitosa (o si se permite importación parcial), realiza el `createMany` y **confirma (COMMIT)** los datos en la base de datos.