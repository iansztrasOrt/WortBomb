# Licencias de las fuentes del diccionario

`dictionary.es.txt` y `dictionary.es-uso.txt` se generan con `npm run build:dict` a partir de las
fuentes de abajo. Todas permiten redistribuir el resultado. Los archivos tienen una palabra por
línea, ya normalizada (minúsculas, sin tildes, con ñ).

## 1. Diccionarios de LibreOffice / RLA-ES (núcleo)

- **Qué es:** el proyecto RLA-ES (diccionarios de corrección ortográfica de español para LibreOffice y
  OpenOffice), de Santiago Bosio y colaboradores. Se usa la versión general (`es`) y las 22 variantes
  regionales: Argentina, Bolivia, Chile, Colombia, Costa Rica, Cuba, República Dominicana, Ecuador,
  España, Guatemala, Honduras, México, Nicaragua, Panamá, Perú, Filipinas, Puerto Rico, Paraguay,
  El Salvador, Estados Unidos, Uruguay y Venezuela.
- **Dónde está:** https://github.com/sbosio/rla-es, empaquetado en npm como `dictionary-es` y
  `dictionary-es-XX` (https://github.com/wooorm/dictionaries).
- **Licencia:** triple licencia, a elección: GPL-3.0, LGPL-3.0 o MPL-1.1. Permiten copiar, modificar y
  redistribuir. Las formas expandidas se distribuyen bajo esas mismas licencias. La "fuente" son los
  archivos .aff y .dic de esos paquetes, y el script que los expande es `scripts/build-dictionary.js`.

## 2. Lista Letterpress (núcleo)

- **Qué es:** el paquete npm `an-array-of-spanish-words` (https://github.com/words/an-array-of-spanish-words),
  con unas 636.000 palabras.
- **De dónde sale:** de la lista pública de palabras del juego Letterpress (atebits).
- **Licencia:** MIT. Permite usar, copiar y redistribuir con aviso de copyright.

## 3. Formas atestiguadas por uso (`dictionary.es-uso.txt`)

- **Qué es:** la lista de frecuencias de palabras en español de OpenSubtitles 2018, de Hermit Dave
  (https://github.com/hermitdave/FrequencyWords).
- **Licencia:** CC BY-SA 4.0 para los datos. Permite redistribuir con atribución y bajo la misma
  licencia. Por eso esas formas van en un archivo aparte, `dictionary.es-uso.txt`, que se
  distribuye bajo CC BY-SA 4.0.
- **Cómo se usa:** NO se agrega la lista en bruto (trae nombres, palabras en inglés y errores). Solo
  entran formas que:
  - derivan de una palabra del núcleo por una regla del español: pronombres pegados a infinitivos,
    gerundios o imperativos; diminutivos, aumentativos y superlativos; adverbios en "-mente";
    prefijos;
  - y además aparecen usadas varias veces;
  - y pasan filtros de ortografía, de nombres propios, de inglés y de errores de tipeo.

## 4. Archivos propios (dominio público / MIT del proyecto)

- `extra-lemmas.txt`: regionalismos y palabras que se flexionan como un modelo.
- `extra-words.txt`: palabras sueltas.
- `blocklist.txt` y `abbreviations.txt`: palabras que se excluyen.
- `control-words.txt` y `control-misspellings.txt`: listas de control de calidad.
