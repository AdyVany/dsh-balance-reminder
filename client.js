/**
 * Client half of dsh-balance-reminder.
 *
 * The bundle registers two pieces of UI while the signed-in account remote is
 * accessible:
 *
 * - `shell.bottom`: an always-visible bar showing the DeepSeek Platform wallet
 *   balance (recharge + granted bonus), refreshed once a minute. The bar turns
 *   amber below ¥20 and red below ¥5; a failed read never becomes a fake zero.
 * - `shell.overlay`: a low-balance reminder card that appears while the wallet
 *   is below the warning threshold and can be dismissed until the balance
 *   recovers.
 *
 * The wallet is read through the existing account controller
 * (`ctx.remote.account.getBalance`), so the plugin needs no API key of its own
 * and no Host-side state.
 */
window.__ModuleLoader__.load({
  id: 'dsh-balance-reminder',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'balance-reminder'
    const REFRESH_MS = 60 * 1000
    const WARN_BELOW = 20
    const CRITICAL_BELOW = 5
    const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

    const zh = {
      label: '余额',
      bonus: '赠金',
      loading: '余额加载中…',
      signedOut: '未登录，无法读取余额',
      failed: '余额获取失败',
      retry: '重试',
      refresh: '刷新',
      refreshing: '刷新中…',
      updated: '更新于',
      autoRefresh: '每分钟自动刷新',
      topUp: '去充值',
      warnTitle: '余额提醒',
      criticalTitle: '余额严重不足',
      warnBodyBefore: 'DeepSeek 账户可用余额为 ',
      warnBodyAfter: '，建议及时充值，以免任务中断。',
      later: '稍后提醒',
      neverMind: '知道了',
      noGrant: '请先在「设置 → 账号」登录 DeepSeek',
    }

    const en = {
      label: 'Balance',
      bonus: 'Bonus',
      loading: 'Loading balance…',
      signedOut: 'Signed out — no balance available',
      failed: 'Balance unavailable',
      retry: 'Retry',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      updated: 'updated',
      autoRefresh: 'auto-refresh every minute',
      topUp: 'Top up',
      warnTitle: 'Low balance',
      criticalTitle: 'Balance critically low',
      warnBodyBefore: 'Your DeepSeek balance is ',
      warnBodyAfter: '. Top up soon to keep tasks running.',
      later: 'Later',
      neverMind: 'Dismiss',
      noGrant: 'Sign in under Settings → Account first',
    }

    /** Build a tiny observable whose snapshot identity is stable until a change. */
    function createSource(initial) {
      let value = initial
      const listeners = new Set()
      return {
        getSnapshot: function () {
          return value
        },
        subscribe: function (listener) {
          listeners.add(listener)
          return function () {
            listeners.delete(listener)
          }
        },
        set: function (next) {
          value = next
          for (const listener of Array.from(listeners)) {
            try {
              listener()
            } catch (error) {
              console.error('[balance-reminder] subscriber failed', error)
            }
          }
        },
      }
    }

    /** Group wallet rows by currency, keeping the decimal strings as numbers. */
    function sumWallets(wallets) {
      const totals = new Map()
      if (!Array.isArray(wallets)) return totals
      for (const wallet of wallets) {
        if (!wallet || typeof wallet.balance !== 'string' || typeof wallet.currency !== 'string') continue
        const amount = Number(wallet.balance)
        if (!Number.isFinite(amount)) continue
        totals.set(wallet.currency, (totals.get(wallet.currency) || 0) + amount)
      }
      return totals
    }

    function symbolFor(currency) {
      return currency === 'USD' ? '$' : '¥'
    }

    /** Platform Web style: two decimals, grouped digits, sub-cent shown as <¥0.01. */
    function formatAbs(value) {
      const roundedDown = Math.floor(value * 100) / 100
      const text = roundedDown.toFixed(2)
      const parts = text.split('.')
      return Number(parts[0]).toLocaleString('en-US') + '.' + parts[1]
    }

    function formatAmount(amount, symbol) {
      const value = Number(amount)
      if (!Number.isFinite(value)) return symbol + '--'
      if (value === 0) return symbol + '0.00'
      if (value < 0) return '-' + symbol + formatAbs(Math.abs(value))
      if (value < 0.01) return '<' + symbol + '0.01'
      return symbol + formatAbs(value)
    }

    function derive(state) {
      const normal = sumWallets(state.normal)
      const bonus = sumWallets(state.bonus)
      const currencies = []
      for (const currency of ['CNY', 'USD']) {
        if (normal.has(currency) || bonus.has(currency)) currencies.push(currency)
      }
      const hasCny = normal.has('CNY') || bonus.has('CNY')
      const cny = (normal.get('CNY') || 0) + (bonus.get('CNY') || 0)
      let level = 'ok'
      if (state.phase === 'ready' && hasCny) {
        if (cny < CRITICAL_BELOW) level = 'critical'
        else if (cny < WARN_BELOW) level = 'warn'
      }
      return { normal: normal, bonus: bonus, currencies: currencies, hasCny: hasCny, cny: cny, level: level }
    }

    function amountText(view) {
      const parts = []
      for (const currency of view.currencies) {
        const total = (view.normal.get(currency) || 0) + (view.bonus.get(currency) || 0)
        parts.push(formatAmount(total, symbolFor(currency)))
      }
      return parts.length > 0 ? parts.join(' · ') : '¥0.00'
    }

    function bonusText(view) {
      const parts = []
      for (const currency of view.currencies) {
        const bonus = view.bonus.get(currency) || 0
        if (bonus > 0) parts.push(formatAmount(bonus, symbolFor(currency)))
      }
      return parts.join(' · ')
    }

    function levelColor(level) {
      if (level === 'critical') return 'var(--dsw-alias-state-error-primary)'
      if (level === 'warn') return 'var(--dsw-alias-state-warn-primary)'
      if (level === 'ok') return 'var(--dsw-alias-label-primary)'
      return 'var(--dsw-alias-label-tertiary)'
    }

    function dotStyle(level) {
      return {
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        flex: 'none',
        background: levelColor(level),
        boxShadow: level === 'critical' ? '0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-error-primary) 18%, transparent)' : undefined,
      }
    }

    const barStyle = {
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      width: '100%',
      minHeight: '28px',
      padding: '0 14px',
      borderTop: '0.5px solid var(--dsw-alias-border-l3)',
      background: 'var(--dsw-alias-bg-base)',
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: '12px',
      lineHeight: '20px',
      fontFamily: 'inherit',
      userSelect: 'none',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
    }

    const buttonStyle = {
      boxSizing: 'border-box',
      border: 'none',
      borderRadius: '5px',
      background: 'transparent',
      color: 'var(--dsw-alias-label-secondary)',
      font: 'inherit',
      fontSize: '12px',
      lineHeight: '18px',
      padding: '2px 7px',
      cursor: 'pointer',
    }

    const primaryButtonStyle = {
      boxSizing: 'border-box',
      border: '1px solid transparent',
      borderRadius: '8px',
      background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary))',
      color: 'var(--dsw-alias-label-primary-foreground, #ffffff)',
      font: 'inherit',
      fontSize: '12px',
      fontWeight: '500',
      lineHeight: '18px',
      padding: '6px 14px',
      cursor: 'pointer',
    }

    const secondaryButtonStyle = {
      boxSizing: 'border-box',
      border: '0.5px solid var(--dsw-alias-border-l3)',
      borderRadius: '8px',
      background: 'transparent',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: '12px',
      lineHeight: '18px',
      padding: '6px 12px',
      cursor: 'pointer',
    }

    function timeText(at) {
      if (!at) return ''
      try {
        return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      } catch (error) {
        return ''
      }
    }

    /** Always-visible wallet bar rendered into the shell's bottom row. */
    function BalanceBar(props) {
      const state = props.useBalance(function (value) {
        return value
      })
      const view = derive(state)
      const t = props.t || function (key) { return key }
      const refresh = props.refresh
      const openTopUp = props.openTopUp
      const [busy, setBusy] = React.useState(false)

      const runRefresh = function () {
        if (busy) return
        setBusy(true)
        Promise.resolve(refresh && refresh()).finally(function () {
          setBusy(false)
        })
      }

      const titleParts = []
      if (state.phase === 'ready') {
        titleParts.push(t('label') + ' ' + amountText(view))
        const bonus = bonusText(view)
        if (bonus) titleParts.push(t('bonus') + ' ' + bonus)
        titleParts.push(t('updated') + ' ' + timeText(state.at))
      } else if (state.phase === 'failed') {
        titleParts.push(state.error || t('failed'))
      }

      const children = [
        h('span', { key: 'dot', style: dotStyle(view.level) }),
        h('span', { key: 'label', style: { color: 'var(--dsw-alias-label-secondary)' } }, t('label')),
      ]

      if (state.phase === 'ready') {
        children.push(
          h(
            'span',
            {
              key: 'amount',
              style: {
                color: levelColor(view.level),
                fontWeight: '600',
                fontVariantNumeric: 'tabular-nums',
              },
            },
            amountText(view),
          ),
        )
        const bonus = bonusText(view)
        if (bonus) {
          children.push(
            h(
              'span',
              { key: 'bonus', style: { color: 'var(--dsw-alias-label-tertiary)' } },
              t('bonus') + ' ' + bonus,
            ),
          )
        }
      } else if (state.phase === 'loading') {
        children.push(h('span', { key: 'state' }, t('loading')))
      } else if (state.phase === 'signed-out') {
        children.push(h('span', { key: 'state' }, t('signedOut')))
        children.push(
          h(
            'span',
            { key: 'hint', style: { color: 'var(--dsw-alias-label-tertiary)' } },
            t('noGrant'),
          ),
        )
      } else {
        children.push(h('span', { key: 'state', style: { color: 'var(--dsw-alias-state-error-primary)' } }, t('failed')))
      }

      children.push(h('span', { key: 'spacer', style: { flex: '1 1 auto' } }))

      if (state.phase === 'ready') {
        children.push(
          h(
            'span',
            { key: 'meta', style: { color: 'var(--dsw-alias-label-tertiary)' } },
            t('autoRefresh') + ' · ' + t('updated') + ' ' + timeText(state.at),
          ),
        )
      }

      children.push(
        h(
          'button',
          {
            key: 'refresh',
            type: 'button',
            style: buttonStyle,
            disabled: busy || state.phase === 'loading',
            onClick: runRefresh,
            title: t('refresh'),
          },
          busy ? t('refreshing') : t('refresh'),
        ),
      )

      if (view.level === 'critical' || view.level === 'warn') {
        children.push(
          h(
            'button',
            {
              key: 'topup',
              type: 'button',
              style: Object.assign({}, buttonStyle, { color: levelColor(view.level), fontWeight: '600' }),
              onClick: openTopUp,
            },
            t('topUp'),
          ),
        )
      }

      return h('div', { style: barStyle, title: titleParts.join(' · '), 'data-dsh-balance-bar': 'true' }, children)
    }

    /** Low-balance card rendered into the shell overlay layer. */
    function BalanceToast(props) {
      const state = props.useBalance(function (value) {
        return value
      })
      const view = derive(state)
      const t = props.t || function (key) { return key }
      const openTopUp = props.openTopUp
      const [dismissed, setDismissed] = React.useState(false)

      React.useEffect(function () {
        if (view.level === 'ok') setDismissed(false)
      }, [view.level])

      if (dismissed || state.phase !== 'ready' || (view.level !== 'warn' && view.level !== 'critical')) return null

      const cardStyle = {
        position: 'fixed',
        right: '16px',
        bottom: '44px',
        zIndex: '40',
        boxSizing: 'border-box',
        width: '348px',
        maxWidth: 'calc(100vw - 32px)',
        padding: '14px 16px',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: '12px',
        background: 'var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base))',
        color: 'var(--dsw-alias-label-primary)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.18)',
        pointerEvents: 'auto',
        fontFamily: 'inherit',
      }

      const iconColor = levelColor(view.level)
      const icon = h(
        'svg',
        {
          width: '16',
          height: '16',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: iconColor,
          strokeWidth: '1.8',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          style: { flex: 'none' },
        },
        h('path', { d: 'M12 3.2 2.6 20.2h18.8L12 3.2Z' }),
        h('path', { d: 'M12 9.2v5' }),
        h('path', { d: 'M12 17.4h.01' }),
      )

      return h(
        'div',
        { style: cardStyle, role: 'status', 'data-dsh-balance-reminder': 'true' },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          icon,
          h(
            'div',
            { style: { fontSize: '13px', fontWeight: '600', lineHeight: '20px' } },
            view.level === 'critical' ? t('criticalTitle') : t('warnTitle'),
          ),
        ),
        h(
          'div',
          { style: { marginTop: '8px', fontSize: '12px', lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' } },
          t('warnBodyBefore'),
          h('strong', { style: { color: iconColor, fontWeight: '600' } }, amountText(view)),
          t('warnBodyAfter'),
        ),
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' } },
          h(
            'button',
            { type: 'button', style: secondaryButtonStyle, onClick: function () { setDismissed(true) } },
            view.level === 'critical' ? t('neverMind') : t('later'),
          ),
          h('button', { type: 'button', style: primaryButtonStyle, onClick: openTopUp }, t('topUp')),
        ),
      )
    }

    const inject = ['slots', 'locale', 'remote', 'remote.account', 'remoteAccess']

    function apply(ctx) {
      const source = createSource({ phase: 'loading', at: 0, normal: [], bonus: [], error: null })
      let inFlight

      const clientMeta = function () {
        let locale = 'zh'
        try {
          locale = ctx.locale.getSnapshot().active || 'zh'
        } catch (error) {
          locale = 'zh'
        }
        let version = '0.2.2-rc.1'
        try {
          const boot = globalThis.__DSH_BOOT__
          if (boot && boot.release && boot.release.version) version = boot.release.version
        } catch (error) {
          version = '0.2.2-rc.1'
        }
        return { version: version, locale: locale, timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60 }
      }

      const refresh = function () {
        if (inFlight) return inFlight
        const account = ctx.remote && ctx.remote.account
        if (!account || typeof account.getBalance !== 'function') {
          source.set({ phase: 'failed', at: Date.now(), normal: [], bonus: [], error: 'account remote unavailable' })
          return Promise.resolve()
        }
        const request = (async function () {
          try {
            const result = await account.getBalance(clientMeta())
            if (!result || result.ok !== true) {
              const message = result && result.error && result.error.message ? String(result.error.message) : 'request failed'
              source.set({ phase: 'failed', at: Date.now(), normal: [], bonus: [], error: message })
              return
            }
            const value = result.value
            if (value === null || value === undefined) {
              source.set({ phase: 'signed-out', at: Date.now(), normal: [], bonus: [], error: null })
              return
            }
            if (value.status !== 'ready') {
              source.set({ phase: 'failed', at: Date.now(), normal: [], bonus: [], error: 'balance unavailable' })
              return
            }
            source.set({
              phase: 'ready',
              at: Date.now(),
              normal: Array.isArray(value.value) ? value.value : [],
              bonus: Array.isArray(value.bonusWallets) ? value.bonusWallets : [],
              error: null,
            })
          } catch (error) {
            source.set({
              phase: 'failed',
              at: Date.now(),
              normal: [],
              bonus: [],
              error: error && error.message ? String(error.message) : String(error),
            })
          }
        })()
        inFlight = request
        request.then(
          function () {
            if (inFlight === request) inFlight = undefined
          },
          function () {
            if (inFlight === request) inFlight = undefined
          },
        )
        return request
      }

      const openTopUp = function () {
        try {
          window.open(TOP_UP_URL, '_blank', 'noopener,noreferrer')
        } catch (error) {
          console.error('[balance-reminder] cannot open the top-up page', error)
        }
      }

      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en })
      }, 'balance-reminder: dictionaries')

      ctx.remoteAccess.whenAccess('account/watch', function () {
        void refresh()
        let timer = setInterval(function () {
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
          void refresh()
        }, REFRESH_MS)
        const onVisibility = function () {
          if (typeof document !== 'undefined' && document.visibilityState === 'visible') void refresh()
        }
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)

        const disposers = [
          ctx.slots.inject('shell.bottom', function () {
            return ctx.slots.register(
              {
                name: 'shell.bottom',
                locale: NS,
                inject: function () {
                  return { hooks: { balance: source }, refresh: refresh, openTopUp: openTopUp }
                },
              },
              BalanceBar,
            )
          }),
          ctx.slots.inject('shell.overlay', function () {
            return ctx.slots.register(
              {
                name: 'shell.overlay',
                id: 'balance-reminder',
                order: 50,
                locale: NS,
                inject: function () {
                  return { hooks: { balance: source }, openTopUp: openTopUp }
                },
              },
              BalanceToast,
            )
          }),
        ]

        return function () {
          if (timer !== undefined) {
            clearInterval(timer)
            timer = undefined
          }
          if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
          for (const dispose of disposers) {
            if (typeof dispose === 'function') dispose()
          }
        }
      })
    }

    return { inject: inject, apply: apply }
  },
})
