<p align="center">
  <img src="./app/icon.svg" width="104" alt="Logotipo de Studio Map OS" />
</p>

<h1 align="center">Studio Map OS</h1>

<p align="center"><strong>SISTEMA OPERATIVO PARA PROYECTOS CREATIVOS</strong></p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja.md">日本語</a> · <strong>Español</strong> · <a href="./README.pt-BR.md">Português</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.tr.md">Türkçe</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.th.md">ไทย</a>
</p>

<p align="center">
  <strong>Haz que un estudio de una sola persona funcione como un equipo completo.</strong><br />
  Un sistema operativo visual y local-first para proyectos, dirigido a creadores independientes y empresas unipersonales.
</p>

<p align="center">
  <a href="https://kunito01.github.io/SMOS/login/"><img src="./docs/readme/live-demo.svg" alt="Abrir la demo en vivo" /></a>
  <a href="https://github.com/kunito01/SMOS/releases/latest"><img src="./docs/readme/download-pwa.svg" alt="Descargar la PWA portátil" /></a>
</p>

<p align="center">
  <a href="https://github.com/kunito01/SMOS/stargazers"><img src="https://img.shields.io/github/stars/kunito01/SMOS?style=flat-square&color=03b5aa" alt="Estrellas en GitHub" /></a>
  <a href="https://github.com/kunito01/SMOS/forks"><img src="https://img.shields.io/github/forks/kunito01/SMOS?style=flat-square&color=ffca0a" alt="Forks en GitHub" /></a>
  <a href="https://github.com/kunito01/SMOS/issues"><img src="https://img.shields.io/github/issues/kunito01/SMOS?style=flat-square&color=f7567c" alt="Issues en GitHub" /></a>
  <img src="https://img.shields.io/badge/Next.js-15-1c2328?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-03b5aa?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/PWA-installable-5a0fc8?style=flat-square&logo=pwa&logoColor=white" alt="PWA instalable" />
  <img src="https://img.shields.io/badge/data-local--first-e9e5df?style=flat-square" alt="Datos local-first" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-03b5aa?style=flat-square" alt="Apache License 2.0" /></a>
</p>

---

## Descripción general

Studio Map OS conecta marcas, grupos de proyectos, proyectos, personas, software, costes, cronogramas, hitos de lanzamiento y archivos en un único espacio de trabajo visual. Ayuda a los creadores independientes a gestionar varios proyectos en paralelo sin reducir el proceso creativo a una lista de tareas genérica.

La versión actual es una PWA instalable y local-first. Los datos de negocio permanecen en el dispositivo, se cifran con Web Crypto y se almacenan de forma persistente en IndexedDB. Están integrados el Web App Manifest, el Service Worker, la página alternativa sin conexión, los iconos de la aplicación y el flujo de empaquetado independiente. Las cuentas, las claves de recuperación y las copias de seguridad también se gestionan en el navegador; todavía no hay conexión con un backend empresarial remoto ni con un sistema de autenticación de servidor.

## Capturas de pantalla

![Vista general del panel de Studio Map OS](./docs/screenshots/01.png)

![Vista del espacio de trabajo de un proyecto en Studio Map OS](./docs/screenshots/02.png)

![Vista de gestión de Studio Map OS](./docs/screenshots/03.png)

## Capacidades principales

| Operaciones de proyectos | Control local de los datos |
| --- | --- |
| Ámbitos de panel para todo el estudio, por marca y por grupo de proyectos | Cuentas locales y claves de recuperación del espacio de trabajo |
| Estado, fases, tareas, cronogramas y lanzamientos de los proyectos | Registros cifrados del espacio de trabajo en IndexedDB |
| Presupuestos por fase, cuentas por cobrar y totales en varias divisas | Copias de seguridad cifradas del dispositivo, del espacio de trabajo y de proyectos |
| Bibliotecas de personas, suscripciones de software y plantillas de costes | Migración de datos heredados del navegador y recuperación transaccional |
| Archivo, restauración y eliminación permanente de proyectos | Instantáneas compartidas de solo lectura con control por campos |
| Diseños para escritorio, tableta y móviles estrechos | PWA instalable, página alternativa sin conexión y once idiomas de interfaz |

## Funciones principales

- **Marcas y grupos de proyectos** — crea marcas diferenciadas y organiza el trabajo con tipos reutilizables de grupos de proyectos.
- **Espacios de trabajo de proyectos** — realiza el seguimiento del estado, las fases, los objetivos, las tareas, las personas, las herramientas, los materiales, las versiones y los registros de actividad.
- **Cronogramas visuales** — configura las fechas de las fases, las tareas, los responsables, las herramientas, las notas y las filas personalizadas de cada proyecto.
- **Presupuestos estructurados** — planifica por fase el personal, los viajes, los gastos diarios, la externalización, los costes adicionales y el software, incluidos impuestos e imprevistos.
- **Costes y cuentas por cobrar** — consolida presupuestos, costes reales, suscripciones de software y calendarios de pago de proyectos.
- **Bibliotecas reutilizables** — gestiona personas, herramientas de software, suscripciones y plantillas de costes.
- **Archivo y portabilidad** — archiva proyectos, exporta un proyecto concreto o crea una copia de seguridad de todos los datos de Studio Map OS en el navegador.
- **Uso compartido de solo lectura** — elige si una instantánea del proyecto incluye cronogramas, entregables, personas, herramientas, materiales, versiones y vistas previas de costes.
- **Interfaz internacional** — utiliza la aplicación en inglés, chino simplificado, japonés, español, portugués, alemán, francés, ruso, turco, coreano o tailandés.

## Tecnología

- Next.js 15 con App Router
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide Icons
- Serwist Service Worker
- Web Crypto API
- IndexedDB y Local Storage

## Compatibilidad PWA

Studio Map OS incluye una estructura completa de integración PWA:

- Un Web App Manifest con el modo de visualización `standalone` y `/login` como URL de inicio.
- Iconos de 192×192 y 512×512, además de iconos maskable y Apple Touch.
- Registro automático del Service Worker y almacenamiento en caché en tiempo de ejecución mediante Serwist.
- Precarga en caché de la raíz, el inicio de sesión, el registro, la página sin conexión, el manifest, el recurso de marca y los iconos PWA.
- Una página alternativa para la navegación de documentos en `/offline`.
- Metadatos para la pantalla de inicio de iOS, colores del tema y `viewport-fit=cover`.
- Un paquete PWA portátil que contiene el servidor independiente de Next.js, los recursos estáticos y un script de inicio.

> [!NOTE]
> El modo de desarrollo desactiva el Service Worker para evitar que las cachés obsoletas interfieran con el desarrollo. Verifica la instalación, el almacenamiento en caché y el funcionamiento sin conexión con una compilación de producción en `localhost` o HTTPS.

## Primeros pasos

### Requisitos

- Se recomienda Node.js 20 LTS
- npm
- Un navegador moderno compatible con Web Crypto e IndexedDB

### Instalación y ejecución

```bash
git clone https://github.com/kunito01/SMOS.git
cd SMOS
npm install
npm run dev
```

Abre [http://localhost:3000/register](http://localhost:3000/register) para crear la primera cuenta local.

En el primer uso:

1. Introduce un nombre, una dirección de correo electrónico y una contraseña de al menos ocho caracteres.
2. Crea un nuevo espacio de trabajo.
3. Copia o descarga inmediatamente la clave de recuperación de 16 dígitos que se genera para el espacio de trabajo.
4. Confirma que la clave de recuperación está guardada en un lugar seguro antes de entrar en el espacio de trabajo.

> [!IMPORTANT]
> La clave de recuperación no se almacena como texto sin formato junto con la cuenta. Si se pierden tanto la contraseña como la clave de recuperación y no queda ninguna copia de seguridad utilizable, es posible que los datos del espacio de trabajo no puedan recuperarse.

Las cuentas locales existentes pueden iniciar sesión en [http://localhost:3000/login](http://localhost:3000/login). No existe ninguna cuenta preconfigurada que acepte una contraseña arbitraria.

### Modo de producción y verificación de la PWA

```bash
npm run build
npm run start
```

Abre [http://localhost:3000/login](http://localhost:3000/login) en un navegador compatible con PWA para inspeccionar el Manifest, el Service Worker y el punto de entrada de instalación. Los navegadores consideran `localhost` un contexto seguro; los despliegues de producción deben utilizar HTTPS.

### Creación de un paquete PWA portátil

```bash
npm run package:pwa
```

El paquete se escribe en `output/pwa/studio-map-os-pwa/`. Incluye el servidor independiente, los recursos PWA y scripts de inicio para Windows (`START_STUDIO_MAP_OS.bat`), macOS (`START_STUDIO_MAP_OS.command`) y terminales Linux/macOS (`START_STUDIO_MAP_OS.sh`). Todos los iniciadores utilizan `127.0.0.1:3002` de forma predeterminada.

## Rutas principales

| Ruta | Finalidad |
| --- | --- |
| `/register` | Crear una cuenta local y un espacio de trabajo, o unirse a uno mediante una copia de seguridad cifrada |
| `/login` | Desbloquear una cuenta local o restaurar una copia de seguridad completa del dispositivo |
| `/offline` | Página alternativa para documentos cuando falla la navegación del Service Worker |
| `/dashboard` | Vista general del estudio, ámbitos, métricas y mapas de proyectos |
| `/companies` | Gestión de marcas y grupos de proyectos |
| `/company/?companyId=...` | Detalles de la marca y resúmenes de los proyectos vinculados |
| `/projects` | Todos los proyectos activos |
| `/project/?projectId=...` | Estado, cronograma, lanzamientos, cuentas por cobrar y ajustes del proyecto |
| `/project-costs/?projectId=...` | Detalles del presupuesto y los costes del proyecto |
| `/project-share/?projectId=...` | Ajustes de los campos compartidos en modo de solo lectura |
| `/costs` | Totales de costes de todo el estudio y ajustes de la divisa de visualización |
| `/libraries` | Bibliotecas de personas, suscripciones de software y plantillas de costes |
| `/archive` | Proyectos archivados y recuperación de copias de seguridad del dispositivo y del espacio de trabajo |
| `/share/?token=...` | Instantánea local del proyecto en modo de solo lectura |

## Modelo de datos y seguridad

```text
Páginas de React
    ↓
Adaptadores locales en lib/api
    ↓
Base de datos de negocio en memoria
    ↓
Cifrado con Web Crypto
    ↓
Persistencia en IndexedDB
```

- Los datos de negocio se aíslan por espacio de trabajo y se guardan como registros cifrados en IndexedDB.
- Una contraseña desbloquea la clave maestra protegida del espacio de trabajo; la clave maestra solo se utiliza en memoria después de iniciar sesión.
- La clave de recuperación de 16 dígitos permite recuperar la clave maestra del espacio de trabajo y desbloquear archivos de copia de seguridad cifrados.
- Los registros del espacio de trabajo y los contenedores de copias de seguridad emplean criptografía del navegador, incluidos PBKDF2, HKDF y AES-GCM.
- Una copia de seguridad completa del dispositivo contiene las cuentas locales, los espacios de trabajo, las preferencias y las instantáneas cifradas de la base de datos. Las exportaciones de espacios de trabajo y proyectos también están cifradas.
- Los navegadores pueden rechazar las solicitudes de almacenamiento persistente, por lo que las copias de seguridad cifradas siguen siendo una parte esencial de la protección de los datos.

> [!WARNING]
> Estos mecanismos no se han sometido a una auditoría de seguridad independiente. No sustituyen a la gestión profesional de claves, las copias de seguridad de servidor ni los sistemas de identidad empresariales.

## Costes en varias divisas

Las divisas actuales de cálculo y visualización son:

- CNY — yuan chino
- USD — dólar estadounidense
- JPY — yen japonés
- EUR — euro

El navegador obtiene directamente los tipos de referencia del servicio Frankfurter respaldado por el Banco Central Europeo (BCE); si la solicitud falla, la aplicación recurre a una caché reciente del navegador o a los tipos integrados. Los tipos de cambio están destinados a estimaciones internas del estudio, no a liquidaciones ni a asesoramiento financiero.

## Archivos de copia de seguridad

| Tipo | Contenido | Nombre de archivo habitual |
| --- | --- | --- |
| Copia de seguridad completa del dispositivo | Todas las cuentas locales, los espacios de trabajo, las preferencias y los datos cifrados | `studio-map-os-*.smos-backup.json` |
| Copia de seguridad del espacio de trabajo | Datos de negocio y preferencias del espacio de trabajo actual | `studio-map-os-workspace-*.smos-backup.json` |
| Archivo de proyecto | Instantánea de un proyecto | `studio-map-os-project-*.smos-project.json` |

Comprueba el tipo de copia de seguridad y la clave de recuperación antes de restaurar. Restaurar una copia completa del dispositivo puede reemplazar los datos existentes de Studio Map OS en el navegador actual.

## Límites actuales del uso compartido público

Los registros compartidos de solo lectura permanecen actualmente en el navegador y en el origen del sitio web que los generó. Una URL compartida puede abrirse de forma local, pero los datos no se publican automáticamente en un servidor remoto. Por ello:

- Un enlace puede dejar de funcionar en otro navegador, después de borrar los datos del sitio o en otro dispositivo.
- Esta función aún no equivale a una página pública alojada en Internet.
- El uso compartido entre dispositivos requerirá almacenamiento remoto, control de acceso e infraestructura de revocación.

## Internacionalización

La interfaz admite once idiomas. Cuando una clave específica no está disponible, los archivos de configuración regional recurren al inglés; los diccionarios de ruso y turco cubren actualmente todas las claves de traducción. Se agradecen mejoras de cobertura y redacción mediante Issues y Pull Requests.

## Estructura del proyecto

```text
app/                  Rutas de Next.js, Manifest, Service Worker y puntos de entrada de la PWA estática
components/           Páginas, módulos de producto, diseño y UI compartida
lib/api/              Adaptadores locales de la API de negocio
lib/i18n/             Diccionarios de la interfaz y etiquetas de dominio
lib/mock/             Datos de demostración y lógica de agregación
lib/security/         Cifrado del espacio de trabajo y del uso compartido público
lib/storage/          IndexedDB y compatibilidad con almacenamiento persistente
lib/types/            Modelos de dominio
lib/utils/            Utilidades de presupuestos, divisas, fases y lanzamientos
public/               Recursos de marca, iconos PWA y paquetes Worker generados
scripts/              Scripts de compilación y empaquetado de la PWA portátil
```

## Comprobaciones de calidad

```bash
npm run lint
npx tsc --noEmit --incremental false
```

El repositorio todavía no incluye pruebas unitarias ni pruebas end-to-end automatizadas. Los cambios relacionados con el cifrado, la migración, la recuperación o los cálculos presupuestarios deben someterse a verificaciones adicionales antes de integrarse.

## Limitaciones actuales

- Las API de negocio siguen siendo adaptadores locales del navegador; no hay ningún backend de servidor de producción conectado.
- Los proyectos nuevos heredan partes de la estructura del proyecto de demostración en lugar de partir de una plantilla completamente vacía.
- Los flujos de edición de costes reales, materiales y registros de actividad todavía no están disponibles por completo.
- Aún falta conectar los detalles de los grupos de proyectos, la revocación del uso compartido y los controles de caducidad de enlaces.
- Después de actualizar la página por completo, es necesario volver a introducir la contraseña para desbloquear el espacio de trabajo.
- La compatibilidad PWA está integrada, pero aún no se han configurado pruebas automatizadas de Lighthouse, del flujo de instalación ni pruebas end-to-end sin conexión.
- Las páginas dinámicas no almacenadas en caché y los endpoints de red en tiempo real pueden seguir sin estar disponibles cuando no hay conexión; la página alternativa sin conexión y los datos locales no sustituyen a las API remotas.

## Contribuciones

Se aceptan Issues y Pull Requests. Antes de enviar un cambio:

1. Describe la página, el modelo de datos o el alcance de migración afectados.
2. Comprueba tanto el diseño de escritorio como el de pantallas estrechas.
3. Ejecuta ESLint y la comprobación de TypeScript.
4. Documenta la compatibilidad con versiones anteriores y la recuperación de copias de seguridad cuando cambie el formato de los datos.

## Licencia y derechos de autor

Este proyecto se distribuye bajo la Apache License 2.0. Consulta [LICENSE](./LICENSE) para obtener más información. Puedes utilizar, copiar, modificar y distribuir el proyecto conforme a los términos de la licencia.

<p align="center">
  <strong>Studio Map OS</strong><br />
  Copyright © 2026 Colorinu Games Limited. Todos los derechos reservados.<br />
  <a href="mailto:kunito.world@icloud.com">kunito.world@icloud.com</a>
</p>
