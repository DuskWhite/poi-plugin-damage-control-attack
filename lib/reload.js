'use strict'

// Reloads the KanColle game frame inside poi. Reuses poi's own
// `gameReload` helper when available, and falls back to the same inline
// webview JavaScript that poi uses internally if the helper is missing.
function reloadGameFallback() {
  const { getStore } = require('views/create-store')
  getStore('layout.webview.ref')?.executeJavaScript(`
  var doc;
  if (document.getElementById('game_frame')) {
    doc = document.getElementById('game_frame').contentDocument;
  } else {
    doc = document;
  }

  var game = doc.getElementById('htmlWrap');
  if (game) {
    game.contentWindow.location.reload()
  }
  `)
}

function reloadGame() {
  try {
    const { gameReload } = require('views/services/utils')
    gameReload()
  } catch (error) {
    console.warn('poi-plugin-damage-control-attack: falling back to inline reload', error)
    reloadGameFallback()
  }
}

module.exports = { reloadGame }
