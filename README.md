# wORTbomb 💣

Juego online por salas: los jugadores forman una ronda y se pasan una bomba. En tu turno aparece una sílaba
(como `ion`, `tr` o `güe`) y tenés que escribir una palabra en español que la contenga antes de que explote.
Si explota, perdés una vida. El último que queda con vidas gana.

Tiene identidad visual propia: no usa assets, logos ni textos de otros juegos, solo la mecánica de "pasar la bomba".

## Cómo se juega

1. En el inicio elegís **apodo y avatar** (color, carita y accesorio). Después podés:
   - tocar **⚡ Jugar rápido** para entrar a una sala pública con lugar;
   - **crear una sala**;
   - **unirte con el código** de 5 letras o con un link `https://…/sala/CODIGO`.
2. En la **sala de espera**, el líder 👑 ajusta las reglas y toca **¡Empezar!** (hacen falta al menos 2 jugadores). Los ajustes son:
   - vidas por jugador y vidas máximas;
   - largo mínimo de palabra;
   - mecha inicial y mecha mínima;
   - minuto en que arranca la muerte súbita;
   - sala pública o privada, contraseña y filtro de insultos.
3. Cuando te toca, **ya podés escribir**: el campo tiene el foco (no hay que tocar nada) y la sílaba aparece resaltada mientras escribís. Apretás **Enter**.
4. Los demás ven en vivo lo que escribís.

**Reglas**

| Regla | Detalle |
|---|---|
| La palabra | Tiene que existir, contener la sílaba en cualquier posición y **no haber sido usada en la partida**. |
| **Regla de oro** | Una palabra aceptada no se puede volver a usar en toda la partida, ni por vos ni por otro. Tampoco cambiándole mayúsculas, tildes o espacios. Si lo intentás, la mecha sigue y no perdés vida. Formas distintas sí valen (`casa`/`casas`, `canto`/`cantaba`). |
| Sin tildes | `cancion` = `canción`. La **ñ** sí cuenta como letra distinta (`año` ≠ `ano`). |
| Si te explota | Perdés una vida y la bomba pasa al siguiente **con la misma sílaba**. Si él tampoco la sabe, sale una sílaba nueva. Sin vidas, quedás eliminado y mirás desde la tribuna, con un chat propio para no spoilear. |
| La mecha se acorta, de a poco | Con el **tiempo de partida**: un 5 % menos por minuto. Con **cada vida perdida** en la ronda: un 3 % menos, y un 5 % más por cada eliminado. Arriba se ve el **nivel de peligro** (1 a 10). |
| Muerte súbita | Si la partida se alarga, el último minuto aparece una **cuenta regresiva**. Al llegar a cero, la pantalla se pone roja: todos quedan con **1 vida** y la bomba va el doble de rápido. |
| Bonus de alfabeto | Cada palabra tacha sus letras. Completar todas da +1 vida, hasta el máximo (en muerte súbita, no). |

El **tutorial animado** se abre la primera vez y desde "¿Cómo se juega?" en el inicio o "Tutorial" en la sala. Cada regla tiene una escenita: la bomba que pasa, la sílaba que pasa al siguiente, la mecha, el bonus y la muerte súbita.

## Instalación y scripts

Requisitos: Node 18.17 o más nuevo (recomendado Node 22).

```bash
npm install
```

```bash
npm start
```

Después abrí http://localhost:3000 en varias pestañas.

| Script | Qué hace |
|---|---|
| `npm start` | Servidor de producción (Express + Socket.IO). |
| `npm run dev` | Igual, pero se reinicia al cambiar archivos. |
| `npm test` | 66 tests (Vitest). Cubren: normalización, palabras usadas, sílabas, mecha, sílaba que pasa al siguiente, muerte súbita, turnos, bonus, geometría de la ronda (nada se tapa), diccionario real y servidor con clientes Socket.IO. |
| `npm run build:dict` | Regenera el diccionario y las sílabas, y corre el control de calidad. |
| `npm run check:dict` | Solo el control de calidad del diccionario. |
| `npm run reports` | Muestra las palabras que reportaron los jugadores como faltantes. |
| `npm run e2e` | Partida completa con 3 navegadores reales (necesita Playwright). |
| `node scripts/layout-check.js` | Mide en el navegador que nada se superponga, de 2 a 16 jugadores, en compu y celular (necesita Playwright). |

### Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | 3000 | Puerto HTTP. |
| `PERSIST_FILE` | (vacío) | Archivo JSON donde se guardan las salas cada 5 s (incluye partida, palabras usadas y reloj) para recuperarlas si el servidor se reinicia. |
| `REPORTS_FILE` | `data/reports/missing-words.jsonl` | Reportes de palabras que faltan. |
| `MAX_ROOMS` | 500 | Tope de salas simultáneas. |
| `LOG_LEVEL` | info | `debug`, `info` o `error`. |

Healthcheck: `GET /healthz` responde con salas, jugadores, tamaño del diccionario y memoria. Lista pública: `GET /api/salas`.

## Despliegue en Render (gratis)

1. Subí la carpeta a un repositorio de GitHub. Los archivos `data/dictionary*.txt` y `data/syllables.json` tienen que estar incluidos (pesan unos 13 MB).
2. En Render, entrá a **New → Blueprint** y elegí el repositorio. El `render.yaml` ya trae Node 22, el plan gratis, el healthcheck y el límite de memoria.
3. Abrí la URL que te da Render. En el plan gratis, la primera carga después de un rato sin uso tarda unos 30 a 60 s.

En **Railway** es lo mismo: `npm install` y `npm start`, con la variable `PORT` que pone Railway.

**Memoria:** el diccionario cargado ocupa unos 80 MB y el proceso completo unos 180 MB, así que entra en los 512 MB del plan gratis. El servidor informa ambos valores al arrancar y en `/healthz`.

## Diccionario

**1.020.037 formas** en español, ya normalizadas: minúsculas, sin tildes y con ñ.

| Archivo | Formas | Licencia |
|---|---|---|
| `data/dictionary.es.txt` (núcleo) | 1.010.760 | GPL/LGPL/MPL y MIT, según la fuente |
| `data/dictionary.es-uso.txt` (formas de uso real) | 9.277 | CC BY-SA 4.0 |

Están dentro del proyecto: el juego no descarga nada al funcionar y los carga en memoria en un `Set` (búsqueda O(1)) en menos de un segundo. El detalle de cada fuente y su licencia está en [`data/LICENSES.md`](data/LICENSES.md).

**Qué se aceptan:**
- plurales, femeninos y diminutivos y aumentativos de uso común;
- todas las conjugaciones;
- voseo: `tenés`, `sos`, `decime`, `poneme`, `andate`;
- pronombres pegados: `dámelo`, `diciéndoselo`, `hagámoslo`;
- regionalismos de toda Hispanoamérica y España.

**Cómo se genera** (`scripts/build-dictionary.js`):
1. **Diccionarios de LibreOffice (RLA-ES)**, el general y las 22 variantes regionales. Se expanden con un expansor de afijos hunspell propio (`scripts/hunspell.js`, equivalente a `unmunch`), así que salen todas las formas flexionadas.
2. **Regionalismos** de `data/extra-lemmas.txt`, que se flexionan como un modelo (`laburar = mandar`, `pibe = jefe`, `chido = alto`).
3. **Lista libre de Letterpress** (`an-array-of-spanish-words`, MIT): suma palabras del lemario general.
4. **Voseo con pronombres**, generado para todos los verbos.
5. **Formas de uso real** sacadas de la lista de frecuencias de OpenSubtitles. Entran solo si derivan de una palabra del núcleo por una regla del español (pronombres pegados a infinitivos, gerundios e imperativos; diminutivos; aumentativos; `-ísimo`; `-mente`; prefijos) y si aparecen usadas varias veces.

**Filtros:**
- ortografía española: nada de "q" sin "u", letras triples, consonantes dobles imposibles, "n" antes de "b" o "p", palabras sin vocales;
- abreviaturas (`data/abbreviations.txt`), nombres propios y palabras inglesas;
- errores de tipeo típicos (`nececito` → `necesito`);
- pretéritos vulgares con "-s" (`hicistes`, `dijistes`, `vistes`);
- `data/blocklist.txt` para vetar palabras a mano.

**Control de calidad** (`scripts/check-dictionary.js`, falla si algo no cumple):
- 500 palabras comunes de control que tienen que estar (cobertura mínima 99 %; hoy es 100 %);
- 95 errores de ortografía que no tienen que estar;
- categorías: conjugaciones, voseo, enclíticos, plurales, ñ y ü, diminutivos y regionalismos.

**Ajustes sin regenerar:** `data/extra-words.txt` agrega palabras y `data/blocklist.txt` las veta. Se aplican al arrancar el servidor.

**Reportar palabra que falta:** el botón está en la partida. El reporte se guarda en `data/reports/missing-words.jsonl` con la palabra, el jugador y la fecha, para que lo revise un administrador. **No habilita la palabra sola.** Para aceptarla, agregala a `extra-words.txt` (o a `extra-lemmas.txt` si se flexiona) y reiniciá.

**Sílabas** (`scripts/build-syllables.js` → `data/syllables.json`, 3.934 sílabas): son todas las subcadenas de 2 y 3 letras, con cuántas palabras las contienen según el largo mínimo de palabra de la sala.
- Al principio salen sílabas comunes (más de 1000 palabras y frecuentes en el habla).
- Con el tiempo se mezclan tramos más difíciles: 300 a 1000, 50 a 300 y 10 a 50 palabras.
- Nunca sale una sílaba con menos de N palabras sin usar en la partida (N = 5, ajustable).
- La misma sílaba solo se repite cuando pasa al siguiente después de una explosión.

## Arquitectura

**El servidor es la única fuente de verdad.** Elige sílabas, valida palabras, calcula la mecha, controla turnos, explosiones y muerte súbita, y lleva todos los temporizadores. El cliente solo manda lo que escribís y dibuja. La mecha se anima con la hora del servidor: se sincroniza al conectar con 5 mediciones de ida y vuelta, y cada turno trae su inicio, duración y vencimiento.

**Regla de no repetir:** `UsedWords.claim()` comprueba y agrega en el mismo paso síncrono. Si dos jugadores mandan la misma palabra "a la vez", el primero que llega la reclama y el segundo recibe "ya se usó". Una palabra rechazada nunca se registra. El Set se vacía solo al empezar una partida nueva o la revancha.

**Fórmula de la mecha** (`engine/constants.js`):

```
duración = max(MÍNIMO, INICIAL × 0,95^minutos × 0,97^vidasPerdidas × 0,95^eliminados) ± 10 %
muerte súbita: max(2 s, duración normal × 0,5)
```

El margen aleatorio nunca baja del mínimo. Hay una alternativa lineal documentada (`curve: 'linear'`).

**La ronda:** `engine/circle.js` calcula los ángulos (360° / jugadores vivos, empezando arriba y en sentido horario).
- **Decisión de diseño:** la vista se gira para que **vos quedes siempre abajo**.
- En pantallas muy altas o muy anchas la ronda es una elipse.
- El tamaño de avatares y etiquetas se adapta a la cantidad de jugadores, y la bomba busca un lugar libre junto al jugador activo.
- Los tests garantizan que avatares, nombres, corazones, bomba y sílaba **no se tapen nunca**, de 2 a 16 jugadores y en 7 tamaños de pantalla.

```
wortbomb/
├── engine/                 lógica pura, sin sockets (la usan el servidor, los tests y en parte el cliente)
│   ├── constants.js        ajustes, mecha, muerte súbita, tramos de sílabas, límites
│   ├── normalize.js        normalización y validación de formato
│   ├── dictionary.js       carga del diccionario en un Set
│   ├── syllables.js        banco de sílabas y selección por dificultad
│   ├── usedWords.js        palabras usadas (claim atómico)
│   ├── turn.js             validación en orden: formato → sílaba → diccionario → usada
│   ├── fuse.js             mecha, nivel de peligro y anuncios
│   ├── alphabet.js         bonus de alfabeto
│   ├── circle.js           geometría de la ronda (asientos, centro, bomba)
│   └── game.js             la partida (turnos, explosiones, muerte súbita, resultados)
├── server/
│   ├── index.js            Express + Socket.IO, /healthz, /api/salas, /sala/:código
│   ├── rooms.js            salas, líder, ajustes, chat por canal, votaciones y temporizadores
│   ├── sockets.js          sesiones por token, límites de tasa y tabla de eventos
│   ├── moderation.js       limpieza de textos, apodos, insultos, anti-ráfagas
│   └── persistence.js      guardado opcional en archivo y reportes
├── client/                 HTML + CSS + JavaScript modular (sin build)
│   ├── index.html, css/style.css, img/favicon.svg
│   └── js/  main.js (controlador) · net.js (socket y reloj) · home.js · room.js · game.js · arena.js (ronda)
│            bomb.js (bomba y explosión) · panels.js (chat, palabras, letras) · results.js · tutorial.js
│            audio.js (Web Audio) · avatar.js (SVG) · profile.js · i18n.js · ui.js
├── data/                   diccionario, sílabas, listas de ajuste y de control, licencias
├── scripts/                build-dictionary, hunspell, build-syllables, check-dictionary, show-reports, e2e, layout-check
└── tests/                  engine, circle, dictionary, server
```

### Eventos de Socket.IO

**Del cliente al servidor.** Los que llevan ✓ responden con `{ ok, error? }`. La sesión va en el handshake (`auth.token`).

| Evento | Payload | Qué hace |
|---|---|---|
| `time:sync` ✓ | — | Devuelve la hora del servidor (sincronización del reloj). |
| `lobby:list` ✓ | — | Lista de salas públicas. |
| `room:create` ✓ | `{ name, isPublic, password, maxPlayers, profile }` | Crea una sala y entra. |
| `room:join` ✓ | `{ code, password, profile }` | Entra con código. Si la partida ya empezó, entra como espectador. |
| `room:quick` ✓ | `{ profile }` | Sala pública con lugar, o una nueva. |
| `room:leave` ✓ | — | Sale de la sala. |
| `room:ready` ✓ | `{ ready }` | Indicador de "listo". |
| `room:settings` ✓ | `{ settings, name, isPublic, password, maxPlayers, filterChat }` | Ajustes (solo el líder). |
| `room:kick` ✓ | `{ playerId }` | Expulsar (solo el líder). |
| `room:start` ✓ | — | Empezar o revancha (solo el líder). |
| `profile:update` ✓ | `{ name, avatar }` | Cambiar apodo o avatar en la sala. |
| `vote:kick` ✓ | `{ playerId }` | Proponer expulsión por votación. |
| `vote:cast` ✓ | `{ voteId, yes }` | Votar (gana la mayoría). |
| `game:submit` ✓ | `{ text }` | Mandar una palabra. Fuera de turno se ignora y se registra. |
| `game:typing` | `{ text }` | Escritura en vivo (con límite de frecuencia). |
| `chat:send` ✓ | `{ text }` | Mensaje. Eliminados y espectadores escriben en su canal durante la partida. |
| `report:word` ✓ | `{ word, note }` | Reportar palabra que falta. |

**Del servidor al cliente:**

| Evento | Payload | Destino |
|---|---|---|
| `session` | `{ token, fresh }` | ese cliente |
| `room:state` | estado completo (sala, miembros, ajustes, partida, chat, votaciones, hora del servidor) | ese cliente: al entrar o reconectar |
| `room:members` | `{ members, leaderId }` | la sala |
| `room:settings` | `{ settings, name, isPublic, hasPassword, maxPlayers, filterChat }` | la sala |
| `room:kicked` | `{ reason }` | el expulsado |
| `chat:message` | `{ channel: 'main' \| 'dead', from \| system, text, at }` | la sala, o solo eliminados y espectadores |
| `vote:update` | `{ vote }` | la sala |
| `game:start` | `{ game, serverNow }` | la sala |
| `game:turn` | `{ turn: { n, playerId, syllable, fails, startedAt, duration, deadline, level, sudden }, reason, from, seats }` | la sala |
| `game:typing` | `{ playerId, text }` | la sala |
| `game:accept` | `{ playerId, word, entry, crossed, remaining, completed, gained, lives }` | la sala |
| `game:reject` | `{ playerId, reason, word, message, by }` | la sala |
| `game:explode` | `{ playerId, lives, cause, syllable }` | la sala |
| `game:eliminated` | `{ playerId, place, reason }` | la sala |
| `game:announce` | `{ text, level, seconds }`: la mecha se acortó | la sala |
| `game:countdown` | `{ suddenAt }`: falta 1 minuto para la muerte súbita | la sala |
| `game:sudden` | `{ seats }`: empieza la muerte súbita | la sala |
| `game:end` | `{ results: ranking, estadísticas, duración, peligro máximo }` | la sala |

## Moderación y robustez

- **Validación:** todo se valida en el servidor. Los textos tienen límite de largo y caracteres permitidos.
- **Límites de tasa por conexión:** palabras, escritura en vivo, chat, reportes y creación de salas por IP.
- **Anti-ráfagas:** se frena el mismo texto repetido muchas veces seguidas.
- **XSS:** el cliente muestra todo con `textContent` y nunca inserta HTML de usuarios.
- **Apodos y chat:** los apodos con insultos se rechazan, y el chat tiene un filtro opcional de insultos.
- **Expulsión:** la puede hacer el líder o la mayoría por votación.
- **Reconexión:**
  - el token se guarda en `localStorage`; si el mismo navegador abre otra pestaña, recibe su propio token;
  - si se desconecta el jugador que tiene la bomba, tiene 5 s de gracia; si no vuelve, la bomba le explota y sigue de largo;
  - a los 30 s sin volver, queda eliminado;
  - si el líder se va, el rol pasa al siguiente.
- **Limpieza y persistencia:** las salas vacías o inactivas se cierran solas. Con `PERSIST_FILE`, las salas sobreviven a un reinicio.

## Checklist de prueba manual (3 pestañas)

1. Pestaña A: elegí apodo y avatar, creá una sala, cambiá las vidas a 3 y guardá los ajustes.
2. Pestañas B y C: abrí el link `…/sala/CODIGO`. Las dos aparecen en la sala de A, con su avatar.
3. A toca **¡Empezar!**. Las tres ven la ronda, cada una consigo misma abajo, y la bomba junto al jugador activo con la mecha quemándose.
4. Cuando te toca, escribí **sin hacer clic**: las letras van al campo. Los demás ven lo que escribís.
5. Mandá una palabra válida: la bomba vuela al siguiente y la palabra aparece en "Palabras".
6. Otra pestaña intenta la misma palabra con mayúsculas o tildes: sale "Esa palabra ya se usó en esta partida (la usó …)", la mecha sigue y no pierde vida.
7. Dejá que explote: hay explosión, sacudida y corazón roto, y **el siguiente recibe la misma sílaba**. Si tampoco la sabe, sale una nueva.
8. Seguí jugando: la mecha y el nivel de peligro suben de a poco con el tiempo y con cada vida perdida.
9. Con la muerte súbita en 1 minuto (ajuste de la sala): aparece la cuenta regresiva, después la pantalla se pone roja, todos quedan con 1 vida y la bomba va más rápido.
10. Al quedar sin vidas pasás a la tribuna: el chat de eliminados no lo ven los vivos.
11. Cerrá una pestaña en su turno y volvé a abrirla en menos de 30 s: vuelve con todo el estado.
12. Al final: podio, estadísticas y **🔁 Jugar de nuevo**. El reloj y las palabras usadas vuelven a cero.
13. Probá en el celular: la ronda entra en la pantalla, con el teclado abierto el panel se esconde y nada se tapa.

## Limitaciones conocidas

- **Celular:** los navegadores no dejan abrir el teclado sin un toque. El campo queda enfocado entre turnos para que no se cierre, pero si se cerró hay que tocar el campo una vez.
- **Persistencia:** es en archivo. No hay Redis: no reparte salas entre varios servidores.
- **Diccionario:** aunque pasa los controles, puede tener alguna forma rara pero válida (sobre todo conjugaciones poco usadas o combinaciones de pronombres) y le puede faltar algún neologismo o regionalismo. Para eso está el botón de reporte y `extra-words.txt`.
- **Render gratis:** se duerme sin uso y las salas en memoria se pierden si se reinicia (salvo con `PERSIST_FILE` en un disco persistente).
