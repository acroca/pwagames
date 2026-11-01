import type { Lang } from './i18n';

export interface Example {
  /** Rows of space-separated tokens; see `renderExample` in guide.ts. */
  grid?: string[];
  /** Monospace drawing, for games that don't fit a grid. */
  pre?: string;
  caption: string;
}

export interface Guide {
  goal: string;
  rules: string[];
  controls: string[];
  examples: Example[];
  tips: string[];
}

type Bi<T> = { en: T; es: T };
type RawGuide = Omit<{ [K in keyof Guide]: Bi<Guide[K]> }, 'examples'> & { examples: Bi<Example>[] };

const ex = (grid: string[] | undefined, pre: string | undefined, en: string, es: string): Bi<Example> => ({
  en: { grid, pre, caption: en },
  es: { grid, pre, caption: es },
});

const RAW: Record<string, RawGuide> = {
  nonogram: {
    goal: {
      en: 'Reveal a hidden picture by deciding which squares are filled and which are empty.',
      es: 'Descubre una imagen oculta decidiendo qué casillas se rellenan y cuáles quedan vacías.',
    },
    rules: {
      en: [
        'The numbers beside a row (or above a column) are the lengths of its runs of consecutive filled squares, in order.',
        'Two runs are always separated by at least one empty square.',
        'A clue of 0 means the whole line is empty.',
        'When a line matches its clue exactly, its numbers turn grey.',
      ],
      es: [
        'Los números junto a una fila (o sobre una columna) son las longitudes de sus tramos de casillas rellenas consecutivas, en orden.',
        'Dos tramos siempre están separados por al menos una casilla vacía.',
        'Una pista de 0 significa que toda la línea está vacía.',
        'Cuando una línea cumple exactamente su pista, sus números se ponen grises.',
      ],
    },
    controls: {
      en: [
        'Pick Fill or Block at the bottom. Fill paints a square; Block marks a square you know is empty.',
        'Tap a square, or drag along a row or column to paint several at once.',
        'Dragging only changes squares in the same state as the first one you touched.',
      ],
      es: [
        'Elige Rellenar o Bloquear abajo. Rellenar pinta una casilla; Bloquear marca una casilla que sabes que está vacía.',
        'Toca una casilla, o arrastra por una fila o columna para pintar varias a la vez.',
        'Al arrastrar solo cambian las casillas que están en el mismo estado que la primera que tocaste.',
      ],
    },
    examples: [
      ex(['# # . # .'], undefined, 'In a row of 5, the clue “2 1” means a run of two, a gap, then a single square.', 'En una fila de 5, la pista «2 1» significa un tramo de dos, un hueco y una casilla suelta.'),
      ex(['# # # # *#'], undefined, 'A clue “5” in a row of 5 fills every square. Look for big clues like this first.', 'Una pista «5» en una fila de 5 rellena todas las casillas. Busca primero pistas grandes como esta.'),
    ],
    tips: {
      en: [
        'Start with lines whose clues nearly fill the line: “4 3” in 8 squares has no spare room.',
        'Big runs overlap with themselves: a run of 7 in 10 squares must fill the middle 4.',
        'Block squares you know are empty; it makes the remaining clues easier to place.',
      ],
      es: [
        'Empieza por líneas cuyas pistas casi llenan la línea: «4 3» en 8 casillas no deja espacio libre.',
        'Los tramos grandes se solapan consigo mismos: un tramo de 7 en 10 casillas debe rellenar las 4 centrales.',
        'Bloquea las casillas que sabes vacías; así es más fácil colocar las pistas restantes.',
      ],
    },
  },

  binairo: {
    goal: {
      en: 'Fill the grid with 0s and 1s following three simple rules.',
      es: 'Llena la cuadrícula con 0 y 1 siguiendo tres reglas sencillas.',
    },
    rules: {
      en: [
        'No more than two equal digits can be next to each other, in a row or a column.',
        'Every row and column has the same number of 0s and 1s.',
        'No two rows are identical, and no two columns are identical.',
        'Square tiles are given and can’t be changed.',
      ],
      es: [
        'No puede haber más de dos dígitos iguales seguidos, en una fila o una columna.',
        'Cada fila y columna tiene la misma cantidad de 0 y de 1.',
        'No hay dos filas idénticas ni dos columnas idénticas.',
        'Las casillas cuadradas vienen dadas y no se pueden cambiar.',
      ],
    },
    controls: {
      en: ['Tap a cell to cycle: empty → 0 → 1 → empty.', 'Drag across cells to copy the first cell’s new value along your path.'],
      es: ['Toca una casilla para alternar: vacía → 0 → 1 → vacía.', 'Arrastra por las casillas para copiar el nuevo valor de la primera a lo largo del recorrido.'],
    },
    examples: [
      ex(['0 0 *1 . . .'], undefined, 'Two 0s side by side: the next cell can’t be another 0, so it must be 1.', 'Dos 0 juntos: la siguiente casilla no puede ser otro 0, así que debe ser 1.'),
      ex(['1 *0 1 . . .'], undefined, 'A gap between two equal digits must hold the other digit, otherwise three in a row would appear.', 'Un hueco entre dos dígitos iguales debe llevar el otro dígito; si no, aparecerían tres seguidos.'),
      ex(['1 0 1 1 *0 *0'], undefined, 'In a 6-wide row, once three 1s are placed, every remaining cell must be 0 (and vice versa).', 'En una fila de 6, cuando ya hay tres 1, todas las casillas restantes deben ser 0 (y viceversa).'),
    ],
    tips: {
      en: ['Scan for pairs and for “x _ x” gaps first.', 'Count 0s and 1s in each line; a line that already has half of one digit is finished for that digit.', 'Use the “no identical lines” rule at the end, on nearly complete lines.'],
      es: ['Busca primero parejas y huecos del tipo «x _ x».', 'Cuenta los 0 y 1 de cada línea; si ya tiene la mitad de un dígito, no admite más de ese dígito.', 'Usa la regla de «sin líneas idénticas» al final, con líneas casi completas.'],
    },
  },

  queens: {
    goal: {
      en: 'Place queens so that every row, column and colored region has exactly one.',
      es: 'Coloca reinas de modo que cada fila, columna y región de color tenga exactamente una.',
    },
    rules: {
      en: ['Exactly one queen in each row.', 'Exactly one queen in each column.', 'Exactly one queen in each colored region.', 'Queens can’t touch each other, not even diagonally.'],
      es: ['Exactamente una reina en cada fila.', 'Exactamente una reina en cada columna.', 'Exactamente una reina en cada región de color.', 'Las reinas no pueden tocarse, ni siquiera en diagonal.'],
    },
    controls: {
      en: ['Tap once for ✕ (no queen here), twice for a queen, three times to clear.', 'Drag to put ✕ on several cells; a drag that starts on a ✕ erases them instead.', 'In Settings, “Auto-✕” crosses out cells that a queen rules out for you.'],
      es: ['Toca una vez para ✕ (aquí no hay reina), dos veces para una reina, tres para borrar.', 'Arrastra para poner ✕ en varias casillas; si empiezas sobre una ✕, las borra.', 'En Ajustes, «Auto-✕» tacha por ti las casillas que descarta una reina.'],
    },
    examples: [
      ex(['. ♛ . .', '. . . ♛', '♛ . . .', '. . ♛ .'], undefined, 'A solved 4×4 grid: one queen per row and column, and none touching, even diagonally.', 'Una cuadrícula 4×4 resuelta: una reina por fila y columna, y ninguna se toca, ni en diagonal.'),
    ],
    tips: {
      en: ['A region that fits in a single row or column forces that line’s queen: ✕ the rest of that line.', 'If two regions share only two rows, no other region can have a queen in those rows.', 'Turn on region patterns in Settings if the colors are hard to tell apart.'],
      es: ['Una región que cabe en una sola fila o columna fuerza la reina de esa línea: pon ✕ en el resto de la línea.', 'Si dos regiones solo ocupan dos filas, ninguna otra región puede tener reina en esas filas.', 'Activa los patrones de región en Ajustes si te cuesta distinguir los colores.'],
    },
  },

  sudoku: {
    goal: {
      en: 'Fill the 9×9 grid with digits 1 to 9.',
      es: 'Llena la cuadrícula de 9×9 con los dígitos del 1 al 9.',
    },
    rules: {
      en: ['Each row contains 1–9 exactly once.', 'Each column contains 1–9 exactly once.', 'Each 3×3 box (thick lines) contains 1–9 exactly once.', 'Given digits can’t be changed.'],
      es: ['Cada fila contiene del 1 al 9 exactamente una vez.', 'Cada columna contiene del 1 al 9 exactamente una vez.', 'Cada caja de 3×3 (líneas gruesas) contiene del 1 al 9 exactamente una vez.', 'Los dígitos dados no se pueden cambiar.'],
    },
    controls: {
      en: ['Tap a cell, then tap a number on the pad. Tap the same number again (or ⌫) to clear it.', 'Turn on Notes to pencil in candidates. Entering a digit removes it from the notes in its row, column and box.', 'The selected cell’s row, column and box are shaded, and matching digits are highlighted.'],
      es: ['Toca una casilla y luego un número del teclado. Toca el mismo número otra vez (o ⌫) para borrarlo.', 'Activa Notas para anotar candidatos. Al poner un dígito se quita de las notas de su fila, columna y caja.', 'La fila, columna y caja de la casilla seleccionada se sombrean, y los dígitos iguales se resaltan.'],
    },
    examples: [
      ex(['5 3 4 6 7 8 9 1 *?'], undefined, 'This row holds 1, 3, 4, 5, 6, 7, 8 and 9. The only digit missing is 2, so ? = 2.', 'Esta fila tiene 1, 3, 4, 5, 6, 7, 8 y 9. El único dígito que falta es el 2, así que ? = 2.'),
    ],
    tips: {
      en: ['Look for a digit that can only go in one cell of a row, column or box (a “hidden single”).', 'Or a cell where only one digit is still possible (a “naked single”).', 'Use Notes when you get stuck: pairs of cells sharing the same two candidates are powerful clues.'],
      es: ['Busca un dígito que solo cabe en una casilla de una fila, columna o caja («single oculto»).', 'O una casilla donde solo es posible un dígito («single desnudo»).', 'Usa Notas si te atascas: dos casillas con los mismos dos candidatos son una pista muy potente.'],
    },
  },

  killer: {
    goal: {
      en: 'Solve a Sudoku where the clues are cages with sums instead of given digits.',
      es: 'Resuelve un Sudoku donde las pistas son jaulas con sumas en lugar de dígitos dados.',
    },
    rules: {
      en: ['All the normal Sudoku rules apply: 1–9 once in every row, column and 3×3 box.', 'The digits inside each dashed cage add up to the small number in its corner.', 'A digit can’t repeat inside a cage.'],
      es: ['Valen todas las reglas normales del Sudoku: del 1 al 9 una vez en cada fila, columna y caja de 3×3.', 'Los dígitos de cada jaula discontinua suman el número pequeño de su esquina.', 'Un dígito no puede repetirse dentro de una jaula.'],
    },
    controls: {
      en: ['Tap a cell, then a number on the pad.', 'Use Notes to pencil in candidates.'],
      es: ['Toca una casilla y luego un número del teclado.', 'Usa Notas para anotar candidatos.'],
    },
    examples: [
      ex(['*? *?'], undefined, 'A cage of 2 cells with sum 3: the only digits are 1 and 2 (no repeats allowed).', 'Una jaula de 2 casillas con suma 3: los únicos dígitos son 1 y 2 (sin repetir).'),
      ex(['*? *?'], undefined, 'A cage of 2 cells with sum 17 can only be 8 and 9.', 'Una jaula de 2 casillas con suma 17 solo puede ser 8 y 9.'),
    ],
    tips: {
      en: ['Memorise the extremes: 2 cells = 3 → {1,2}; 3 cells = 6 → {1,2,3}; 3 cells = 24 → {7,8,9}.', 'A row, column or box sums to 45: use that to find single cells hiding between cages.'],
      es: ['Memoriza los extremos: 2 casillas = 3 → {1,2}; 3 casillas = 6 → {1,2,3}; 3 casillas = 24 → {7,8,9}.', 'Una fila, columna o caja suma 45: úsalo para encontrar casillas sueltas entre jaulas.'],
    },
  },

  kenken: {
    goal: {
      en: 'Fill an N×N grid with digits 1 to N, using the arithmetic clues of each cage.',
      es: 'Llena una cuadrícula N×N con dígitos del 1 al N, usando las pistas aritméticas de cada jaula.',
    },
    rules: {
      en: ['Each row and each column contains every digit from 1 to N exactly once.', 'Each outlined cage shows a target and an operation (+, −, × or ÷). Its digits must combine to the target.', '− and ÷ cages have two cells: subtract the smaller from the larger, or divide the larger by the smaller.', 'A digit may repeat inside a cage, as long as the cells are in different rows and columns.', 'A cage with just a number (no operation) is a given digit.'],
      es: ['Cada fila y cada columna contiene todos los dígitos del 1 al N exactamente una vez.', 'Cada jaula marcada muestra un objetivo y una operación (+, −, × o ÷). Sus dígitos deben combinarse para dar el objetivo.', 'Las jaulas − y ÷ tienen dos casillas: resta el menor al mayor, o divide el mayor entre el menor.', 'Un dígito puede repetirse dentro de una jaula si las casillas están en filas y columnas distintas.', 'Una jaula con solo un número (sin operación) es un dígito dado.'],
    },
    controls: {
      en: ['Tap a cell, then a number on the pad.', 'Use Notes to pencil in candidates.'],
      es: ['Toca una casilla y luego un número del teclado.', 'Usa Notas para anotar candidatos.'],
    },
    examples: [
      ex(['1 2 3', '2 3 1', '3 1 2'], undefined, 'A valid 3×3 grid: each digit once per row and column. A “5+” cage on the last two cells of the first row would be 2 + 3; a “6×” cage there would also be 2 × 3.', 'Una cuadrícula 3×3 válida: cada dígito una vez por fila y columna. Una jaula «5+» en las dos últimas casillas de la primera fila sería 2 + 3; una «6×» también sería 2 × 3.'),
    ],
    tips: {
      en: ['Start with single-cell cages and big products or sums.', 'In a straight cage (one row or column), digits can’t repeat; in an L-shaped cage they can.'],
      es: ['Empieza por las jaulas de una casilla y las de productos o sumas grandes.', 'En una jaula recta (una fila o columna) los dígitos no pueden repetirse; en una jaula en L sí.'],
    },
  },

  futoshiki: {
    goal: {
      en: 'Fill the grid with 1 to N, obeying the inequality signs between cells.',
      es: 'Llena la cuadrícula con 1 a N, respetando los signos de desigualdad entre casillas.',
    },
    rules: {
      en: ['Each row and column contains every digit from 1 to N exactly once.', 'The sign between two cells must hold: the open side of the sign faces the larger digit.', 'A sign turns red if the digits on both sides break it.'],
      es: ['Cada fila y columna contiene todos los dígitos del 1 al N exactamente una vez.', 'El signo entre dos casillas debe cumplirse: el lado abierto del signo mira al dígito mayor.', 'Un signo se pone rojo si los dígitos a ambos lados lo incumplen.'],
    },
    controls: {
      en: ['Tap a cell, then a number on the pad.', 'Use Notes to pencil in candidates.'],
      es: ['Toca una casilla y luego un número del teclado.', 'Usa Notas para anotar candidatos.'],
    },
    examples: [
      ex(['1 < *? > 2'], undefined, 'In a row of 3: the middle must be greater than 1 and greater than 2, so it is 3.', 'En una fila de 3: la casilla central debe ser mayor que 1 y mayor que 2, así que es 3.'),
      ex(['. < . < . < 4'], undefined, 'A chain of “<” signs is a ladder: with 4 digits it must be 1 < 2 < 3 < 4.', 'Una cadena de signos «<» es una escalera: con 4 dígitos solo puede ser 1 < 2 < 3 < 4.'),
    ],
    tips: {
      en: ['The smallest digit can’t be on the large side of a sign; the largest can’t be on the small side.', 'Follow chains of signs: a cell that is smaller than two others can’t be N.'],
      es: ['El dígito más pequeño no puede estar en el lado mayor de un signo; el más grande no puede estar en el lado menor.', 'Sigue las cadenas de signos: una casilla menor que otras dos no puede ser N.'],
    },
  },

  kakuro: {
    goal: {
      en: 'Fill the white cells with digits so every run adds up to its clue, like a crossword made of sums.',
      es: 'Llena las casillas blancas con dígitos para que cada tramo sume su pista, como un crucigrama de sumas.',
    },
    rules: {
      en: ['Fill every white cell with a digit from 1 to 9.', 'Each horizontal run adds up to the clue on its left (the number above the diagonal).', 'Each vertical run adds up to the clue above it (the number below the diagonal).', 'Digits can’t repeat within a run.'],
      es: ['Llena cada casilla blanca con un dígito del 1 al 9.', 'Cada tramo horizontal suma la pista de su izquierda (el número sobre la diagonal).', 'Cada tramo vertical suma la pista de arriba (el número bajo la diagonal).', 'Los dígitos no pueden repetirse dentro de un tramo.'],
    },
    controls: {
      en: ['Tap a cell, then a number on the pad. Use Notes for candidates.', 'Turn on “Show combinations” in Settings: it lists the digit sets that fit the selected runs.'],
      es: ['Toca una casilla y luego un número del teclado. Usa Notas para candidatos.', 'Activa «Mostrar combinaciones» en Ajustes: lista los conjuntos de dígitos que encajan en los tramos seleccionados.'],
    },
    examples: [
      ex(['3→ *? *?'], undefined, 'A run of 2 cells that sums to 3 can only use 1 and 2.', 'Un tramo de 2 casillas que suma 3 solo puede usar 1 y 2.'),
      ex(['16→ *? *?'], undefined, 'A run of 2 cells with sum 16 can only be 7 + 9.', 'Un tramo de 2 casillas con suma 16 solo puede ser 7 + 9.'),
    ],
    tips: {
      en: ['Learn the unique sets: 2 cells → 3, 4, 16, 17; 3 cells → 6, 7, 23, 24.', 'When a cell belongs to two runs, only digits allowed by both are possible.'],
      es: ['Aprende los conjuntos únicos: 2 casillas → 3, 4, 16, 17; 3 casillas → 6, 7, 23, 24.', 'Cuando una casilla pertenece a dos tramos, solo valen los dígitos permitidos por ambos.'],
    },
  },

  hitori: {
    goal: {
      en: 'Shade some cells so that no number repeats in any row or column among the unshaded cells.',
      es: 'Sombrea algunas casillas para que ningún número se repita en ninguna fila o columna entre las casillas sin sombrear.',
    },
    rules: {
      en: ['Among the unshaded cells, a number may appear only once per row and per column.', 'Shaded cells can’t touch each other side by side (diagonals are fine).', 'All unshaded cells must stay connected in a single area.'],
      es: ['Entre las casillas sin sombrear, un número solo puede aparecer una vez por fila y por columna.', 'Las casillas sombreadas no pueden tocarse por los lados (en diagonal sí).', 'Todas las casillas sin sombrear deben seguir conectadas en una única zona.'],
    },
    controls: {
      en: ['Tap to cycle: plain → shaded → circled (a cell you know stays unshaded).', 'Drag to apply the same mark to several cells.'],
      es: ['Toca para alternar: normal → sombreada → rodeada (una casilla que sabes que no se sombrea).', 'Arrastra para aplicar la misma marca a varias casillas.'],
    },
    examples: [
      ex(['1 #2 2 3'], undefined, 'The two 2s clash in this row: shade one of them. The other 2 stays.', 'Los dos 2 chocan en esta fila: sombrea uno de ellos. El otro 2 se queda.'),
      ex(['1 #2 #2 3'], undefined, 'Not allowed: shaded cells can’t be next to each other.', 'No permitido: las casillas sombreadas no pueden estar juntas.'),
    ],
    tips: {
      en: ['If three equal numbers are in a row, shade the two outer ones… or the middle one.', 'When you shade a cell, circle all its neighbours: they can’t be shaded.', 'If a unique number can’t be shaded, circle it: that helps rule out other cells.'],
      es: ['Si hay tres números iguales seguidos, sombrea los dos de los extremos… o el del medio.', 'Cuando sombrees una casilla, rodea todos sus vecinos: no pueden sombrearse.', 'Si un número único no puede sombrearse, rodéalo: ayuda a descartar otras casillas.'],
    },
  },

  nurikabe: {
    goal: {
      en: 'Decide which cells are sea and which are island. Numbers are island sizes.',
      es: 'Decide qué casillas son mar y cuáles isla. Los números son tamaños de isla.',
    },
    rules: {
      en: ['Each number is part of an island of exactly that many cells; every island has exactly one number.', 'Islands can’t touch each other side by side.', 'All the other cells are sea, and the sea forms a single connected area.', 'There can be no 2×2 block of sea anywhere.'],
      es: ['Cada número es parte de una isla con exactamente esa cantidad de casillas; cada isla tiene exactamente un número.', 'Las islas no pueden tocarse por los lados.', 'Todas las demás casillas son mar, y el mar forma una única zona conectada.', 'No puede haber ningún bloque de 2×2 de mar.'],
    },
    controls: {
      en: ['Tap to cycle: empty → sea → dot (island) → empty.', 'Drag to apply the same mark to several cells.'],
      es: ['Toca para alternar: vacía → mar → punto (isla) → vacía.', 'Arrastra para aplicar la misma marca a varias casillas.'],
    },
    examples: [
      ex(['2 • #', '# # #', '1 # 1'], undefined, 'A solved 3×3. The “2” island is the 2 and the dot (•) next to it; each “1” is a lone cell; # is sea. The sea is connected and has no 2×2 block.', 'Un 3×3 resuelto. La isla «2» es el 2 y el punto a su lado; cada «1» es una casilla suelta; # es mar. El mar está conectado y no tiene bloques 2×2.'),
    ],
    tips: {
      en: ['Cells next to a “1” are sea. A cell between two different numbers must be sea.', 'If a 2×2 area has three sea cells, the fourth must be island.', 'Sea cells that are cut off need a path to the rest of the sea.'],
      es: ['Las casillas junto a un «1» son mar. Una casilla entre dos números distintos debe ser mar.', 'Si un área 2×2 tiene tres casillas de mar, la cuarta debe ser isla.', 'Las casillas de mar aisladas necesitan un camino hacia el resto del mar.'],
    },
  },

  slitherlink: {
    goal: {
      en: 'Draw a single closed loop along the grid lines that satisfies every number.',
      es: 'Dibuja un único bucle cerrado sobre las líneas de la cuadrícula que cumpla todos los números.',
    },
    rules: {
      en: ['The loop passes along the dotted grid lines, joining neighbouring dots.', 'Each number tells how many of the four sides of its cell belong to the loop.', 'The loop never crosses itself or branches, and it is one single loop.', 'Cells with no number can have any count of sides.'],
      es: ['El bucle recorre las líneas punteadas de la cuadrícula, uniendo puntos vecinos.', 'Cada número indica cuántos de los cuatro lados de su casilla pertenecen al bucle.', 'El bucle nunca se cruza ni se ramifica, y es un único bucle.', 'Las casillas sin número pueden tener cualquier cantidad de lados.'],
    },
    controls: {
      en: ['Tap a gap between two dots to cycle: line → ✕ → empty. ✕ marks a side you know is NOT in the loop.', 'Drag from dot to dot to draw several lines; a drag that starts on a line erases.'],
      es: ['Toca el hueco entre dos puntos para alternar: línea → ✕ → vacío. ✕ marca un lado que sabes que NO está en el bucle.', 'Arrastra de punto a punto para dibujar varias líneas; si empiezas sobre una línea, borra.'],
    },
    examples: [
      ex(undefined, '+---+\n| 4 |\n+---+', 'A “4” has all four sides in the loop. A “0” has none.', 'Un «4» tiene sus cuatro lados en el bucle. Un «0» no tiene ninguno.'),
      ex(undefined, '+---+   +\n| 3     0\n+---+   +', 'Next to a 0, the shared side is never drawn, so the 3 uses its other three sides.', 'Junto a un 0, el lado compartido nunca se dibuja, así que el 3 usa sus otros tres lados.'),
    ],
    tips: {
      en: ['Every dot has either 0 or 2 lines touching it. A dot with 2 ✕ already needs no more lines.', 'Two adjacent 3s share a line between them, and the lines extend outward from there.', 'The app highlights a number once it is satisfied, and flags it if it has too many lines.'],
      es: ['Cada punto tiene 0 o 2 líneas que lo tocan. Un punto con 2 ✕ ya no necesita más líneas.', 'Dos 3 adyacentes comparten la línea entre ellos, y las líneas se extienden hacia fuera.', 'La app resalta un número cuando se cumple y lo marca si tiene demasiadas líneas.'],
    },
  },

  minesweeper: {
    goal: {
      en: 'Open every cell that has no mine, using the numbers as clues.',
      es: 'Abre todas las casillas sin mina, usando los números como pistas.',
    },
    rules: {
      en: ['A number tells how many of the 8 neighbouring cells hide a mine.', 'Your first tap is always safe and opens an area. From there, every board can be solved by logic alone: you never have to guess.', 'Opening a mine ends the game, but you can retry the same board.', 'You win when all safe cells are open.'],
      es: ['Un número indica cuántas de las 8 casillas vecinas esconden una mina.', 'Tu primer toque siempre es seguro y abre una zona. A partir de ahí, todo tablero se resuelve solo con lógica: nunca hay que adivinar.', 'Abrir una mina termina la partida, pero puedes reintentar el mismo tablero.', 'Ganas cuando todas las casillas seguras están abiertas.'],
    },
    controls: {
      en: ['Tap to open a cell. Long-press (or pick the Flag tool) to flag a suspected mine.', 'Tap a number whose mines are all flagged to open the rest of its neighbours at once.'],
      es: ['Toca para abrir una casilla. Mantén pulsado (o elige la herramienta Bandera) para marcar una mina sospechosa.', 'Toca un número cuyas minas ya están todas marcadas para abrir de golpe el resto de sus vecinos.'],
    },
    examples: [
      ex(['1 1 .', '# 1 .'], undefined, 'The top-left 1 has only one hidden neighbour (#), so that cell is a mine. Flag it.', 'El 1 de arriba a la izquierda solo tiene un vecino oculto (#), así que esa casilla es una mina. Márcala con bandera.'),
    ],
    tips: {
      en: ['A 1 with only one hidden neighbour: that neighbour is a mine.', 'If a number’s mines are all flagged, every other neighbour is safe.', 'Compare neighbouring numbers: the difference between them often shows which cells hold the mines.'],
      es: ['Un 1 con un solo vecino oculto: ese vecino es una mina.', 'Si todas las minas de un número están marcadas, los demás vecinos son seguros.', 'Compara números vecinos: la diferencia entre ellos suele indicar dónde están las minas.'],
    },
  },
};

export function guideFor(id: string, lang: Lang): Guide | null {
  const g = RAW[id];
  if (!g) return null;
  return {
    goal: g.goal[lang],
    rules: g.rules[lang],
    controls: g.controls[lang],
    examples: g.examples.map((e) => e[lang]),
    tips: g.tips[lang],
  };
}
