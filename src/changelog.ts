// What changed in each update, newest first. Add an entry with every update.

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.11.0',
    date: '2026-11-23',
    title: 'New villager menu',
    items: [
      'Selecting villagers now shows four choices: Village (Z), Military (X), Defenses (C) and Repair (V).',
      'Village has houses, rice paddies, storehouses, the Dock and the Market. Military has the Barracks, the Stable and the Pagoda. Defenses has walls, gates and towers. Press F or Esc to go back.',
      'Repair: press V, then click a damaged building, and the selected villagers go and fix it. Hold Shift to repair several.',
      'Building buttons are half as wide, with smaller pictures. The cost shows as numbers in each resource colour (red food, brown wood, gold, grey stone), as in the top bar.',
      'The Pagoda and Samurai now need the Imperial Age. Samurai were rebalanced: a bit better than a Champion one on one, but two Champions beat one.',
    ],
  },
  {
    version: '0.10.3',
    date: '2026-11-23',
    title: 'Wide gates and joined walls',
    items: [
      'Gates are now two tiles wide, drawn as one gate with a door on each half. Clicking either half selects the whole gate, and Lock and Delete work on both halves.',
      'While placing a gate over a wall, the preview sits right in the wall, with those wall pieces hidden underneath, so you can see exactly what it replaces.',
      'A gate placed on a wall gives you back the full cost of the wall pieces it replaces.',
      'A gate turns to run along the wall you put it in. In a north-south wall it is shown side-on. Away from walls, press R to turn it.',
      'Diagonal walls now join up: a diagonal line is built as a connected staircase, with no corner gaps. Wall lines can be up to 32 pieces long.',
      'Selecting a tree now shows the right picture and name: Cherry tree, Pine or Bamboo.',
    ],
  },
  {
    version: '0.10.2',
    date: '2026-11-22',
    title: 'Enemy sea landings',
    items: [
      'On the Inland Sea, the Normal and Hard enemy builds a transport boat once it has war boats.',
      'Every other attack, up to 8 of its soldiers board the transport. It sails round to your shore nearest your Town Center, and they storm ashore there instead of coming over the sandbars. Watch your coasts, and sink the transport before it lands.',
    ],
  },
  {
    version: '0.10.1',
    date: '2026-11-22',
    title: 'Transport boats',
    items: [
      'New boat: the Transport boat (100 wood, from the Dock). It carries up to 8 troops or villagers across the water.',
      'To load: select land units and right-click your transport. If it is out on the water, it sails to the nearest shore and they climb aboard. Their helmets show in the cabin windows.',
      'To land them: with the transport selected, right-click a spot on land. It sails to the closest shore, lets everyone off, and they walk on to where you clicked. Press Z (Unload) to let them off right where it is.',
      'Anyone aboard is lost if the transport sinks. If you delete it next to the shore, they step off first.',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-11-22',
    title: 'Samurai and boats',
    items: [
      'New building: the Pagoda (Feudal Age, 175 wood and 100 stone), a slender five-storey pagoda that trains Samurai.',
      'New unit: the Samurai (65 food, 45 gold). An elite swordsman with quick, heavy blows that cut down swordsmen, spearmen and archers. Elite Samurai in the Imperial Age.',
      'New building: the Dock (120 wood), built on the shore touching water. It trains fishing boats and war boats.',
      'Fishing boats (60 wood) catch fish from shoals out in the water and bring it back to a Dock. They carry twice as much as a villager and cannot fight.',
      'War boats (Feudal Age, 90 wood and 30 gold) shoot arrows from the water at boats, troops and buildings near the shore. Heavy war boats in the Imperial Age.',
      'Boats sail across open water, sandbars and fords, and under bridges. Foot soldiers cannot fight a boat out on the water, but archers, towers and Town Centers can shoot it.',
      'Fish shoals off every coast on the Inland Sea, and a few in the wider rivers.',
      'The villager build menu now has three pages. Press F to go from Build (houses, paddies, storehouses, Dock, Market) to Army (Barracks, Stable, Pagoda) to Walls.',
      'The enemy builds a Dock, fishing boats and war boats on the Inland Sea, and a Pagoda with Samurai in some openings.',
      'Unit bonuses are written shorter (like +3 vs swords/spears/archers) so they fit in the panel.',
    ],
  },
  {
    version: '0.9.2',
    date: '2026-11-22',
    title: 'Cancel boxes and adding groups',
    items: [
      'While a merchant is being hired (or an age or tower upgrade is under way), the panel shows a box with its picture. Click the box to cancel, just like cancelling units in a training queue.',
      'Hold Shift and press a group number to add that group to what you already have selected. For example, press 1, then Shift + 2 to select both groups.',
    ],
  },
  {
    version: '0.9.1',
    date: '2026-11-22',
    title: 'Tidier bottom panel',
    items: [
      'Fixed: text ran off the bottom of the panel while the Market hired a merchant.',
      'While something is being researched (a merchant, an age, a tower upgrade), its button now says Cancel in red. Press it to stop.',
      'Buttons that cost three resources (like the merchant) use a smaller picture so all three costs fit.',
      'An age advance shows as "To Imperial Age 45%" so it fits on one line.',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-11-22',
    title: 'Inland Sea',
    items: [
      'New map: the Inland Sea. Choose Rivers or Inland Sea on the menu. Each side has a large home island and a private back island with gold and stone. Two islets and a central island, rich in gold, sit in the sea between you.',
      'Shallow sandbars join the islands and can be walked across. They are the choke points of the map. Boats are coming next.',
      'Open sea is drawn a shade darker than the water near the shore.',
      'Press Delete (the delete key on a Mac) to destroy the units or buildings you have selected. Unfinished buildings give back what was not built yet. Your Town Center cannot be deleted.',
      'Place a gate on one of your wall pieces, finished or still a foundation, to swap it in.',
      'Only walls and gates can be built on bridges, fords and sandbars now, so nobody can block a crossing by accident.',
      'Fixed: the rice paddy placement preview showed a house. It now shows the field.',
    ],
  },
  {
    version: '0.8.2',
    date: '2026-11-22',
    title: 'Villager counts',
    items: [
      'The top bar shows how many villagers are gathering each resource, in brackets after the amount, e.g. 350 (6).',
      'On small or zoomed-in windows the top bar squeezes its spacing and shortens labels (Feudal instead of Feudal Age) so it stays on one line.',
    ],
  },
  {
    version: '0.8.1',
    date: '2026-11-22',
    title: 'One farmer per paddy',
    items: [
      'Shift-clicking several rice paddies with several villagers selected now gives each paddy its own villager, who builds it and then farms it (replanting as usual). If you place more paddies than you have villagers, the extra ones wait for a free villager.',
      'Villagers who finish a paddy together no longer crowd onto it: one farms it and the others build or farm other paddies close by.',
      'Right-clicking a paddy with several villagers sends one there and the rest to free paddies nearby.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-11-22',
    title: 'Music and match stats',
    items: [
      'Music: a calm loop of koto, a soft drone and a bamboo flute while you build, and a battle loop with taiko drums when a real fight breaks out near you. It eases back to calm after the fighting stops.',
      'New Music on/off button on the menu and the pause screen (M still mutes everything).',
      'The end-of-match screen now shows each resource gathered, biggest army, buildings built and when each side reached each age, with the better number in gold.',
      'Graphs of army size, villagers and resources gathered over the whole match, with dotted lines where each side reached a new age.',
      'Fixed: the minimap only showed the top-left part of the bigger map. It now shows the whole map, and clicking it goes to the right place.',
      'Fixed: the Full screen buttons did nothing.',
    ],
  },
  {
    version: '0.7.3',
    date: '2026-11-20',
    title: 'River variants',
    items: [
      'Each match picks one of five river layouts: winding, meandering (no bridge in the middle), twin streams with land between them, a central lake to go around, or a wide river with shallow fords instead of bridges.',
      'Fords are walkable shallow water with stepping stones.',
      'Twin streams come up most often (about 4 matches in 10).',
      'Removed the leftover Theme option from the menu; Sakura Village is the only look for now.',
    ],
  },
  {
    version: '0.7.2',
    date: '2026-11-20',
    title: 'Rice paddies',
    items: [
      'New building: the Rice paddy (60 wood). A villager works it for 300 food, then it replants itself for 40 wood. Units can walk over it.',
      'Food no longer runs out once the wild food near your village is gone.',
      'The enemy plants paddies, moves workers between resources as it needs them, and no longer stalls its army while saving up for an age.',
      'Select a rice paddy and press Z to turn auto-replant off or on. With it off, the paddy disappears when empty instead of costing 40 wood.',
      'Rice paddies now look like a golden harvest field with a scarecrow; the rice thins out and straw bundles pile up as you harvest it.',
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
