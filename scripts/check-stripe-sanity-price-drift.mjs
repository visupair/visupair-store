#!/usr/bin/env node
/**
 * Compares Stripe Price.unit_amount against Sanity catalog fields for products
 * that have stripePriceId. Uses the same EUR/PLN fallbacks as checkout-server-money.
 *
 * Run: npm run check:stripe-sanity-prices
 * Requires STRIPE_SECRET_KEY and SANITY_API_TOKEN in .env (or environment).
 */
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CHECKOUT_FX_EUR_PLN = 4.3;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
const sanityToken = process.env.SANITY_API_TOKEN?.trim();

if (!stripeKey || !sanityToken) {
  console.log("Skip: set STRIPE_SECRET_KEY and SANITY_API_TOKEN to compare prices.");
  process.exit(0);
}

const projectId = "sovnyov1";
const dataset = "production";
const apiVersion = "2024-03-01";

const groq = `*[_type == "product" && defined(stripePriceId) && stripePriceId != "" && isFree != true]{_id,name,price,pricePLN,stripePriceId}[0...80]`;

function expectedEurMinor(priceEur) {
  return Math.round(Math.max(0, Number(priceEur) || 0) * 100);
}

function expectedPlnMinor(priceEur, pricePLN) {
  const eur = Math.max(0, Number(priceEur) || 0);
  const pln =
    typeof pricePLN === "number" && pricePLN > 0
      ? pricePLN
      : Math.round(eur * CHECKOUT_FX_EUR_PLN);
  return Math.round(pln * 100);
}

async function sanityFetch() {
  const q = `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}?query=${encodeURIComponent(groq)}`;
  const res = await fetch(q, {
    headers: { Authorization: `Bearer ${sanityToken}` },
  });
  if (!res.ok) {
    throw new Error(`Sanity query failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return body.result || [];
}

async function stripePrice(priceId) {
  const res = await fetch(
    `https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`,
    { headers: { Authorization: `Bearer ${stripeKey}` } },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe ${res.status}`);
  }
  return data;
}

let mismatch = 0;
let ok = 0;
let skipped = 0;

let rows;
try {
  rows = await sanityFetch();
} catch (e) {
  console.error("Sanity fetch failed:", e.message || e);
  process.exit(1);
}

console.log(`Checking ${rows.length} Sanity products with stripePriceId...\n`);

for (const row of rows) {
  const id = row.stripePriceId;
  let sp;
  try {
    sp = await stripePrice(id);
  } catch (e) {
    console.error(`✖ ${row.name} (${row._id}): Stripe fetch failed — ${e.message}`);
    mismatch++;
    continue;
  }

  if (sp.unit_amount == null) {
    console.log(`— ${row.name}: skip (no unit_amount on Price)`);
    skipped++;
    continue;
  }

  const cur = (sp.currency || "").toLowerCase();
  let expected;
  if (cur === "eur") {
    expected = expectedEurMinor(row.price);
  } else if (cur === "pln") {
    expected = expectedPlnMinor(row.price, row.pricePLN);
  } else {
    console.log(`— ${row.name}: skip (Stripe currency ${cur})`);
    skipped++;
    continue;
  }

  if (sp.unit_amount !== expected) {
    console.error(
      `✖ ${row.name}: Stripe ${cur} ${sp.unit_amount} vs Sanity-derived minor ${expected} (price_id ${id})`,
    );
    mismatch++;
  } else {
    ok++;
  }
}

console.log(`\nSummary: ${ok} match, ${mismatch} issues, ${skipped} skipped`);
process.exit(mismatch > 0 ? 1 : 0);
