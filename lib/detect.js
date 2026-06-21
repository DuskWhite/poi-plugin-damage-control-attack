'use strict'

// Emergency repair consumables. Master slotitem IDs:
//   42 = 応急修理要員 (Emergency Repair Personnel)
//   43 = 応急修理女神 (Emergency Repair Goddess)
const REPAIR_ITEM_IDS = [42, 43]

// Anchorage-repair ("泊地修理") node letters that trigger the warning.
const REPAIR_NODE_LETTERS = ['F', 'H', 'I']

// Returns the array of ship instance ids that are currently sortied.
// Mirrors poi's damagedCheck: flatten api_ship across every fleet whose
// sortieStatus flag is true, dropping the -1 empty-slot placeholders.
function getSortiedShipIds(sortieStatus, fleets) {
  const result = []
  ;(sortieStatus || []).forEach((isSortie, fleetIndex) => {
    if (!isSortie) return
    const ships = (fleets && fleets[fleetIndex] && fleets[fleetIndex].api_ship) || []
    ships.forEach((shipId) => {
      if (shipId && shipId !== -1) result.push(shipId)
    })
  })
  return result
}

// Collects every equipment instance id equipped on a ship, across the four
// regular slots (api_slot) plus the reinforcement expansion (api_slot_ex).
function getShipEquipIds(ship) {
  if (!ship) return []
  const slot = Array.isArray(ship.api_slot) ? ship.api_slot : []
  const ex = typeof ship.api_slot_ex === 'number' ? [ship.api_slot_ex] : []
  return slot.concat(ex).filter((id) => id && id !== -1)
}

// True when the ship carries an emergency repair personnel/goddess.
function hasRepairItem(ship, equips, $equips) {
  return getShipEquipIds(ship).some((equipInstanceId) => {
    const equip = equips && equips[equipInstanceId]
    if (!equip) return false
    const masterId = equip.api_slotitem_id
    return REPAIR_ITEM_IDS.includes(masterId)
  })
}

// Resolves the next-node letter for the current sortie position.
// mapKey is "<area>-<map>" (e.g. "3-5"); route[currentNode] is [from, to]
// where `to` is the alpha node letter the fleet will advance to.
function getNextNodeLetter(fcdMap, sortieMapId, currentNode) {
  if (!fcdMap || sortieMapId == null || currentNode == null) return null
  const mapId = Number(sortieMapId)
  if (!Number.isFinite(mapId)) return null
  const mapKey = `${Math.floor(mapId / 10)}-${mapId % 10}`
  const mapData = fcdMap[mapKey]
  if (!mapData || !mapData.route) return null
  const entry = mapData.route[currentNode]
  if (!entry) return null
  const letter = entry[1]
  return typeof letter === 'string' ? letter : null
}

// Main entry: decides whether the warning should fire.
//
// Conditions:
//   1. Exactly one ship is sortied.
//   2. That ship carries an emergency repair personnel (42) or goddess (43).
//   3. The next node letter is one of F / H / I (anchorage repair).
function shouldWarn(opts) {
  const { sortieStatus, fleets, ships, equips, fcdMap, sortieMapId, currentNode } = opts

  const sortiedShipIds = getSortiedShipIds(sortieStatus, fleets)
  if (sortiedShipIds.length !== 1) return false

  const ship = ships && ships[sortiedShipIds[0]]
  if (!ship) return false
  if (!hasRepairItem(ship, equips)) return false

  const nextLetter = getNextNodeLetter(fcdMap, sortieMapId, currentNode)
  if (!nextLetter) return false
  if (!REPAIR_NODE_LETTERS.includes(nextLetter)) return false

  return true
}

module.exports = {
  REPAIR_ITEM_IDS,
  REPAIR_NODE_LETTERS,
  getSortiedShipIds,
  getShipEquipIds,
  hasRepairItem,
  getNextNodeLetter,
  shouldWarn,
}
