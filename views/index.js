'use strict'

const React = require('react')
const { Callout, Switch, Intent } = require('@blueprintjs/core')
const { useTranslation } = require('react-i18next')

const STORAGE_KEY = 'poi-plugin-damage-control-attack:disabled'

function tt(t, key, fallback) {
  const translated = t(key)
  return translated === key ? fallback : translated
}

function reactClass() {
  const { t } = useTranslation('poi-plugin-damage-control-attack')
  const [disabled, setDisabled] = React.useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'true'
    } catch (_) {
      return false
    }
  })

  const toggle = (value) => {
    setDisabled(value)
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false')
    } catch (_) {
      /* storage may be unavailable */
    }
  }

  return React.createElement(
    'div',
    { style: { padding: 12 } },
    React.createElement(
      Callout,
      { intent: Intent.WARNING, title: tt(t, 'settingsTitle', '损管进击提醒') },
      tt(
        t,
        'settingsDescription',
        '当出击舰队只有一艘船且携带応急修理要員/女神，并且下一个进击点位为泊地修理点（F/H/I）时，弹出确认弹窗。点击取消会刷新游戏页面。',
      ),
    ),
    React.createElement(
      'div',
      { style: { marginTop: 12 } },
      React.createElement(Switch, {
        checked: !disabled,
        label: tt(t, 'enableLabel', '启用进击提醒'),
        onChange: (event) => toggle(!event.currentTarget.checked),
      }),
    ),
  )
}

exports.reactClass = reactClass
