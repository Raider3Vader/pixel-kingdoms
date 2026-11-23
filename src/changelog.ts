// What changed in each update, newest first. Add an entry with every update.

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.11.2',
    date: '2026-11-23',
    title: 'Easier building, wide gates',
    items: [
      'A new villager menu with four choices: Village (Z), Military (X), Defenses (C) and Repair (V). F or Esc goes back.',
      'Village: houses, rice paddies, storehouses, the Dock and the Market. Military: Barracks, Stable and Pagoda. Defenses: walls, gates and towers.',
      'Repair: press V, then click a damaged building. Hold Shift to repair several.',
      'Building buttons are half as wide, with costs shown as numbers in each resource colour, as in the top bar.',
      'Gates are two tiles wide and turn to run along the wall. Away from walls, press R to turn one.',
      'Hold a gate over a wall to see it set into the wall. Placing it gives back the full cost of the wall pieces it replaces.',
      'Diagonal walls join up as a connected staircase, with no corner gaps. Wall lines can be up to 32 pieces long.',
      'The Pagoda and Samurai now need the Imperial Age. A Samurai beats one Champion, but not two.',
      'Press Q twice quickly, or Shift + Q, to select every idle villager.',
      'Selecting a tree shows the right picture and name: Cherry tree, Pine or Bamboo.',
    ],
  },
  {
    version: '0.10.2',
    date: '2026-11-22',
    title: 'Samurai and boats',
    items: [
      'New: the Pagoda, a slender five-storey pagoda that trains Samurai, elite swordsmen who cut down swords, spears and archers.',
      'New: the Dock (120 wood), built on the shore. It trains three kinds of boat.',
      'Fishing boats (60 wood) catch fish from shoals out in the water and bring it to the Dock.',
      'War boats (Feudal Age) shoot at boats, troops and buildings near the shore. Heavy war boats in the Imperial Age.',
      'Transport boats (100 wood) carry 8 troops or villagers. Right-click it with troops to load them; right-click land with it to sail over and unload. Anyone aboard is lost if it sinks.',
      'Boats sail over open water, sandbars and fords, and under bridges. Foot soldiers cannot fight a boat on the water, but archers, towers and Town Centers can.',
      'On the Inland Sea, the enemy fishes, sends war boats, and lands troops on your shore by transport.',
    ],
  },
  {
    version: '0.9.2',
    date: '2026-11-22',
    title: 'The Inland Sea',
    items: [
      'New map: the Inland Sea. Pick Rivers or Inland Sea on the menu.',
      'Each side has a home island and a private back island with gold and stone. Islets and a central island, rich in gold, lie between you, joined by walkable sandbars.',
      'Press Delete to destroy what you have selected. Unfinished buildings give back what was not built yet. Your Town Center cannot be deleted.',
      'Only walls and gates can be built on bridges, fords and sandbars, so a crossing is never blocked by accident.',
      'The top bar shows how many villagers gather each resource, e.g. 350 (6).',
      'Shift-placing several rice paddies gives each its own villager, and villagers no longer crowd onto one paddy.',
      'Shift + a group number adds that group to what you have selected.',
      'While something is being researched, its button says Cancel; clicking its picture in the panel also cancels it.',
      'Fixed: the rice paddy placement preview showed a house, and text ran off the bottom panel.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-11-22',
    title: 'Music and match stats',
    items: [
      'Music: a calm koto and flute loop while you build, and taiko drums when a fight breaks out near you. Music on/off is on the menu and the pause screen.',
      'The end-of-match screen shows resources gathered, biggest army, buildings built and age times, with graphs of the whole match.',
      'Fixed: the minimap only showed part of the bigger map, and the Full screen buttons did nothing.',
    ],
  },
  {
    version: '0.7.3',
    date: '2026-11-20',
    title: 'Rice paddies and river layouts',
    items: [
      'New: the Rice paddy (60 wood). A villager farms it for 300 food, then it replants itself for 40 wood. Press Z on one to turn replanting off.',
      'Each match picks one of five river layouts: winding, meandering, twin streams, a central lake, or a wide river with shallow fords.',
      'A forest belt with narrow gaps crosses each half of the map: choke points to hold or wall off. Dense woods and open meadows in between.',
      'The enemy plants paddies and moves workers between resources as it needs them.',
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
