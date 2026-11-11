import { Boxes, Coffee, Droplets, LayoutGrid, Nut, Wheat } from 'lucide-react'
import { Badge, Button, Card, Check, Collapse, Count, Field, Meter, Popover, Row, Stage, States, Text, Window, type Act } from './kit'
import { PayPalMark } from '../components/PayPalAttribution'
import './wholeshare.css'

// WholeShare landing hero: ask Mosaic for takeout containers, join the group, PayPal holds the funds.
// Real values from the seeded catalog: clan-austin-specialty-grade-002 (base $9.50, tier 22% at 1,300 of 2,000 units).

type S = {
  typed: string
  focused: boolean
  filtered: boolean
  sheet: boolean
  units: string
  pay: 'idle' | 'pending' | 'held'
}

const initial: S = { typed: '', focused: false, filtered: false, sheet: false, units: '', pay: 'idle' }
const POSTER: S = { typed: 'takeout containers', focused: false, filtered: true, sheet: true, units: '10', pay: 'held' }

const UNIT = 28.98
const CURRENT = 1300
const TARGET = 2000

type Group = { id: string; name: string; meta: string; price: string; off: string; coffee: boolean; Icon: typeof Coffee }
const GROUPS: Group[] = [
  { id: 'rice', name: 'Jasmine rice 25 lb', meta: 'New York · 84 of 120 bags', price: '$21.07', off: '14% off', coffee: false, Icon: Wheat },
  { id: 'garden', name: 'Takeout containers 32 oz (Garden State)', meta: 'New York · 38 of 80 cases', price: '$28.98', off: '8% off', coffee: true, Icon: Boxes },
  { id: 'gloves', name: 'Nitrile gloves (1,000)', meta: 'New York · 32 of 60 cases', price: '$58.88', off: '8% off', coffee: false, Icon: LayoutGrid },
  { id: 'oil', name: 'Soybean cooking oil 35 lb', meta: 'New York · 39 of 60 jugs', price: '$43.24', off: '6% off', coffee: false, Icon: Droplets },
  { id: 'eastern', name: 'Takeout containers 32 oz (Eastern Imports)', meta: 'New York · 41 of 80 cases', price: '$22.88', off: '18% off', coffee: true, Icon: Boxes },
  { id: 'cups', name: 'Clear PET cups 16 oz with lids', meta: 'New York · 29 of 50 cases', price: '$54.52', off: '6% off', coffee: false, Icon: Coffee }
]

type Joined = { id: string; name: string; meta: string; amount: string; tone: 'neutral' | 'success'; label: string; Icon: typeof Coffee }
const JOINED: Joined[] = [
  { id: 'rice', name: 'Jasmine rice 25 lb', meta: '150 bags', amount: '$3,675.00', tone: 'neutral', label: 'Pledged', Icon: Wheat },
  { id: 'gloves', name: 'Nitrile gloves (1,000)', meta: '10 cases', amount: '$640.00', tone: 'neutral', label: 'Pledged', Icon: LayoutGrid },
  { id: 'cups', name: 'Clear PET cups 16 oz', meta: '75 cases', amount: '$2,047.50', tone: 'success', label: 'Authorized', Icon: Coffee }
]

const money = (n: number) => `$${n.toFixed(2)}`
const unitsOf = (s: S) => Math.max(0, parseInt(s.units || '0', 10) || 0)

async function script(a: Act<S>) {
  await a.wait(700)
  await a.click('ask-field')
  await a.set({ focused: true })
  await a.type('typed', 'takeout containers')
  await a.wait(250)
  await a.click('ask-button')
  await a.set({ focused: false, filtered: true })
  await a.wait(1300)

  await a.move({ at: 'join', x: 0.8, y: 0.75 })
  await a.wait(250)
  await a.click()
  await a.set({ sheet: true })
  await a.wait(700)

  await a.click('units-field')
  await a.type('units', '10')
  await a.wait(900)

  await a.move({ at: 'pay', x: 0.85, y: 0.8 })
  await a.wait(250)
  await a.click()
  await a.set({ pay: 'pending' })
  await a.wait(1100)
  await a.set({ pay: 'held' })
  await a.wait(1700)

  // The sheet closes and the new hold lands in Your groups, the payoff that holds.
  await a.set({ sheet: false })
  await a.wait(2300)

  // Exit around the anchor: the new row leaves, the list opens back up. Numbers reset under the closed sheet.
  await a.set({ pay: 'held', filtered: false, typed: '' })
  await a.snap({ units: '' })
  await a.move('rest')
  await a.wait(700)
  await a.set({ pay: 'idle' })
  await a.wait(700)
}

export function WholeShareHero() {
  return (
    <Stage
      width={1000}
      height={540}
      initial={initial}
      poster={POSTER}
      script={script}
      cursor={{ at: { wide: { x: 560, y: 360 }, compact: { x: 200, y: 300 } }, style: 'arrow' }}
      className="wh"
    >
      {(s) => {
        const units = unitsOf(s)
        const total = units * UNIT
        const held = s.pay === 'held'
        const progress = (CURRENT + (held ? units : 0)) / TARGET
        return (
          <>
            <Window url="wholeshare.app/discover" className="wh-window">
              <div className="wh-app">
                <header className="wh-nav">
                  <span className="wh-word">Whole<b>Share</b></span>
                  <nav className="wh-tabs" aria-hidden="true">
                    <span data-on>Discover</span><span>My groups</span><span>Disputes</span><span>Agents</span>
                  </nav>
                  <div className="wh-ask">
                    <Field value={s.typed} placeholder="Ask Mosaic for a group" focused={s.focused} box={{ 'data-target': 'ask-field', 'data-cursor': 'ibeam' }} />
                    <Button variant="primary" size="medium" data-target="ask-button" className="wh-gold">Ask Mosaic</Button>
                  </div>
                </header>

                <section className="wh-body">
                  <div className="wh-main">
                    <div className="wh-list-head">
                      <div className="wh-title">{s.filtered ? 'Container groups' : 'Buying groups'}</div>
                      <Badge tone="accent" dot className="wh-mosaic" data-show={s.filtered ? true : undefined}>Mosaic found 2 container groups</Badge>
                    </div>
                    <Card pad="small" gap={0} className="wh-list">
                      {GROUPS.map((g) => (
                        <Collapse key={g.id} open={!s.filtered || g.coffee}>
                          <Row
                            lead={<span className="wh-tile"><g.Icon size={18} strokeWidth={1.8} /></span>}
                            title={<Text>{g.name}</Text>}
                            subtitle={<Text>{g.meta}</Text>}
                            selected={s.sheet && g.id === 'garden'}
                          >
                            <span className="wh-trail wh-trail--priced">
                              <Text className="wh-price">{g.price}</Text>
                              <span className="wh-slot">
                                {g.id === 'garden' && s.filtered ? (
                                  <Button variant="secondary" size="small" data-target="join" data-cursor="pointer">Join</Button>
                                ) : (
                                  <Badge tone="neutral">{g.off}</Badge>
                                )}
                              </span>
                            </span>
                          </Row>
                        </Collapse>
                      ))}
                    </Card>
                  </div>

                  <aside className="wh-side">
                    <div className="wh-list-head">
                      <div className="wh-title">Your groups</div>
                    </div>
                    <Card pad="small" gap={0} className="wh-list">
                      {JOINED.map((g) => (
                        <Row
                          key={g.id}
                          lead={<span className="wh-tile"><g.Icon size={18} strokeWidth={1.8} /></span>}
                          title={<Text>{g.name}</Text>}
                          subtitle={<Text>{`${g.meta} · ${g.amount}`}</Text>}
                        >
                          <span className="wh-trail"><Badge tone={g.tone}>{g.label}</Badge></span>
                        </Row>
                      ))}
                      <Collapse open={held && !s.sheet} reveal="drop">
                        <Row
                          lead={<span className="wh-tile"><Boxes size={18} strokeWidth={1.8} /></span>}
                          title={<Text>Takeout containers 32 oz</Text>}
                          subtitle={<Text>10 cases · $289.80</Text>}
                        >
                          <span className="wh-trail"><Badge tone="success">Authorized</Badge></span>
                        </Row>
                      </Collapse>
                    </Card>
                  </aside>
                </section>
              </div>
            </Window>

            <Popover show={s.sheet} origin="top right" className="wh-sheet">
              <div className="wh-pledge">
                <div className="wh-copy">
                  <div className="wh-label">Pledge to this group</div>
                  <Text wrap className="wh-strong">Takeout containers 32 oz (Garden State)</Text>
                </div>
                <Field label="Units" value={s.units} placeholder="0" focused={s.sheet && !s.units} box={{ 'data-target': 'units-field', 'data-cursor': 'ibeam' }} />
                <div className="wh-sum">
                  <div className="wh-line"><span>Unit price</span><span className="wh-num">$28.98</span></div>
                  <div className="wh-line wh-total"><span>PayPal hold</span><Count className="wh-num" value={total} format={money} /></div>
                </div>
                <div className="wh-fill">
                  <div className="wh-line"><span>Group progress</span><Count className="wh-num" value={Math.round(progress * 100)} format={(n) => `${Math.round(n)}%`} /></div>
                  <Meter value={progress} />
                </div>
                <Button variant="primary" size="large" data-target="pay" className="wh-gold wh-pay">
                  <States
                    value={s.pay}
                    states={{
                      idle: <span className="wh-inline"><PayPalMark size={16} />Continue with PayPal</span>,
                      pending: <span className="wh-inline"><Check on={false} pending size={14} />Opening PayPal</span>,
                      held: <span className="wh-inline"><Check on size={14} />Hold authorized</span>
                    }}
                  />
                </Button>
                <Text wrap className="wh-dim">Held on PayPal. Not charged until the group fills.</Text>
              </div>
            </Popover>
            <span data-target="rest" style={{ position: 'absolute', left: 560, top: 360 }} />
          </>
        )
      }}
    </Stage>
  )
}
