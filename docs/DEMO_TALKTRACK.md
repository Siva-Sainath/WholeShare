# WholeShare demo talk track

Your 20 second hook comes first, then this 2 minute 40 second screen recording. Each section below is a few points to say in your own words, in the order they appear on screen. Speed-ups are labelled in the top right corner of the video ("2x sped up" and so on), so you can say "this part is sped up" and it is true.

## The problem numbers for your 10 second stats moment

Say two or three of these, not all. Each is from the source named, and the landing page links to the same sources.

- **36 million+ small businesses** in the US, and they employ **45.9% of the workforce**. Source: SBA Office of Advocacy, 2025 profiles.
- **About 90% of businesses worldwide** are small or medium sized, and they provide **over half of all jobs**. Source: World Bank.
- **9 in 10 US restaurants have fewer than 50 employees.** Source: National Restaurant Association.
- Independent restaurants that buy through a group report **10 to 30% lower inventory cost**. This is an industry estimate from trade publications (FSR Magazine), so say "reported" and not "proven".
- Why small buyers pay more: suppliers give their best price to whoever orders the most, so small operators pay a higher price per unit. McKinsey describes this as small and medium businesses lacking the purchasing power of larger ones. It is a pattern in trade sources, not a measured national number, so do not give it a percentage.

One line that ties it together: *most businesses are small, small buyers pay more per box, and the fix everyone talks about, buying together, breaks on trust: whose door, who pays, and who eats the loss if it arrives crushed.*

## Section by section

### 1. Landing and the problem (20 seconds)
- This is Neon Dumpling, a dumpling restaurant in Brooklyn. It pays $31.50 a case for takeout containers and needs 12 a month.
- The supplier only gives group pricing at 80 cases. No small restaurant gets there alone.
- Point at the numbers on screen: these are the sourced figures. Then the three questions at the bottom: whose door does it ship to, who pays what, and who fronts the cash if it arrives crushed.
- Sponsor note: the line on the page that says Mosaic is awake is **Fireworks** serverless inference answering in under a second.

### 2. Onboarding from documents (24 seconds)
- We did not type a profile. We dropped the supplier invoice and inventory sheet.
- It read the business, address, supplier and the $31.50 price, and showed which file each value came from. Anything not written in the documents is left blank and asked, so nothing is invented.
- Then it connected PayPal for real, with a sandbox login, and let us choose what Mosaic is allowed to do. Everything starts off, and approving payments is never Mosaic's.
- Sponsor notes: PDF and photo reading runs on the server with no extra tools, **Fireworks** pulls the fields, files go through the **JuiceFS**-aware storage layer, and sign-in is **PayPal**.
- The darker parts of the video here are sped up: reading the files and the PayPal page loads.

### 3. Join a group (26 seconds)
- We search takeout containers and open the Garden State group, the supplier it already uses.
- On the page: the discount tiers, the supplier's trust score, the delivery estimate, and the receiving point, the back door on Main Street.
- Pledge 12 cases. PayPal opens, we log in and approve. That places a hold of $325.08. Nothing is charged.
- Sponsor note: **PayPal** Orders v2 authorize. Money is held, not taken, until the goods arrive.

### 4. Every page, and an outside agent (24 seconds)
- My groups: what it has pledged and what is held.
- Disputes: the **Bryntum** timeline of deliveries, the calendar of inspection windows, and the claims board.
- Insights: **AG Grid** and **AG Studio** reports, all about this business only.
- Agents page: an outside assistant, here Instinct, used a plain link to ask WholeShare a question, and it shows up live on this page. Any chatbot that can open a link can do this, and it can search and compare but only the person can approve money.

### 5. Mosaic, the hero (42 seconds)
- One prompt: compare the two container groups for 12 cases. Mosaic opens a full comparison: cheapest total, fastest delivery, most trusted supplier. Eastern is about $50 cheaper but takes 12 days against 5, and Garden State is the supplier already trusted.
- The panel also shows what it saves against today's $31.50, row by row, with the best value marked.
- Then ask where the shipments are and which claims are open. Mosaic answers from the real records. Try asking it to move a delivery earlier than the supplier allows: it refuses and tells you the rule, which is the point, because every change is checked by the server.
- Ask it to find new suppliers for wide boba straws. This reads real supplier pages in a cloud browser, so it is slow and sped up here.
- Then start a group buy. It fills the form from one sentence, including both delivery points.
- Sponsor notes: **Fireworks** for the thinking, the Mosaic harness for the rules (allowed tools, permissions, at most five tool calls a turn, a fact check on every reply), **Kernel** for the browser, **AG Grid** and **Bryntum** for what appears on screen.

### 6. Disputes (16 seconds)
- A delivery arrives crushed. We write one sentence and Mosaic fills the claim form, then attach the photo.
- The claim moves on the board from Draft, to With supplier, to Settled. The refund is proportional to the damaged units. If the money was only held, the supplier is paid for the intact units and the rest of the hold is released.
- Sponsor note: **PayPal** refund and partial capture, and the Disputes webhook.

### 7. Close (5 seconds)
- Money only moves when you approve it on PayPal. The URL is wholeshare-app.onrender.com.

## Sponsors and technology, in one breath each
- **Fireworks AI**: serverless inference for Mosaic and for reading documents.
- **PayPal**: authorize, capture, refund, invoicing, and the Disputes webhook, all in the sandbox.
- **AG Grid and AG Studio**: the tables, charts and reports.
- **Bryntum**: the delivery timeline, calendar and claims board.
- **Kernel**: cloud browsers that read supplier pages.
- **MCP** and in-page agent tools: how an outside assistant and an agent in the browser use WholeShare under the same permissions.
- **JuiceFS** for stored documents and **Render** for hosting.

## Honest limits to be ready for
- PayPal is the sandbox. No real money moves.
- A few records on the sample business, the shipments and two past claims, are sample history and carry no PayPal ids.
- One workspace is shared on the live site, so only one person should use it at a time.
- Supplier research with Kernel takes 10 to 30 seconds, and web leads are marked unverified.
- In the dispute clip the claim is approved and the sample supplier accepts it. That claim has no PayPal hold behind it, so the refund shows as a local record and not a PayPal id. When a pledge has a real hold behind it, the refund goes through PayPal.
- The Mosaic "move delivery" request in the video is refused by a rule (a delivery cannot arrive less than a day after dispatch). Say so as a feature, not a failure.
