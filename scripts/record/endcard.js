// Makes the closing card as an image: the one line to leave the judges with, and the address.
import puppeteer from "puppeteer";
const out = `${process.env.HOME}/Movies/WholeShare-demo/endcard.png`;
const b = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1920, height: 1080 });
await p.setContent(`<body style="margin:0;height:1080px;display:grid;place-items:center;background:linear-gradient(135deg,#EEF3FA,#D8E4F4);font-family:-apple-system,Helvetica,Arial,sans-serif;color:#0F1F2E"><div style="text-align:center;max-width:1300px"><div style="font-size:30px;letter-spacing:.08em;text-transform:uppercase;color:#0070BA;font-weight:600">WholeShare</div><div style="font-size:92px;line-height:1.08;font-weight:700;letter-spacing:-.03em;margin:28px 0 36px">Money only moves when you approve it on PayPal.</div><div style="font-size:40px;color:#3C4A59">wholeshare-app.onrender.com</div></div></body>`);
await p.screenshot({ path: out });
await b.close();
console.log(out);
