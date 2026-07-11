import type { SaveStats, StatGroup, StatItem } from '../types';
import { allObjects, buildableEntries, shortClass, splineLengthCm, type SaveLevel } from './saveObject';

// Computes the aggregate "fun stats" shown in the Stats tab from a parsed save.
//
// Two distinct data sources in a save back these numbers:
//  1. Regular save objects (`level.objects`) — every machine, belt, pole, vehicle and
//     creature is its own object with a `typePath`. Belts/pipes/tracks also carry an
//     `mSplineData` point list we sum into a real-world length.
//  2. Lightweight buildables — since Satisfactory 1.0 the bulk-placed building pieces
//     (foundations, walls, ramps, roofs…) are NOT individual objects. They live packed
//     in the BuildableSubsystem's `specialProperties.buildables[]`, each entry holding a
//     class reference plus an `instances[]` array. A megabase has tens of thousands of
//     these, so they dominate the "things built" counts.

// Foundations are an 8 m × 8 m square footprint regardless of thickness (8x1/8x2/8x4).
const FOUNDATION_AREA_M2 = 64;
// A regulation football (soccer) pitch, for a relatable area comparison.
const FOOTBALL_PITCH_M2 = 7140;

export function computeStats(
  levels: SaveLevel[],
  playDurationSeconds: number,
): SaveStats {
  // shortClass -> count, over every object regardless of kind.
  const count = new Map<string, number>();
  // shortClass -> count, lightweight buildables only (foundations/walls/ramps/…).
  const lw = new Map<string, number>();

  let beltLen = 0;
  let pipeLen = 0;
  let hyperLen = 0;
  let railLen = 0;
  let buildableTotal = 0;
  let enemyCount = 0;

  for (const o of allObjects(levels)) {
    const tp = o.typePath ?? '';
    const cls = shortClass(tp);
    count.set(cls, (count.get(cls) ?? 0) + 1);

    if (tp.includes('/Buildable/')) buildableTotal += 1;
    if (tp.includes('/Creature/Enemy/') && cls.startsWith('Char_')) enemyCount += 1;

    // Lightweight buildables packed on the BuildableSubsystem actor.
    for (const b of buildableEntries(o)) {
      const bc = shortClass(b.typeReference?.pathName ?? '');
      if (bc) lw.set(bc, (lw.get(bc) ?? 0) + (b.instances?.length ?? 0));
    }

    // Spline lengths by transport kind.
    if (/ConveyorBelt/.test(tp)) beltLen += splineLengthCm(o);
    else if (/PipeHyper/.test(tp)) hyperLen += splineLengthCm(o);
    else if (/Pipeline|Build_Pipe/.test(tp)) pipeLen += splineLengthCm(o);
    else if (/RailroadTrack/.test(tp)) railLen += splineLengthCm(o);
  }

  // Sum counts whose class name matches a pattern.
  const sum = (map: Map<string, number>, re: RegExp): number => {
    let n = 0;
    for (const [k, v] of map) if (re.test(k)) n += v;
    return n;
  };
  const c = (re: RegExp) => sum(count, re);
  const l = (re: RegExp) => sum(lw, re);
  const m = (cm: number) => cm / 100; // cm -> meters

  const foundations = l(/Foundation/);
  const walls = l(/Wall/);
  const ramps = l(/Ramp|QuarterPipe/);
  const roofs = l(/Roof/);
  const decorations = l(/Railing|Catwalk|Fence|Pillar|Beam|Stair/);
  const lwTotal = [...lw.values()].reduce((a, b) => a + b, 0);

  const foundationArea = foundations * FOUNDATION_AREA_M2;
  const pitches = foundationArea / FOOTBALL_PITCH_M2;

  // Production machines.
  const smelters = c(/Build_SmelterMk/);
  const foundries = c(/Build_FoundryMk/);
  const constructors = c(/Build_ConstructorMk/);
  const assemblers = c(/Build_AssemblerMk/);
  const manufacturers = c(/Build_ManufacturerMk/);
  const refineries = c(/Build_OilRefinery|Build_Refinery/);
  const blenders = c(/Build_Blender/);
  const packagers = c(/Build_Packager/);
  const accelerators = c(/Build_HadronCollider|Build_Converter|Build_QuantumEncoder/);
  const productionTotal =
    smelters +
    foundries +
    constructors +
    assemblers +
    manufacturers +
    refineries +
    blenders +
    packagers +
    accelerators;

  // Power generation.
  const biomass = c(/Build_GeneratorBiomass|Build_GeneratorIntegratedBiomass/);
  const coal = c(/Build_GeneratorCoal/);
  const fuel = c(/Build_GeneratorFuel/);
  const nuclear = c(/Build_GeneratorNuclear/);
  const geothermal = c(/Build_GeneratorGeoThermal/);
  const generators = biomass + coal + fuel + nuclear + geothermal;

  const distinctBuildTypes =
    [...count.keys()].filter((k) => k.startsWith('Build_') || k.startsWith('BUILD_')).length +
    lw.size;

  const groups: StatGroup[] = [];
  const push = (title: string, items: (StatItem | false | null | undefined)[]) => {
    const real = items.filter((i): i is StatItem => !!i && i.value > 0);
    if (real.length) groups.push({ title, items: real });
  };

  push('Overview', [
    { label: 'Time played', value: playDurationSeconds, format: 'duration' },
    {
      label: 'Things built',
      value: buildableTotal + lwTotal,
      hint: 'every placed building & foundation piece',
    },
    { label: 'Distinct building types', value: distinctBuildTypes },
  ]);

  push('Logistics', [
    {
      label: 'Conveyor belts',
      value: beltLen >= 0 ? Math.round(m(beltLen)) : 0,
      format: 'distance',
      hint: `${c(/Build_ConveyorBelt/).toLocaleString()} belt segments`,
    },
    { label: 'Conveyor lifts', value: c(/Build_ConveyorLift/) },
    { label: 'Splitters', value: c(/Build_ConveyorAttachmentSplitter/) },
    { label: 'Mergers', value: c(/Build_ConveyorAttachmentMerger/) },
    {
      label: 'Pipelines',
      value: Math.round(m(pipeLen)),
      format: 'distance',
      hint: `${c(/Build_Pipeline/).toLocaleString()} pipe segments`,
    },
    { label: 'Pipeline pumps', value: c(/Build_PipelinePump/) },
    {
      label: 'Hypertubes',
      value: Math.round(m(hyperLen)),
      format: 'distance',
      hint: `${c(/Build_PipeHyperStart/).toLocaleString()} entrances`,
    },
    {
      label: 'Railways',
      value: Math.round(m(railLen)),
      format: 'distance',
      hint: `${c(/Build_TrainStation/).toLocaleString()} stations`,
    },
    { label: 'Power lines', value: c(/Build_PowerLine/) },
    { label: 'Power poles', value: c(/Build_PowerPole/) },
  ]);

  push('Construction', [
    {
      label: 'Foundations',
      value: foundations,
      hint: foundations > 0 ? `≈ ${pitches.toFixed(1)} football pitches of floor` : undefined,
    },
    { label: 'Foundation area', value: Math.round(foundationArea), format: 'area' },
    { label: 'Walls', value: walls },
    { label: 'Ramps', value: ramps },
    { label: 'Roofs', value: roofs },
    { label: 'Railings, pillars & catwalks', value: decorations },
    { label: 'Ladders', value: c(/Build_Ladder/) },
  ]);

  push('Production', [
    { label: 'Smelters', value: smelters },
    { label: 'Foundries', value: foundries },
    { label: 'Constructors', value: constructors },
    { label: 'Assemblers', value: assemblers },
    { label: 'Manufacturers', value: manufacturers },
    { label: 'Refineries', value: refineries },
    { label: 'Blenders', value: blenders },
    { label: 'Packagers', value: packagers },
    { label: 'Particle accelerators', value: accelerators },
    { label: 'Total production machines', value: productionTotal },
  ]);

  push('Extraction', [
    { label: 'Miners', value: c(/Build_MinerMk/) },
    { label: 'Oil extractors', value: c(/Build_OilPump/) },
    { label: 'Water extractors', value: c(/Build_WaterPump/) },
    { label: 'Resource well pressurizers', value: c(/Build_FrackingSmasher|FrackingCore/) },
  ]);

  push('Power', [
    { label: 'Biomass burners', value: biomass },
    { label: 'Coal generators', value: coal },
    { label: 'Fuel generators', value: fuel },
    { label: 'Nuclear power plants', value: nuclear },
    { label: 'Geothermal generators', value: geothermal },
    { label: 'Total generators', value: generators },
    { label: 'Power storage', value: c(/Build_PowerStorage/) },
  ]);

  push('Storage', [
    { label: 'Storage containers', value: c(/Build_StorageContainer/) },
    { label: 'Fluid buffers & tanks', value: c(/Build_IndustrialTank|Build_PipeStorageTank|Build_FluidBuffer/) },
    { label: 'Dimensional depot uploaders', value: c(/Build_CentralStorage/) },
  ]);

  push('Trains & vehicles', [
    { label: 'Locomotives', value: c(/BP_Locomotive/) },
    { label: 'Freight wagons', value: c(/BP_FreightWagon/) },
    { label: 'Train stations', value: c(/Build_TrainStation/) },
    {
      label: 'Wheeled vehicles',
      value: c(/BP_Truck|BP_Explorer|BP_Tractor|BP_FactoryCart|BP_CyberWagon|BP_GolfCart/),
    },
  ]);

  push('Milestones', [
    { label: 'Space Elevator', value: c(/Build_SpaceElevator/) },
    { label: 'AWESOME Sinks', value: count.get('Build_ResourceSink') ?? 0 },
    { label: 'AWESOME Shops', value: c(/Build_ResourceSinkShop/) },
    { label: 'M.A.M.', value: c(/Build_Mam/) },
    { label: 'Radar towers', value: c(/Build_RadarTower/) },
    { label: 'Signs', value: c(/Build_StandaloneWidgetSign|Build_SignPole/) },
  ]);

  push('Wildlife & foraging', [
    { label: 'Hostile creatures remaining', value: enemyCount },
    { label: 'Creature spawners', value: c(/BP_CreatureSpawner/) },
    { label: 'Berry bushes', value: c(/BP_BerryBush/) },
    { label: 'Nut bushes', value: c(/BP_NutBush/) },
    { label: 'Mushrooms', value: c(/BP_Shroom/) },
  ]);

  return { groups };
}
