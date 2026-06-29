// ==UserScript==
// @name         KanColle Damage Control Advance Warning
// @namespace    https://github.com/DuskWhite/poi-plugin-damage-control-attack
// @version      0.1.6
// @description  Warns before advancing to anchorage repair nodes with a single ship carrying damage control.
// @author       DuskWhite
// @license      MIT
// @match        *://www.dmm.com/netgame/social/-/gadgets/=/app_id=854854/*
// @match        *://play.games.dmm.com/game/kancolle*
// @match        *://osapi.dmm.com/gadgets/ifr*
// @match        *://*/kcs2/index.php*
// @include      /^https?:\/\/[^/]+\/kcs2\/index\.php.*$/
// @resource     kc3Edges https://raw.githubusercontent.com/KC3Kai/KC3Kai/master/src/data/edges.json
// @grant        GM_getResourceText
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @run-at       document-start
// ==/UserScript==

/*
 * Uses KC3Kai's map edge data to resolve KanColle api_no values to node letters.
 * KC3Kai is MIT licensed: https://github.com/KC3Kai/KC3Kai
 */
(function () {
  'use strict'

  const STORAGE_KEY = 'poi-plugin-damage-control-attack:disabled'
  const EDGE_URLS = [
    'https://cdn.jsdelivr.net/gh/KC3Kai/KC3Kai@master/src/data/edges.json',
    'https://raw.githubusercontent.com/KC3Kai/KC3Kai/master/src/data/edges.json',
  ]
  const edgeStore = { edges: {} }

  function notifyEdgesLoaded() {
    const pageWindow = typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window
    if (pageWindow && typeof pageWindow.postMessage === 'function') {
      pageWindow.postMessage({
        source: 'damage-control-attack',
        type: 'edges',
        edges: edgeStore.edges,
      }, '*')
    }
  }

  function setEdgesFromText(text, source) {
    if (!text) return false
    try {
      const parsed = JSON.parse(text)
      if (parsed && Object.keys(parsed).length > 0) {
        edgeStore.edges = parsed
        console.info('damage-control-attack userscript: KC3Kai edge data loaded', {
          source,
          edgeMaps: Object.keys(edgeStore.edges).length,
        })
        notifyEdgesLoaded()
        return true
      }
    } catch (error) {
      console.warn('damage-control-attack userscript: failed to parse KC3Kai edge data', source, error)
    }
    return false
  }

  function requestText(url) {
    return new Promise((resolve, reject) => {
      const request = typeof GM_xmlhttpRequest === 'function'
        ? GM_xmlhttpRequest
        : typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function'
          ? GM.xmlHttpRequest
          : null

      if (request) {
        request({
          method: 'GET',
          url,
          onload: (response) => resolve(response.responseText),
          onerror: reject,
          ontimeout: reject,
        })
        return
      }

      fetch(url).then((response) => response.text()).then(resolve, reject)
    })
  }

  async function loadEdges() {
    if (typeof GM_getResourceText === 'function') {
      if (setEdgesFromText(GM_getResourceText('kc3Edges'), '@resource')) return
    }

    if (typeof GM !== 'undefined' && typeof GM.getResourceText === 'function') {
      try {
        if (setEdgesFromText(await GM.getResourceText('kc3Edges'), 'GM.getResourceText')) return
      } catch (error) {
        console.warn('damage-control-attack userscript: GM.getResourceText failed', error)
      }
    }

    for (const url of EDGE_URLS) {
      try {
        if (setEdgesFromText(await requestText(url), url)) return
      } catch (error) {
        console.warn('damage-control-attack userscript: edge data request failed', url, error)
      }
    }

    console.warn('damage-control-attack userscript: KC3Kai edge data unavailable')
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('切换损管进击提醒', () => {
      const disabled = window.localStorage.getItem(STORAGE_KEY) === 'true'
      window.localStorage.setItem(STORAGE_KEY, disabled ? 'false' : 'true')
      window.alert(`损管进击提醒已${disabled ? '启用' : '停用'}`)
    })
    GM_registerMenuCommand('切换损管进击提醒调试日志', () => {
      const enabled = window.localStorage.getItem(`${STORAGE_KEY}:debug`) === 'true'
      window.localStorage.setItem(`${STORAGE_KEY}:debug`, enabled ? 'false' : 'true')
      window.alert(`损管进击提醒调试日志已${enabled ? '关闭' : '开启'}，请刷新游戏页面`)
    })
    GM_registerMenuCommand('显示刷新悬浮窗', () => {
      const pageWindow = typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window
      window.localStorage.setItem('poi-plugin-reload-game-button:panel-closed', 'false')
      try {
        pageWindow.top.postMessage({
          source: 'damage-control-attack',
          type: 'showReloadPanel',
        }, '*')
      } catch (_) {
        pageWindow.postMessage({
          source: 'damage-control-attack',
          type: 'showReloadPanel',
        }, '*')
      }
    })
  }

  function pageMain(edgeStore, pageWindow) {
    'use strict'

    const window = pageWindow || globalThis.window
    const document = window.document
    const URL = window.URL
    const FormData = window.FormData
    const URLSearchParams = window.URLSearchParams

    const DIALOG_ID = 'poi-damage-control-attack-dialog'
    const RELOAD_PANEL_ID = 'poi-reload-game-panel'
    const STYLE_ID = 'poi-damage-control-attack-style'
    const STORAGE_KEY = 'poi-plugin-damage-control-attack:disabled'
    const DEBUG_KEY = `${STORAGE_KEY}:debug`
    const RELOAD_PANEL_STORAGE_KEY = 'poi-plugin-reload-game-button:panel-state'
    const RELOAD_PANEL_CLOSED_KEY = 'poi-plugin-reload-game-button:panel-closed'
    const REPAIR_ITEM_IDS = [42, 43]
    const REPAIR_NODE_LETTERS = ['F', 'H', 'I']
    const MAP_PATHS = new Set(['/kcsapi/api_req_map/start', '/kcsapi/api_req_map/next'])

    const state = {
      ships: {},
      equips: {},
      fleets: [],
      sortieFleetIndex: null,
      sortieMapWorld: null,
      sortieMapNum: null,
      lastWarnKey: null,
      handledApiCount: 0,
      lastApiPath: null,
      lastDecision: 'not checked',
    }

    window.__damageControlAttack = {
      state,
      version: '0.1.6',
      showDialog,
      showReloadPanel,
      edgeStore,
    }

    window.addEventListener('message', (event) => {
      const data = event.data
      if (!data || data.source !== 'damage-control-attack' || data.type !== 'edges') return
      edgeStore.edges = data.edges || {}
      console.info('damage-control-attack userscript: KC3Kai edge data applied', {
        edgeMaps: Object.keys(edgeStore.edges).length,
      })
    })
    window.addEventListener('message', (event) => {
      const data = event.data
      if (!data || data.source !== 'damage-control-attack' || data.type !== 'showReloadPanel') return
      showReloadPanel()
    })
    window.addEventListener('message', (event) => {
      const data = event.data
      if (!data || data.source !== 'damage-control-attack' || data.type !== 'reloadGame') return
      if (isGameFrame()) reloadGameFrame()
      else postToChildFrames(window, data)
    })

    function isDebug() {
      try {
        return window.localStorage.getItem(DEBUG_KEY) === 'true'
      } catch (_) {
        return false
      }
    }

    function debugLog() {
      if (!isDebug()) return
      console.info('[damage-control-attack]', ...arguments)
    }

    function isDisabled() {
      try {
        return window.localStorage.getItem(STORAGE_KEY) === 'true'
      } catch (_) {
        return false
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
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-style: normal;
          font-variant: normal;
          font-weight: 400;
          letter-spacing: 0;
          line-height: normal;
          max-width: 380px;
          padding: 18px 20px 16px;
          position: static;
          text-align: left;
          white-space: normal;
          width: calc(100% - 32px);
        }
        #${DIALOG_ID},
        #${DIALOG_ID} * {
          box-sizing: border-box;
        }
        #${DIALOG_ID}__title {
          display: block;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0;
          line-height: 1.4;
          margin-bottom: 10px;
          position: static;
          text-align: left;
          white-space: normal;
          width: 100%;
        }
        #${DIALOG_ID}__body {
          display: block;
          font-size: 14px;
          font-weight: 400;
          letter-spacing: 0;
          line-height: 1.6;
          margin-bottom: 18px;
          max-width: 100%;
          overflow-wrap: break-word;
          position: static;
          text-align: left;
          white-space: normal;
          width: 100%;
        }
        #${DIALOG_ID}__actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 0;
          position: static;
          width: 100%;
        }
        .${DIALOG_ID}__btn {
          align-items: center;
          appearance: none;
          border: 0;
          border-radius: 4px;
          cursor: pointer;
          display: inline-flex;
          font-size: 14px;
          font-weight: 600;
          height: auto;
          justify-content: center;
          letter-spacing: 0;
          line-height: 1.2;
          min-width: 84px;
          padding: 8px 16px;
          position: static;
          text-align: center;
          text-decoration: none;
          touch-action: manipulation;
          white-space: nowrap;
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
        #${RELOAD_PANEL_ID} {
          backdrop-filter: blur(12px);
          background: rgba(35, 40, 48, 0.88);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
          box-sizing: border-box;
          color: #fff;
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-style: normal;
          font-variant: normal;
          font-weight: 400;
          letter-spacing: 0;
          line-height: normal;
          min-height: 58px;
          min-width: 120px;
          overflow: hidden;
          position: fixed;
          text-align: center;
          white-space: normal;
          z-index: 2147483000;
        }
        #${RELOAD_PANEL_ID},
        #${RELOAD_PANEL_ID} * {
          box-sizing: border-box;
        }
        #${RELOAD_PANEL_ID} .poi-reload-game-panel-handle {
          align-items: center;
          background: rgba(255, 255, 255, 0.1);
          cursor: move;
          display: flex;
          flex: 0 0 22px;
          font-size: 11px;
          font-weight: 600;
          height: 22px;
          justify-content: center;
          letter-spacing: 0;
          line-height: 22px;
          position: static;
          text-align: center;
          touch-action: none;
          user-select: none;
          width: 100%;
        }
        #${RELOAD_PANEL_ID} .poi-reload-game-panel-title {
          display: block;
          flex: 1 1 auto;
          overflow: hidden;
          text-align: center;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        #${RELOAD_PANEL_ID} .poi-reload-game-panel-close {
          align-items: center;
          appearance: none;
          background: transparent;
          border: 0;
          border-radius: 0;
          color: rgba(255, 255, 255, 0.86);
          cursor: pointer;
          display: inline-flex;
          flex: 0 0 26px;
          font-size: 17px;
          font-weight: 400;
          height: 22px;
          justify-content: center;
          line-height: 1;
          margin: 0;
          padding: 0;
          position: static;
          text-align: center;
          touch-action: manipulation;
          width: 26px;
        }
        #${RELOAD_PANEL_ID} .poi-reload-game-panel-close:active {
          background: rgba(255, 255, 255, 0.12);
        }
        #${RELOAD_PANEL_ID} .poi-reload-game-panel-button {
          align-items: center;
          appearance: none;
          background: #d9822b;
          border: 0;
          border-radius: 0;
          color: #fff;
          cursor: pointer;
          display: flex;
          flex: 1 1 auto;
          font-size: 18px;
          font-weight: 700;
          height: auto;
          justify-content: center;
          letter-spacing: 0;
          line-height: 1.2;
          margin: 0;
          min-height: 36px;
          padding: 8px 12px;
          position: static;
          text-align: center;
          text-decoration: none;
          touch-action: manipulation;
          user-select: none;
          white-space: normal;
          width: 100%;
        }
        #${RELOAD_PANEL_ID} .poi-reload-game-panel-button:active {
          background: #bf7326;
        }
        #${RELOAD_PANEL_ID} .poi-reload-game-panel-resizer {
          border-bottom: 12px solid rgba(255, 255, 255, 0.72);
          border-left: 12px solid transparent;
          bottom: 4px;
          cursor: nwse-resize;
          display: block;
          height: 0;
          position: absolute;
          right: 4px;
          touch-action: none;
          width: 0;
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
      title.textContent = '进击提醒'

      const body = document.createElement('div')
      body.id = `${DIALOG_ID}__body`
      body.textContent = '继续进击将消耗损管或者女神 请确认是否继续进击'

      const actions = document.createElement('div')
      actions.id = `${DIALOG_ID}__actions`

      const confirmBtn = document.createElement('button')
      confirmBtn.type = 'button'
      confirmBtn.className = `${DIALOG_ID}__btn ${DIALOG_ID}__btn--confirm`
      confirmBtn.textContent = '确认'
      confirmBtn.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        closeDialog()
      })

      const cancelBtn = document.createElement('button')
      cancelBtn.type = 'button'
      cancelBtn.className = `${DIALOG_ID}__btn ${DIALOG_ID}__btn--cancel`
      cancelBtn.textContent = '取消'
      cancelBtn.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        closeDialog()
        window.location.reload()
      })

      actions.appendChild(confirmBtn)
      actions.appendChild(cancelBtn)
      dialog.appendChild(title)
      dialog.appendChild(body)
      dialog.appendChild(actions)
      overlay.appendChild(dialog)
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) event.stopPropagation()
      })

      document.body.appendChild(overlay)
    }

    function isGameFrame() {
      return window.location.pathname === '/kcs2/index.php'
    }

    function isTopWindow() {
      return window.top === window
    }

    function readReloadPanelState() {
      try {
        const raw = window.localStorage.getItem(RELOAD_PANEL_STORAGE_KEY)
        if (!raw) return { width: 168, height: 78, top: null, left: null }

        const parsed = JSON.parse(raw)
        return {
          width: Number.isFinite(parsed.width) ? parsed.width : 168,
          height: Number.isFinite(parsed.height) ? parsed.height : 78,
          top: Number.isFinite(parsed.top) ? parsed.top : null,
          left: Number.isFinite(parsed.left) ? parsed.left : null,
        }
      } catch (error) {
        console.warn('damage-control-attack userscript: failed to read reload panel state', error)
        return { width: 168, height: 78, top: null, left: null }
      }
    }

    function writeReloadPanelState(panel) {
      try {
        const rect = panel.getBoundingClientRect()
        window.localStorage.setItem(RELOAD_PANEL_STORAGE_KEY, JSON.stringify({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
        }))
      } catch (error) {
        console.warn('damage-control-attack userscript: failed to write reload panel state', error)
      }
    }

    function isReloadPanelClosed() {
      try {
        return window.localStorage.getItem(RELOAD_PANEL_CLOSED_KEY) === 'true'
      } catch (_) {
        return false
      }
    }

    function setReloadPanelClosed(closed) {
      try {
        window.localStorage.setItem(RELOAD_PANEL_CLOSED_KEY, closed ? 'true' : 'false')
      } catch (_) {
        /* ignore storage failures */
      }
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max)
    }

    function clampReloadPanel(panel) {
      const rect = panel.getBoundingClientRect()
      const left = clamp(rect.left, 0, Math.max(0, window.innerWidth - rect.width))
      const top = clamp(rect.top, 0, Math.max(0, window.innerHeight - rect.height))
      panel.style.left = `${Math.round(left)}px`
      panel.style.top = `${Math.round(top)}px`
      panel.style.right = 'auto'
    }

    function applyReloadPanelState(panel) {
      const state = readReloadPanelState()
      const width = clamp(state.width, 120, Math.max(120, window.innerWidth))
      const height = clamp(state.height, 58, Math.max(58, window.innerHeight))

      panel.style.width = `${Math.round(width)}px`
      panel.style.height = `${Math.round(height)}px`

      if (state.left == null || state.top == null) {
        panel.style.right = '14px'
        panel.style.left = 'auto'
        panel.style.top = `${Math.round((window.innerHeight - height) / 2)}px`
      } else {
        panel.style.left = `${Math.round(state.left)}px`
        panel.style.top = `${Math.round(state.top)}px`
        panel.style.right = 'auto'
      }

      window.requestAnimationFrame(() => clampReloadPanel(panel))
    }

    function reloadGameFrame() {
      window.location.reload()
    }

    function postToChildFrames(targetWindow, message) {
      for (let index = 0; index < targetWindow.frames.length; index += 1) {
        const frame = targetWindow.frames[index]
        try {
          frame.postMessage(message, '*')
          postToChildFrames(frame, message)
        } catch (_) {
          try {
            frame.postMessage(message, '*')
          } catch (_) {
            /* cross-origin frame refused traversal */
          }
        }
      }
    }

    function requestGameReload() {
      if (isGameFrame()) {
        reloadGameFrame()
        return
      }

      postToChildFrames(window, {
        source: 'damage-control-attack',
        type: 'reloadGame',
      })
    }

    function closeReloadPanel(panel) {
      writeReloadPanelState(panel)
      setReloadPanelClosed(true)
      panel.remove()
    }

    function makeReloadPanelDraggable(panel, handle) {
      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        panel.setPointerCapture?.(event.pointerId)

        const rect = panel.getBoundingClientRect()
        const startX = event.clientX
        const startY = event.clientY
        const startLeft = rect.left
        const startTop = rect.top

        const onMove = (moveEvent) => {
          panel.style.left = `${Math.round(startLeft + moveEvent.clientX - startX)}px`
          panel.style.top = `${Math.round(startTop + moveEvent.clientY - startY)}px`
          panel.style.right = 'auto'
          clampReloadPanel(panel)
        }

        const onEnd = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onEnd)
          window.removeEventListener('pointercancel', onEnd)
          writeReloadPanelState(panel)
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onEnd)
        window.addEventListener('pointercancel', onEnd)
      })
    }

    function makeReloadPanelResizable(panel, resizer) {
      resizer.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        panel.setPointerCapture?.(event.pointerId)

        const rect = panel.getBoundingClientRect()
        const startX = event.clientX
        const startY = event.clientY
        const startWidth = rect.width
        const startHeight = rect.height

        const onMove = (moveEvent) => {
          const width = clamp(startWidth + moveEvent.clientX - startX, 120, window.innerWidth)
          const height = clamp(startHeight + moveEvent.clientY - startY, 58, window.innerHeight)
          panel.style.width = `${Math.round(width)}px`
          panel.style.height = `${Math.round(height)}px`
          clampReloadPanel(panel)
        }

        const onEnd = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onEnd)
          window.removeEventListener('pointercancel', onEnd)
          writeReloadPanelState(panel)
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onEnd)
        window.addEventListener('pointercancel', onEnd)
      })
    }

    function createReloadPanel() {
      const panel = document.createElement('div')
      panel.id = RELOAD_PANEL_ID

      const handle = document.createElement('div')
      handle.className = 'poi-reload-game-panel-handle'

      const title = document.createElement('div')
      title.className = 'poi-reload-game-panel-title'
      title.textContent = 'Reload'

      const close = document.createElement('button')
      close.type = 'button'
      close.className = 'poi-reload-game-panel-close'
      close.title = '关闭'
      close.setAttribute('aria-label', '关闭')
      close.textContent = '×'
      close.addEventListener('pointerdown', (event) => {
        event.stopPropagation()
      })
      close.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        closeReloadPanel(panel)
      })

      handle.appendChild(title)
      handle.appendChild(close)

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'poi-reload-game-panel-button'
      button.title = '重新载入游戏'
      button.setAttribute('aria-label', '重新载入游戏')
      button.textContent = '重新载入游戏'
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        requestGameReload()
      })

      const resizer = document.createElement('div')
      resizer.className = 'poi-reload-game-panel-resizer'

      panel.appendChild(handle)
      panel.appendChild(button)
      panel.appendChild(resizer)

      makeReloadPanelDraggable(panel, handle)
      makeReloadPanelResizable(panel, resizer)
      applyReloadPanelState(panel)

      return panel
    }

    function injectReloadPanel() {
      if (!isTopWindow() || !document.body || isReloadPanelClosed()) return false
      if (document.getElementById(RELOAD_PANEL_ID)) return true

      ensureStyle()
      document.body.appendChild(createReloadPanel())
      return true
    }

    function showReloadPanel() {
      if (!isTopWindow()) return
      setReloadPanelClosed(false)
      injectReloadPanel()
      const panel = document.getElementById(RELOAD_PANEL_ID)
      if (panel) {
        clampReloadPanel(panel)
        writeReloadPanelState(panel)
      }
    }

    function handleWindowResize() {
      const panel = document.getElementById(RELOAD_PANEL_ID)
      if (panel) {
        clampReloadPanel(panel)
        writeReloadPanelState(panel)
      }
    }

    function startReloadPanel() {
      if (!isTopWindow()) return

      const start = () => {
        injectReloadPanel()
        window.addEventListener('resize', handleWindowResize)
        const retryTimer = window.setInterval(() => {
          if (injectReloadPanel()) window.clearInterval(retryTimer)
        }, 1000)
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true })
      } else {
        start()
      }
    }

    function parsePath(url) {
      try {
        return new URL(url, window.location.href).pathname
      } catch (_) {
        return ''
      }
    }

    function parseResponse(text) {
      if (typeof text !== 'string') return null
      const jsonText = text.startsWith('svdata=') ? text.slice(7) : text
      try {
        return JSON.parse(jsonText)
      } catch (_) {
        return null
      }
    }

    function parseParams(body) {
      if (!body) return {}
      if (body instanceof URLSearchParams) return Object.fromEntries(body.entries())
      if (body instanceof FormData) return Object.fromEntries(body.entries())
      if (typeof body !== 'string') return {}
      try {
        return Object.fromEntries(new URLSearchParams(body).entries())
      } catch (_) {
        return {}
      }
    }

    function putByApiId(target, items) {
      ;(items || []).forEach((item) => {
        if (item && item.api_id != null) target[item.api_id] = item
      })
    }

    function putOneOrManyByApiId(target, items) {
      if (Array.isArray(items)) putByApiId(target, items)
      else if (items && items.api_id != null) putByApiId(target, [items])
    }

    function setFleets(fleets) {
      if (Array.isArray(fleets)) state.fleets = fleets
    }

    function updatePort(apiData) {
      putByApiId(state.ships, apiData.api_ship)
      putByApiId(state.equips, apiData.api_slot_item)
      setFleets(apiData.api_deck_port)
    }

    function updateShipDeck(apiData) {
      putByApiId(state.ships, apiData.api_ship_data)
      setFleets(apiData.api_deck_data)
    }

    function updateShipList(apiData) {
      if (Array.isArray(apiData)) {
        putByApiId(state.ships, apiData)
        return
      }
      putByApiId(state.ships, apiData.api_ship_data || apiData.api_ship)
      setFleets(apiData.api_deck_data || apiData.api_deck)
    }

    function updateSlotItems(apiData) {
      putByApiId(state.equips, Array.isArray(apiData) ? apiData : apiData.api_slot_item)
    }

    function updateKnownState(apiData) {
      if (!apiData || typeof apiData !== 'object') return
      putOneOrManyByApiId(state.ships, apiData.api_ship_data || apiData.api_ship)
      putOneOrManyByApiId(state.equips, apiData.api_slot_item)
      if (Array.isArray(apiData.api_deck_data)) setFleets(apiData.api_deck_data)
      else if (Array.isArray(apiData.api_deck)) setFleets(apiData.api_deck)
    }

    function updateFleetChange(params) {
      const fleetIndex = Number(params.api_id) - 1
      const shipIndex = Number(params.api_ship_idx)
      const shipId = Number(params.api_ship_id)
      const fleet = state.fleets[fleetIndex]
      if (!fleet || !Array.isArray(fleet.api_ship)) return

      if (shipIndex >= 0) {
        fleet.api_ship[shipIndex] = Number.isFinite(shipId) ? shipId : -1
      } else if (shipIndex === -1) {
        fleet.api_ship = fleet.api_ship.map((currentShipId, index) => (index === 0 ? currentShipId : -1))
      }
    }

    function getFleetShips() {
      const fleet = state.fleets[state.sortieFleetIndex]
      return ((fleet && fleet.api_ship) || []).filter((shipId) => shipId && shipId !== -1)
    }

    function getShipEquipIds(ship) {
      if (!ship) return []
      const slot = Array.isArray(ship.api_slot) ? ship.api_slot : []
      const ex = typeof ship.api_slot_ex === 'number' ? [ship.api_slot_ex] : []
      return slot.concat(ex).filter((id) => id && id !== -1)
    }

    function hasRepairItem(ship) {
      return getShipEquipIds(ship).some((equipInstanceId) => {
        const equip = state.equips[equipInstanceId]
        return equip && REPAIR_ITEM_IDS.includes(equip.api_slotitem_id)
      })
    }

    function getNodeLetter(apiNo) {
      const mapKey = `World ${state.sortieMapWorld}-${state.sortieMapNum}`
      const edges = edgeStore.edges
      const edge = edges && edges[mapKey] && edges[mapKey][String(apiNo)]
      return Array.isArray(edge) && typeof edge[1] === 'string' ? edge[1] : null
    }

    function shouldWarn(nodeData) {
      if (!nodeData || nodeData.api_no == null) {
        state.lastDecision = 'no node data'
        return false
      }

      const shipIds = getFleetShips()
      if (shipIds.length !== 1) {
        state.lastDecision = `sortied ship count is ${shipIds.length}`
        return false
      }

      const ship = state.ships[shipIds[0]]
      if (!ship) {
        state.lastDecision = `ship ${shipIds[0]} not found`
        return false
      }
      if (!hasRepairItem(ship)) {
        state.lastDecision = `ship ${shipIds[0]} has no repair item`
        return false
      }

      const nodeLetter = getNodeLetter(nodeData.api_no)
      if (!nodeLetter) {
        state.lastDecision = `node ${nodeData.api_no} not found in edge data`
        return false
      }
      if (!REPAIR_NODE_LETTERS.includes(nodeLetter)) {
        state.lastDecision = `node ${nodeData.api_no} is ${nodeLetter}`
        return false
      }

      state.lastDecision = `warning at ${nodeLetter}`
      return true
    }

    function maybeWarn(nodeData) {
      if (isDisabled()) {
        state.lastDecision = 'disabled'
        debugLog('skip warning:', state.lastDecision)
        return
      }
      if (!shouldWarn(nodeData)) {
        debugLog('skip warning:', state.lastDecision, {
          fleetIndex: state.sortieFleetIndex,
          map: `${state.sortieMapWorld}-${state.sortieMapNum}`,
          apiNo: nodeData && nodeData.api_no,
          fleets: state.fleets.length,
          ships: Object.keys(state.ships).length,
          equips: Object.keys(state.equips).length,
        })
        return
      }

      const warnKey = `${state.sortieMapWorld}-${state.sortieMapNum}-${nodeData.api_no}`
      if (state.lastWarnKey === warnKey) return
      state.lastWarnKey = warnKey
      debugLog('show warning:', warnKey)
      showDialog()
    }

    function handleMapStart(params, apiData) {
      state.sortieFleetIndex = Number(params.api_deck_id || 1) - 1
      state.sortieMapWorld = Number(apiData.api_maparea_id)
      state.sortieMapNum = Number(apiData.api_mapinfo_no)
      state.lastWarnKey = null
      maybeWarn(apiData)
    }

    function handleApi(path, params, response) {
      const apiData = response && response.api_data
      state.handledApiCount += 1
      state.lastApiPath = path
      debugLog('api handled:', path)
      if (path === '/kcsapi/api_req_hensei/change') updateFleetChange(params)
      if (!apiData) return
      updateKnownState(apiData)

      if (path === '/kcsapi/api_port/port') updatePort(apiData)
      else if (path === '/kcsapi/api_get_member/ship_deck') updateShipDeck(apiData)
      else if (path === '/kcsapi/api_get_member/ship2' || path === '/kcsapi/api_get_member/ship3') updateShipList(apiData)
      else if (path === '/kcsapi/api_get_member/deck') setFleets(apiData)
      else if (path === '/kcsapi/api_get_member/slot_item') updateSlotItems(apiData)
      else if (path === '/kcsapi/api_req_map/start') handleMapStart(params, apiData)
      else if (path === '/kcsapi/api_req_map/next') maybeWarn(apiData)
      else if (MAP_PATHS.has(path)) maybeWarn(apiData)
    }

    function handleResponse(url, body, responseText) {
      const path = parsePath(url)
      if (!path.startsWith('/kcsapi/')) return
      const response = parseResponse(responseText)
      if (!response) return

      try {
        handleApi(path, parseParams(body), response)
      } catch (error) {
        console.warn('damage-control-attack userscript: failed to handle API response', path, error)
      }
    }

    function isKcsApiUrl(url) {
      return parsePath(url).startsWith('/kcsapi/')
    }

    function getXhrTextResponse(xhr) {
      if (xhr.responseType && xhr.responseType !== 'text') return null
      try {
        return xhr.responseText
      } catch (error) {
        debugLog('skip unreadable xhr response:', xhr.responseType, error)
        return null
      }
    }

    function hookXhr() {
      const OriginalXhr = window.XMLHttpRequest
      if (!OriginalXhr || OriginalXhr.__damageControlAttackHooked) return

      function HookedXhr() {
        const xhr = new OriginalXhr()
        let requestUrl = ''
        let requestBody = null

        const originalOpen = xhr.open
        xhr.open = function open(method, url) {
          requestUrl = String(url || '')
          return originalOpen.apply(xhr, arguments)
        }

        const originalSend = xhr.send
        xhr.send = function send(body) {
          requestBody = body
          xhr.addEventListener('load', () => {
            if (!isKcsApiUrl(requestUrl)) return
            const responseText = getXhrTextResponse(xhr)
            if (responseText === null) return
            handleResponse(requestUrl, requestBody, responseText)
          })
          return originalSend.apply(xhr, arguments)
        }

        return xhr
      }

      HookedXhr.prototype = OriginalXhr.prototype
      HookedXhr.UNSENT = OriginalXhr.UNSENT
      HookedXhr.OPENED = OriginalXhr.OPENED
      HookedXhr.HEADERS_RECEIVED = OriginalXhr.HEADERS_RECEIVED
      HookedXhr.LOADING = OriginalXhr.LOADING
      HookedXhr.DONE = OriginalXhr.DONE
      HookedXhr.__damageControlAttackHooked = true
      window.XMLHttpRequest = HookedXhr
    }

    function hookFetch() {
      const originalFetch = window.fetch
      if (typeof originalFetch !== 'function' || originalFetch.__damageControlAttackHooked) return

      function hookedFetch(input, init) {
        const url = typeof input === 'string' ? input : input && input.url
        const body = (init && init.body) || (input && input.body) || null
        return originalFetch.apply(this, arguments).then((response) => {
          if (url && parsePath(url).startsWith('/kcsapi/')) {
            response.clone().text().then((text) => handleResponse(url, body, text))
          }
          return response
        })
      }

      hookedFetch.__damageControlAttackHooked = true
      window.fetch = hookedFetch
    }

    hookXhr()
    hookFetch()
    startReloadPanel()
    console.info('damage-control-attack userscript loaded', {
      href: window.location.href,
      edgeMaps: edgeStore.edges ? Object.keys(edgeStore.edges).length : 0,
    })
  }

  function injectPageMain() {
    if (typeof unsafeWindow !== 'undefined' && unsafeWindow && unsafeWindow.XMLHttpRequest) {
      try {
        pageMain(edgeStore, unsafeWindow)
        return
      } catch (error) {
        console.warn('damage-control-attack userscript: unsafeWindow hook failed, falling back to script injection', error)
      }
    }

    const parent = document.documentElement || document.head || document.body
    if (!parent) {
      window.setTimeout(injectPageMain, 0)
      return
    }

    const script = document.createElement('script')
    script.textContent = `;(${pageMain.toString()})(${JSON.stringify(edgeStore)});`
    parent.appendChild(script)
    script.remove()
  }

  injectPageMain()
  loadEdges()
})()
