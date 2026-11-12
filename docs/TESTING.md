# How to test WholeShare

This guide takes you through the whole product in about ten minutes. You do not need to install anything.

Live app: https://wholeshare-app.onrender.com

Everything runs in the **PayPal sandbox**. No real money moves.

## Before you start

- **Sign in.** The app has no account to create. You become a business by finishing onboarding.
- **PayPal sandbox buyer.** When PayPal asks you to log in, use this sandbox account.
  - Email: [sandbox buyer email]
  - Password: [sandbox buyer password]
- **Test one at a time.** The live demo has one shared business profile and workspace. If two people test at the same moment they see each other's changes. Choose **Sign out** (top right) when you finish, which also switches Mosaic's permissions off. If the site opens straight into the app without onboarding, refresh once.
- **Wait for the first answer.** If Mosaic is slow to start, wait a few seconds. After a quiet spell the model needs a moment to wake.

## 1. Start from your documents

1. Open the app and choose **Use your business**.
2. Choose **Use the Neon Dumpling sample documents**. WholeShare reads a supplier invoice and an inventory sheet.
3. Watch the checklist fill in: the business, the address, the supplier, and the $31.50 a case you pay today.
4. To use your own paperwork instead, drop a PDF, a spreadsheet or a photo of an invoice into the box. WholeShare keeps a value only if it is written in your document.
5. Answer the spend limit question. Then choose **Connect with PayPal** and log in with the sandbox account. PayPal may ask you to agree once.
6. Choose **Choose permissions** and switch on what Mosaic may do. Every switch starts off. Then finish with **Confirm and save**.

You can skip the documents and describe your own business in a sentence instead. Mosaic builds a workspace around it.

## 2. Find, compare and join a group

1. Open **Discover**. The takeout container groups are already listed, because the app knows what you buy.
2. Open the **Garden State** group. Look at the discount tiers, the supplier's trust score, the delivery time and the receiving point.
3. Tick **I agree to this group's rules**, enter `12` units, and choose **Continue** twice.
4. Choose the PayPal button. A PayPal window opens. Log in with the sandbox account and approve.
5. You should see **Pledge authorized**. PayPal has placed a hold for $325.08. Nothing is charged.

## 3. Ask Mosaic

Open **Mosaic** and try these, one at a time.

- `Compare the two takeout container groups for 12 cases` opens a full comparison: the cheapest, the fastest, the most trusted, and what you save against what you pay today.
- `Where is my shipment and when does my inspection window end?` answers from the real shipment records.
- `Which deliveries are in transit and when will they arrive?`
- `Which of my damage claims are still open?`
- `Find new suppliers for wide boba straws near New York` makes a Kernel cloud browser read supplier websites. It takes up to half a minute.
- `Start a group buy for wide boba straws, 8 cases, delivered to our back door on Bedford Avenue and to Cloud Nine Boba on Court Street` opens the form already filled in.

If Mosaic needs a permission you have not switched on, it stops and tells you which switch to turn on. You can turn it on in **Settings**, or with the **Allow** button in the chat.

## 4. Deliveries and claims

1. Open **Disputes**. The **Timeline** shows deliveries on a Bryntum scheduler. Try **Zoom in** and click a bar.
2. Open **Calendar** for the inspection windows, and **Claims board** for claims by stage.
3. Open **File a claim**. Type `3 of the 8 cases from Eastern arrived crushed at the corners` and choose **Fill the form with Mosaic**.
4. Pick the delivered shipment, add a unit price and an email, and attach any photo.
5. Choose **Submit damage claim**. Open **Claims**, choose the new claim, then choose **Approve and send to supplier**.
6. The claim now shows **With the supplier**. The refund is worked out for the damaged units only.

## 5. Reports

Open **Insights**. These are AG Studio reports about your business: money held on PayPal, demand and savings, deliveries and claims. Open **My groups** for the table of pledges.

## 6. Connect an outside assistant

1. Open **Agents** and choose **Create agent link**. Copy the link.
2. Fetch the link with any tool that can open a web address. It returns instructions for the assistant.
3. Ask a question through the link. Replace `TOKEN` with the token at the end of your link.

   ```bash
   curl "https://wholeshare-app.onrender.com/api/v1/agent/TOKEN/ask?q=Which%20takeout%20container%20groups%20can%20we%20still%20join%3F"
   curl "https://wholeshare-app.onrender.com/api/v1/agent/TOKEN/clans?search=takeout&limit=3"
   ```

4. Watch the **Live from connected agents** feed on the Agents page.

For a full MCP client, point it at `https://wholeshare-app.onrender.com/mcp` with the header `Authorization: Bearer TOKEN`. The tool `request_pledge_approval` returns a PayPal approval link that an assistant can send to its owner.

## What to expect

- Mosaic replies in two to eight seconds. Supplier research with a cloud browser can take 30 to 60 seconds for an unusual product.
- Mosaic only changes the screen or opens a PayPal step. It cannot approve a payment.
- Some records, such as the shipments and two past claims on the Neon Dumpling sample business, are sample history.

## Run it on your own machine

The [README](../README.md#run-it-yourself) lists the steps. You need a PayPal sandbox app and a model key.
