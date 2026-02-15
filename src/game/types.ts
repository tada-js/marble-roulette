export type Rng = () => number;

export type Layout = "classic" | "roulette" | "zigzag";

export type Point = readonly [number, number];

export interface Peg {
  x: number;
  y: number;
  r: number;
}

export interface Slot {
  idx: number;
  x0: number;
  x1: number;
  label: string;
}

export interface CorridorBand {
  y0: number;
  y1: number;
}

export interface Corridor {
  worldW: number;
  startY: number;
  endY: number;
  wideHalf: number;
  narrowHalf: number;
  clearBands: CorridorBand[];
}

export interface SegmentBins {
  binH: number;
  bins: number[][];
}

export interface WallSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  id?: string;
  // Precomputed fields for faster collision checks (filled by buildWallSegments).
  dx: number;
  dy: number;
  len2: number;
  yMin: number;
  yMax: number;
}

export type FixedEntity =
  | { id: string; type: "polyline"; points: Point[] }
  | { id: string; type: "box"; x: number; y: number; w: number; h: number; rot?: number };

export interface Propeller {
  id: string;
  x: number;
  y: number;
  len: number;
  omega: number;
  phase: number;
  maxSurf?: number;
  bounce?: number;
  mix?: number;
  down?: number;
  maxUp?: number;
}

export interface Rotor {
  id?: string;
  x: number;
  y: number;
  r: number;
  omega: number;
  maxSurf?: number;
  bounce?: number;
  kick?: number;
  dampT?: number;
  down?: number;
  maxUp?: number;
  phase?: number;
}

export interface RouletteLayout {
  entities: FixedEntity[];
  spawnY: number;
  topY: number;
  spawnBoundsAtY: (y: number) => { left: number; right: number };
}

export interface ZigzagLayout {
  entities: FixedEntity[];
  spawnY: number;
  topY: number;
  spawnBoundsAtY: (y: number) => { left: number; right: number };
  propellers: Propeller[];
  rotors: Rotor[];
}

export interface Board {
  layout: Layout;
  worldW: number;
  worldH: number;
  pegR: number;
  ballR: number;
  rows: number;
  cols: number;
  topPad: number;
  sidePad: number;
  slotCount: number;
  slotH: number;
  slotW: number;
  pegs: Peg[];
  pegRows: Peg[][];
  pegGapX: number;
  pegGapY: number;
  corridor: Corridor | null;
  roulette: RouletteLayout | null;
  zigzag: ZigzagLayout | null;
  wallSegments: WallSegment[];
  wallBins: SegmentBins | null;
  slots: Slot[];
}

export interface BallCatalogEntry {
  id: string;
  name: string;
  imageDataUrl: string;
  tint: string;
}

export interface MarbleResult {
  slot: number;
  label: string;
}

export interface FinishRecord extends MarbleResult {
  marbleId: string;
  ballId: string;
  t: number;
}

export interface Marble {
  id: string;
  ballId: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  done: boolean;
  result: MarbleResult | null;

  // Internal runtime fields used for stability tweaks.
  _unstuckCdMs?: number;
  _winMs?: number;
  _winY0?: number;
  _winYMin?: number;
  _winYMax?: number;
  _unstuckHits?: number;
}

export interface GameState {
  mode: "menu" | "playing";
  t: number;
  seed: number;
  rng: Rng;
  board: Board;
  ballsCatalog: BallCatalogEntry[];
  counts: Record<string, number>;
  stats: { propellerContacts: number };
  pending: Marble[];
  released: boolean;
  totalToDrop: number;
  finished: FinishRecord[];
  winner: FinishRecord | null;
  _binCounts: number[];
  dropX: number;
  marbles: Marble[];
  lastResult: (MarbleResult & { marbleId: string; ballId: string }) | null;
}

export interface MakeBoardOptions {
  worldW?: number;
  worldH?: number;
  pegR?: number;
  ballR?: number;
  rows?: number;
  cols?: number;
  topPad?: number;
  sidePad?: number;
  slotCount?: number;
  slotH?: number;
  heightMultiplier?: number;
  elementScale?: number;
  corridorEnabled?: boolean;
  customRotors?: CustomRotor[] | null;
  layout?: Layout;
}

export type CustomRotor = {
  // Provide either world coordinates (x/y) or normalized fractions (xFrac/yFrac).
  x?: number;
  y?: number;
  xFrac?: number;
  yFrac?: number;

  // Optional tuning knobs.
  r?: number;
  omega?: number;
  maxSurf?: number;
  bounce?: number;
  kick?: number;
  dampT?: number;
  down?: number;
  maxUp?: number;
};
