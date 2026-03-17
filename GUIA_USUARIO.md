# FeatherTalk — Guia de usuario

Guia rapida para usar FeatherTalk, la app de dictado local.

---

## Como acceder al menu

FeatherTalk vive en la **bandeja del sistema** (system tray):

- **Windows**: Busca un pequeno circulo en la esquina inferior derecha de la barra de tareas, junto al reloj. Si no lo ves, haz click en la flecha `^` para mostrar iconos ocultos.
- **macOS**: Busca un pequeno circulo en la barra de menu superior, a la derecha.

**Click derecho** sobre ese icono para abrir el menu con todas las opciones. Tambien puedes abrir el menu con el atajo `Ctrl+Win+H` desde cualquier lugar.

> El widget flotante (el anillo animado que aparece al grabar) NO es clickeable — es solo visual. Toda la interaccion se hace desde el icono de la bandeja o con atajos de teclado.

---

## Atajos de teclado


| Accion                  | Windows          | macOS       |
| ----------------------- | ---------------- | ----------- |
| Iniciar/detener dictado | `Ctrl+Win+Space` | `⌘+⌃+Space` |
| Modo Default            | `Ctrl+Win+1`     | `⌘+⌃+1`     |
| Modo Email              | `Ctrl+Win+2`     | `⌘+⌃+2`     |
| Modo Bullet             | `Ctrl+Win+3`     | `⌘+⌃+3`     |
| Modo Coding             | `Ctrl+Win+4`     | `⌘+⌃+4`     |
| Cambiar modo (ciclar)   | `Ctrl+Win+M`     | `⌘+⌃+M`     |
| Deshacer pegado         | `Ctrl+Win+Z`     | `⌘+⌃+Z`     |
| Reintentar limpieza     | `Ctrl+Win+R`     | `⌘+⌃+R`     |
| Cancelar grabacion      | `Escape`         | `Escape`    |
| Abrir menu de bandeja   | `Ctrl+Win+H`     | `⌘+⌃+H`     |


Si el hotkey principal (`Ctrl+Win+Space`) esta ocupado por otra app, FeatherTalk intenta automaticamente con alternativas: `Ctrl+Shift+Space`, `Ctrl+Alt+Space`, `Ctrl+Space`.

Puedes personalizar el hotkey principal desde **Configuracion** (menu de bandeja > Abrir settings).

---

## Flujo de dictado

1. **Presiona el hotkey** — aparece el widget animado y comienza a grabar tu voz.
2. **Habla normalmente** — soporta espanol, ingles y mezcla de ambos.
3. **Presiona el hotkey de nuevo** — la grabacion se detiene y el audio se envia a Parakeet ASR.
4. **Limpieza automatica** — el texto se limpia con Llama (LLM local) segun el modo activo.
5. **Pegado automatico** — el texto limpio se pega en la app donde esta tu cursor.

Si quieres **cancelar** mientras grabas, presiona `Escape`.

Si el resultado no es bueno:

- `Ctrl+Win+Z` — deshace el pegado y restaura el clipboard anterior.
- `Ctrl+Win+R` — reintenta la limpieza con el LLM (puedes cambiar de modo antes).

---

## Modos de limpieza


| Modo        | Que hace                                                                               |
| ----------- | -------------------------------------------------------------------------------------- |
| **Default** | Limpieza minima: puntuacion, mayusculas, quita muletillas. Preserva tu texto original. |
| **Email**   | Convierte el dictado en un email profesional corto.                                    |
| **Bullet**  | Convierte el dictado en una lista de puntos concisos.                                  |
| **Coding**  | Limpieza minima preservando identificadores, APIs, variables y terminos tecnicos.      |


Cambia de modo con `Ctrl+Win+1-4`, con `Ctrl+Win+M` para ciclar, o desde el menu de la bandeja.

---

## Icono de la bandeja — significado de colores


| Color                | Estado                                            |
| -------------------- | ------------------------------------------------- |
| Gris (circulo vacio) | **Listo** — esperando tu hotkey                   |
| Rojo (circulo lleno) | **Grabando** — microfono activo                   |
| Verde (dona)         | **Procesando** — transcribiendo o limpiando texto |
| Naranja (X)          | **Error** — algo fallo, revisa la notificacion    |
| Amarillo (!)         | **Advertencia** — un servicio no esta disponible  |


---

## Menu de la bandeja (click derecho en el icono o `Ctrl+Win+H`)


| Opcion                | Que hace                                                  |
| --------------------- | --------------------------------------------------------- |
| Copiar ultimo dictado | Copia el resultado mas reciente al clipboard              |
| Modo                  | Submenu para cambiar entre Default, Email, Bullet, Coding |
| Idioma                | Submenu para elegir Auto, Espanol o English               |
| Servicios             | Muestra estado de ASR y Llama (click para refrescar)      |
| Ver atajos de teclado | Abre ventana con referencia de hotkeys                    |
| Abrir settings        | Abre la ventana de configuracion                          |
| Abrir carpeta de logs | Abre la carpeta con los archivos de log                   |
| Salir                 | Cierra FeatherTalk                                        |


---

## Configuracion

Accede desde el menu de bandeja > **Abrir settings**. Opciones disponibles:

### General

- **Hotkey principal** — la combinacion de teclas para iniciar/detener dictado.
- **Modo de limpieza** — modo por defecto.
- **Idioma** — Auto, Espanol o English. Auto detecta automaticamente.
- **Beeps de audio** — sonidos de confirmacion al grabar/procesar.
- **Vista previa antes de pegar** — revisa el texto limpio antes de que se pegue.

### Audio

- **Microfono** — nombre o ID del dispositivo de audio. Dejar vacio usa el predeterminado del sistema.
- **Ruta ffmpeg** — ruta al ejecutable ffmpeg para captura de audio.
- **Fallback DSHOW** — si WASAPI falla, intentar con DSHOW como respaldo.

### ASR (reconocimiento de voz)

- **ASR Worker URL** — URL del servidor Parakeet local (default: `http://127.0.0.1:8787`).
- **Modelo ASR** — modelo de reconocimiento (default: `parakeet-tdt-0.6b`).
- **Compute** — Auto detecta GPU; usa CPU como respaldo.
- **Timeout** — tiempo maximo de espera en milisegundos.

### Llama (limpieza de texto)

- **Backend** — Ollama o llama.cpp.
- **Modelo** — modelo LLM a usar (default: `llama3.1:8b`).
- **Ollama Base URL** — URL del servidor Ollama (default: `http://127.0.0.1:11434`).
- **llama.cpp Base URL** — URL del servidor llama.cpp (default: `http://127.0.0.1:8080`).
- **Timeout** — tiempo maximo de espera.
- **Num predict** — maximo de tokens a generar.

### Widget

- **Posicion** — top-center, top-left o top-right. Tambien puedes arrastrarlo con el grip superior.
- **Tamano** — Pequeno, Mediano o Grande.

### Historial

- **Guardar historial** — activa o desactiva el guardado de dictados.
- **Retencion** — dias que se conservan los dictados.

Archivo de configuracion: `%LOCALAPPDATA%\FeatherTalk\config\settings.json`

---

## Tips y solucion de problemas

### No encuentro el icono de FeatherTalk

En Windows, busca en la bandeja del sistema (esquina inferior derecha). Si no aparece, haz click en la flecha `^` para ver iconos ocultos. Puedes arrastrar el icono de FeatherTalk fuera para que siempre sea visible.

### El widget aparece pero no puedo hacerle click

El widget es solo visual (animacion del anillo). Toda la interaccion es por atajos de teclado o click derecho en el icono de la bandeja. El unico elemento clickeable del widget es la barra superior para arrastrarlo.

### No se pega el texto en mi app

Algunas apps con permisos elevados (ejecutadas como administrador) bloquean el pegado automatico. El texto queda en el clipboard — pegalo manualmente con `Ctrl+V`.

### Servicios no disponibles

Verifica que Parakeet ASR y Ollama esten corriendo antes de usar FeatherTalk. Haz click en "Servicios" en el menu de bandeja para refrescar el estado.

### GPU no disponible

FeatherTalk usa GPU (CUDA) por defecto para ASR. Si no detecta GPU, reintenta automaticamente con CPU. Puedes forzar CPU desde Configuracion > ASR > Compute.

### Deteccion de idioma incorrecta

En modo "Auto", FeatherTalk detecta espanol o ingles automaticamente. Si notas sesgo hacia un idioma, selecciona el idioma manualmente desde el menu de bandeja > Idioma.

### Diagnosticar problemas de microfono

Ejecuta `npm run diagnose:mic` en la terminal para ver informacion detallada de los dispositivos de audio disponibles.

### Donde estan los logs

Accede desde el menu de bandeja > **Abrir carpeta de logs**. Los logs incluyen tiempos detallados de cada etapa del pipeline. Ruta: `%LOCALAPPDATA%\FeatherTalk\logs\app.log`

---

## Variables de entorno (avanzado)


| Variable                      | Descripcion                                    |
| ----------------------------- | ---------------------------------------------- |
| `FEATHERTALK_AUDIO_MODE=stub` | Usa un grabador stub (para desarrollo/testing) |
| `FEATHERTALK_ASR_URL`         | Override de la URL del servidor ASR            |
| `FEATHERTALK_OLLAMA_URL`      | Override de la URL de Ollama                   |
| `FEATHERTALK_FFMPEG_PATH`     | Override de la ruta a ffmpeg                   |
| `FEATHERTALK_LLAMA_MODEL`     | Override del modelo LLM                        |


