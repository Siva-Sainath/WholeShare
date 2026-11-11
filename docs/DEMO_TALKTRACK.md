# WholeShare demo talk track

Your 20 second hook plays first, then this 2 minute 37 second screen recording. Each section below gives the seconds it is on screen, a line you can say as written, and the sponsor or tech to name there. The lines are written to be spoken at an easy pace, about 2.2 words a second, with room to breathe. Every sped-up stretch has a label in the top right corner, so it is honest to say "this is sped up".

| Section | On screen | Seconds | Words | Pace |
|---|---|---|---|---|
| 1. Landing and the problem | 0:00 to 0:20 | 20 | 54 | 2.7 words per second |
| 2. Onboarding from documents | 0:20 to 0:36 | 16 | 37 | 2.3 words per second |
| 3a. Find and open a group | 0:36 to 0:51 | 15 | 29 | 1.9 words per second |
| 3b. Approve on PayPal | 0:51 to 1:02 | 11 | 17 | 1.5 words per second |
| 4. Every page, and an outside agent | 1:02 to 1:30 | 28 | 55 | 2.0 words per second |
| 5. Mosaic | 1:30 to 2:16 | 46 | 78 | 1.7 words per second |
| 6. Disputes | 2:16 to 2:32 | 16 | 28 | 1.8 words per second |
| 7. Close | 2:32 to 2:37 | 5 | 10 | 2.0 words per second |

## 1. Landing and the problem (0:00 to 0:20, 20 seconds, 54 words)

**Say:** Meet Neon Dumpling, a dumpling shop in Brooklyn. It pays $31.50 a case for takeout boxes, because no shop that small ever reaches the group price. There are 36 million small businesses in the US, so this is everywhere. What stops them buying together is trust: whose door, who pays, who eats the loss.

- Say one stat only here. The SBA number, 36 million, is the safest.
- The four stat cards on screen carry the sources, so you can point at them for the 10 second stats moment: SBA, World Bank, National Restaurant Association, FSR Magazine.
- **Sponsor and tech to name:** Fireworks: the 'Mosaic is awake' line on the landing page is real Fireworks inference answering in under a second.

## 2. Onboarding from documents (0:20 to 0:36, 16 seconds, 37 words)

**Say:** I don't type a profile. I drop in the invoice and the inventory sheet, and the checklist fills in. Every value has to be written in the documents, so nothing is invented. Then PayPal connects for real.

- Point at the checklist ticking from 0 to 6, then at the PayPal login.
- **Sponsor and tech to name:** Fireworks reads the fields. PDFs and photos are read on the server with no extra tools. Files go through the JuiceFS storage layer. Sign-in is PayPal.

## 3a. Find and open a group (0:36 to 0:51, 15 seconds, 29 words)

**Say:** I search takeout containers and open Garden State, the supplier I already use. Price tiers, a trust score, delivery in five days, and the exact receiving point. Twelve cases.

- Hover the receiving point and the tiers while you say it.
- **Sponsor and tech to name:** AG Grid sits behind the search results.

## 3b. Approve on PayPal (0:51 to 1:02, 11 seconds, 17 words)

**Say:** Now PayPal. I approve, and it places a hold of $325.08. Nothing is charged. The money waits.

- The line to land: held, not charged.
- **Sponsor and tech to name:** PayPal Orders v2 with authorize. Capture only happens when I accept the goods.

## 4. Every page, and an outside agent (1:02 to 1:30, 28 seconds, 55 words)

**Say:** Everything runs on live data. Disputes has a Bryntum timeline, a calendar of inspection windows, and a claims board. Insights is AG Grid and Studio, only for this business. And on Agents, my assistant Instinct just used a plain link to ask WholeShare a question. It can search and compare. Only I can approve money.

- Say 'Instinct' as the cursor lands on the live feed on the Agents page. That is the moment that shows any chatbot can plug in.
- **Sponsor and tech to name:** Bryntum for the timeline, calendar and board. AG Grid and AG Studio for tables and reports. MCP and a plain invite link for outside agents.

## 5. Mosaic (1:30 to 2:16, 46 seconds, 78 words)

**Say:** This is Mosaic. One sentence, compare the two container groups, and it builds the whole comparison: cheapest, fastest, most trusted, and what I save against my $31.50. Eastern is about fifty dollars cheaper, Garden State arrives seven days sooner. Then I ask where my shipments are and it answers from the real records. Ask for new suppliers and a cloud browser reads their own pages, that's the sped-up part. Then it fills a group-buy form from one sentence.

- The screen is busy on purpose. Read the three verdict cards at the top, then point at the green cells.
- The 'sped up' label is on screen. You can say 'this is sped up, it's reading real supplier pages'.
- **Sponsor and tech to name:** Fireworks does the thinking. The Mosaic harness enforces permissions, at most five tool calls a turn, and a fact check on every reply. Kernel runs the cloud browser. AG Grid and Bryntum are what opens beside the chat.

## 6. Disputes (2:16 to 2:32, 16 seconds, 28 words)

**Say:** A delivery arrives crushed. One sentence, Mosaic fills the claim, I attach the photo, approve it, and the supplier accepts. The refund is proportional to what was damaged.

- If asked about the refund: this sample claim has no PayPal hold behind it, so it records locally. With a real hold it goes through PayPal.
- **Sponsor and tech to name:** PayPal refund or partial capture, and the Disputes webhook.

## 7. Close (2:32 to 2:37, 5 seconds, 10 words)

**Say:** Small businesses buy together. The money waits for the goods.

- Stop talking when the card appears. It says Powered by PayPal.
- **Sponsor and tech to name:** PayPal, on screen.

## The numbers for your 10 second stats moment

Use two or three. Each is from the source named, and the landing page links to the same sources.

- 36 million+ small businesses in the US, employing 45.9% of the workforce. SBA Office of Advocacy, 2025.
- About 90% of businesses worldwide are small or medium sized, and they provide over half of all jobs. World Bank.
- 9 in 10 US restaurants have fewer than 50 employees. National Restaurant Association.
- Independent restaurants that buy through a group report 10 to 30% lower inventory cost. This is an industry estimate from trade publications (FSR Magazine), so say "reported", not "proven".
- Why small buyers pay more: suppliers give their best price to whoever orders the most. McKinsey describes small and medium businesses as lacking the purchasing power of larger ones. This is a pattern in trade sources, not a measured national percentage, so do not put a number on it.

## Honest limits to be ready for

- PayPal is the sandbox. No real money moves. The closing card says so.
- The shipments and the two past claims on the sample business are sample history with no PayPal ids.
- The "move delivery" request is refused by a rule in the app (a delivery cannot arrive less than a day after dispatch). If you show it, present it as the app protecting you.
- One workspace is shared on the live site, so only one person should use it at a time.
- Supplier research with Kernel takes 10 to 30 seconds, and web leads are marked unverified.
