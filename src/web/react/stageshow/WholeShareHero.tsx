import { Boxes, Coffee, Droplets, LayoutGrid, Nut, Wheat } from 'lucide-react'
import { Badge, Button, Card, Check, Collapse, Count, Field, Meter, Popover, Row, Stage, States, Text, Window, type Act } from './kit'
import { PayPalMark } from '../components/PayPalAttribution'
import './wholeshare.css'

// WholeShare landing hero: ask Mosaic for coffee, join the group, PayPal holds the funds.
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
const POSTER: S = { typed: 'coffee', focused: false, filtered: true, sheet: true, units: '100', pay: 'held' }

const UNIT = 7.41
const CURRENT = 1300
const TARGET = 2000

type Group = { id: string; name: string; meta: string; price: string; off: string; coffee: boolean; Icon: typeof Coffee }
const GROUPS: Group[] = [
  { id: 'pistachio', name: 'Sicilian pistachio paste', meta: 'Austin · 500 of 1,000 units', price: '$33.75', off: '25% off', coffee: false, Icon: Nut },
  { id: 'specialty', name: 'Ethiopian Yirgacheffe green coffee', meta: 'Austin · 1,300 of 2,000 units', price: '$7.41', off: '22% off', coffee: true, Icon: Coffee },
  { id: 'amsterdam', name: 'Cold brew coffee concentrate', meta: 'Amsterdam · 596 of 3,000 units', price: '$126.83', off: 'No tier yet', coffee: true, Icon: Coffee },
  { id: 'olive', name: 'Arbequina extra virgin olive oil', meta: 'Austin · 1,350 of 1,500 units', price: '$10.00', off: '20% off', coffee: false, Icon: Droplets },
  { id: 'flour', name: 'Stone-ground winter wheat flour', meta: 'Austin · 4,000 of 5,000 units', price: '$0.98', off: '18% off', coffee: false, Icon: Wheat },
  { id: 'incheon', name: 'Cold brew coffee concentrate', meta: 'Incheon · 127 of 500 units', price: '$117.77', off: '14% off', coffee: true, Icon: Coffee }
]

type Joined = { id: string; name: string; meta: string; amount: string; tone: 'neutral' | 'success'; label: string; Icon: typeof Coffee }
const JOINED: Joined[] = [
  { id: 'flour', name: 'Golden Fields organic flour', meta: '150 units', amount: '$1,500.00', tone: 'neutral', label: 'Pledged', Icon: Wheat },
  { id: 'tiles', name: 'Matte porcelain floor tiles', meta: '4 pallets', amount: '$3,400.00', tone: 'neutral', label: 'Pledged', Icon: LayoutGrid },
  { id: 'boxes', name: 'Kraft shipping boxes', meta: '75 bundles', amount: '$2,047.50', tone: 'success', label: 'Authorized', Icon: Boxes }
]

const money = (n: number) => `$${n.toFixed(2)}`
const unitsOf = (s: S) => Math.max(0, parseInt(s.units || '0', 10) || 0)

async function script(a: Act<S>) {
  await a.wait(700)
  await a.click('ask-field')
  await a.set({ focused: true })
  await a.type('typed', 'coffee')
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
  await a.type('units', '100')
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
                      <div className="wh-title">{s.filtered ? 'Coffee groups' : 'Buying groups'}</div>
                      <Badge tone="accent" dot className="wh-mosaic" data-show={s.filtered ? true : undefined}>Mosaic found 3 coffee groups</Badge>
                    </div>
                    <Card pad="small" gap={0} className="wh-list">
                      {GROUPS.map((g) => (
                        <Collapse key={g.id} open={!s.filtered || g.coffee}>
                          <Row
                            lead={<span className="wh-tile"><g.Icon size={18} strokeWidth={1.8} /></span>}
                            title={<Text>{g.name}</Text>}
                            subtitle={<Text>{g.meta}</Text>}
                            meta={<Text className="wh-price">{g.price}</Text>}
                            selected={s.sheet && g.id === 'specialty'}
                          >
                            {g.id === 'specialty' ? (
                              <Button variant="secondary" size="small" data-target="join" data-cursor="pointer">Join</Button>
                            ) : (
                              <Badge tone="neutral">{g.off}</Badge>
                            )}
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
                          <Badge tone={g.tone}>{g.label}</Badge>
                        </Row>
                      ))}
                      <Collapse open={held && !s.sheet} reveal="drop">
                        <Row
                          lead={<span className="wh-tile"><Coffee size={18} strokeWidth={1.8} /></span>}
                          title={<Text>Yirgacheffe green coffee</Text>}
                          subtitle={<Text>100 units · $741.00</Text>}
                        >
                          <Badge tone="success">Authorized</Badge>
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
                  <Text wrap className="wh-strong">Ethiopian Yirgacheffe green coffee</Text>
                </div>
                <Field label="Units" value={s.units} placeholder="0" focused={s.sheet && !s.units} box={{ 'data-target': 'units-field', 'data-cursor': 'ibeam' }} />
                <div className="wh-sum">
                  <div className="wh-line"><span>Unit price</span><span className="wh-num">$7.41</span></div>
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
