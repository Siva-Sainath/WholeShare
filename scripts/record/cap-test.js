import puppeteer from "puppeteer";
const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ["--app=https://wholeshare-app.onrender.com/", "--window-size=1440,900", "--window-position=10,30", "--disable-features=Translate"] });
const [page] = await browser.pages();
await page.evaluate(() => { document.title = "WholeShareDemo"; });
console.log("ready");
await new Promise((r) => setTimeout(r, 40000));
await browser.close();
