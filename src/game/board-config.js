import { makeBoard } from "./engine.js";

/**
 * Hand-tuned extra rotors (world coords or xFrac/yFrac in [0..1]).
 * These override auto-added mid-section rotors (early rotor ring stays).
 */
export const CUSTOM_ROTORS = [
  { xFrac: 0.220, yFrac: 0.629, omega: 11.2 },
  { xFrac: 0.342, yFrac: 0.629, omega: -11.2 },
  { xFrac: 0.140, yFrac: 0.722, omega: 11.8 },
  { xFrac: 0.136, yFrac: 0.713, omega: -11.8 },
  { xFrac: 0.869, yFrac: 0.713, omega: 12.4 },
  { xFrac: 0.447, yFrac: 0.227, omega: 12.4 },
  { xFrac: 0.431, yFrac: 0.221, omega: -12.0 },
  { xFrac: 0.580, yFrac: 0.221, omega: 12.0 },
  { xFrac: 0.318, yFrac: 0.280, omega: -11.6 },
  { xFrac: 0.229, yFrac: 0.277, omega: 11.6 },
  { xFrac: 0.389, yFrac: 0.277, omega: -11.2 },
  { xFrac: 0.315, yFrac: 0.161, omega: 12.6 },
  { xFrac: 0.693, yFrac: 0.161, omega: -12.6 },
  { xFrac: 0.395, yFrac: 0.177, omega: 11.8 },
  { xFrac: 0.594, yFrac: 0.177, omega: -11.8 },
  { xFrac: 0.455, yFrac: 0.523, omega: 11.6 },
  { xFrac: 0.375, yFrac: 0.233, omega: -12.2 },
  { xFrac: 0.518, yFrac: 0.233, omega: 12.2 },
  { xFrac: 0.536, yFrac: 0.352, omega: -11.4 },
  { xFrac: 0.354, yFrac: 0.413, omega: 11.4 },
  { xFrac: 0.670, yFrac: 0.629, omega: -12.0 },
  { xFrac: 0.791, yFrac: 0.629, omega: 12.0 },
  { xFrac: 0.865, yFrac: 0.722, omega: -12.6 },
  { xFrac: 0.419, yFrac: 0.529, omega: 11.6 },
  { xFrac: 0.548, yFrac: 0.471, omega: -11.6 },
  { xFrac: 0.641, yFrac: 0.474, omega: 11.8 },
  { xFrac: 0.286, yFrac: 0.259, omega: 12.0 },
  { xFrac: 0.443, yFrac: 0.262, omega: -12.0 },
];

/**
 * Build the default board layout for the game.
 */
export function createGameBoard() {
  // Single finish slot: marbles pile in arrival order. (No per-slot outcomes.)
  return makeBoard({
    layout: "zigzag",
    slotCount: 1,
    heightMultiplier: 10,
    elementScale: 0.85,
    customRotors: CUSTOM_ROTORS,
  });
}
