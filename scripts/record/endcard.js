// Makes the closing card as an image: a small, calm sign-off with the PayPal credit and the address.
import puppeteer from "puppeteer";
import { readFileSync } from "node:fs";
const out = `${process.env.HOME}/Movies/WholeShare-demo/endcard.png`;
const logo = readFileSync("src/web/public/assets/logo-120.svg", "utf8");
const paypal = "M15.607 4.653H8.941L6.645 19.251H1.82L4.862 0h7.995c3.754 0 6.375 2.294 6.473 5.513-.648-.478-2.105-.86-3.722-.86m6.57 5.546c0 3.41-3.01 6.853-6.958 6.853h-2.493L11.595 24H6.74l1.845-11.538h3.592c4.208 0 7.346-3.634 7.153-6.949a5.24 5.24 0 0 1 2.848 4.686M9.653 5.546h6.408c.907 0 1.942.222 2.363.541-.195 2.741-2.655 5.483-6.441 5.483H8.714Z";
const b = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
await p.setContent(`<style>.lg svg{width:64px!important;height:64px!important;display:block}</style><body style="margin:0;height:1080px;display:grid;place-items:center;background:radial-gradient(1200px 700px at 50% 38%,#FFFFFF,#E9F0F9);font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;color:#0F1F2E">
  <div style="display:grid;justify-items:center;gap:30px;max-width:1100px;text-align:center">
    <div style="display:flex;align-items:center;gap:16px"><div style="width:64px;height:64px;display:grid;place-items:center"><div style="width:64px;height:64px;overflow:hidden" class="lg">${logo}</div></div><div style="font-size:40px;font-weight:700;letter-spacing:-.02em">Whole<span style="color:#0070BA">Share</span></div></div>
    <div style="font-size:54px;line-height:1.15;font-weight:650;letter-spacing:-.025em">Being small does not mean<br>you have to pay more.</div>
    <div style="display:flex;align-items:center;gap:14px;padding:14px 26px;border-radius:999px;background:#fff;border:1px solid #D7E2EE;box-shadow:0 10px 30px -14px rgba(15,31,46,.35);font-size:26px;color:#3C4A59">
      <svg width="30" height="30" viewBox="0 0 24 24"><path d="${paypal}" fill="#003087"/></svg><span>Powered by <b style="color:#003087">PayPal</b></span><span style="color:#8A97A5">sandbox demo</span>
    </div>
    <div style="font-size:26px;color:#5C6A79;letter-spacing:.01em">wholeshare-app.onrender.com</div>
  </div></body>`);
await p.screenshot({ path: out });
await b.close();
console.log(out);
