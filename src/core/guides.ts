import type { Lang } from './i18n';

/** How an overlay line is drawn; see `drawLine` in example.ts. */
export type LineStyle =
  | 'loop'
  | 'edge'
  | 'cross'
  | 'bridge'
  | 'bridge2'
  | 'thermo'
  | 'mercury'
  | 'mercury-gap'
  | 'path-a'
  | 'path-b'
  | 'domino';

export interface Drawing {
  /** Rows of space-separated tokens; see `parse` in example.ts. */
  grid: string[];
  /** Rows of region letters matching `grid` (`.` for none). Different letters get a wall between them. */
  regions?: string[];
  /** `tint` colours each region, `outline` only draws the walls, `cage` draws dashed outlines. Defaults to tint. */
  regionStyle?: 'tint' | 'outline' | 'cage';
  /** Small corner label (a cage clue) per region letter. */
  labels?: Record<string, string>;
  /** `dots` puts dots on the corners, `centres` in the squares, `bare` draws nothing. Defaults to a ruled grid. */
  board?: 'grid' | 'dots' | 'centres' | 'bare';
  /** Lines over the grid, as `x,y` points: corners for `edge` and `cross`, square centres for the rest. */
  lines?: [LineStyle, string][];
  /** Marks the example as a correct position or as a broken rule. */
  mark?: 'ok' | 'bad';
}

export interface Example extends Drawing {
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

const ex = (drawing: Drawing | string[], en: string, es: string): Bi<Example> => {
  const d = Array.isArray(drawing) ? { grid: drawing } : drawing;
  return { en: { ...d, caption: en }, es: { ...d, caption: es } };
};

/** The 2×2 boxes of a 4×4 Sudoku. */
const BOXES = ['a a b b', 'a a b b', 'c c d d', 'c c d d'];
/** Four T-shaped regions that tile a 4×4 grid. */
const PINWHEEL = ['a a a b', 'c a b b', 'c c d b', 'c d d d'];

/** Shown in every game that has the Undo and Check buttons. */
const COMMON: Bi<string> = {
  en: 'Undo takes back your last move. Check outlines your mistakes in red.',
  es: 'Deshacer revierte tu última jugada. Comprobar marca tus errores en rojo.',
};
const NO_COMMON = new Set(['minesweeper']);
/** Shown instead in games that have Undo but nothing to check. */
const UNDO_ONLY: Bi<string> = {
  en: 'Undo takes back your last move, including adding numbers.',
  es: 'Deshacer revierte tu última jugada, también la de añadir números.',
};
const NO_CHECK = new Set(['taketen']);

const RAW: Record<string, RawGuide> = {
  nonogram: {
    goal: {
      en: 'Reveal a hidden picture by deciding which squares are filled and which are empty.',
      es: 'Descubre una imagen oculta decidiendo qué casillas se rellenan y cuáles quedan vacías.',
    },
    rules: {
      en: [
        'The numbers beside a row (or above a column) are the lengths of its runs of filled squares, in order from left to right (or top to bottom).',
        'Two runs are always separated by at least one empty square.',
        'When a line matches its clue exactly, its numbers turn grey.',
      ],
      es: [
        'Los números junto a una fila (o sobre una columna) son las longitudes de sus tramos de casillas rellenas, en orden de izquierda a derecha (o de arriba abajo).',
        'Dos tramos siempre están separados por al menos una casilla vacía.',
        'Cuando una línea cumple exactamente su pista, sus números se ponen grises.',
      ],
    },
    controls: {
      en: [
        'Pick Fill or Block at the bottom. Fill paints a square; Block puts a ✕ on a square you know is empty.',
        'Tap a square to mark it, or drag to mark several at once. A drag stays on the row or column where it started.',
        'Tap a square that already has the selected mark to clear it.',
        'Dragging only changes squares in the same state as the first one you touched, so it never overwrites your other marks.',
      ],
      es: [
        'Elige Rellenar o Bloquear abajo. Rellenar pinta una casilla; Bloquear pone una ✕ en una casilla que sabes que está vacía.',
        'Toca una casilla para marcarla, o arrastra para marcar varias a la vez. El arrastre se queda en la fila o columna donde empezó.',
        'Toca una casilla que ya tiene la marca seleccionada para borrarla.',
        'Al arrastrar solo cambian las casillas que están en el mismo estado que la primera que tocaste, así que nunca pisa tus otras marcas.',
      ],
    },
    examples: [
      ex(
        ['^3_2 . # # # . . # # . .'],
        'The clue “3 2” means a run of three, then at least one empty square, then a run of two. This is one of several ways to fit them in the row.',
        'La pista «3 2» significa un tramo de tres, al menos una casilla vacía y un tramo de dos. Esta es una de las varias formas de colocarlos en la fila.',
      ),
      ex(
        ['^7 . . . # # # # . . .'],
        'A run of 7 in a row of 10 can sit anywhere from the far left to the far right, but the four middle squares are filled in every case. Fill them straight away.',
        'Un tramo de 7 en una fila de 10 puede ir desde el extremo izquierdo hasta el derecho, pero las cuatro casillas centrales quedan rellenas en todos los casos. Rellénalas enseguida.',
      ),
      ex(
        ['^4_5 # # # # :x # # # # #'],
        '“4 5” needs 4 + 1 + 5 = 10 squares, so in a row of 10 there is only one way to place it.',
        '«4 5» necesita 4 + 1 + 5 = 10 casillas, así que en una fila de 10 solo hay una forma de colocarla.',
      ),
    ],
    tips: {
      en: [
        'Add up a line’s numbers plus one gap between each of them. The closer that total is to the length of the line, the more squares you can fill straight away.',
        'Any run longer than half the line always covers the middle squares.',
        'When a run is complete, block the squares at both of its ends.',
        'Block squares you know are empty; it makes the remaining clues easier to place.',
      ],
      es: [
        'Suma los números de una línea más un hueco entre cada uno. Cuanto más se acerque ese total a la longitud de la línea, más casillas puedes rellenar de inmediato.',
        'Cualquier tramo más largo que media línea siempre cubre las casillas centrales.',
        'Cuando un tramo esté completo, bloquea las casillas de sus dos extremos.',
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
        'Never three equal digits in a row, across or down. Two side by side is fine.',
        'Every row and every column has as many 0s as 1s.',
        'No two rows are identical, and no two columns are identical.',
        'Tiles drawn as squares on a grey background are given and can’t be changed.',
      ],
      es: [
        'Nunca tres dígitos iguales seguidos, ni en horizontal ni en vertical. Dos juntos sí se puede.',
        'Cada fila y cada columna tiene tantos 0 como 1.',
        'No hay dos filas idénticas ni dos columnas idénticas.',
        'Las fichas cuadradas sobre fondo gris vienen dadas y no se pueden cambiar.',
      ],
    },
    controls: {
      en: ['Tap a cell to cycle: empty → 0 → 1 → empty.', 'Drag across cells to copy the first cell’s new value along your path.'],
      es: ['Toca una casilla para alternar: vacía → 0 → 1 → vacía.', 'Arrastra por las casillas para copiar el nuevo valor de la primera a lo largo del recorrido.'],
    },
    examples: [
      ex(['0 0 *1 . . .'], 'Two 0s side by side: the next cell can’t be another 0, so it must be 1.', 'Dos 0 juntos: la siguiente casilla no puede ser otro 0, así que debe ser 1.'),
      ex(['1 *0 1 . . .'], 'A gap between two equal digits must hold the other digit, otherwise there would be three in a row.', 'Un hueco entre dos dígitos iguales debe llevar el otro dígito; si no, habría tres seguidos.'),
      ex(['1 0 1 1 *0 *0'], 'A row of 6 holds three 1s and three 0s. Once the three 1s are placed, every remaining cell is a 0 (and vice versa).', 'Una fila de 6 tiene tres 1 y tres 0. Cuando ya están los tres 1, todas las casillas restantes son 0 (y viceversa).'),
      ex(
        ['0 1 1 0 0 1', '0 1 1 0 *1 *0'],
        'The bottom row still needs one 0 and one 1. Ending in “0 1” would copy the row above, so it has to end in “1 0”.',
        'A la fila de abajo le faltan un 0 y un 1. Si terminara en «0 1» copiaría la fila de arriba, así que debe terminar en «1 0».',
      ),
    ],
    tips: {
      en: ['Scan for pairs and for “x _ x” gaps first.', 'Count the 0s and 1s in each line: once half the line is one digit, all the other cells take the other digit.', 'Keep the “no identical lines” rule for the end, on lines that are nearly complete.'],
      es: ['Busca primero parejas y huecos del tipo «x _ x».', 'Cuenta los 0 y 1 de cada línea: cuando media línea ya es de un dígito, las demás casillas llevan el otro.', 'Deja la regla de «sin líneas idénticas» para el final, con líneas casi completas.'],
    },
  },

  queens: {
    goal: {
      en: 'Place queens so that every row, column and colored region has exactly one.',
      es: 'Coloca reinas de modo que cada fila, columna y región de color tenga exactamente una.',
    },
    rules: {
      en: ['Exactly one queen in each row.', 'Exactly one queen in each column.', 'Exactly one queen in each colored region.', 'Queens can’t touch each other, not even diagonally. Further apart on a diagonal is fine.'],
      es: ['Exactamente una reina en cada fila.', 'Exactamente una reina en cada columna.', 'Exactamente una reina en cada región de color.', 'Las reinas no pueden tocarse, ni siquiera en diagonal. Más separadas en una diagonal sí se puede.'],
    },
    controls: {
      en: [
        'Tap a square to cycle: ✕ (no queen here) → queen → empty.',
        'Drag to put ✕ on several squares; a drag that starts on a ✕ erases them instead.',
        'When you place a queen, the app adds a fainter ✕ on every square it rules out. Tapping one of those places a queen straight away. Settings can switch this off (“Auto-✕ cells ruled out by queens”).',
        'Queens that break a rule turn red.',
        'If the colors are hard to tell apart, turn on “Region patterns” in Settings.',
      ],
      es: [
        'Toca una casilla para alternar: ✕ (aquí no hay reina) → reina → vacía.',
        'Arrastra para poner ✕ en varias casillas; si empiezas sobre una ✕, las borra.',
        'Al colocar una reina, la app pone una ✕ más tenue en cada casilla que descarta. Si tocas una de esas, pone una reina directamente. Puedes desactivarlo en Ajustes («Poner ✕ automático en casillas descartadas por reinas»).',
        'Las reinas que incumplen una regla se ponen rojas.',
        'Si te cuesta distinguir los colores, activa «Patrones de región» en Ajustes.',
      ],
    },
    examples: [
      ex(
        { grid: ['. ♛ . .', '. . . ♛', '♛ . . .', '. . ♛ .'], regions: ['a a a b', 'a c b b', 'c c c d', 'c d d d'], mark: 'ok' },
        'A solved 4×4: one queen in every row, every column and every colored region, and no two queens touch.',
        'Un 4×4 resuelto: una reina en cada fila, cada columna y cada región de color, y ninguna toca a otra.',
      ),
      ex(
        { grid: ['!♛ . .', '. !♛ .'], regions: ['a a b', 'a b b'], mark: 'bad' },
        'Not allowed: these queens are in different rows, columns and regions, but they touch at a corner.',
        'No permitido: estas reinas están en filas, columnas y regiones distintas, pero se tocan por una esquina.',
      ),
      ex(
        { grid: ['. . :x :x', '. . . .'], regions: ['a a b b', 'c c c b'] },
        'The region at the top left lies entirely in the top row, so that row’s queen is somewhere inside it. Every other square of the row gets a ✕.',
        'La región de arriba a la izquierda está entera en la fila superior, así que la reina de esa fila está dentro de ella. Las demás casillas de la fila llevan ✕.',
      ),
    ],
    tips: {
      en: [
        'A region that fits in a single row or column holds that line’s queen: ✕ the rest of the line.',
        'If two regions together fit inside the same two rows (or columns), they use up the queens of both lines: ✕ every other square in them.',
        'The smallest regions have the fewest options: start there.',
        'A square can’t hold a queen if a queen there would leave some row, column or region with no free square.',
      ],
      es: [
        'Una región que cabe en una sola fila o columna contiene la reina de esa línea: pon ✕ en el resto de la línea.',
        'Si dos regiones caben juntas en las mismas dos filas (o columnas), se quedan con las reinas de ambas líneas: pon ✕ en todas las demás casillas de ellas.',
        'Las regiones más pequeñas tienen menos opciones: empieza por ahí.',
        'Una casilla no puede tener reina si una reina ahí dejara alguna fila, columna o región sin casillas libres.',
      ],
    },
  },

  sudoku: {
    goal: {
      en: 'Fill every square with a digit so that no digit repeats in any row, column or box.',
      es: 'Llena cada casilla con un dígito de modo que ninguno se repita en ninguna fila, columna o caja.',
    },
    rules: {
      en: [
        'A 9×9 grid uses the digits 1 to 9, a 6×6 grid 1 to 6 and a 4×4 grid 1 to 4.',
        'Each row contains every digit exactly once.',
        'Each column contains every digit exactly once.',
        'Each box (marked by thick lines: 3×3 on 9×9, 2×3 on 6×6, 2×2 on 4×4) contains every digit exactly once.',
        'The digits in black are given and can’t be changed; yours are blue.',
      ],
      es: [
        'Una cuadrícula 9×9 usa los dígitos del 1 al 9, una 6×6 del 1 al 6 y una 4×4 del 1 al 4.',
        'Cada fila contiene cada dígito exactamente una vez.',
        'Cada columna contiene cada dígito exactamente una vez.',
        'Cada caja (marcada con líneas gruesas: 3×3 en 9×9, 2×3 en 6×6, 2×2 en 4×4) contiene cada dígito exactamente una vez.',
        'Los dígitos en negro vienen dados y no se pueden cambiar; los tuyos son azules.',
      ],
    },
    controls: {
      en: [
        'Tap a square, then a number on the pad. Tap the same number again (or ⌫) to clear it.',
        'Turn on Notes to pencil in candidates. Entering a digit removes it from the notes in its row, column and box.',
        'The selected square’s row, column and box are shaded, and matching digits are highlighted.',
        'A digit that repeats in its row, column or box turns red. A number on the pad dims once it is placed everywhere.',
        'Pick the size (4×4, 6×6 or 9×9) when you start a new puzzle.',
      ],
      es: [
        'Toca una casilla y luego un número del teclado. Toca el mismo número otra vez (o ⌫) para borrarlo.',
        'Activa Notas para anotar candidatos. Al poner un dígito se quita de las notas de su fila, columna y caja.',
        'La fila, columna y caja de la casilla seleccionada se sombrean, y los dígitos iguales se resaltan.',
        'Un dígito que se repite en su fila, columna o caja se pone rojo. Un número del teclado se atenúa cuando ya está colocado en todas partes.',
        'Elige el tamaño (4×4, 6×6 o 9×9) al empezar un nuevo puzzle.',
      ],
    },
    examples: [
      ex(
        { grid: ['1 . . .', '. . . 1', '. 1 :x :x', '. . *1 :x'], regions: BOXES, regionStyle: 'outline' },
        'Where does the 1 go in the bottom-right box? The third row and the last column already have a 1, which rules out three squares (✕). Only one is left.',
        '¿Dónde va el 1 en la caja de abajo a la derecha? La tercera fila y la última columna ya tienen un 1, lo que descarta tres casillas (✕). Solo queda una.',
      ),
      ex(
        { grid: ['. 2 . .', '3 *4 . .', '. . . .', '. 1 . .'], regions: BOXES, regionStyle: 'outline' },
        'The highlighted square has a 3 in its row and a 2 and a 1 in its column. The only digit left for it is 4.',
        'La casilla resaltada tiene un 3 en su fila y un 2 y un 1 en su columna. El único dígito que le queda es el 4.',
      ),
    ],
    tips: {
      en: [
        'Pick a digit and a box, row or column, and look for the only square where that digit still fits, as in the first example.',
        'Or pick a square and rule out every digit it can see, as in the second example. This works best on crowded rows and boxes.',
        'Use Notes when you get stuck. Two squares of a row, column or box that can only hold the same two digits keep those digits for themselves: remove them from the rest.',
      ],
      es: [
        'Elige un dígito y una caja, fila o columna, y busca la única casilla donde ese dígito aún cabe, como en el primer ejemplo.',
        'O elige una casilla y descarta todos los dígitos que ve, como en el segundo ejemplo. Funciona mejor en filas y cajas muy llenas.',
        'Usa Notas si te atascas. Dos casillas de una fila, columna o caja que solo admiten los mismos dos dígitos se los quedan: quítalos del resto.',
      ],
    },
  },

  jigsaw: {
    goal: {
      en: 'Fill the grid with digits so that every row, column and irregular region contains each digit once.',
      es: 'Rellena la cuadrícula con dígitos para que cada fila, columna y región irregular contenga cada dígito una vez.',
    },
    rules: {
      en: [
        'Each row and each column holds the digits 1 to N exactly once (N is the grid size).',
        'Instead of square boxes, the grid is split into N irregular regions of N squares, marked by thick lines and soft colors. Each region also holds every digit exactly once.',
        'The digits in black are given and can’t be changed.',
      ],
      es: [
        'Cada fila y cada columna contiene los dígitos de 1 a N exactamente una vez (N es el tamaño de la cuadrícula).',
        'En lugar de cajas cuadradas, la cuadrícula se divide en N regiones irregulares de N casillas, marcadas con líneas gruesas y colores suaves. Cada región también contiene cada dígito exactamente una vez.',
        'Los dígitos en negro vienen dados y no se pueden cambiar.',
      ],
    },
    controls: {
      en: [
        'Tap a square, then a number on the pad. Tap the same number again (or ⌫) to clear it.',
        'Turn on Notes to pencil in candidates.',
        'Squares sharing a row, column or region with the selected one are highlighted; clashing digits turn red.',
      ],
      es: [
        'Toca una casilla y luego un número del teclado. Toca el mismo número otra vez (o ⌫) para borrarlo.',
        'Activa Notas para anotar candidatos.',
        'Las casillas que comparten fila, columna o región con la seleccionada se resaltan; los dígitos que chocan se ponen rojos.',
      ],
    },
    examples: [
      ex(
        { grid: ['1 2 3 4', '3 4 1 2', '2 1 4 3', '4 3 2 1'], regions: PINWHEEL, mark: 'ok' },
        'A solved 4×4: every row, every column and each of the four colored regions holds 1, 2, 3 and 4.',
        'Un 4×4 resuelto: cada fila, cada columna y cada una de las cuatro regiones de color contiene 1, 2, 3 y 4.',
      ),
      ex(
        { grid: ['1 2 3 .', '. *4 . .', '. . . .', '. . . .'], regions: PINWHEEL },
        'The region at the top already holds 1, 2 and 3, so its fourth square must be 4. Follow the thick lines: the region dips into the second row.',
        'La región de arriba ya tiene 1, 2 y 3, así que su cuarta casilla debe ser 4. Sigue las líneas gruesas: la región baja hasta la segunda fila.',
      ),
    ],
    tips: {
      en: [
        'Look for a digit that can go in only one square of a region, row or column.',
        'If a digit of a region can only go in one row, it can’t go anywhere else in that row (and the same for columns).',
        'Odd-shaped regions often have a square squeezed between others: start there.',
      ],
      es: [
        'Busca un dígito que solo pueda ir en una casilla de una región, fila o columna.',
        'Si un dígito de una región solo puede ir en una fila, no puede ir en ningún otro lugar de esa fila (y lo mismo con las columnas).',
        'Las regiones de forma rara suelen tener una casilla encajada entre otras: empieza por ahí.',
      ],
    },
  },

  killer: {
    goal: {
      en: 'Solve a Sudoku whose clues are cages with sums. Only Easy puzzles give you a few digits as well.',
      es: 'Resuelve un Sudoku cuyas pistas son jaulas con sumas. Solo los puzzles fáciles te dan además algunos dígitos.',
    },
    rules: {
      en: [
        'All the normal Sudoku rules apply: 1 to 9 once in every row, column and 3×3 box.',
        'A cage is a group of squares inside a dashed outline. Its digits add up to the small number in its corner.',
        'A digit can’t repeat inside a cage.',
      ],
      es: [
        'Valen todas las reglas normales del Sudoku: del 1 al 9 una vez en cada fila, columna y caja de 3×3.',
        'Una jaula es un grupo de casillas dentro de un contorno discontinuo. Sus dígitos suman el número pequeño de su esquina.',
        'Un dígito no puede repetirse dentro de una jaula.',
      ],
    },
    controls: {
      en: [
        'Tap a square, then a number on the pad. Tap the same number again (or ⌫) to clear it.',
        'Turn on Notes to pencil in candidates. Entering a digit removes it from the notes in its row, column, box and cage.',
      ],
      es: [
        'Toca una casilla y luego un número del teclado. Toca el mismo número otra vez (o ⌫) para borrarlo.',
        'Activa Notas para anotar candidatos. Al poner un dígito se quita de las notas de su fila, columna, caja y jaula.',
      ],
    },
    examples: [
      ex(
        { grid: ['. . . .'], regions: ['a a b b'], regionStyle: 'cage', labels: { a: '3', b: '17' } },
        'Two squares that add up to 3 can only be 1 and 2. Two that add up to 17 can only be 8 and 9. The rest of the grid decides their order.',
        'Dos casillas que suman 3 solo pueden ser 1 y 2. Dos que suman 17 solo pueden ser 8 y 9. El resto de la cuadrícula decide su orden.',
      ),
      ex(
        { grid: ['. . .', '. . .', '. . *6'], regions: ['a a a', 'b b b', 'c c d'], regionStyle: 'cage', labels: { a: '12', b: '18', c: '9' } },
        'Every row, column and 3×3 box adds up to 45. In this box the three cages total 12 + 18 + 9 = 39, so the last square is 45 − 39 = 6.',
        'Cada fila, columna y caja de 3×3 suma 45. En esta caja las tres jaulas suman 12 + 18 + 9 = 39, así que la última casilla es 45 − 39 = 6.',
      ),
    ],
    tips: {
      en: [
        'Start with small cages whose sum is very low or very high: they have few combinations.',
        'Memorise the extremes. Two squares: 3 is 1+2, 4 is 1+3, 16 is 7+9, 17 is 8+9. Three squares: 6 is 1+2+3, 7 is 1+2+4, 23 is 6+8+9, 24 is 7+8+9.',
        'Use the 45 trick from the second example wherever cages almost fill a row, column or box.',
      ],
      es: [
        'Empieza por jaulas pequeñas con una suma muy baja o muy alta: tienen pocas combinaciones.',
        'Memoriza los extremos. Dos casillas: 3 es 1+2, 4 es 1+3, 16 es 7+9, 17 es 8+9. Tres casillas: 6 es 1+2+3, 7 es 1+2+4, 23 es 6+8+9, 24 es 7+8+9.',
        'Usa el truco del 45 del segundo ejemplo donde las jaulas casi llenen una fila, columna o caja.',
      ],
    },
  },

  kenken: {
    goal: {
      en: 'Fill an N×N grid with the digits 1 to N so that no digit repeats in a row or column and every cage hits its target.',
      es: 'Llena una cuadrícula N×N con los dígitos del 1 al N sin repetir ninguno en una fila o columna y de modo que cada jaula dé su objetivo.',
    },
    rules: {
      en: [
        'Each row and each column contains every digit from 1 to N exactly once.',
        'A cage is a group of squares inside thick lines. Its label gives a target and an operation: combining the cage’s digits with that operation must give the target.',
        '+ and × cages can be any size: add or multiply all their digits.',
        '− and ÷ cages always have two squares: subtract the smaller from the larger, or divide the larger by the smaller.',
        'A digit may repeat inside a cage, as long as the two squares are in different rows and columns.',
        'A single-square cage shows just its digit, already filled in.',
      ],
      es: [
        'Cada fila y cada columna contiene todos los dígitos del 1 al N exactamente una vez.',
        'Una jaula es un grupo de casillas dentro de líneas gruesas. Su etiqueta da un objetivo y una operación: al combinar los dígitos de la jaula con esa operación debe salir el objetivo.',
        'Las jaulas + y × pueden tener cualquier tamaño: suma o multiplica todos sus dígitos.',
        'Las jaulas − y ÷ siempre tienen dos casillas: resta el menor al mayor, o divide el mayor entre el menor.',
        'Un dígito puede repetirse dentro de una jaula si las dos casillas están en filas y columnas distintas.',
        'Una jaula de una sola casilla muestra solo su dígito, ya colocado.',
      ],
    },
    controls: {
      en: ['Tap a square, then a number on the pad. Tap the same number again (or ⌫) to clear it.', 'Turn on Notes to pencil in candidates.'],
      es: ['Toca una casilla y luego un número del teclado. Toca el mismo número otra vez (o ⌫) para borrarlo.', 'Activa Notas para anotar candidatos.'],
    },
    examples: [
      ex(
        { grid: ['1 2 3', '2 3 1', '3 1 2'], regions: ['a a b', 'a c b', 'd d d'], regionStyle: 'outline', labels: { a: '5+', b: '2−', c: '3', d: '6×' }, mark: 'ok' },
        'A solved 3×3. “5+” is 1 + 2 + 2: the 2 repeats, which is fine because the two 2s share no row or column. “2−” is 3 − 1, “6×” is 3 × 1 × 2, and the lone 3 was given.',
        'Un 3×3 resuelto. «5+» es 1 + 2 + 2: el 2 se repite, y está bien porque los dos 2 no comparten fila ni columna. «2−» es 3 − 1, «6×» es 3 × 1 × 2, y el 3 suelto venía dado.',
      ),
    ],
    tips: {
      en: [
        'Start with cages that have a single combination: in a 4×4, “7+” on two squares is 3 + 4 and “12×” on two squares is 3 × 4.',
        'In a straight cage (all in one row or column) digits can’t repeat; in a bent cage they can.',
        'Note the candidates of each cage, then let rows and columns remove them, as in a Sudoku.',
      ],
      es: [
        'Empieza por las jaulas con una sola combinación: en un 4×4, «7+» en dos casillas es 3 + 4 y «12×» en dos casillas es 3 × 4.',
        'En una jaula recta (toda en una fila o columna) los dígitos no pueden repetirse; en una jaula doblada sí.',
        'Anota los candidatos de cada jaula y deja que las filas y columnas los eliminen, como en un Sudoku.',
      ],
    },
  },

  futoshiki: {
    goal: {
      en: 'Fill the grid with the digits 1 to N, obeying the “greater than” signs between squares.',
      es: 'Llena la cuadrícula con los dígitos del 1 al N, respetando los signos «mayor que» entre casillas.',
    },
    rules: {
      en: [
        'Each row and column contains every digit from 1 to N exactly once (N is the grid size).',
        'A sign between two squares compares them: its point aims at the smaller digit and its open side faces the larger one.',
        'Digits on a grey background are given.',
        'A sign turns red when the digits on both sides break it.',
      ],
      es: [
        'Cada fila y columna contiene todos los dígitos del 1 al N exactamente una vez (N es el tamaño de la cuadrícula).',
        'Un signo entre dos casillas las compara: su punta señala al dígito menor y su lado abierto mira al mayor.',
        'Los dígitos sobre fondo gris vienen dados.',
        'Un signo se pone rojo cuando los dígitos a ambos lados lo incumplen.',
      ],
    },
    controls: {
      en: ['Tap a square, then a number on the pad. Tap the same number again (or ⌫) to clear it.', 'Turn on Notes to pencil in candidates.'],
      es: ['Toca una casilla y luego un número del teclado. Toca el mismo número otra vez (o ⌫) para borrarlo.', 'Activa Notas para anotar candidatos.'],
    },
    examples: [
      ex(['~1 < *3 > ~2'], 'In a row of 3, the middle square must be greater than the 1 and greater than the 2, so it is 3.', 'En una fila de 3, la casilla central debe ser mayor que el 1 y mayor que el 2, así que es 3.'),
      ex(['*1 < *2 < *3 < *4'], 'Three “<” signs in a row of 4 leave a single order: 1 < 2 < 3 < 4.', 'Tres signos «<» en una fila de 4 dejan un único orden: 1 < 2 < 3 < 4.'),
      ex(['. > *? > .'], 'In any grid, a square that is smaller than one neighbour and greater than another can be neither 1 nor N.', 'En cualquier cuadrícula, una casilla menor que una vecina y mayor que otra no puede ser ni 1 ni N.'),
    ],
    tips: {
      en: [
        'A square on the small side of a sign can’t be N, and one on the large side can’t be 1.',
        'Chains add up: a square that is greater than a square that is itself greater than a third one is at least 3.',
        'Once the signs have narrowed things down, finish like a Sudoku: look for the only place a digit fits in a row or column.',
      ],
      es: [
        'Una casilla en el lado menor de un signo no puede ser N, y una en el lado mayor no puede ser 1.',
        'Las cadenas se acumulan: una casilla mayor que otra que a su vez es mayor que una tercera vale al menos 3.',
        'Cuando los signos ya hayan acotado las opciones, termina como en un Sudoku: busca el único lugar donde cabe un dígito en una fila o columna.',
      ],
    },
  },

  skyscrapers: {
    goal: {
      en: 'Place a building of height 1 to N in every square so that each clue counts the buildings visible from its edge.',
      es: 'Coloca un edificio de altura 1 a N en cada casilla para que cada pista cuente los edificios visibles desde su borde.',
    },
    rules: {
      en: [
        'Each row and each column holds the heights 1 to N exactly once.',
        'A number outside the grid tells how many buildings you can see when you look along that row or column from that side.',
        'A taller building hides every shorter one behind it.',
        'An edge with no number tells you nothing about that view.',
      ],
      es: [
        'Cada fila y cada columna contiene las alturas de 1 a N exactamente una vez.',
        'Un número fuera de la cuadrícula indica cuántos edificios se ven al mirar a lo largo de esa fila o columna desde ese lado.',
        'Un edificio más alto oculta a todos los más bajos que tiene detrás.',
        'Un borde sin número no dice nada sobre esa vista.',
      ],
    },
    controls: {
      en: [
        'Tap a square, then a number on the pad. Tap the same number again (or ⌫) to clear it.',
        'Turn on Notes to pencil in possible heights.',
        'Once a row or column is completely filled, its clues turn grey if they are right and red if they are wrong.',
      ],
      es: [
        'Toca una casilla y luego un número del teclado. Toca el mismo número otra vez (o ⌫) para borrarlo.',
        'Activa Notas para anotar alturas posibles.',
        'Cuando una fila o columna está completa, sus pistas se ponen grises si son correctas y rojas si no lo son.',
      ],
    },
    examples: [
      ex(
        ['^4 1 2 3 4 ^1'],
        'From the left every building is taller than the one before, so all 4 are visible. From the right the 4 comes first and hides the other three, so only 1 is visible.',
        'Desde la izquierda cada edificio es más alto que el anterior, así que se ven los 4. Desde la derecha el 4 va primero y oculta a los otros tres, así que solo se ve 1.',
      ),
      ex(
        ['^2 3 1 4 2 ^2'],
        'From the left you see the 3 and the 4; the 1 hides behind the 3 and the 2 behind the 4. From the right you see the 2 and the 4.',
        'Desde la izquierda ves el 3 y el 4; el 1 se esconde tras el 3 y el 2 tras el 4. Desde la derecha ves el 2 y el 4.',
      ),
    ],
    tips: {
      en: [
        'A clue of 1 means the tallest building (N) is right next to the clue.',
        'A clue of N means the heights rise 1, 2, … N from that side.',
        'The tallest building is always visible, and it hides everything behind it. With a clue of 3, it can’t be in the first two squares.',
        'With a clue of 2, the first building can’t be the tallest, otherwise you would see only one.',
      ],
      es: [
        'Una pista de 1 significa que el edificio más alto (N) está justo junto a la pista.',
        'Una pista de N significa que las alturas suben 1, 2, … N desde ese lado.',
        'El edificio más alto siempre se ve, y oculta todo lo que tiene detrás. Con una pista de 3, no puede estar en las dos primeras casillas.',
        'Con una pista de 2, el primer edificio no puede ser el más alto; si lo fuera solo verías uno.',
      ],
    },
  },

  kakuro: {
    goal: {
      en: 'Fill the white squares with digits so every run adds up to its clue, like a crossword made of sums.',
      es: 'Llena las casillas blancas con dígitos para que cada tramo sume su pista, como un crucigrama de sumas.',
    },
    rules: {
      en: [
        'Fill every white square with a digit from 1 to 9.',
        'A run is an unbroken line of white squares, across or down.',
        'A number in the top-right half of a dark square is the sum of the run to its right.',
        'A number in the bottom-left half of a dark square is the sum of the run below it.',
        'Digits can’t repeat within a run.',
      ],
      es: [
        'Llena cada casilla blanca con un dígito del 1 al 9.',
        'Un tramo es una línea continua de casillas blancas, en horizontal o en vertical.',
        'Un número en la mitad superior derecha de una casilla oscura es la suma del tramo que tiene a su derecha.',
        'Un número en la mitad inferior izquierda de una casilla oscura es la suma del tramo que tiene debajo.',
        'Los dígitos no pueden repetirse dentro de un tramo.',
      ],
    },
    controls: {
      en: [
        'Tap a square, then a number on the pad. Tap the same number again (or ⌫) to clear it.',
        'Turn on Notes to pencil in candidates.',
        'Under the board, the app lists the digit sets that fit the two runs of the selected square. Sets that clash with digits you already placed are dimmed. Settings can hide the list.',
      ],
      es: [
        'Toca una casilla y luego un número del teclado. Toca el mismo número otra vez (o ⌫) para borrarlo.',
        'Activa Notas para anotar candidatos.',
        'Bajo el tablero, la app lista los conjuntos de dígitos que encajan en los dos tramos de la casilla seleccionada. Los que chocan con dígitos ya colocados se atenúan. Puedes ocultar la lista en Ajustes.',
      ],
    },
    examples: [
      ex(
        { grid: ['\\ 3\\ 4\\', '\\4 1 3', '\\3 2 1'], mark: 'ok' },
        'A solved corner. Across: 1 + 3 = 4 and 2 + 1 = 3. Down: 1 + 2 = 3 and 3 + 1 = 4.',
        'Una esquina resuelta. En horizontal: 1 + 3 = 4 y 2 + 1 = 3. En vertical: 1 + 2 = 3 y 3 + 1 = 4.',
      ),
      ex(
        ['\\ 3\\ 4\\', '\\4 *1 .', '\\3 . .'],
        'How to start it: two squares that add up to 3 are 1 and 2, and two that add up to 4 are 1 and 3 (2 + 2 would repeat). The highlighted square is in a “3” run and a “4” run, so it must be 1.',
        'Cómo empezarla: dos casillas que suman 3 son 1 y 2, y dos que suman 4 son 1 y 3 (2 + 2 repetiría). La casilla resaltada está en un tramo «3» y en un tramo «4», así que debe ser 1.',
      ),
    ],
    tips: {
      en: [
        'Learn the sums with a single combination. Two squares: 3, 4, 16 and 17. Three squares: 6, 7, 23 and 24.',
        'A square belongs to two runs: only digits allowed by both are possible.',
        'Long runs with very low or very high sums are as restricted as short ones: nine squares always hold 1 to 9.',
      ],
      es: [
        'Aprende las sumas con una sola combinación. Dos casillas: 3, 4, 16 y 17. Tres casillas: 6, 7, 23 y 24.',
        'Una casilla pertenece a dos tramos: solo valen los dígitos permitidos por ambos.',
        'Los tramos largos con sumas muy bajas o muy altas están tan limitados como los cortos: nueve casillas siempre llevan del 1 al 9.',
      ],
    },
  },

  hitori: {
    goal: {
      en: 'Shade some squares so that no number repeats in any row or column among the unshaded ones.',
      es: 'Sombrea algunas casillas para que ningún número se repita en ninguna fila o columna entre las que quedan sin sombrear.',
    },
    rules: {
      en: [
        'Among the unshaded squares, a number may appear only once per row and once per column.',
        'Shaded squares can’t touch each other side by side (diagonally is fine).',
        'All unshaded squares must stay connected in a single area.',
      ],
      es: [
        'Entre las casillas sin sombrear, un número solo puede aparecer una vez por fila y una vez por columna.',
        'Las casillas sombreadas no pueden tocarse por los lados (en diagonal sí).',
        'Todas las casillas sin sombrear deben seguir conectadas en una única zona.',
      ],
    },
    controls: {
      en: [
        'Tap to cycle: plain → shaded → circled → plain. A circle is your own reminder that a square stays unshaded.',
        'Drag to apply the same mark to several squares.',
        'Shaded squares that touch turn red.',
      ],
      es: [
        'Toca para alternar: normal → sombreada → rodeada → normal. El círculo es tu propio recordatorio de que una casilla no se sombrea.',
        'Arrastra para aplicar la misma marca a varias casillas.',
        'Las casillas sombreadas que se tocan se ponen rojas.',
      ],
    },
    examples: [
      ex(['1 #2 2 3'], 'Two 2s in the same row: one of them has to be shaded. Which one depends on the rest of the grid.', 'Dos 2 en la misma fila: hay que sombrear uno. Cuál de ellos depende del resto de la cuadrícula.'),
      ex({ grid: ['1 #!2 #!2 3'], mark: 'bad' }, 'Not allowed: two shaded squares side by side.', 'No permitido: dos casillas sombreadas juntas.'),
      ex(
        { grid: ['!1 #1 3', '#1 3 2', '3 2 1'], mark: 'bad' },
        'Not allowed: the corner 1 is cut off from the other unshaded squares. Shading the corner instead fixes both pairs of 1s at once.',
        'No permitido: el 1 de la esquina queda aislado de las demás casillas sin sombrear. Sombrear la esquina en su lugar arregla las dos parejas de 1 a la vez.',
      ),
    ],
    tips: {
      en: [
        'A square between two equal numbers (like the 3 in 2 3 2) can never be shaded: circle it.',
        'Three equal numbers in a row: shade the two outer ones and keep the middle one.',
        'When you shade a square, circle its four neighbours. When you circle a number, shade every equal number in its row and column.',
        'A number that appears only once in its row and column never needs shading.',
      ],
      es: [
        'Una casilla entre dos números iguales (como el 3 en 2 3 2) nunca puede sombrearse: rodéala.',
        'Tres números iguales seguidos: sombrea los dos de los extremos y deja el del medio.',
        'Cuando sombrees una casilla, rodea sus cuatro vecinas. Cuando rodees un número, sombrea todos los números iguales de su fila y columna.',
        'Un número que aparece una sola vez en su fila y columna nunca necesita sombrearse.',
      ],
    },
  },

  nurikabe: {
    goal: {
      en: 'Decide which squares are sea and which are island. Each number is the size of its island.',
      es: 'Decide qué casillas son mar y cuáles isla. Cada número es el tamaño de su isla.',
    },
    rules: {
      en: [
        'Each number belongs to an island of exactly that many squares, counting the numbered square itself.',
        'Every island has exactly one number.',
        'Islands can’t touch each other side by side (diagonally is fine).',
        'All the other squares are sea, and the sea forms a single connected area.',
        'The sea never fills a 2×2 block.',
      ],
      es: [
        'Cada número pertenece a una isla de exactamente esa cantidad de casillas, contando la del propio número.',
        'Cada isla tiene exactamente un número.',
        'Las islas no pueden tocarse por los lados (en diagonal sí).',
        'Todas las demás casillas son mar, y el mar forma una única zona conectada.',
        'El mar nunca llena un bloque de 2×2.',
      ],
    },
    controls: {
      en: ['Tap to cycle: empty → sea → dot (island) → empty.', 'Drag to apply the same mark to several squares.', 'A 2×2 block of sea turns red.'],
      es: ['Toca para alternar: vacía → mar → punto (isla) → vacía.', 'Arrastra para aplicar la misma marca a varias casillas.', 'Un bloque de 2×2 de mar se pone rojo.'],
    },
    examples: [
      ex(
        { grid: ['2 :dot #', '# # #', '1 # 1'], mark: 'ok' },
        'A solved 3×3. The 2 and the dotted square next to it make an island of two; each 1 is an island on its own. The dark sea is in one piece and has no 2×2 block.',
        'Un 3×3 resuelto. El 2 y la casilla con punto de al lado forman una isla de dos; cada 1 es una isla por sí solo. El mar oscuro está en una sola pieza y no tiene ningún bloque de 2×2.',
      ),
      ex(
        { grid: ['2 :dot #! #!', '# # #! #!'], mark: 'bad' },
        'Not allowed: four sea squares form a 2×2 block. One of them has to be island.',
        'No permitido: cuatro casillas de mar forman un bloque de 2×2. Una de ellas tiene que ser isla.',
      ),
    ],
    tips: {
      en: [
        'The squares around a 1 are sea. A square that touches two different numbers is sea too.',
        'When an island is complete, surround it with sea.',
        'If a 2×2 area has three sea squares, the fourth must be island.',
        'Every sea square needs a way out to the rest of the sea: a sea square with a single open neighbour continues through it.',
      ],
      es: [
        'Las casillas alrededor de un 1 son mar. Una casilla que toca dos números distintos también es mar.',
        'Cuando una isla esté completa, rodéala de mar.',
        'Si un área de 2×2 tiene tres casillas de mar, la cuarta debe ser isla.',
        'Cada casilla de mar necesita una salida hacia el resto del mar: una casilla de mar con una sola vecina abierta continúa por ella.',
      ],
    },
  },

  slitherlink: {
    goal: {
      en: 'Draw a single closed loop along the grid lines that satisfies every number.',
      es: 'Dibuja un único bucle cerrado sobre las líneas de la cuadrícula que cumpla todos los números.',
    },
    rules: {
      en: [
        'The loop runs along the sides of the squares, from dot to neighbouring dot.',
        'Each number (0 to 3) tells how many of the four sides of its square belong to the loop.',
        'The loop never crosses itself or branches, and there is only one loop.',
        'Squares with no number can have any number of sides in the loop.',
      ],
      es: [
        'El bucle recorre los lados de las casillas, de un punto al punto vecino.',
        'Cada número (de 0 a 3) indica cuántos de los cuatro lados de su casilla pertenecen al bucle.',
        'El bucle nunca se cruza ni se ramifica, y solo hay un bucle.',
        'Las casillas sin número pueden tener cualquier cantidad de lados en el bucle.',
      ],
    },
    controls: {
      en: [
        'Tap the gap between two dots to cycle: line → ✕ → empty. A ✕ is your own mark for a side you know is not in the loop.',
        'Drag from dot to dot to draw several lines; a drag that starts on a line erases.',
        'A number turns grey once it has the right number of lines, and red if it has too many or can no longer get enough. A dot with more than two lines turns red.',
      ],
      es: [
        'Toca el hueco entre dos puntos para alternar: línea → ✕ → vacío. La ✕ es tu propia marca para un lado que sabes que no está en el bucle.',
        'Arrastra de punto a punto para dibujar varias líneas; si empiezas sobre una línea, borra.',
        'Un número se pone gris cuando tiene la cantidad correcta de líneas, y rojo si tiene demasiadas o ya no puede conseguir suficientes. Un punto con más de dos líneas se pone rojo.',
      ],
    },
    examples: [
      ex(
        { grid: ['3 2', '2 3'], board: 'dots', lines: [['edge', '0,0 2,0 2,2 1,2 1,1 0,1 0,0']], mark: 'ok' },
        'A solved 2×2. Count the sides of each square that the loop uses: three for each 3, two for each 2.',
        'Un 2×2 resuelto. Cuenta los lados de cada casilla que usa el bucle: tres para cada 3, dos para cada 2.',
      ),
      ex(
        { grid: ['3 0'], board: 'dots', lines: [['edge', '1,0 0,0 0,1 1,1'], ['cross', '1,0.5 1.5,0 2,0.5 1.5,1']] },
        'None of the sides of a 0 are in the loop, so they all get a ✕. That includes the side it shares with the 3, which must therefore use its other three sides.',
        'Ningún lado de un 0 está en el bucle, así que todos llevan ✕. Eso incluye el lado que comparte con el 3, que por tanto debe usar sus otros tres lados.',
      ),
    ],
    tips: {
      en: [
        'Every dot has either two lines or none. When a dot has two, put ✕ on its other sides.',
        'A line that reaches a dot with only one open side left must continue through it. A dot with no line and a single open side gets a ✕ there.',
        'Two 3s side by side: the side between them and the two outer sides parallel to it are always lines.',
        'In a corner of the grid, a 3 uses both outer sides and a 1 uses neither.',
      ],
      es: [
        'Cada punto tiene dos líneas o ninguna. Cuando un punto ya tiene dos, pon ✕ en sus otros lados.',
        'Una línea que llega a un punto al que solo le queda un lado abierto debe continuar por él. Un punto sin líneas y con un solo lado abierto lleva ✕ ahí.',
        'Dos 3 juntos: el lado entre ellos y los dos lados exteriores paralelos a él siempre son líneas.',
        'En una esquina de la cuadrícula, un 3 usa los dos lados exteriores y un 1 no usa ninguno.',
      ],
    },
  },

  minesweeper: {
    goal: {
      en: 'Open every square that has no mine, using the numbers as clues.',
      es: 'Abre todas las casillas sin mina, usando los números como pistas.',
    },
    rules: {
      en: [
        'A number tells how many of the squares around it (up to 8, diagonals included) hide a mine. An open square with no number has none.',
        'The first square you open is always safe and opens an area. From there, every board can be solved by logic alone: you never have to guess.',
        'Opening a mine ends the game, but you can retry the same board.',
        'You win when all the safe squares are open. Flags are optional.',
      ],
      es: [
        'Un número indica cuántas de las casillas que lo rodean (hasta 8, diagonales incluidas) esconden una mina. Una casilla abierta sin número no tiene ninguna.',
        'La primera casilla que abres siempre es segura y abre una zona. A partir de ahí, todo tablero se resuelve solo con lógica: nunca hay que adivinar.',
        'Abrir una mina termina la partida, pero puedes reintentar el mismo tablero.',
        'Ganas cuando todas las casillas seguras están abiertas. Las banderas son opcionales.',
      ],
    },
    controls: {
      en: [
        'Pick Open or Flag at the bottom, then tap a square. A long-press uses the other tool, so you rarely need to switch.',
        'Tap a number whose mines are all flagged to open the rest of its neighbours at once.',
        'The counter under the board shows how many mines are not flagged yet.',
      ],
      es: [
        'Elige Abrir o Bandera abajo y toca una casilla. Una pulsación larga usa la otra herramienta, así que casi nunca hace falta cambiar.',
        'Toca un número cuyas minas ya están todas marcadas para abrir de golpe el resto de sus vecinas.',
        'El contador bajo el tablero muestra cuántas minas quedan por marcar.',
      ],
    },
    examples: [
      ex(
        ['. . .', '. 1 1', '. 1 ~🚩'],
        'The 1 in the middle touches a single unopened square, so that square is its mine: flag it.',
        'El 1 del centro toca una sola casilla sin abrir, así que esa casilla es su mina: márcala con bandera.',
      ),
      ex(
        ['~🚩 *', '1 1'],
        'Both 1s already have their mine flagged, so the highlighted square is safe to open. Tapping either 1 opens it for you.',
        'Los dos 1 ya tienen su mina marcada, así que la casilla resaltada es segura. Si tocas cualquiera de los 1, se abre sola.',
      ),
    ],
    tips: {
      en: [
        'If a number has as many unopened neighbours as mines left to find, they are all mines.',
        'If a number’s mines are all flagged, every other neighbour is safe.',
        'Compare two numbers side by side: the difference between them tells you about the squares that only one of them touches.',
      ],
      es: [
        'Si un número tiene tantas vecinas sin abrir como minas le faltan, todas son minas.',
        'Si todas las minas de un número están marcadas, las demás vecinas son seguras.',
        'Compara dos números contiguos: la diferencia entre ellos te informa sobre las casillas que solo toca uno de los dos.',
      ],
    },
  },

  tents: {
    goal: {
      en: 'Pitch a tent next to every tree without any two tents touching.',
      es: 'Planta una tienda junto a cada árbol sin que dos tiendas se toquen.',
    },
    rules: {
      en: [
        'Every tree has its own tent in a square next to it: above, below, left or right, not diagonal.',
        'There are exactly as many tents as trees, and each tent belongs to one tree only.',
        'Tents never touch each other, not even diagonally.',
        'The numbers outside the grid tell how many tents are in each row and column.',
      ],
      es: [
        'Cada árbol tiene su propia tienda en una casilla contigua: arriba, abajo, a la izquierda o a la derecha, no en diagonal.',
        'Hay exactamente tantas tiendas como árboles, y cada tienda pertenece a un solo árbol.',
        'Las tiendas nunca se tocan, ni siquiera en diagonal.',
        'Los números fuera de la cuadrícula indican cuántas tiendas hay en cada fila y columna.',
      ],
    },
    controls: {
      en: [
        'Tap a square to cycle: tent → grass → empty. Grass (a dot) is your own mark for a square you know has no tent.',
        'Drag to apply the same mark to several squares.',
        'Numbers turn grey when satisfied and red when exceeded. Tents that touch are tinted red.',
      ],
      es: [
        'Toca una casilla para alternar: tienda → hierba → vacía. La hierba (un punto) es tu propia marca para una casilla que sabes que no tiene tienda.',
        'Arrastra para aplicar la misma marca a varias casillas.',
        'Los números se ponen grises al cumplirse y rojos si se superan. Las tiendas que se tocan se tiñen de rojo.',
      ],
    },
    examples: [
      ex(
        { grid: ['^ ^1 ^0 ^1', '^1 ⛺ 🌲 :dot', '^0 :dot :dot :dot', '^1 :dot 🌲 ⛺'], mark: 'ok' },
        'A solved 3×3. Each tree has a tent beside it, the two tents don’t touch, and every number matches the tents in its row or column.',
        'Un 3×3 resuelto. Cada árbol tiene una tienda al lado, las dos tiendas no se tocan, y cada número coincide con las tiendas de su fila o columna.',
      ),
      ex(
        { grid: ['🌲 !⛺ .', '. 🌲 !⛺'], mark: 'bad' },
        'Not allowed: each tent is beside its tree, but the two tents touch at a corner.',
        'No permitido: cada tienda está junto a su árbol, pero las dos tiendas se tocan por una esquina.',
      ),
    ],
    tips: {
      en: [
        'A square with no tree beside it can never hold a tent: mark it as grass.',
        'A row or column with a 0 is all grass. If its number equals its free squares, they are all tents.',
        'A tree with only one free neighbour gets its tent there.',
        'After placing a tent, mark every empty square around it as grass, diagonals included.',
      ],
      es: [
        'Una casilla sin árbol al lado nunca puede tener tienda: márcala como hierba.',
        'Una fila o columna con un 0 es toda hierba. Si su número iguala sus casillas libres, todas son tiendas.',
        'Un árbol con una sola vecina libre pone su tienda ahí.',
        'Después de plantar una tienda, marca como hierba todas las casillas vacías que la rodean, diagonales incluidas.',
      ],
    },
  },

  lightup: {
    goal: {
      en: 'Light up every white square with bulbs, without letting bulbs shine on each other.',
      es: 'Ilumina todas las casillas blancas con bombillas, sin que las bombillas se iluminen entre sí.',
    },
    rules: {
      en: [
        'A bulb lights its own square and every square in its row and column, in both directions, until a black wall.',
        'Every white square must be lit.',
        'No bulb may be lit by another bulb.',
        'A number on a wall says exactly how many bulbs are in the squares touching its sides (diagonals don’t count). Walls without a number can have any amount.',
      ],
      es: [
        'Una bombilla ilumina su casilla y todas las de su fila y columna, en ambos sentidos, hasta un muro negro.',
        'Todas las casillas blancas deben quedar iluminadas.',
        'Ninguna bombilla puede quedar iluminada por otra.',
        'Un número en un muro indica exactamente cuántas bombillas hay en las casillas que tocan sus lados (las diagonales no cuentan). Los muros sin número pueden tener cualquier cantidad.',
      ],
    },
    controls: {
      en: [
        'Tap a white square to cycle: bulb → dot → empty. A dot is your own mark for a square you know has no bulb.',
        'Drag to apply the same mark to several squares.',
        'Lit squares turn yellow, and bulbs that light each other turn red. A wall number turns grey when it is met and red when it can’t be.',
      ],
      es: [
        'Toca una casilla blanca para alternar: bombilla → punto → vacía. El punto es tu propia marca para una casilla que sabes que no tiene bombilla.',
        'Arrastra para aplicar la misma marca a varias casillas.',
        'Las casillas iluminadas se ponen amarillas, y las bombillas que se iluminan entre sí, rojas. El número de un muro se pone gris cuando se cumple y rojo cuando ya no puede cumplirse.',
      ],
    },
    examples: [
      ex(
        ['. % . . .', '% %💡 % # .', '. % . . .'],
        'A bulb lights its row and column in both directions. The wall stops the light, so the square behind it stays dark.',
        'Una bombilla ilumina su fila y su columna en ambos sentidos. El muro corta la luz, así que la casilla de detrás queda a oscuras.',
      ),
      ex(
        { grid: ['% %💡 %', '%💡 #4 %💡', '% %💡 %'], mark: 'ok' },
        'A 4 has a bulb on each of its four sides. These bulbs don’t light each other: the wall is in the way.',
        'Un 4 tiene una bombilla en cada uno de sus cuatro lados. Estas bombillas no se iluminan entre sí: el muro está en medio.',
      ),
      ex(
        { grid: ['!💡 % % !💡'], mark: 'bad' },
        'Not allowed: two bulbs in the same row with no wall between them.',
        'No permitido: dos bombillas en la misma fila sin un muro entre ellas.',
      ),
    ],
    tips: {
      en: [
        'A wall whose number equals its free neighbours gets a bulb on each: always a 4, a 3 on the edge, a 2 in a corner. A 0 rules them all out.',
        'A square that is already lit can’t hold a bulb: mark it with a dot.',
        'If a dark square can only be lit from one place, put a bulb there.',
      ],
      es: [
        'Un muro cuyo número iguala sus vecinas libres lleva bombilla en todas: siempre un 4, un 3 en el borde, un 2 en una esquina. Un 0 las descarta todas.',
        'Una casilla ya iluminada no puede tener bombilla: márcala con un punto.',
        'Si una casilla a oscuras solo puede iluminarse desde un sitio, pon la bombilla ahí.',
      ],
    },
  },

  bridges: {
    goal: {
      en: 'Connect all the islands into one network with bridges.',
      es: 'Conecta todas las islas en una única red con puentes.',
    },
    rules: {
      en: [
        'Each island’s number is how many bridges end on it.',
        'Bridges run in straight horizontal or vertical lines between two islands.',
        'Two islands can be joined by one bridge or by two, never more.',
        'Bridges never cross each other or pass over an island.',
        'In the end you must be able to walk from any island to any other.',
      ],
      es: [
        'El número de cada isla indica cuántos puentes terminan en ella.',
        'Los puentes van en línea recta, horizontal o vertical, entre dos islas.',
        'Dos islas pueden unirse con un puente o con dos, nunca más.',
        'Los puentes nunca se cruzan ni pasan por encima de una isla.',
        'Al final debe poder irse caminando de cualquier isla a cualquier otra.',
      ],
    },
    controls: {
      en: [
        'Tap the dotted line between two islands to cycle: one bridge → two bridges → none.',
        'Or drag from one island to a neighbouring one.',
        'Islands turn blue when complete and red when they have too many bridges. Bridges that cross turn red.',
      ],
      es: [
        'Toca la línea de puntos entre dos islas para alternar: un puente → dos puentes → ninguno.',
        'O arrastra de una isla a otra vecina.',
        'Las islas se ponen azules al completarse y rojas si tienen demasiados puentes. Los puentes que se cruzan se ponen rojos.',
      ],
    },
    examples: [
      ex(
        { grid: ['(3) _ (4)', '_ _ _', '(1) _ (2)'], board: 'bare', lines: [['bridge2', '0,0 2,0'], ['bridge', '0,0 0,2'], ['bridge2', '2,0 2,2']], mark: 'ok' },
        'A solved puzzle. The 3 has a double bridge to the 4 and a single one to the 1; the 4 gets its other two bridges from the 2. All four islands are linked.',
        'Un puzzle resuelto. El 3 tiene un puente doble al 4 y uno simple al 1; el 4 recibe sus otros dos puentes del 2. Las cuatro islas quedan unidas.',
      ),
      ex(
        { grid: ['(1) _ (1) _ (2) _ (2)'], board: 'bare', lines: [['bridge', '0,0 2,0'], ['bridge2', '4,0 6,0']], mark: 'bad' },
        'Not allowed: every island has the right number of bridges, but they form two separate groups.',
        'No permitido: cada isla tiene su número de puentes, pero forman dos grupos separados.',
      ),
    ],
    tips: {
      en: [
        'An island that needs two bridges to every neighbour is settled at once: a 4 in a corner, a 6 on an edge, an 8 anywhere.',
        'One less than that (a 3 in a corner, a 5 on an edge, a 7) needs at least one bridge to every neighbour.',
        'An island with a single neighbour sends all its bridges there.',
        'Don’t close off a group: two 1s can’t be joined to each other, and neither can two 2s with a double bridge, unless they are the only islands.',
      ],
      es: [
        'Una isla que necesita dos puentes hacia cada vecina queda resuelta al instante: un 4 en una esquina, un 6 en un borde, un 8 en cualquier sitio.',
        'Una menos que eso (un 3 en una esquina, un 5 en un borde, un 7) necesita al menos un puente hacia cada vecina.',
        'Una isla con una sola vecina le envía todos sus puentes.',
        'No cierres un grupo: dos 1 no pueden unirse entre sí, ni dos 2 con un puente doble, salvo que sean las únicas islas.',
      ],
    },
  },

  battleships: {
    goal: {
      en: 'Find where every ship of the fleet is hiding.',
      es: 'Encuentra dónde se esconde cada barco de la flota.',
    },
    rules: {
      en: [
        'The fleet is shown under the board. Ships are straight lines of 1 to 4 squares (1 to 3 on the smallest grid), placed across or down.',
        'Ships never touch each other, not even diagonally.',
        'The numbers beside the grid tell how many squares of each row and column are part of a ship.',
        'Some squares are revealed from the start: a rounded end, a square middle piece, a round one-square boat or water.',
      ],
      es: [
        'La flota se muestra bajo el tablero. Los barcos son líneas rectas de 1 a 4 casillas (de 1 a 3 en la cuadrícula más pequeña), en horizontal o en vertical.',
        'Los barcos nunca se tocan, ni siquiera en diagonal.',
        'Los números junto a la cuadrícula indican cuántas casillas de cada fila y columna son parte de un barco.',
        'Algunas casillas están reveladas desde el principio: un extremo redondeado, una pieza central cuadrada, un barco redondo de una casilla o agua.',
      ],
    },
    controls: {
      en: [
        'Tap a square to cycle: water → ship → empty. Drag to apply the same mark to several squares.',
        'When you mark a ship square, the app fills in water on its four diagonals. Settings can switch this off (“Auto-fill water diagonal to ships”).',
        'A ship in the fleet list fades once you have drawn it and closed it in with water. Ships that touch or bend turn red.',
      ],
      es: [
        'Toca una casilla para alternar: agua → barco → vacía. Arrastra para aplicar la misma marca a varias casillas.',
        'Cuando marcas una casilla de barco, la app pone agua en sus cuatro diagonales. Puedes desactivarlo en Ajustes («Poner agua automáticamente en las diagonales de los barcos»).',
        'Un barco de la lista de la flota se atenúa cuando lo has dibujado y rodeado de agua. Los barcos que se tocan o se doblan se ponen rojos.',
      ],
    },
    examples: [
      ex(
        {
          grid: ['^ ^1 ^1 ^1 ^1', '^3 :shipl :ship :shipr :water', '^0 :water :water :water :water', '^1 :water :water :water :ship1', '^0 :water :water :water :water'],
          mark: 'ok',
        },
        'A solved 4×4 with a ship of three and a boat of one. Each number counts the ship squares in its row or column, and the two ships don’t touch, not even at a corner.',
        'Un 4×4 resuelto con un barco de tres y uno de una casilla. Cada número cuenta las casillas de barco de su fila o columna, y los dos barcos no se tocan, ni siquiera por una esquina.',
      ),
    ],
    tips: {
      en: [
        'A row or column with a 0 is all water. Fill the rest of a line with water as soon as it has all its ship squares.',
        'If a line needs as many ship squares as it has free squares, they are all ship.',
        'A rounded end tells you which way its ship continues: the next square that way is ship, and the squares around the end are water.',
        'Place the biggest ship first: there are few places with enough room for it.',
      ],
      es: [
        'Una fila o columna con un 0 es toda agua. Llena de agua el resto de una línea en cuanto tenga todas sus casillas de barco.',
        'Si una línea necesita tantas casillas de barco como casillas libres tiene, todas son barco.',
        'Un extremo redondeado indica hacia dónde continúa su barco: la siguiente casilla en esa dirección es barco, y las que rodean el extremo son agua.',
        'Coloca primero el barco más grande: hay pocos sitios con espacio suficiente para él.',
      ],
    },
  },

  masyu: {
    goal: {
      en: 'Draw a single closed loop that passes through every pearl.',
      es: 'Dibuja un único bucle cerrado que pase por todas las perlas.',
    },
    rules: {
      en: [
        'The loop moves horizontally or vertically from the centre of a square to the centre of the next, never crossing itself or branching.',
        'Black (filled) pearl: the loop turns on the pearl, and then goes straight through the next square on both sides.',
        'White (hollow) pearl: the loop goes straight through the pearl, and turns in the square just before it, just after it, or both.',
        'The loop doesn’t have to visit the squares without a pearl.',
      ],
      es: [
        'El bucle se mueve en horizontal o vertical del centro de una casilla al centro de la siguiente, sin cruzarse ni ramificarse.',
        'Perla negra (rellena): el bucle gira en la perla, y después sigue recto por la casilla siguiente en ambos lados.',
        'Perla blanca (hueca): el bucle pasa recto por la perla, y gira en la casilla justo anterior, en la justo posterior o en ambas.',
        'El bucle no tiene que pasar por las casillas sin perla.',
      ],
    },
    controls: {
      en: [
        'Drag from square to square to draw the loop; a drag that starts on a line erases.',
        'Tap the gap between two squares to cycle: line → ✕ → empty. A ✕ is your own mark for a gap the loop doesn’t use.',
        'A pearl gets a red outline when the loop breaks its rule.',
      ],
      es: [
        'Arrastra de casilla en casilla para dibujar el bucle; si empiezas sobre una línea, borra.',
        'Toca el hueco entre dos casillas para alternar: línea → ✕ → vacío. La ✕ es tu propia marca para un hueco que el bucle no usa.',
        'Una perla recibe un contorno rojo cuando el bucle incumple su regla.',
      ],
    },
    examples: [
      ex(
        { grid: [':black . .', '. . .', '. . :white', '. . .'], board: 'centres', lines: [['loop', '0,0 2,0 2,3 0,3 0,0']], mark: 'ok' },
        'The loop turns on the black pearl and leaves it straight in both directions. It runs straight through the white pearl and turns in the very next square.',
        'El bucle gira en la perla negra y sale de ella recto en ambas direcciones. Atraviesa recto la perla blanca y gira en la casilla siguiente.',
      ),
      ex(
        { grid: ['!:black .', '. .', '. .'], board: 'centres', lines: [['loop', '0,0 1,0 1,2 0,2 0,0']], mark: 'bad' },
        'Not allowed: to the right of the black pearl the loop turns in the very next square. It has to go straight through that square first.',
        'No permitido: a la derecha de la perla negra el bucle gira en la casilla siguiente. Antes tiene que atravesar recto esa casilla.',
      ),
      ex(
        { grid: ['. . !:white . .'], board: 'centres', lines: [['loop', '0,0 4,0']], mark: 'bad' },
        'Not allowed: the line runs straight on through the squares on both sides of the white pearl. It has to turn in at least one of them.',
        'No permitido: la línea sigue recta por las casillas de ambos lados de la perla blanca. Tiene que girar en al menos una de ellas.',
      ),
    ],
    tips: {
      en: [
        'A black pearl on the edge or one square away from it must send a line away from the edge: it needs two squares of room on each side it uses.',
        'A white pearl on the edge runs along the edge.',
        'Two black pearls side by side can’t be joined to each other: both send a line outward, away from the other.',
        'Three or more white pearls in a row can’t be threaded by one straight line: the loop crosses each of them the other way.',
        'Mark gaps you know are unused with ✕, and watch out for small closed loops that leave pearls outside.',
      ],
      es: [
        'Una perla negra en el borde o a una casilla de él debe enviar una línea alejándose del borde: necesita dos casillas de espacio en cada lado que usa.',
        'Una perla blanca en el borde va a lo largo del borde.',
        'Dos perlas negras juntas no pueden unirse entre sí: ambas envían una línea hacia fuera, alejándose de la otra.',
        'Tres o más perlas blancas seguidas no pueden ensartarse con una sola línea recta: el bucle cruza cada una en la otra dirección.',
        'Marca con ✕ los huecos que sabes que no se usan, y vigila los bucles pequeños cerrados que dejan perlas fuera.',
      ],
    },
  },

  norinori: {
    goal: {
      en: 'Shade squares in pairs (dominoes) so that every region ends up with exactly two shaded squares.',
      es: 'Sombrea casillas por parejas (dominós) para que cada región acabe con exactamente dos casillas sombreadas.',
    },
    rules: {
      en: [
        'Every colored region contains exactly two shaded squares.',
        'Every shaded square touches exactly one other shaded square side by side: together they form a domino.',
        'Dominoes never touch each other side by side (diagonally is fine).',
        'A domino may lie across the border between two regions. It then counts as one shaded square for each of them.',
      ],
      es: [
        'Cada región de color contiene exactamente dos casillas sombreadas.',
        'Cada casilla sombreada toca por un lado exactamente a otra casilla sombreada: juntas forman un dominó.',
        'Los dominós nunca se tocan por los lados (en diagonal sí).',
        'Un dominó puede quedar sobre la frontera entre dos regiones. Entonces cuenta como una casilla sombreada para cada una.',
      ],
    },
    controls: {
      en: [
        'Tap to cycle: shaded → dot → empty. A dot is your own mark for a square you know is not shaded.',
        'Drag to apply the same mark to several squares.',
        'Shaded squares that break a rule turn red.',
      ],
      es: [
        'Toca para alternar: sombreada → punto → vacía. El punto es tu propia marca para una casilla que sabes que no se sombrea.',
        'Arrastra para aplicar la misma marca a varias casillas.',
        'Las casillas sombreadas que incumplen una regla se ponen rojas.',
      ],
    },
    examples: [
      ex(
        { grid: ['# # . .', '. . . #', '# # . #'], regions: ['a b b c', 'a b b c', 'a b c c'], mark: 'ok' },
        'A solved grid with three regions. Each region has two shaded squares, and the shaded squares pair up into three dominoes that don’t touch. The two dominoes on the left each lie across a region border.',
        'Una cuadrícula resuelta con tres regiones. Cada región tiene dos casillas sombreadas, y estas se emparejan en tres dominós que no se tocan. Los dos dominós de la izquierda quedan cada uno sobre una frontera entre regiones.',
      ),
      ex(
        { grid: ['#! #! #!', '. . .'], regions: ['a a b', 'a b b'], mark: 'bad' },
        'Not allowed: three shaded squares in a line. The middle one touches two others, so this is not a domino.',
        'No permitido: tres casillas sombreadas en línea. La del medio toca a otras dos, así que esto no es un dominó.',
      ),
    ],
    tips: {
      en: [
        'A region with only two squares is entirely shaded.',
        'Once a region has its two shaded squares, dot the rest of it. Dot the squares around every finished domino too.',
        'A square whose neighbours are all dotted can never be shaded: it would have no partner.',
        'If a shaded square without a partner has a single free neighbour, that neighbour is its partner.',
      ],
      es: [
        'Una región de solo dos casillas se sombrea entera.',
        'Cuando una región ya tiene sus dos casillas sombreadas, pon puntos en el resto. Pon puntos también alrededor de cada dominó terminado.',
        'Una casilla con todas sus vecinas con punto nunca puede sombrearse: no tendría pareja.',
        'Si una casilla sombreada sin pareja solo tiene una vecina libre, esa vecina es su pareja.',
      ],
    },
  },

  fillomino: {
    goal: {
      en: 'Write a number in every square so that each group of touching equal numbers contains exactly that many squares.',
      es: 'Escribe un número en cada casilla para que cada grupo de números iguales conectados tenga exactamente esa cantidad de casillas.',
    },
    rules: {
      en: [
        'Every square gets a number.',
        'Equal numbers that touch side by side form a group, and the size of a group must be the number written in it.',
        'So a 1 is alone, a 2 is part of a pair, a 3 belongs to a group of three, and so on.',
        'Two different groups of the same size can’t touch side by side: they would merge into one group that is too big.',
        'A group can contain several given numbers, or none at all.',
      ],
      es: [
        'Cada casilla lleva un número.',
        'Los números iguales que se tocan por los lados forman un grupo, y el tamaño de un grupo debe ser el número escrito en él.',
        'Así, un 1 está solo, un 2 forma pareja, un 3 pertenece a un grupo de tres, y así sucesivamente.',
        'Dos grupos distintos del mismo tamaño no pueden tocarse por los lados: se fundirían en un grupo demasiado grande.',
        'Un grupo puede contener varios números dados, o ninguno.',
      ],
    },
    controls: {
      en: [
        'Tap a square, then a number on the pad. Tap the same number again (or ⌫) to clear it.',
        'Turn on Notes to pencil in candidates.',
        'The lines between equal neighbours disappear, so groups show up as shapes. A complete group turns green; one that is too big turns red.',
      ],
      es: [
        'Toca una casilla y luego un número del teclado. Toca el mismo número otra vez (o ⌫) para borrarlo.',
        'Activa Notas para anotar candidatos.',
        'Las líneas entre vecinas iguales desaparecen, así que los grupos se ven como formas. Un grupo completo se pone verde; uno demasiado grande, rojo.',
      ],
    },
    examples: [
      ex(
        { grid: ['2 2 3', '1 3 3'], regions: ['a a b', 'c b b'], regionStyle: 'outline', mark: 'ok' },
        'The two 2s form a group of two, the three 3s a group of three, and the 1 stands alone.',
        'Los dos 2 forman un grupo de dos, los tres 3 un grupo de tres y el 1 está solo.',
      ),
      ex(
        { grid: ['!2 !2 !2 !2'], mark: 'bad' },
        'Not allowed: two pairs of 2s side by side merge into a single group of four 2s.',
        'No permitido: dos parejas de 2 juntas se funden en un único grupo de cuatro 2.',
      ),
    ],
    tips: {
      en: [
        'Finish the groups that already have the right size: every square around them takes a different number.',
        'A group that still has to grow and has only one free neighbour must grow through that neighbour.',
        'A single empty square closed in by finished groups is a 1.',
        'Not every group has a given number: when no given can reach a square, start a new group there.',
      ],
      es: [
        'Termina los grupos que ya tienen el tamaño correcto: todas las casillas a su alrededor llevan un número distinto.',
        'Un grupo que aún debe crecer y solo tiene una vecina libre debe crecer por ella.',
        'Una sola casilla vacía encerrada entre grupos terminados es un 1.',
        'No todos los grupos tienen un número dado: cuando ningún número dado puede llegar a una casilla, empieza ahí un grupo nuevo.',
      ],
    },
  },

  kuromasu: {
    goal: {
      en: 'Shade squares so that every number can see exactly that many unshaded squares.',
      es: 'Sombrea casillas para que cada número vea exactamente esa cantidad de casillas sin sombrear.',
    },
    rules: {
      en: [
        'A number looks up, down, left and right, as far as the next shaded square or the edge. It counts every square it sees, plus its own.',
        'Numbered squares are never shaded.',
        'Shaded squares can’t touch each other side by side (diagonally is fine).',
        'All unshaded squares must stay connected as one area.',
      ],
      es: [
        'Un número mira hacia arriba, abajo, izquierda y derecha, hasta la siguiente casilla sombreada o el borde. Cuenta todas las casillas que ve, más la suya.',
        'Las casillas con número nunca se sombrean.',
        'Las casillas sombreadas no pueden tocarse por los lados (en diagonal sí).',
        'Todas las casillas sin sombrear deben seguir conectadas como una única zona.',
      ],
    },
    controls: {
      en: [
        'Tap to cycle: shaded → dot → empty. A dot is your own mark for a square you know is not shaded.',
        'Drag to apply the same mark to several squares.',
        'A number turns grey when its view is settled and correct, and red when it can no longer be right. Shaded squares that touch turn red.',
      ],
      es: [
        'Toca para alternar: sombreada → punto → vacía. El punto es tu propia marca para una casilla que sabes que no se sombrea.',
        'Arrastra para aplicar la misma marca a varias casillas.',
        'Un número se pone gris cuando su vista está decidida y es correcta, y rojo cuando ya no puede cumplirse. Las casillas sombreadas que se tocan se ponen rojas.',
      ],
    },
    examples: [
      ex(
        ['*3 * #', '* . .', '# . .'],
        'The 3 sees the highlighted squares: itself, one square to the right and one below. A shaded square blocks its view in each direction.',
        'El 3 ve las casillas resaltadas: la suya, una a la derecha y una debajo. Una casilla sombreada le corta la vista en cada dirección.',
      ),
      ex(
        ['*5 * *', '* . .', '* . .'],
        'In a 3×3 grid, a 5 in the corner has to see its whole row and its whole column (1 + 2 + 2), so none of the highlighted squares can be shaded.',
        'En una cuadrícula de 3×3, un 5 en la esquina tiene que ver toda su fila y toda su columna (1 + 2 + 2), así que ninguna de las casillas resaltadas puede sombrearse.',
      ),
    ],
    tips: {
      en: [
        'A number that already sees its full count is closed off: shade the next square in every direction.',
        'A number equal to everything it could possibly see (its whole row plus its whole column) has no shaded square in its row or column.',
        'If a number can’t reach its count without looking in a certain direction, the first squares that way are unshaded.',
        'The neighbours of a shaded square are unshaded: dot them.',
      ],
      es: [
        'Un número que ya ve su cantidad completa queda cerrado: sombrea la siguiente casilla en cada dirección.',
        'Un número igual a todo lo que podría ver (toda su fila más toda su columna) no tiene ninguna casilla sombreada en su fila ni en su columna.',
        'Si un número no puede llegar a su cantidad sin mirar en cierta dirección, las primeras casillas en esa dirección quedan sin sombrear.',
        'Las vecinas de una casilla sombreada no se sombrean: márcalas con punto.',
      ],
    },
  },

  dominosa: {
    goal: {
      en: 'Split the grid into dominoes so that every domino of the set appears exactly once.',
      es: 'Divide la cuadrícula en dominós para que cada ficha del juego aparezca exactamente una vez.',
    },
    rules: {
      en: [
        'The grid shows the numbers of a full set of dominoes with the lines between them erased. A double-6 set has 28 dominoes, from 0-0 to 6-6.',
        'Every square belongs to exactly one domino, which covers two neighbouring squares.',
        'Each pair of numbers (0-0, 0-1, 2-5…) is used exactly once. The list under the board shows which ones are still free.',
      ],
      es: [
        'La cuadrícula muestra los números de un juego completo de dominó sin las líneas que separan las fichas. Un juego doble 6 tiene 28 fichas, de 0-0 a 6-6.',
        'Cada casilla pertenece exactamente a un dominó, que cubre dos casillas vecinas.',
        'Cada pareja de números (0-0, 0-1, 2-5…) se usa exactamente una vez. La lista bajo el tablero muestra cuáles siguen libres.',
      ],
    },
    controls: {
      en: [
        'Drag from a square onto a neighbouring one to place a domino. A domino that was in the way is removed.',
        'Tap a domino to remove it.',
        'Dominoes are colored by their number pair. A pair used twice turns red, and used pairs fade in the list.',
      ],
      es: [
        'Arrastra de una casilla a una vecina para colocar un dominó. Si había un dominó en medio, se quita.',
        'Toca un dominó para quitarlo.',
        'Los dominós se colorean según su pareja de números. Una pareja usada dos veces se pone roja, y las usadas se atenúan en la lista.',
      ],
    },
    examples: [
      ex(
        { grid: ['0 0 1', '1 1 0'], lines: [['domino', '0,0 1,0'], ['domino', '0,1 1,1'], ['domino', '2,0 2,1']], mark: 'ok' },
        'A tiny set with three dominoes: 0-0, 0-1 and 1-1. The only two 0s that touch are in the top row, so the 0-0 goes there. The only two 1s that touch are below them, and the last two squares make the 0-1.',
        'Un juego diminuto con tres fichas: 0-0, 0-1 y 1-1. Los únicos dos 0 que se tocan están en la fila de arriba, así que el 0-0 va ahí. Los únicos dos 1 que se tocan están debajo, y las dos últimas casillas forman el 0-1.',
      ),
    ],
    tips: {
      en: [
        'Look for a pair of numbers that appears side by side in only one place: that place is a domino.',
        'Doubles are a good place to start: two equal numbers touch in few places.',
        'Once a pair is placed, every other spot where the same two numbers touch is not a domino: those squares pair up with another neighbour.',
        'A square with only one free neighbour forms a domino with it. Corners and edges get there first.',
      ],
      es: [
        'Busca una pareja de números que aparezca junta en un solo sitio: ese sitio es un dominó.',
        'Los dobles son un buen comienzo: dos números iguales se tocan en pocos sitios.',
        'Cuando una pareja ya está colocada, cualquier otro sitio donde se toquen esos dos números no es un dominó: esas casillas se emparejan con otra vecina.',
        'Una casilla con una sola vecina libre forma un dominó con ella. Las esquinas y los bordes llegan antes a eso.',
      ],
    },
  },

  numberlink: {
    goal: {
      en: 'Connect every pair of equal numbers with a path, using every square of the grid.',
      es: 'Conecta cada pareja de números iguales con un camino, usando todas las casillas de la cuadrícula.',
    },
    rules: {
      en: [
        'Each number appears twice. A path joins the two and runs from square to square horizontally or vertically.',
        'Paths never cross, branch or share squares.',
        'Every square of the grid must be on a path, so the shortest route is often not the right one.',
      ],
      es: [
        'Cada número aparece dos veces. Un camino une los dos y avanza de casilla en casilla en horizontal o vertical.',
        'Los caminos nunca se cruzan, ramifican ni comparten casillas.',
        'Todas las casillas de la cuadrícula deben estar en un camino, así que la ruta más corta a menudo no es la correcta.',
      ],
    },
    controls: {
      en: [
        'Drag from a number, or from any square of its path, through other squares to paint them in its color.',
        'Dragging over another path replaces it. A drag that starts on an empty square erases, and a tap on a path square clears it.',
        'A number gets a glow ring once its pair is connected. Squares where a path branches turn red.',
      ],
      es: [
        'Arrastra desde un número, o desde cualquier casilla de su camino, por otras casillas para pintarlas de su color.',
        'Arrastrar sobre otro camino lo sustituye. Si empiezas en una casilla vacía, borra; y un toque en una casilla de un camino la limpia.',
        'Un número se rodea de un halo cuando su pareja está conectada. Las casillas donde un camino se ramifica se ponen rojas.',
      ],
    },
    examples: [
      ex(
        { grid: ['(1:a) (2:b) .', '. (2:b) .', '. . (1:a)'], lines: [['path-a', '0,0 0,2 2,2'], ['path-b', '1,0 2,0 2,1 1,1']], mark: 'ok' },
        'A solved 3×3. The two 2s are right next to each other, but joining them directly would leave two squares empty, so their path goes the long way round.',
        'Un 3×3 resuelto. Los dos 2 están pegados, pero unirlos directamente dejaría dos casillas vacías, así que su camino da la vuelta larga.',
      ),
    ],
    tips: {
      en: [
        'An empty square with only two open neighbours is a corridor: the path enters through one and leaves through the other. Empty corners of the grid are always like that.',
        'A number with a single open neighbour starts its path there.',
        'Don’t wall off an area with no numbers in it: no path could fill it.',
      ],
      es: [
        'Una casilla vacía con solo dos vecinas abiertas es un pasillo: el camino entra por una y sale por la otra. Las esquinas vacías de la cuadrícula siempre son así.',
        'Un número con una sola vecina abierta empieza su camino por ella.',
        'No dejes encerrada una zona sin números: ningún camino podría llenarla.',
      ],
    },
  },

  thermometers: {
    goal: {
      en: 'Fill the thermometers with mercury so that every row and column has the right number of filled squares.',
      es: 'Llena los termómetros de mercurio para que cada fila y columna tenga la cantidad correcta de casillas llenas.',
    },
    rules: {
      en: [
        'Each thermometer fills from its round bulb towards its tip, without gaps. It can be empty, partly filled or full.',
        'The numbers beside the grid tell how many squares are filled in each row and column.',
        'Every square is part of a thermometer. Thermometers can bend.',
      ],
      es: [
        'Cada termómetro se llena desde su bulbo redondo hacia la punta, sin huecos. Puede estar vacío, medio lleno o lleno.',
        'Los números junto a la cuadrícula indican cuántas casillas están llenas en cada fila y columna.',
        'Cada casilla es parte de un termómetro. Los termómetros pueden doblarse.',
      ],
    },
    controls: {
      en: [
        'Tap a square to cycle: filled → ✕ → empty. A ✕ is your own mark for a square you know stays empty.',
        'Drag to apply the same mark to several squares.',
        'Numbers turn grey when satisfied and red when exceeded. A filled square right after a ✕ on the same thermometer is tinted red.',
      ],
      es: [
        'Toca una casilla para alternar: llena → ✕ → vacía. La ✕ es tu propia marca para una casilla que sabes que queda vacía.',
        'Arrastra para aplicar la misma marca a varias casillas.',
        'Los números se ponen grises al cumplirse y rojos si se superan. Una casilla llena justo después de una ✕ en el mismo termómetro se tiñe de rojo.',
      ],
    },
    examples: [
      ex(
        {
          grid: ['^ ^2 ^1 ^1', '^3 . . .', '^1 . . .'],
          lines: [['thermo', '1,1 3,1'], ['mercury', '1,1 3,1'], ['thermo', '1,2 3,2'], ['mercury', '1,2 1,2']],
          mark: 'ok',
        },
        'Two thermometers with their bulbs on the left. The top one is full, which gives its row 3 filled squares. The bottom one has only its bulb filled. The columns then count 2, 1 and 1.',
        'Dos termómetros con el bulbo a la izquierda. El de arriba está lleno, lo que da 3 casillas llenas en su fila. El de abajo solo tiene lleno el bulbo. Las columnas cuentan entonces 2, 1 y 1.',
      ),
      ex(
        { grid: ['. . . .'], lines: [['thermo', '0,0 3,0'], ['mercury-gap', '2,0 3,0']], mark: 'bad' },
        'Not allowed: the tip is filled but the bulb is empty. Mercury always starts at the bulb.',
        'No permitido: la punta está llena pero el bulbo está vacío. El mercurio siempre empieza en el bulbo.',
      ),
    ],
    tips: {
      en: [
        'A filled square fills everything between it and the bulb. An empty square empties everything between it and the tip.',
        'A row or column with a 0 is all empty; one whose number equals its length is all filled.',
        'A tip can only be filled if its whole thermometer is, and a bulb can only be empty if its whole thermometer is.',
        'When a line needs only a few filled squares, look at its bulbs first; when it needs nearly all of them, look at which tips can stay empty.',
      ],
      es: [
        'Una casilla llena obliga a llenar todo lo que hay entre ella y el bulbo. Una vacía obliga a vaciar todo lo que hay entre ella y la punta.',
        'Una fila o columna con un 0 está toda vacía; si su número iguala su longitud, está toda llena.',
        'Una punta solo puede estar llena si lo está todo su termómetro, y un bulbo solo puede estar vacío si lo está todo su termómetro.',
        'Cuando una línea necesita pocas casillas llenas, mira primero sus bulbos; cuando las necesita casi todas, mira qué puntas pueden quedar vacías.',
      ],
    },
  },

  mosaic: {
    goal: {
      en: 'Shade squares so that every number matches the shaded squares around it, revealing a picture.',
      es: 'Sombrea casillas para que cada número coincida con las casillas sombreadas a su alrededor, descubriendo una imagen.',
    },
    rules: {
      en: [
        'A number counts the shaded squares in the 3×3 block centred on it: its eight neighbours and its own square.',
        'On an edge the block only has 6 squares, and in a corner only 4.',
        'A numbered square can be shaded or not, just like any other.',
        'Squares without a number can be either. The puzzle is solved when every number is right.',
      ],
      es: [
        'Un número cuenta las casillas sombreadas del bloque de 3×3 centrado en él: sus ocho vecinas y su propia casilla.',
        'En un borde el bloque solo tiene 6 casillas, y en una esquina solo 4.',
        'Una casilla con número puede sombrearse o no, como cualquier otra.',
        'Las casillas sin número pueden ser de cualquier tipo. El puzzle está resuelto cuando todos los números se cumplen.',
      ],
    },
    controls: {
      en: [
        'Tap to cycle: shaded → dot → empty. A dot is your own mark for a square you know is not shaded.',
        'Drag to apply the same mark to several squares.',
        'A number turns grey when its block is fully decided and correct, and red when it can no longer be met.',
      ],
      es: [
        'Toca para alternar: sombreada → punto → vacía. El punto es tu propia marca para una casilla que sabes que no se sombrea.',
        'Arrastra para aplicar la misma marca a varias casillas.',
        'Un número se pone gris cuando su bloque está decidido y es correcto, y rojo cuando ya no puede cumplirse.',
      ],
    },
    examples: [
      ex(
        { grid: ['#3 # :dot', '# 4 :dot', ':dot :dot #'], mark: 'ok' },
        'The 4 in the middle counts all nine squares: four of them are shaded. The 3 in the corner only counts the four squares of its corner, and three are shaded, including its own.',
        'El 4 del centro cuenta las nueve casillas: cuatro están sombreadas. El 3 de la esquina solo cuenta las cuatro casillas de su esquina, y tres están sombreadas, incluida la suya.',
      ),
      ex(
        ['#4 # .', '# # .', '. . .'],
        'A 4 in a corner fills its whole block, and so does a 6 on an edge or a 9 anywhere. A 0 does the opposite: dot every square around it.',
        'Un 4 en una esquina llena todo su bloque, igual que un 6 en un borde o un 9 en cualquier sitio. Un 0 hace lo contrario: pon punto en todas las casillas a su alrededor.',
      ),
    ],
    tips: {
      en: [
        'Start with the numbers that decide a whole block: 0 and 9, 6 on an edge, 4 in a corner.',
        'When a number already has all its shaded squares, dot the rest of its block. When it needs every remaining square, shade them all.',
        'Compare two numbers side by side. Their blocks overlap, so the difference between them comes from the squares only one of them covers.',
      ],
      es: [
        'Empieza por los números que deciden un bloque entero: 0 y 9, 6 en un borde, 4 en una esquina.',
        'Cuando un número ya tiene todas sus casillas sombreadas, pon punto en el resto de su bloque. Cuando necesita todas las que quedan, sombréalas todas.',
        'Compara dos números contiguos. Sus bloques se solapan, así que la diferencia entre ellos viene de las casillas que solo cubre uno de los dos.',
      ],
    },
  },
  taketen: {
    goal: {
      en: 'Cross out every number on the sheet, two at a time.',
      es: 'Tacha todos los números de la hoja, de dos en dos.',
    },
    rules: {
      en: [
        'Two numbers make a pair when they are equal or add up to 10.',
        'A pair can be crossed out when the two numbers are next to each other: side by side, one above the other, or diagonally.',
        'Crossed-out numbers no longer count. A pair can also be taken across them, in a straight line along a row, a column or a diagonal, as long as no other number is in the way.',
        'The sheet reads like text: the end of each row continues at the start of the next. Two numbers that follow each other in that order, with only crossed-out numbers between them, also make a pair.',
        'A row with every number crossed out disappears, and the rows below move up.',
        'Add numbers copies the numbers still on the sheet to the end, in reading order. Every sheet can be cleared without it.',
      ],
      es: [
        'Dos números forman pareja cuando son iguales o suman 10.',
        'Una pareja se puede tachar cuando los dos números están juntos: uno al lado del otro, uno encima del otro o en diagonal.',
        'Los números tachados ya no cuentan. También se puede formar pareja pasando por encima de ellos, en línea recta por una fila, una columna o una diagonal, siempre que no haya otro número en medio.',
        'La hoja se lee como un texto: el final de cada fila continúa al principio de la siguiente. Dos números seguidos en ese orden, con solo números tachados entre ellos, también forman pareja.',
        'Una fila con todos sus números tachados desaparece, y las filas de abajo suben.',
        'Añadir números copia al final los números que quedan en la hoja, en orden de lectura. Toda hoja se puede vaciar sin usarlo.',
      ],
    },
    controls: {
      en: [
        'Tap a number, then tap its partner. Or drag from one number to the other.',
        'Tap the selected number again to let go of it.',
        'If the two numbers cannot be paired, they shake and the second one stays selected.',
        'Hint shows a pair that can be crossed out. When there is none, the game tells you so.',
      ],
      es: [
        'Toca un número y luego su pareja. O arrastra de un número al otro.',
        'Toca otra vez el número seleccionado para soltarlo.',
        'Si los dos números no se pueden emparejar, tiemblan y el segundo queda seleccionado.',
        'Pista muestra una pareja que se puede tachar. Cuando no hay ninguna, el juego te lo dice.',
      ],
    },
    examples: [
      ex(
        { grid: ['*3 1 *8', '6 *7 *8'], mark: 'ok' },
        '3 and 7 touch diagonally and add up to 10. The two 8s are equal and one is above the other. Either pair can be crossed out.',
        '3 y 7 se tocan en diagonal y suman 10. Los dos 8 son iguales y uno está encima del otro. Cualquiera de las dos parejas se puede tachar.',
      ),
      ex(
        { grid: ['*4 ~ 5 2', '9 ~ 1 8', '3 7 *6 5'], mark: 'ok' },
        'The grey squares are crossed out. 4 and 6 are on the same diagonal with only a crossed-out square between them, so they make a pair.',
        'Las casillas grises están tachadas. 4 y 6 están en la misma diagonal con solo una casilla tachada entre ellos, así que forman pareja.',
      ),
      ex(
        { grid: ['5 1 2 *9', '*9 3 6 2'], mark: 'ok' },
        'The 9 at the end of the first row is followed, in reading order, by the 9 at the start of the second row. They make a pair.',
        'Al 9 del final de la primera fila le sigue, en orden de lectura, el 9 del principio de la segunda. Forman pareja.',
      ),
      ex(
        { grid: ['!2 5 !8 1'], mark: 'bad' },
        '2 and 8 add up to 10, but the 5 between them is still there. Cross out the 5 first.',
        '2 y 8 suman 10, pero el 5 que hay entre ellos sigue ahí. Tacha primero el 5.',
      ),
    ],
    tips: {
      en: [
        'Before taking a pair, look at what it opens up and what it leaves alone. Each number has few partners nearby, and using up the wrong one can leave another without a pair.',
        'Pairs in the same row or in neighbouring squares are easy to see. Check the columns and diagonals too, and the ends of the rows.',
        'Clearing a whole row brings the rows around it together, which creates new pairs between them.',
        'If you get stuck, try Undo before Add numbers: a different order often clears the sheet.',
      ],
      es: [
        'Antes de tachar una pareja, mira qué deja libre y qué deja solo. Cada número tiene pocos compañeros cerca, y gastar el que no toca puede dejar a otro sin pareja.',
        'Las parejas en la misma fila o en casillas vecinas se ven enseguida. Mira también las columnas, las diagonales y los extremos de las filas.',
        'Vaciar una fila entera junta las filas de alrededor, y eso crea parejas nuevas entre ellas.',
        'Si te atascas, prueba Deshacer antes que Añadir números: un orden distinto suele vaciar la hoja.',
      ],
    },
  },
  alibi: {
    goal: {
      en: 'Work out where everyone in the house was standing, and so who was alone with the victim.',
      es: 'Averigua dónde estaba cada persona de la casa y, con eso, quién estaba a solas con la víctima.',
    },
    rules: {
      en: [
        'Everyone, the victim (☠) included, stands on a different square: exactly one person in each row and exactly one in each column.',
        'Nobody stands on a square that holds an object.',
        'Every statement is true.',
        '“Next to” an object means on a square that shares a side with it, in the same room. “Touching diagonally” means the two squares meet at a corner, whatever the walls.',
        '“In a row above” means anywhere higher up on the board, in any column. Below, left and right work the same way.',
        'Exactly one suspect was in the victim’s room: the culprit. Any other room can hold several people, or nobody.',
      ],
      es: [
        'Cada persona, incluida la víctima (☠), ocupa una casilla distinta: exactamente una persona en cada fila y exactamente una en cada columna.',
        'Nadie está en una casilla que tenga un objeto.',
        'Todas las declaraciones son ciertas.',
        '«Junto a» un objeto significa en una casilla que comparte un lado con él, dentro de la misma habitación. «Tocar en diagonal» significa que las dos casillas se tocan por una esquina, haya o no paredes.',
        '«En una fila por encima» significa en cualquier fila más alta del tablero, en cualquier columna. Por debajo, izquierda y derecha funcionan igual.',
        'En la habitación de la víctima había exactamente un sospechoso: el culpable. En cualquier otra habitación puede haber varias personas, o ninguna.',
      ],
    },
    controls: {
      en: [
        'Tap a statement to pick that person. The board shows the ✕ marks of the person picked.',
        'Tap a square to cycle: ✕ (this person wasn’t here) → place the person → empty. Drag to put ✕ on several squares; a drag that starts on a ✕ erases them instead.',
        'Tap someone on the board to pick them, and tap them again to take them off.',
        'When you place someone, the app adds a fainter ✕ along their row and column for everybody else. Tapping one of those places the person straight away. Settings can switch this off.',
        'People who share a row or column get a red ring. A room named in the picked person’s statement is shown lighter.',
        'The puzzle is solved when everyone is on the right square. The culprit is then named.',
      ],
      es: [
        'Toca una declaración para elegir a esa persona. El tablero muestra las ✕ de la persona elegida.',
        'Toca una casilla para alternar: ✕ (esta persona no estaba aquí) → colocar a la persona → vacía. Arrastra para poner ✕ en varias casillas; si empiezas sobre una ✕, las borra.',
        'Toca a alguien en el tablero para elegirlo, y vuelve a tocarlo para quitarlo.',
        'Al colocar a alguien, la app pone una ✕ más tenue en su fila y su columna para todos los demás. Si tocas una de esas, coloca a la persona directamente. Puedes desactivarlo en Ajustes.',
        'Las personas que comparten fila o columna llevan un aro rojo. La habitación nombrada en la declaración de la persona elegida se ve más clara.',
        'El caso está resuelto cuando todos están en su casilla. Entonces se nombra al culpable.',
      ],
    },
    examples: [
      ex(
        { grid: ['. . ☠ .', '. . . *B', 'A 🌿 . .', '. C . .'], regions: ['a a b b', 'a a b b', 'c c c c', 'c c c c'], mark: 'ok' },
        'A solved 4×4: one person in every row and every column. Bruno (B) is the only one in the victim’s room, so Bruno did it.',
        'Un 4×4 resuelto: una persona en cada fila y en cada columna. Bruno (B) es el único en la habitación de la víctima, así que fue Bruno.',
      ),
      ex(
        { grid: ['. *. .', '*. 🌿 .', '. *. .'], regions: ['a a b', 'a a b', 'a a b'] },
        '“Next to a plant” leaves the three highlighted squares. The square to the right of the plant is in another room, so it doesn’t count.',
        '«Junto a una planta» deja las tres casillas resaltadas. La casilla a la derecha de la planta está en otra habitación, así que no cuenta.',
      ),
      ex(
        { grid: ['!A . .', '. . B', '!C . .'], regions: ['a a b', 'a a b', 'a a b'], mark: 'bad' },
        'Not allowed: Ana (A) and Carla (C) are in the same column.',
        'No permitido: Ana (A) y Carla (C) están en la misma columna.',
      ),
    ],
    tips: {
      en: [
        'Start with the statements that leave the fewest squares: a named room, or an object that appears only once or twice.',
        'Each person has their own ✕ marks. Take the statements one at a time and cross out what each one rules out.',
        'Statements about two people work both ways: if Ana was in a row above Bruno, Ana can’t be in the bottom row and Bruno can’t be in the top row.',
        'If someone can only be in one row or column, nobody else can use it.',
        'Keep the victim’s room in mind: once you know it, exactly one suspect fits in it and everyone else is outside.',
      ],
      es: [
        'Empieza por las declaraciones que dejan menos casillas: una habitación con nombre, o un objeto que solo aparece una o dos veces.',
        'Cada persona tiene sus propias ✕. Ve declaración por declaración y tacha lo que descarta cada una.',
        'Las declaraciones sobre dos personas sirven en ambos sentidos: si Ana estaba en una fila por encima de Bruno, Ana no puede estar en la última fila ni Bruno en la primera.',
        'Si alguien solo puede estar en una fila o columna, nadie más puede usarla.',
        'Ten presente la habitación de la víctima: en cuanto la conozcas, en ella cabe exactamente un sospechoso y todos los demás están fuera.',
      ],
    },
  },
  logicgrid: {
    goal: {
      en: 'Use the clues to work out which item of each group belongs to each person.',
      es: 'Usa las pistas para averiguar qué elemento de cada grupo corresponde a cada persona.',
    },
    rules: {
      en: [
        'The people are the columns. The rows come in groups (pets, sports, ages…) with as many items as there are people.',
        'In every group each person has exactly one item, and no two people have the same one: one ✓ in each column of the group and one in each row.',
        'Every clue is true.',
        '“Whoever has a dog” is one of the people, and you may not know which yet. A clue never compares someone with themselves: “Ana is older than whoever has a dog” also tells you the dog isn’t Ana’s.',
        '“Ana has a dog or a cat” means one of the two is hers; the other belongs to someone else.',
      ],
      es: [
        'Las personas son las columnas. Las filas van en grupos (mascotas, deportes, edades…) con tantos elementos como personas.',
        'En cada grupo cada persona tiene exactamente un elemento, y no hay dos personas con el mismo: un ✓ en cada columna del grupo y uno en cada fila.',
        'Todas las pistas son ciertas.',
        '«Quien tiene un perro» es una de las personas, y puede que aún no sepas cuál. Una pista nunca compara a alguien consigo mismo: «Ana es mayor que quien tiene un perro» también te dice que el perro no es de Ana.',
        '«Ana tiene un perro o un gato» significa que uno de los dos es suyo; el otro es de otra persona.',
      ],
    },
    controls: {
      en: [
        'Tap a square to cycle: ✕ (it isn’t theirs) → ✓ (it is) → empty. Drag to put ✕ on several squares; a drag that starts on a ✕ erases them instead.',
        'When you place a ✓, the app adds a fainter ✕ to the rest of its row and of its column within the group. Settings can switch this off.',
        'Two ✓ in the same row, or in the same column of a group, turn red.',
        'Tap a clue to cross it off once you have used it up; tap it again to bring it back.',
        'The puzzle is solved when every ✓ is in place. You don’t need to fill in the ✕.',
      ],
      es: [
        'Toca una casilla para alternar: ✕ (no es suyo) → ✓ (sí lo es) → vacía. Arrastra para poner ✕ en varias casillas; si empiezas sobre una ✕, las borra.',
        'Al colocar un ✓, la app pone una ✕ más tenue en el resto de su fila y de su columna dentro del grupo. Puedes desactivarlo en Ajustes.',
        'Dos ✓ en la misma fila, o en la misma columna de un grupo, se ponen en rojo.',
        'Toca una pista para tacharla cuando ya la hayas aprovechado del todo; tócala otra vez para recuperarla.',
        'El cuadro está resuelto cuando todos los ✓ están en su sitio. No hace falta rellenar las ✕.',
      ],
    },
    examples: [
      ex(
        ['_ ^A ^B ^C', '^🐶 *✓ :x :x', '^🐱 :x :x *✓', '^🐰 :x *✓ :x'],
        'A solved group: one ✓ in every row and every column. Ana (A) has the dog, Carla (C) the cat and Bruno (B) the rabbit.',
        'Un grupo resuelto: un ✓ en cada fila y en cada columna. Ana (A) tiene el perro, Carla (C) el gato y Bruno (B) el conejo.',
      ),
      ex(
        ['_ ^A ^B ^C', '^🐶 . . .', '^🐱 . . .', '^🐰 *:x . .'],
        '“Ana has a dog or a cat”: the rabbit isn’t hers, so it gets a ✕ in her column (A).',
        '«Ana tiene un perro o un gato»: el conejo no es suyo, así que lleva una ✕ en su columna (A).',
      ),
      ex(
        ['_ ^A ^B ^C', '^6 . . *:x', '^7 . . .', '^8 *:x . .'],
        '“Ana is younger than Carla”: Ana (A) can’t be the oldest and Carla (C) can’t be the youngest.',
        '«Ana es menor que Carla»: Ana (A) no puede ser la mayor ni Carla (C) la menor.',
      ),
      ex(
        ['_ ^A ^B ^C', '^🐶 !✓ . .', '^🐱 !✓ . .', '^🐰 . . .'],
        'Not allowed: Ana (A) has two pets.',
        'No permitido: Ana (A) tiene dos mascotas.',
      ),
    ],
    tips: {
      en: [
        'Start with the clues that name a person: they put a ✓ or some ✕ on the grid straight away.',
        'A clue that links two groups works person by person. “Whoever has a dog plays tennis”: anyone who can’t have the dog can’t play tennis either, and the other way round.',
        '“Whoever has a dog doesn’t play tennis” only helps once you know who has one of the two: then the other gets a ✕ for that person.',
        'With ages, look at the ends. Someone older than another person can’t be the youngest, and “one year older” rules out more: the two ages must be next to each other.',
        'When a row or a column of a group has a single empty square left, the ✓ goes there.',
      ],
      es: [
        'Empieza por las pistas que nombran a una persona: ponen un ✓ o alguna ✕ en el cuadro enseguida.',
        'Una pista que une dos grupos se aplica persona a persona. «Quien tiene un perro juega al tenis»: quien no puede tener el perro tampoco puede jugar al tenis, y al revés.',
        '«Quien tiene un perro no juega al tenis» solo ayuda cuando sabes quién tiene una de las dos cosas: entonces la otra lleva una ✕ para esa persona.',
        'Con las edades, mira los extremos. Quien es mayor que otra persona no puede ser el más joven, y «un año más» descarta todavía más: las dos edades tienen que ser seguidas.',
        'Cuando en una fila o una columna de un grupo queda una sola casilla libre, ahí va el ✓.',
      ],
    },
  },
};

export const GUIDE_IDS = Object.keys(RAW);

export function guideFor(id: string, lang: Lang): Guide | null {
  const g = RAW[id];
  if (!g) return null;
  return {
    goal: g.goal[lang],
    rules: g.rules[lang],
    controls: NO_COMMON.has(id) ? g.controls[lang] : [...g.controls[lang], (NO_CHECK.has(id) ? UNDO_ONLY : COMMON)[lang]],
    examples: g.examples.map((e) => e[lang]),
    tips: g.tips[lang],
  };
}
