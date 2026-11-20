// What changed in each update, newest first. Add an entry with every update.

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.7.2',
    date: '2026-11-20',
    title: 'Rice paddies',
    items: [
      'New building: the Rice paddy (60 wood). A villager works it for 300 food, then it replants itself for 40 wood. Units can walk over it.',
      'Food no longer runs out once the wild food near your village is gone.',
      'The enemy plants paddies, moves workers between resources as it needs them, and no longer stalls its army while saving up for an age.',
      'Select a rice paddy and press Z to turn auto-replant off or on. With it off, the paddy disappears when empty instead of costing 40 wood.',
    ],
  },
  {
    version: '0.7.1',
    date: '2026-11-20',
    title: 'Choke points',
    items: [
      'A thick forest belt now crosses each half of the map, between your village and the middle, with two or three narrow gaps: choke points to hold or wall off.',
      'A few dense woods with no way through, and open meadows in between.',
      'Villagers can still chop a new path through any forest.',
      'Trees scattered along the river banks, and small groves where the river meets the edge of the map.',
    ],
  },
  {
    version: '0.7',
    date: '2026-11-20',
    title: 'Ages, gold and stone, walls and towers',
    items: [
      'Three ages: Dark, Feudal and Imperial. Advance at the Town Center (Feudal: 350 food, 150 wood; Imperial: 600 food, 300 wood, 200 gold).',
      'Soldiers start weak and upgrade every age, with new armor to match: Militia, Man-at-Arms, Champion; Spearman, Pikeman, Halberdier; Archer, Longbowman; Cavalry, Knight.',
      'New spear line, deadly against horses. Archers arrive in the Feudal Age, along with the Stable and Market.',
      'Armor now matters: heavy armor shrugs off arrows, and archers do half damage up close.',
      'The Scout is now a fast rider with a sword.',
      'Gold and stone to mine. The Market sells food, wood and stone for gold, earns gold from trade, and hires merchants for more.',
      'Wooden walls and gates from the start, stone ones in the Feudal Age. Gates let only your side through, and can be locked.',
      'Watch towers see far. Guard towers shoot arrows and hold 5 troops; each archer inside adds an arrow.',
      'Villagers repair damaged buildings for a share of the cost.',
      'A bigger map (96 by 96) with more room between trees, and the camera can scroll a little past the edge.',
      'The Classic look is put away for now; Sakura Village is the only theme.',
    ],
  },
  {
    version: '0.6',
    date: '2026-11-20',
    title: 'Title screen, changelog and Hostile',
    items: [
      'New title screen: a villager runs from a rider across a meadow.',
      'This changelog, opened from the menu.',
      'Soldiers have a Hostile switch (V). On: they attack any enemy they see, even while marching. Off: they only fight back.',
      'Stop is now Stand down (B): drop all orders, turn Hostile off and hold still.',
      'Proofread all the text in the game.',
      'A shorter bottom bar, with button labels that wrap to fit.',
      'Fixed the help text in the bottom-left box being cut off.',
    ],
  },
  {
    version: '0.5',
    date: '2026-11-20',
    title: 'Formations and full screen',
    items: [
      'The game fills the whole window, with a Full screen button on the menus.',
      'Formations for soldiers: Z line, X block, C box. Fighters in front, archers behind or inside; the group marches at its slowest pace.',
      'Double-click a building to select every one of that kind; a train key queues one unit in each.',
      'Control groups: Ctrl + 1-9 saves a group, 1-9 selects it.',
      'The Controls screen fits small or zoomed-in windows.',
    ],
  },
  {
    version: '0.4',
    date: '2026-11-19',
    title: 'Stable and Scout',
    items: [
      'New building: the Stable (a long wooden barn) trains Cavalry and Scouts. The Barracks keeps Swordsmen and Archers.',
      'New unit: the Scout, a fast horse archer that sees far and does not chase fights.',
      'Cavalry appear as spear samurai or armored warhorses.',
      'The enemy builds whichever of Barracks or Stable its plan needs first.',
    ],
  },
  {
    version: '0.3',
    date: '2026-11-19',
    title: 'Queued orders and a starting scout',
    items: [
      'Shift + right-click queues orders, shown as a trail of flags: exploring routes, or gather one tree and then a sheep.',
      'Both sides start with a Scout.',
      'Q selects the next idle villager.',
    ],
  },
  {
    version: '0.2',
    date: '2026-11-19',
    title: 'Sakura Village and the river',
    items: [
      'New Sakura Village theme: villagers in straw hats, samurai, tile-roofed buildings and a three-tier pagoda.',
      'Cherry blossom, pine and bamboo forests, and persimmon trees for food.',
      'A Theme setting on the menu (Sakura Village or Classic).',
      'A river now runs between the villages, with three bridges.',
    ],
  },
  {
    version: '0.1',
    date: '2026-11-19',
    title: 'First playable prototype',
    items: [
      'Gather food and wood, build, train villagers and soldiers, and fight under fog of war.',
      'An enemy kingdom with four openings (Boom, Rush, Archer line, Horse raid) and three difficulties.',
      'Archers beat Swordsmen, Cavalry beats Archers, Swordsmen beat Cavalry.',
      'Menus, minimap, sound effects and victory screens.',
    ],
  },
];

export const VERSION = CHANGELOG[0].version;
