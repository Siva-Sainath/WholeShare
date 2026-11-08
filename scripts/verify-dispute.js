import "dotenv/config";

async function verifyDispute(disputeId) {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const baseUrl = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;

  console.log(`[INFO] Querying dispute: ${disputeId}`);
  const res1 = await fetch(`${baseUrl}/v1/customer/disputes/${disputeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`Direct GET HTTP Status: ${res1.status}`);
  const data1 = await res1.json();
  console.log("Direct GET response:\n", JSON.stringify(data1, null, 2));

  console.log("\n[INFO] Listing recent disputes for merchant:");
  const res2 = await fetch(`${baseUrl}/v1/customer/disputes?page_size=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`List HTTP Status: ${res2.status}`);
  const data2 = await res2.json();
  console.log("List response:\n", JSON.stringify(data2, null, 2));
}

verifyDispute("PP-R-OOA-10194658").catch(console.error);
