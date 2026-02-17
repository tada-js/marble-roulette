import { makeBoard, type CustomRotorInput } from "./engine.ts";

/**
 * Hand-tuned extra rotors (world coords or xFrac/yFrac in [0..1]).
 * These override auto-added mid-section rotors (early rotor ring stays).
 */
export const CUSTOM_ROTORS: CustomRotorInput[] = [
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
  { xFrac: 0.406, yFrac: 0.289, omega: 11.8 },
  { xFrac: 0.377, yFrac: 0.296, omega: -11.8 },
  { xFrac: 0.638, yFrac: 0.353, omega: 11.8 },
  { xFrac: 0.586, yFrac: 0.343, omega: -11.8 },
  { xFrac: 0.742, yFrac: 0.339, omega: 12.0 },
  { xFrac: 0.672, yFrac: 0.334, omega: -12.0 },
  { xFrac: 0.404, yFrac: 0.405, omega: 11.6 },
  { xFrac: 0.299, yFrac: 0.394, omega: -11.6 },
  { xFrac: 0.371, yFrac: 0.394, omega: 11.6 },
  { xFrac: 0.605, yFrac: 0.561, omega: -11.8 },
  { xFrac: 0.507, yFrac: 0.557, omega: 11.8 },
  { xFrac: 0.192, yFrac: 0.673, omega: -12.0 },
  { xFrac: 0.737, yFrac: 0.673, omega: 12.0 },
  { xFrac: 0.494, yFrac: 0.949, omega: -12.2 },
  { xFrac: 0.509, yFrac: 0.943, omega: 12.2 },
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
