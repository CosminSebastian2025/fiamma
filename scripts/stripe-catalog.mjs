#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const API_BASE = 'https://api.stripe.com/v1';
const flags = new Set(process.argv.slice(2));
const dryRun = flags.has('--dry-run');
const jsonOutput = flags.has('--json');

const currency = (process.env.STRIPE_CURRENCY || 'eur').toLowerCase();
const productName = process.env.STRIPE_PRODUCT_NAME || 'Fiamma Plus';
const productDescription =
  process.env.STRIPE_PRODUCT_DESCRIPTION || 'Abbonamento Fiamma Plus con accesso ai vantaggi premium.';
const taxCode = process.env.STRIPE_TAX_CODE || 'txcd_10103000';

const plans = [
  {
    productKey: 'plus',
    lookupKey: 'plus_monthly',
    nickname: 'Plus mensile',
    interval: 'month',
    intervalCount: 1,
    recurring: true,
    amount: readAmount('STRIPE_PRICE_MONTHLY_AMOUNT', 999),
    envName: 'STRIPE_PRICE_PLUS_MONTHLY',
  },
  {
    productKey: 'plus',
    lookupKey: 'plus_yearly',
    nickname: 'Plus annuale',
    interval: 'year',
    intervalCount: 1,
    recurring: true,
    amount: readAmount('STRIPE_PRICE_YEARLY_AMOUNT', 5999),
    envName: 'STRIPE_PRICE_PLUS_YEARLY',
  },
];

const coinProductName = process.env.STRIPE_COINS_PRODUCT_NAME || 'Fiamma Coins';
const coinProductDescription =
  process.env.STRIPE_COINS_PRODUCT_DESCRIPTION || 'Monete Fiamma per regali e sticker.';

const coinPacks = [
  {
    productKey: 'coins',
    lookupKey: 'coins_starter',
    nickname: 'Starter - 200 monete',
    pack: 'starter',
    recurring: false,
    amount: readAmount('STRIPE_COINS_STARTER_AMOUNT', 199),
    envName: 'STRIPE_PRICE_COINS_STARTER',
  },
  {
    productKey: 'coins',
    lookupKey: 'coins_popular',
    nickname: 'Popolare - 550 monete',
    pack: 'popular',
    recurring: false,
    amount: readAmount('STRIPE_COINS_POPULAR_AMOUNT', 399),
    envName: 'STRIPE_PRICE_COINS_POPULAR',
  },
  {
    productKey: 'coins',
    lookupKey: 'coins_value',
    nickname: 'Convenienza - 1200 monete',
    pack: 'value',
    recurring: false,
    amount: readAmount('STRIPE_COINS_VALUE_AMOUNT', 749),
    envName: 'STRIPE_PRICE_COINS_VALUE',
  },
  {
    productKey: 'coins',
    lookupKey: 'coins_pro',
    nickname: 'Pro - 2400 monete',
    pack: 'pro',
    recurring: false,
    amount: readAmount('STRIPE_COINS_PRO_AMOUNT', 999),
    envName: 'STRIPE_PRICE_COINS_PRO',
  },
];

const allPrices = [...plans, ...coinPacks];

let secretKey = '';
let transport = 'api';
let cliMode = null;

function readAmount(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} deve essere un intero in centesimi maggiore di zero.`);
  }
  return value;
}

function validateConfig() {
  if (!/^[a-z]{3}$/.test(currency)) throw new Error(`Valuta non valida: ${currency}`);
  if (!/^txcd_\d{8}$/.test(taxCode)) throw new Error(`Tax code non valido: ${taxCode}`);
  for (const plan of allPrices) {
    if (!/^[a-z0-9_]{1,200}$/.test(plan.lookupKey)) {
      throw new Error(`Lookup key non valida: ${plan.lookupKey}`);
    }
  }
}

function resolveSecretKey() {
  const fromEnv = process.env.STRIPE_SECRET_KEY?.trim();
  if (fromEnv) return fromEnv;

  const fromConfig = readKeyFromConfigFile();
  if (fromConfig) return fromConfig;

  try {
    const config = runCli(['config', '--list']);
    const testKey = config.match(/test_mode_api_key\s*=\s*["']?([^"'\s]+)["']?/);
    if (testKey) return testKey[1];
  } catch {
    // CLI non disponibile: si prova il fallback via CLI autorizzato.
  }

  return null;
}

function readKeyFromConfigFile() {
  const candidates = [
    join(homedir(), '.config', 'stripe', 'config.toml'),
    process.env.APPDATA ? join(process.env.APPDATA, 'stripe', 'config.toml') : null,
  ].filter(Boolean);

  for (const path of candidates) {
    try {
      const config = readFileSync(path, 'utf8');
      const testKey = config.match(/test_mode_api_key\s*=\s*["']?([^"'\s]+)["']?/);
      if (testKey) return testKey[1];

      const liveKey = config.match(/live_mode_api_key\s*=\s*["']?([^"'\s]+)["']?/);
      if (liveKey) return liveKey[1];
    } catch {
      // File non leggibile: prova il successivo.
    }
  }

  return null;
}

function authorizeKey() {
  const key = resolveSecretKey();
  if (!key) {
    transport = 'cli';
    ensureCliTestMode();
    return;
  }

  secretKey = key;
  transport = 'api';
  if (!/^(sk|rk|rkcs)_(test|live)_/.test(secretKey)) {
    throw new Error('La chiave non sembra una chiave Stripe valida (sk_test_, rk_test_ o rkcs_test_).');
  }
  if (secretKey.includes('_live_') && process.env.ALLOW_LIVE !== '1') {
    throw new Error('Chiave live rilevata. Usa una chiave di test oppure imposta ALLOW_LIVE=1 se sei sicuro.');
  }
}

function flatten(value, prefix = '', out = {}) {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const key = `${prefix}[${index}]`;
      if (item !== null && typeof item === 'object') flatten(item, key, out);
      else out[key] = String(item);
    });
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      flatten(item, prefix ? `${prefix}[${key}]` : key, out);
    }
    return out;
  }
  out[prefix] = String(value);
  return out;
}

function cliBinary() {
  return process.platform === 'win32' ? 'stripe.cmd' : 'stripe';
}

function quoteCmdArg(value) {
  const text = String(value);
  if (text && !/[\s"&|<>^()%!]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function runCli(args) {
  const commandLine = [cliBinary(), ...args].map(quoteCmdArg).join(' ');
  if (process.env.STRIPE_CLI_DEBUG === '1') {
    console.error(`[stripe-cli] ${commandLine}`);
  }
  // Su Windows cmd non è un eseguibile: si passa la riga come stringa allo shell,
  // altrimenti Node concatena gli argomenti senza quotarli (DEP0190).
  const result = spawnSync(commandLine, {
    encoding: 'utf8',
    timeout: 120_000,
    shell: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `stripe CLI: codice ${result.status}`);
  }
  return result.stdout;
}

function parseCliJson(output) {
  const text = String(output).trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    // Il CLI può anteporre una riga di stato prima del JSON.
  }

  const start = text.search(/[\[{]/);
  if (start >= 0) {
    try {
      return JSON.parse(text.slice(start));
    } catch {
      // Errore gestito sotto.
    }
  }

  throw new Error('Risposta JSON non riconosciuta dal CLI Stripe.');
}

function ensureCliTestMode() {
  let balance;
  try {
    balance = parseCliJson(runCli(['get', '/v1/balance']));
  } catch (error) {
    throw new Error(
      `Nessuna chiave Stripe trovata e CLI non utilizzabile. Esegui \`stripe login\` oppure imposta STRIPE_SECRET_KEY (solo test). Dettaglio: ${error.message}`,
    );
  }

  if (balance.livemode && process.env.ALLOW_LIVE !== '1') {
    throw new Error('Il CLI Stripe è in modalità LIVE. Passa a un sandbox oppure imposta ALLOW_LIVE=1 se sei sicuro.');
  }
  cliMode = balance.livemode ? 'live' : 'test';
}

function cliStripe(path, { method = 'GET', params } = {}) {
  const verb = method === 'GET' ? 'get' : method === 'POST' ? 'post' : null;
  if (!verb) throw new Error(`Metodo non supportato dal CLI: ${method}`);

  const args = [verb, path];
  for (const [key, value] of Object.entries(params ? flatten(params) : {})) {
    args.push('-d', `${key}=${value}`);
  }
  return parseCliJson(runCli(args));
}

async function stripe(path, options = {}) {
  if (transport === 'cli') return cliStripe(path, options);

  const { method = 'GET', params } = options;
  const body = params ? new URLSearchParams(flatten(params)) : undefined;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body,
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.error?.message || response.statusText;
    throw new Error(`Stripe ${method} ${path} (${response.status}): ${message}`);
  }
  return data;
}

async function findProduct(productKey) {
  let startingAfter = null;

  for (let page = 0; page < 20; page += 1) {
    const params = { limit: '100', active: 'true' };
    if (startingAfter) params.starting_after = startingAfter;

    const list = await stripe('/products', { params });
    const product = list.data.find((item) => item.metadata?.plan === productKey);
    if (product) return product;
    if (!list.has_more || list.data.length === 0) return null;
    startingAfter = list.data[list.data.length - 1].id;
  }

  return null;
}

async function createProduct(productKey) {
  const isCoins = productKey === 'coins';
  return stripe('/products', {
    method: 'POST',
    params: {
      name: isCoins ? coinProductName : productName,
      description: isCoins ? coinProductDescription : productDescription,
      tax_code: taxCode,
      metadata: { app: 'fiamma', plan: productKey },
    },
  });
}

async function findActivePrices(lookupKey) {
  const list = await stripe('/prices', {
    params: { limit: '10', active: 'true', lookup_keys: [lookupKey] },
  });
  return list.data;
}

function samePrice(price, plan, productId) {
  const priceProduct = typeof price.product === 'string' ? price.product : price.product?.id;
  const recurringMatches = plan.recurring
    ? price.recurring?.interval === plan.interval &&
      (price.recurring?.interval_count ?? 1) === plan.intervalCount
    : !price.recurring;
  return (
    priceProduct === productId &&
    price.unit_amount === plan.amount &&
    price.currency === currency &&
    recurringMatches &&
    price.tax_behavior === 'inclusive'
  );
}

async function ensurePrice(product, plan) {
  const existing = await findActivePrices(plan.lookupKey);
  const matching = existing.find((price) => samePrice(price, plan, product.id));

  if (matching) {
    for (const price of existing) {
      if (price.id !== matching.id) await deactivatePrice(price.id);
    }
    return { price: matching, action: 'riusato' };
  }

  const params = {
    product: product.id,
    currency,
    unit_amount: plan.amount,
    lookup_key: plan.lookupKey,
    transfer_lookup_key: true,
    tax_behavior: 'inclusive',
    nickname: plan.nickname,
    metadata: {
      app: 'fiamma',
      plan: plan.productKey,
      ...(plan.recurring ? { interval: plan.interval } : { pack: plan.pack }),
    },
  };
  if (plan.recurring) {
    params.recurring = { interval: plan.interval, interval_count: plan.intervalCount };
  }

  const created = await stripe('/prices', { method: 'POST', params });

  for (const price of existing) await deactivatePrice(price.id);
  return { price: created, action: existing.length > 0 ? 'sostituito' : 'creato' };
}

async function deactivatePrice(priceId) {
  await stripe(`/prices/${priceId}`, { method: 'POST', params: { active: false } });
}

function formatAmount(cents) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function describeConfig() {
  return [
    `Prodotto Plus: ${productName}`,
    `Prodotto Monete: ${coinProductName}`,
    `Tax code: ${taxCode}`,
    ...plans.map(
      (plan) =>
        `  ${plan.lookupKey}: ${formatAmount(plan.amount)} ogni ${plan.intervalCount} ${plan.interval}`,
    ),
    ...coinPacks.map(
      (plan) => `  ${plan.lookupKey}: ${formatAmount(plan.amount)} una tantum (${plan.pack})`,
    ),
  ].join('\n');
}

async function main() {
  validateConfig();

  if (dryRun) {
    console.log('DRY RUN - nessuna chiamata a Stripe');
    console.log(describeConfig());
    return;
  }

  authorizeKey();

  const products = {};
  for (const key of ['plus', 'coins']) {
    const existingProduct = await findProduct(key);
    products[key] = existingProduct ?? (await createProduct(key));
  }

  const results = [];
  for (const plan of allPrices) {
    results.push({ plan, ...(await ensurePrice(products[plan.productKey], plan)) });
  }

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          products: { plus: products.plus.id, coins: products.coins.id },
          prices: Object.fromEntries(results.map((result) => [result.plan.envName, result.price.id])),
        },
        null,
        2,
      ),
    );
    return;
  }

  const isTest = transport === 'cli' ? cliMode === 'test' : secretKey.includes('_test_');
  console.log(`Catalogo Stripe pronto${isTest ? ' (test)' : ' (LIVE)'}.`);
  console.log(`Prodotto Plus: ${products.plus.id} - ${products.plus.name}`);
  console.log(`Prodotto Monete: ${products.coins.id} - ${products.coins.name}`);
  for (const result of results) {
    console.log(
      `  ${result.plan.lookupKey}: ${result.price.id} - ${formatAmount(result.plan.amount)}${
        result.plan.recurring ? ` / ${result.plan.interval}` : ' una tantum'
      } (${result.action})`,
    );
  }

  console.log('\nSalva gli ID nei secret Supabase (opzionali: il checkout usa le lookup key):');
  console.log(
    `supabase secrets set ${results.map((result) => `${result.plan.envName}=${result.price.id}`).join(' ')}`,
  );
}

main().catch((error) => {
  console.error(`Errore: ${error.message}`);
  process.exit(1);
});
