'use strict'

const assert = require('assert')

const {
  REPAIR_ITEM_IDS,
  REPAIR_NODE_LETTERS,
  getSortiedShipIds,
  getShipEquipIds,
  hasRepairItem,
  getNextNodeLetter,
  shouldWarn,
} = require('./lib/detect')

const pkg = require('./package.json')

// ---------------------------------------------------------------------------
// Static metadata checks
// ---------------------------------------------------------------------------

assert.strictEqual(pkg.name, 'poi-plugin-damage-control-attack')
assert.strictEqual(pkg.author, 'DuskWhite')
assert.strictEqual(pkg.poiPlugin.i18nDir, 'i18n')

assert.deepStrictEqual(REPAIR_ITEM_IDS, [42, 43])
assert.deepStrictEqual(REPAIR_NODE_LETTERS, ['F', 'H', 'I'])

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// A minimal fcd map shaped like poi's state.fcd.map: mapKey -> { route, spots }
// route[currentNode] = [fromNode, toNodeLetter]. Here node 6 -> "F".
const fcdMap = {
  '3-5': {
    route: {
      0: [null, '1'],
      6: ['1', 'F'],
      7: ['F', 'G'],
      8: ['D', 'H'],
      10: ['G', 'I'],
      12: ['A', 'B'],
    },
    spots: {},
  },
}

const makeEquips = (overrides = {}) => ({ 1: { api_slotitem_id: 183 }, 2: { api_slotitem_id: 42 }, 3: { api_slotitem_id: 43 }, ...overrides })

const makeShip = (overrides = {}) => ({
  api_id: 100,
  api_ship_id: 1,
  api_slot: [1, -1, -1, -1],
  api_slot_ex: -1,
  ...overrides,
})

// ---------------------------------------------------------------------------
// getSortiedShipIds
// ---------------------------------------------------------------------------

assert.deepStrictEqual(
  getSortiedShipIds([true, false, false, false], [{ api_ship: [100, -1, -1, -1, -1, -1] }]),
  [100],
  'single sortied fleet returns its non-empty ships',
)

assert.deepStrictEqual(
  getSortiedShipIds([false, false, false, false], [{ api_ship: [100] }]),
  [],
  'no sortied fleet returns empty',
)

assert.deepStrictEqual(
  getSortiedShipIds([true, true, false, false], [
    { api_ship: [100, 101] },
    { api_ship: [102, -1] },
  ]),
  [100, 101, 102],
  'combined fleet flattens both and drops -1',
)

// ---------------------------------------------------------------------------
// getShipEquipIds
// ---------------------------------------------------------------------------

assert.deepStrictEqual(getShipEquipIds(makeShip()), [1], 'drops -1 placeholders')
assert.deepStrictEqual(
  getShipEquipIds(makeShip({ api_slot: [1, 2, 3, 4], api_slot_ex: 5 })),
  [1, 2, 3, 4, 5],
  'includes reinforcement expansion',
)
assert.deepStrictEqual(getShipEquipIds(null), [], 'null ship returns empty')

// ---------------------------------------------------------------------------
// hasRepairItem
// ---------------------------------------------------------------------------

assert.strictEqual(
  hasRepairItem(makeShip({ api_slot: [2, -1, -1, -1] }), makeEquips()),
  true,
  '要員 (42) in a regular slot triggers',
)

assert.strictEqual(
  hasRepairItem(makeShip({ api_slot: [-1, -1, -1, -1], api_slot_ex: 3 }), makeEquips()),
  true,
  '女神 (43) in reinforcement expansion triggers',
)

assert.strictEqual(
  hasRepairItem(makeShip({ api_slot: [1, -1, -1, -1] }), makeEquips()),
  false,
  'ordinary equipment does not trigger',
)

assert.strictEqual(
  hasRepairItem(makeShip({ api_slot: [99, -1, -1, -1] }), makeEquips()),
  false,
  'unknown equip instance id does not trigger',
)

// ---------------------------------------------------------------------------
// getNextNodeLetter
// ---------------------------------------------------------------------------

assert.strictEqual(getNextNodeLetter(fcdMap, 35, 6), 'F', 'node 6 on 3-5 advances to F')
assert.strictEqual(getNextNodeLetter(fcdMap, 35, 12), 'B', 'node 12 on 3-5 advances to B')
assert.strictEqual(getNextNodeLetter(fcdMap, 35, 7), 'G', 'node 7 on 3-5 advances to G (not a repair node)')
assert.strictEqual(getNextNodeLetter(fcdMap, 35, 8), 'H', 'node 8 on 3-5 advances to H')
assert.strictEqual(getNextNodeLetter(fcdMap, 35, 10), 'I', 'node 10 on 3-5 advances to I')
assert.strictEqual(getNextNodeLetter(fcdMap, 99, 6), null, 'unknown map returns null')
assert.strictEqual(getNextNodeLetter(fcdMap, 35, 999), null, 'unknown node returns null')
assert.strictEqual(getNextNodeLetter(null, 35, 6), null, 'null fcd returns null')

// ---------------------------------------------------------------------------
// shouldWarn
// ---------------------------------------------------------------------------

const baseWarnOpts = () => ({
  sortieStatus: [true, false, false, false],
  fleets: [{ api_ship: [100, -1, -1, -1, -1, -1] }],
  ships: { 100: makeShip({ api_slot: [2, -1, -1, -1] }) },
  equips: makeEquips(),
  fcdMap,
  sortieMapId: 35,
  currentNode: 6,
})

assert.strictEqual(shouldWarn(baseWarnOpts()), true, 'single ship + 要員 + next node F warns')

assert.strictEqual(
  shouldWarn({ ...baseWarnOpts(), currentNode: 7 }),
  false,
  'next node G (not F/H/I) does not warn',
)

assert.strictEqual(
  shouldWarn({ ...baseWarnOpts(), currentNode: 8 }),
  true,
  'next node H warns',
)

assert.strictEqual(
  shouldWarn({ ...baseWarnOpts(), currentNode: 10 }),
  true,
  'next node I warns',
)

assert.strictEqual(
  shouldWarn({ ...baseWarnOpts(), ships: { 100: makeShip({ api_slot: [1, -1, -1, -1] }) } }),
  false,
  'no repair item equipped does not warn',
)

assert.strictEqual(
  shouldWarn({
    ...baseWarnOpts(),
    fleets: [{ api_ship: [100, 101, -1, -1, -1, -1] }],
    ships: {
      100: makeShip({ api_slot: [2, -1, -1, -1] }),
      101: makeShip({ api_id: 101, api_slot: [-1, -1, -1, -1] }),
    },
  }),
  false,
  'two sortied ships does not warn',
)

assert.strictEqual(
  shouldWarn({ ...baseWarnOpts(), sortieMapId: 0 }),
  false,
  'not in sortie does not warn',
)

assert.strictEqual(
  shouldWarn({ ...baseWarnOpts(), currentNode: null }),
  false,
  'null currentNode does not warn',
)

assert.strictEqual(
  shouldWarn({ ...baseWarnOpts(), sortieStatus: [false, false, false, false] }),
  false,
  'no fleet sortied does not warn',
)

// 女神 in slot_ex also triggers the warning on node H.
assert.strictEqual(
  shouldWarn({
    ...baseWarnOpts(),
    ships: { 100: makeShip({ api_slot: [-1, -1, -1, -1], api_slot_ex: 3 }) },
    currentNode: 8,
  }),
  true,
  '女神 in reinforcement expansion + node H warns',
)

console.log('damage-control-attack detection tests ok')
