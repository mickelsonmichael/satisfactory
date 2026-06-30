import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RecipeData, CollectibleMarker, Recipe } from '../types';

interface Props {
  recipeData: RecipeData | null;
  markers: CollectibleMarker[];
  unlockedSchematics: string[];
}

// --- Grouping -----------------------------------------------------------------

interface RecipeGroup {
  key: string;
  label: string;
  tierNum: number; // -1 for non-tier groups
  recipes: [string, Recipe][]; // [recipeClass, recipe]
}

function buildAlternateGroups(recipeData: RecipeData): RecipeGroup[] {
  const map = new Map<number, RecipeGroup>();

  for (const [key, recipe] of Object.entries(recipeData.recipes)) {
    if (!recipe.isAlternate) continue;

    const t = recipe.tier >= 0 ? recipe.tier : 0;
    if (!map.has(t)) {
      map.set(t, {
        key: `tier-${t}`,
        label: t === 0 ? 'Tier 0 — Any' : `Tier ${t}`,
        tierNum: t,
        recipes: [],
      });
    }
    map.get(t)!.recipes.push([key, recipe]);
  }

  for (const g of map.values()) {
    g.recipes.sort((a, b) => a[1].name.localeCompare(b[1].name));
  }

  return [...map.values()].sort((a, b) => a.tierNum - b.tierNum);
}

// --- Icon helpers -------------------------------------------------------------

function itemIconUrl(itemClass: string): string {
  const name = itemClass.replace(/^Desc_/, '').replace(/_C$/, '');
  return `${import.meta.env.BASE_URL}icons/items/IconDesc_${name}_256.png`;
}

// Deterministic hue from a string so each item gets a consistent color tile.
function itemHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 360;
}

// --- Wiki helpers -------------------------------------------------------------

function wikiName(name: string) {
  return name.replace(/\s+/g, '_');
}

function wikiPageUrl(itemName: string) {
  return `https://satisfactory.wiki.gg/wiki/${wikiName(itemName)}`;
}

// --- Building name map -------------------------------------------------------

const BUILDING_NAMES: Record<string, string> = {
  Desc_ConstructorMk1_C: 'Constructor',
  Desc_AssemblerMk1_C: 'Assembler',
  Desc_ManufacturerMk1_C: 'Manufacturer',
  Desc_SmelterMk1_C: 'Smelter',
  Desc_FoundryMk1_C: 'Foundry',
  Desc_OilRefinery_C: 'Refinery',
  Desc_Packager_C: 'Packager',
  Desc_Blender_C: 'Blender',
  Desc_HadronCollider_C: 'Particle Accelerator',
  Desc_QuantumEncoder_C: 'Quantum Encoder',
  Desc_Converter_C: 'Converter',
};

function buildingLabel(cls: string): string {
  return (
    BUILDING_NAMES[cls] ??
    cls.replace(/^Desc_/, '').replace(/_C$/, '').replace(/_/g, ' ')
  );
}

// --- Item icon (with SCIM CDN + letter fallback) ------------------------------

function ItemIcon({
  itemClass,
  itemName,
  size,
}: {
  itemClass: string;
  itemName: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const hue = itemHue(itemName);
  const initial = itemName[0]?.toUpperCase() ?? '?';

  if (failed) {
    return (
      <div
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: 4,
          flexShrink: 0,
          background: `hsl(${hue},35%,22%)`,
          border: `1px solid hsl(${hue},40%,35%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.42,
          fontWeight: 700,
          color: `hsl(${hue},60%,70%)`,
        }}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={itemIconUrl(itemClass)}
      alt={itemName}
      width={size}
      height={size}
      style={{ objectFit: 'contain', flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  );
}

// --- Recipe card -------------------------------------------------------------

interface CardProps {
  recipe: Recipe;
  items: RecipeData['items'];
  unlocked: boolean;
  onClick: () => void;
}

function RecipeCard({ recipe, items, unlocked, onClick }: CardProps) {
  const primary = recipe.products[0];
  const primaryItem = items[primary?.item ?? ''];

  return (
    <button
      onClick={onClick}
      title={recipe.name + (unlocked ? '' : ' — not yet researched')}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #2a2a35',
        borderRadius: 6,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        opacity: unlocked ? 1 : 0.35,
        padding: '8px 4px 6px',
        textAlign: 'center',
        filter: unlocked ? 'none' : 'grayscale(0.6)',
        transition: 'background 0.12s, border-color 0.12s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(250,149,73,0.08)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a3a48';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a35';
      }}
    >
      {primaryItem ? (
        <ItemIcon itemClass={primary.item} itemName={primaryItem.name} size={36} />
      ) : (
        <div style={{ width: 36, height: 36, background: '#222', borderRadius: 4, flexShrink: 0 }} />
      )}
      <span
        style={{
          color: '#ccc',
          fontSize: 10,
          lineHeight: 1.2,
          wordBreak: 'break-word',
          maxHeight: 26,
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {recipe.name.replace(/^Alternate:\s*/i, '')}
      </span>
    </button>
  );
}

// --- Recipe modal ------------------------------------------------------------

interface ModalProps {
  recipe: Recipe;
  items: RecipeData['items'];
  unlocked: boolean;
  onClose: () => void;
}

function ItemRow({
  itemClass,
  amount,
  items,
}: {
  itemClass: string;
  amount: number;
  items: RecipeData['items'];
}) {
  const item = items[itemClass];
  const name = item?.name ?? itemClass;
  const liquid = item?.liquid ?? false;

  return (
    <a
      href={wikiPageUrl(name)}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: '#ddd',
        textDecoration: 'none',
        padding: '4px 6px',
        borderRadius: 5,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid #2a2a35',
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLAnchorElement).style.background = 'rgba(250,149,73,0.1)')
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.04)')
      }
    >
      <ItemIcon itemClass={itemClass} itemName={name} size={28} />
      <span style={{ flex: 1, fontSize: 12 }}>{name}</span>
      <span style={{ color: '#FA9549', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
        ×{amount}
        {liquid ? ' m³' : ''}
      </span>
    </a>
  );
}

function RecipeModal({ recipe, items, unlocked, onClose }: ModalProps) {
  const building = recipe.producedIn[0] ? buildingLabel(recipe.producedIn[0]) : 'Unknown';

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#13141a',
          border: '1px solid #FA9549',
          borderRadius: 10,
          padding: '20px 22px',
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{recipe.name}</div>
            <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
              {building} · {recipe.time}s cycle
              {!unlocked && (
                <span style={{ color: '#f2c14e', marginLeft: 8 }}>Not yet researched</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: 2,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Ingredients */}
        {recipe.ingredients.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                color: '#666',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 6,
              }}
            >
              Ingredients
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recipe.ingredients.map((ing) => (
                <ItemRow key={ing.item} itemClass={ing.item} amount={ing.amount} items={items} />
              ))}
            </div>
          </div>
        )}

        {/* Products */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              color: '#666',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            Products
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recipe.products.map((prod) => (
              <ItemRow key={prod.item} itemClass={prod.item} amount={prod.amount} items={items} />
            ))}
          </div>
        </div>

        {/* Unlock info */}
        {recipe.schematicName && (
          <div
            style={{ borderTop: '1px solid #222', paddingTop: 10, fontSize: 11, color: '#666' }}
          >
            Unlocked by:{' '}
            <span style={{ color: '#aaa' }}>{recipe.schematicName}</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// --- Hard drive counter -------------------------------------------------------

function HardDriveCounter({ markers }: { markers: CollectibleMarker[] }) {
  const total = markers.filter((m) => m.type === 'hardDrive').length;
  const remaining = markers.filter((m) => m.type === 'hardDrive' && !m.collected).length;
  const collected = total - remaining;

  if (total === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(250,149,73,0.08)',
        border: '1px solid rgba(250,149,73,0.25)',
        borderRadius: 6,
        padding: '7px 10px',
        marginTop: 8,
        marginBottom: 2,
      }}
    >
      <img
        src={`${import.meta.env.BASE_URL}icons/collectibles/HardDrive_256.png`}
        alt="Hard Drive"
        width={18}
        height={18}
        style={{ objectFit: 'contain', flexShrink: 0 }}
        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: '#FA9549', fontWeight: 600 }}>
          {remaining} hard drive{remaining !== 1 ? 's' : ''} on the map
        </div>
        <div style={{ fontSize: 10, color: '#666' }}>
          {collected} of {total} collected
        </div>
      </div>
    </div>
  );
}

// --- Tier banner -------------------------------------------------------------

function TierBanner({ label, locked }: { label: string; locked: boolean }) {
  return (
    <div style={{ marginTop: 12, marginBottom: locked ? 4 : 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: locked ? '#666' : '#FA9549',
        }}
      >
        {label}
        {locked && (
          <span
            style={{
              fontWeight: 400,
              fontSize: 10,
              color: '#555',
              textTransform: 'none',
              letterSpacing: 0,
            }}
          >
            — not yet unlocked
          </span>
        )}
      </div>
      {locked && (
        <div
          style={{
            background: 'rgba(242,193,78,0.05)',
            border: '1px solid rgba(242,193,78,0.15)',
            borderRadius: 4,
            color: '#7a6a30',
            fontSize: 10,
            padding: '3px 7px',
            marginTop: 3,
          }}
        >
          Unlock HUB milestones in this tier to make these alternates available in the MAM.
        </div>
      )}
    </div>
  );
}

// --- Main panel --------------------------------------------------------------

export default function RecipesPanel({ recipeData, markers, unlockedSchematics }: Props) {
  const [selectedRecipe, setSelectedRecipe] = useState<[string, Recipe] | null>(null);

  const groups = useMemo(() => (recipeData ? buildAlternateGroups(recipeData) : []), [recipeData]);

  const hasSave = markers.length > 0;
  const hasSaveData = hasSave && unlockedSchematics.length > 0;
  const unlockedSet = useMemo(() => new Set(unlockedSchematics), [unlockedSchematics]);

  // Max HUB milestone tier unlocked in this save. Computed from milestone (non-alternate)
  // recipes whose schematic class appears in the save's unlocked schematics.
  // -1 = no confirmed milestone tier (extraction failed or no save) → show nothing as locked.
  const maxUnlockedTier = useMemo(() => {
    if (!hasSaveData || !recipeData) return -1;
    let max = -1;
    for (const recipe of Object.values(recipeData.recipes)) {
      if (recipe.isAlternate) continue;
      if (
        recipe.schematicType !== 'EST_Milestone' &&
        recipe.schematicType !== 'EST_Tutorial' &&
        recipe.schematicType !== 'EST_Custom'
      )
        continue;
      if (recipe.tier >= 0 && unlockedSet.has(recipe.schematicClass)) {
        max = Math.max(max, recipe.tier);
      }
    }
    return max;
  }, [hasSaveData, recipeData, unlockedSet]);

  if (!recipeData) {
    return (
      <div style={{ color: '#888', fontSize: 12, padding: '12px 0', lineHeight: 1.5 }}>
        Loading recipe data…
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 4 }}>
      <HardDriveCounter markers={markers} />

      {groups.map((group) => {
        // A tier is locked when we can confirm the player hasn't reached it yet —
        // only flag when a HIGHER tier is confirmed unlocked to avoid false positives.
        const tierLocked =
          hasSaveData && maxUnlockedTier >= 0 && group.tierNum > maxUnlockedTier;

        return (
          <div key={group.key}>
            <TierBanner label={group.label} locked={tierLocked} />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 4,
                marginTop: 4,
              }}
            >
              {group.recipes.map(([recipeKey, recipe]) => {
                // Individual alternates are "researched" when their schematic is purchased.
                // Without save data, show all as available.
                const recipeUnlocked = hasSaveData
                  ? unlockedSet.has(recipe.schematicClass)
                  : true;
                return (
                  <RecipeCard
                    key={recipeKey}
                    recipe={recipe}
                    items={recipeData.items}
                    unlocked={recipeUnlocked}
                    onClick={() => setSelectedRecipe([recipeKey, recipe])}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {selectedRecipe && (
        <RecipeModal
          recipe={selectedRecipe[1]}
          items={recipeData.items}
          unlocked={hasSaveData ? unlockedSet.has(selectedRecipe[1].schematicClass) : true}
          onClose={() => setSelectedRecipe(null)}
        />
      )}
    </div>
  );
}
