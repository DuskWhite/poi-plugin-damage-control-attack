'use strict'

const { shouldWarn } = require('./lib/detect')
const { reloadGame } = require('./lib/reload')

const PLUGIN_ID = 'poi-plugin-damage-control-attack'
const DIALOG_ID = 'poi-damage-control-attack-dialog'
const STYLE_ID = 'poi-damage-control-attack-style'
const STORAGE_KEY = 'poi-plugin-damage-control-attack:disabled'

const MAP_PATHS = new Set([
  '/kcsapi/api_req_map/start',
  '/kcsapi/api_req_map/next',
])

// Reads a localized string. Plugin i18n is registered under the plugin id
// namespace by poi, so window.i18next can resolve it directly. Falls back
// to the provided Chinese text when the key is missing.
function tt(key, fallback) {
  try {
    const i18next = window.i18next
    if (i18next && typeof i18next.t === 'function') {
      const translated = i18next.t(key, { ns: PLUGIN_ID })
      if (translated && translated !== key) return translated
    }
  } catch (_) {
    /* ignore i18n failures, use fallback */
  }
  return fallback
}

function isDisabled() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch (_) {
    return false
  }
}

function setDisabled(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false')
  } catch (_) {
    /* storage may be unavailable in some contexts */
  }
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${DIALOG_ID}__overlay {
      align-items: center;
      background: rgba(0, 0, 0, 0.45);
      display: flex;
      justify-content: center;
      position: fixed;
      z-index: 2147483646;
      inset: 0;
    }
    #${DIALOG_ID} {
      background: rgba(35, 40, 48, 0.96);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      box-sizing: border-box;
      color: #fff;
      max-width: 380px;
      padding: 18px 20px 16px;
      width: calc(100% - 32px);
    }
    #${DIALOG_ID}__title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0;
      margin-bottom: 10px;
    }
    #${DIALOG_ID}__body {
      font-size: 14px;
      letter-spacing: 0;
      line-height: 1.6;
      margin-bottom: 18px;
      white-space: normal;
    }
    #${DIALOG_ID}__actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    .${DIALOG_ID}__btn {
      border: 0;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0;
      min-width: 84px;
      padding: 8px 16px;
      touch-action: manipulation;
    }
    .${DIALOG_ID}__btn--cancel {
      background: #d9822b;
      color: #fff;
    }
    .${DIALOG_ID}__btn--cancel:active {
      background: #bf7326;
    }
    .${DIALOG_ID}__btn--confirm {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
    .${DIALOG_ID}__btn--confirm:active {
      background: rgba(255, 255, 255, 0.2);
    }
  `
  document.head.appendChild(style)
}

function closeDialog() {
  const overlay = document.getElementById(`${DIALOG_ID}__overlay`)
  if (overlay) overlay.remove()
}

function showDialog() {
  if (document.getElementById(`${DIALOG_ID}__overlay`)) return
  ensureStyle()

  const overlay = document.createElement('div')
  overlay.id = `${DIALOG_ID}__overlay`

  const dialog = document.createElement('div')
  dialog.id = DIALOG_ID

  const title = document.createElement('div')
  title.id = `${DIALOG_ID}__title`
  title.textContent = tt('warningTitle', '进击提醒')

  const body = document.createElement('div')
  body.id = `${DIALOG_ID}__body`
  body.textContent = tt(
    'warningBody',
    '继续进击将消耗损管或者女神 请确认是否继续进击',
  )

  const actions = document.createElement('div')
  actions.id = `${DIALOG_ID}__actions`

  const confirmBtn = document.createElement('button')
  confirmBtn.type = 'button'
  confirmBtn.className = `${DIALOG_ID}__btn ${DIALOG_ID}__btn--confirm`
  confirmBtn.textContent = tt('confirm', '确认')
  confirmBtn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    closeDialog()
  })

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = `${DIALOG_ID}__btn ${DIALOG_ID}__btn--cancel`
  cancelBtn.textContent = tt('cancel', '取消')
  cancelBtn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    closeDialog()
    reloadGame()
  })

  actions.appendChild(confirmBtn)
  actions.appendChild(cancelBtn)

  dialog.appendChild(title)
  dialog.appendChild(body)
  dialog.appendChild(actions)
  overlay.appendChild(dialog)

  // Clicking the backdrop does nothing: the user must make an explicit
  // choice, since a stray click should neither advance nor reload.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) event.stopPropagation()
  })

  document.body.appendChild(overlay)
}

function handleGameResponse(e) {
  const { path } = e.detail
  if (!MAP_PATHS.has(path)) return
  if (isDisabled()) return

  const { getStore } = window
  if (typeof getStore !== 'function') return

  const sortieStatus = getStore('sortie.sortieStatus')
  const fleets = getStore('info.fleets')
  const ships = getStore('info.ships')
  const equips = getStore('info.equips')
  const fcdMap = getStore('fcd.map')
  const sortieMapId = getStore('sortie.sortieMapId')
  const currentNode = getStore('sortie.currentNode')

  try {
    if (
      shouldWarn({
        sortieStatus,
        fleets,
        ships,
        equips,
        fcdMap,
        sortieMapId,
        currentNode,
      })
    ) {
      showDialog()
    }
  } catch (error) {
    console.warn(`${PLUGIN_ID}: detection failed`, error)
  }
}

function pluginDidLoad() {
  window.addEventListener('game.response', handleGameResponse)
}

function pluginWillUnload() {
  window.removeEventListener('game.response', handleGameResponse)
  closeDialog()
  const style = document.getElementById(STYLE_ID)
  if (style) style.remove()
}

module.exports = {
  pluginDidLoad,
  pluginWillUnload,
  reactClass: () => require('./views').reactClass(),
}
