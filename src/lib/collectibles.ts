import type { CollectibleType, LayerState } from '../types';

// typePaths confirmed by parsing saves/satisfactory.20260627.sav (SaveVersion 60).
// Hard drives are inside DropPods; the pod stays in the world. A looted pod gains the
// mHasBeenLooted property — detected by presence, not value (see parserAdapter.ts).
// Mercer Spheres = BP_WAT2, Somersloops = BP_WAT1 (WAT = alien artifact category).
export const COLLECTIBLE_TYPE_PATHS: Record<CollectibleType, string> = {
  hardDrive:
    '/Game/FactoryGame/World/Benefit/DropPod/BP_DropPod.BP_DropPod_C',
  mercerSphere:
    '/Game/FactoryGame/Prototype/WAT/BP_WAT2.BP_WAT2_C',
  somersloop:
    '/Game/FactoryGame/Prototype/WAT/BP_WAT1.BP_WAT1_C',
  slugBlue:
    '/Game/FactoryGame/Resource/Environment/Crystal/BP_Crystal.BP_Crystal_C',
  slugYellow:
    '/Game/FactoryGame/Resource/Environment/Crystal/BP_Crystal_mk2.BP_Crystal_mk2_C',
  slugPurple:
    '/Game/FactoryGame/Resource/Environment/Crystal/BP_Crystal_mk3.BP_Crystal_mk3_C',
  // Cassette tapes (Boom Box tapes) and the B-374 helmet are one-off, hand-placed
  // collectibles. They have no dedicated world actor — in the save they are generic
  // FGItemPickup_Spawnable crates that vanish once taken — so there is no typePath to
  // match and no reliable per-item collected flag. They ship as fixed static markers
  // (coordinates from the wiki, see collectibles.json) and never resolve as collected
  // from the save; the "Mark Collected" button still tracks them client-side.
  cassetteTape: '',
  helmet: '',
};

export const PATH_TO_TYPE = Object.fromEntries(
  (Object.entries(COLLECTIBLE_TYPE_PATHS) as [CollectibleType, string][])
    .filter(([, path]) => path !== '')
    .map(([type, path]) => [path, type]),
) as Record<string, CollectibleType>;

export const LAYER_DEFAULTS: Omit<LayerState, 'uncollectedCount' | 'collectedCount'>[] = [
  { type: 'hardDrive',    label: 'Hard Drives',    color: '#f59e0b', visible: true },
  { type: 'mercerSphere', label: 'Mercer Spheres',  color: '#8b5cf6', visible: true },
  { type: 'somersloop',   label: 'Somersloops',     color: '#db2777', visible: true },
  { type: 'slugBlue',     label: 'Blue Power Slugs',   color: '#3b82f6', visible: true },
  { type: 'slugYellow',   label: 'Yellow Power Slugs',  color: '#eab308', visible: true },
  { type: 'slugPurple',   label: 'Purple Power Slugs',  color: '#a855f7', visible: true },
  { type: 'cassetteTape', label: 'Cassette Tapes',     color: '#14b8a6', visible: true },
  { type: 'helmet',       label: 'B-374 Helmet',       color: '#ef4444', visible: true },
];
