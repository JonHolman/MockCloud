import { chromium } from "playwright";

const BASE = process.env.MOCKCLOUD_URL || "http://localhost:4444";
const PAUSE = 2000;
const ts = Date.now();

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const headless = !process.argv.includes("--visible");
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: "demo-video", size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  // Home — show dashboard with existing resources
  await page.goto(BASE);
  await page.waitForSelector("text=MockCloud");
  await sleep(5000);

  // S3 — browse existing bucket then create a new one
  await page.locator("nav a.chalk-nav-item").getByText("S3").click();
  await page.waitForSelector("text=S3 Buckets");
  await sleep(PAUSE);

  await page.getByText("my-app-uploads").first().click();
  await page.waitForSelector("text=Objects");
  await sleep(PAUSE);

  await page.locator("nav a.chalk-nav-item").getByText("S3").click();
  await page.waitForSelector("text=S3 Buckets");
  await sleep(500);

  const bucketName = `demo-bucket-${ts}`;
  await page.getByRole("button", { name: "Create bucket" }).click();
  await page.getByPlaceholder("my-bucket").waitFor();
  await sleep(500);
  await page.getByPlaceholder("my-bucket").fill(bucketName);
  await sleep(800);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForSelector(`text=${bucketName}`);
  await sleep(PAUSE);

  // DynamoDB — browse existing table then create a new one
  await page.locator("nav a.chalk-nav-item").getByText("DynamoDB").click();
  await page.waitForSelector("text=Tables");
  await sleep(PAUSE);

  await page.getByText("users").first().click();
  await page.waitForSelector("text=Items");
  await sleep(PAUSE);

  await page.locator("nav a.chalk-nav-item").getByText("DynamoDB").click();
  await page.waitForSelector("text=Tables");
  await sleep(500);

  const tableName = `orders-${ts}`;
  await page.getByRole("button", { name: "Create table" }).click();
  await page.getByPlaceholder("my-table").waitFor();
  await sleep(500);
  await page.getByPlaceholder("my-table").fill(tableName);
  await sleep(800);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForSelector(`text=${tableName}`);
  await sleep(PAUSE);

  // Secrets Manager — see existing then create new
  await page.locator("nav a.chalk-nav-item").getByText("Secrets Manager").click();
  await page.waitForSelector("text=my-api-key");
  await sleep(PAUSE);

  const secretName = `db-password-${ts}`;
  await page.getByRole("button", { name: "Create secret" }).click();
  await page.getByPlaceholder("my-secret").waitFor();
  await sleep(500);
  await page.getByPlaceholder("my-secret").fill(secretName);
  await sleep(500);
  await page.locator("textarea").first().fill("super-secret-password-123");
  await sleep(800);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.waitForSelector(`text=${secretName}`);
  await sleep(PAUSE);

  // CloudFormation
  await page.locator("nav a.chalk-nav-item").getByText("CloudFormation").click();
  await page.waitForSelector("text=Stacks");
  await sleep(PAUSE);

  // Lambda
  await page.locator("nav a.chalk-nav-item").getByText("Lambda").click();
  await page.waitForSelector("text=Functions");
  await sleep(PAUSE);

  // Back to home — counts should be higher now
  await page.locator("nav a.chalk-nav-header").click();
  await page.waitForSelector("text=MockCloud");
  await sleep(5000);

  await context.close();
  await browser.close();

  console.log("Recording saved to demo-video/");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
