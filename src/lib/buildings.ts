// Building classification, footprint sizing, and name humanizing.
//
// Pure data/util module (no React) shared by the parser (parserAdapter.ts), the
// canvas overlay (BuildingLayer.tsx) and the filter controls (LayerControls.tsx).
//
// Buildings come from two places in a save — full `Build_*` objects (machines, belts,
// poles) and lightweight buildables (foundations/walls/ramps packed on the
// BuildableSubsystem). Both are reduced to a flat `Building` footprint; see types.ts.

import type { BuildingCategory, BuildingCategoryDef } from '../types';
import { shortClass } from './saveObject';

// Display order + legend colors for the Buildings filter section. Colors are picked to
// read against the busy terrain map at ~35% fill opacity and to separate the categories.
export const BUILDING_CATEGORIES: BuildingCategoryDef[] = [
  { id: 'foundation', label: 'Foundations & floors', color: '#8a93a6' },
  { id: 'wall', label: 'Walls, roofs & ramps', color: '#c2895a' },
  { id: 'production', label: 'Production', color: '#f25c54' },
  { id: 'power', label: 'Power', color: '#f2c14e' },
  { id: 'logistics', label: 'Logistics', color: '#5aa9e6' },
  { id: 'storage', label: 'Storage', color: '#9b8cf2' },
  { id: 'vehicle', label: 'Trains & vehicles', color: '#56c271' },
  { id: 'misc', label: 'Other', color: '#9aa0a6' },
];

// Ordered, first-match-wins classification rules. More specific patterns come first so
// e.g. PowerPole is 'power' before a generic 'Pole' could fall elsewhere.
const CATEGORY_RULES: [RegExp, BuildingCategory][] = [
  [/Foundation|Pillar|Ramp|QuarterPipe|Floor/i, 'foundation'],
  [/Wall|Roof|Railing|Catwalk|Fence|Stair|Beam|Window|Gate|Door/i, 'wall'],
  [
    /Smelter|Foundry|Constructor|Assembler|Manufacturer|Refinery|Blender|Packager|HadronCollider|Converter|QuantumEncoder|MinerMk|OilPump|WaterPump|Fracking|Miner/i,
    'production',
  ],
  [/Generator|PowerStorage|PowerPole|PowerLine|PowerSwitch|PowerTower/i, 'power'],
  [
    /ConveyorBelt|ConveyorLift|ConveyorAttachment|ConveyorPole|ConveyorCeiling|Pipeline|PipeHyper|RailroadTrack|Hyper|PipeStorage|PipelineSupport|PipelinePump|PipelineJunction/i,
    'logistics',
  ],
  [/StorageContainer|IndustrialTank|FluidBuffer|CentralStorage|DimensionalDepot/i, 'storage'],
  [/Locomotive|FreightWagon|TrainStation|Truck|Explorer|Tractor|Docking|TruckStation|DroneStation|Drone/i, 'vehicle'],
];

export function classify(cls: string): BuildingCategory {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(cls)) return cat;
  return 'misc';
}

// Footprint width × depth in cm (local X × local Y before rotation). Ordered, first-match
// wins, specific-before-general. Values approximate the in-game footprints — precise enough
// for a translucent overlay. Belts/pipes are splines with only an origin point, so they get
// a small marker-sized footprint.
interface Size {
  w: number;
  d: number;
}
const SIZE_RULES: [RegExp, Size][] = [
  // Lightweight buildables (the bulk of a base)
  [/Foundation/i, { w: 800, d: 800 }],
  [/Ramp/i, { w: 800, d: 800 }],
  [/Roof/i, { w: 800, d: 800 }],
  [/QuarterPipe/i, { w: 800, d: 800 }],
  [/Wall.*Tris/i, { w: 800, d: 80 }],
  [/Wall|Fence/i, { w: 800, d: 80 }],
  [/Railing|Catwalk/i, { w: 800, d: 40 }],
  [/PillarBase/i, { w: 200, d: 200 }],
  [/Pillar/i, { w: 200, d: 200 }],
  // Production machines
  [/SmelterMk/i, { w: 600, d: 900 }],
  [/FoundryMk/i, { w: 900, d: 1000 }],
  [/ConstructorMk/i, { w: 800, d: 950 }],
  [/AssemblerMk/i, { w: 1000, d: 1500 }],
  [/ManufacturerMk/i, { w: 1800, d: 1900 }],
  [/OilRefinery|Refinery/i, { w: 1000, d: 2000 }],
  [/Blender/i, { w: 1600, d: 1800 }],
  [/Packager/i, { w: 800, d: 800 }],
  [/HadronCollider|Converter|QuantumEncoder/i, { w: 2400, d: 3300 }],
  // Extraction
  [/MinerMk/i, { w: 600, d: 1400 }],
  [/OilPump/i, { w: 800, d: 1200 }],
  [/WaterPump/i, { w: 2000, d: 1900 }],
  [/FrackingSmasher|FrackingCore/i, { w: 2000, d: 2000 }],
  // Power
  [/GeneratorBiomass/i, { w: 800, d: 800 }],
  [/GeneratorCoal/i, { w: 800, d: 1000 }],
  [/GeneratorFuel/i, { w: 1000, d: 1000 }],
  [/GeneratorNuclear/i, { w: 2400, d: 2400 }],
  [/GeneratorGeoThermal/i, { w: 1900, d: 1900 }],
  [/PowerStorage/i, { w: 600, d: 900 }],
  [/PowerPole|PowerSwitch/i, { w: 200, d: 200 }],
  // Storage
  [/StorageContainer/i, { w: 500, d: 1000 }],
  [/IndustrialTank/i, { w: 1100, d: 1100 }],
  [/FluidBuffer|PipeStorageTank/i, { w: 600, d: 600 }],
  [/CentralStorage/i, { w: 400, d: 400 }],
  // Trains & vehicles
  [/TrainStation|DockingStation|TruckStation/i, { w: 1600, d: 3400 }],
  [/Locomotive|FreightWagon/i, { w: 600, d: 3400 }],
  // Logistics origins (splines have no real footprint)
  [/Conveyor|Pipe|Hyper|RailroadTrack/i, { w: 150, d: 150 }],
  // Misc small
  [/Sign|Lamp|Light|Ladder|Stair|Beam/i, { w: 200, d: 200 }],
];
const DEFAULT_SIZE: Size = { w: 300, d: 300 };

export function footprintFor(cls: string): Size {
  for (const [re, size] of SIZE_RULES) if (re.test(cls)) return size;
  return DEFAULT_SIZE;
}

// "Build_ManufacturerMk1" -> "Manufacturer Mk1"; "Build_Foundation_8x4_01" -> "Foundation 8x4 01".
// Splits camelCase boundaries only, so dimension tokens like "8x4" / "Mk3" stay intact.
export function humanize(cls: string): string {
  return cls
    .replace(/^(?:Build_|Desc_)/, '')
    .replace(/_C$/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

// "/Game/.../Recipe_IronPlate_C" -> "Iron Plate"
export function humanizeRecipe(path: string): string {
  return humanize(shortClass(path).replace(/^Recipe_/, ''));
}
