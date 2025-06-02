import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import chalk from "chalk";

const sitemapIndexUrl = ""; //Existing sitemap
const newBaseUrl = ""; //own
const skipPatterns = ["/articles/"];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ""
});

async function fetchXml(url) {
  try {
    const response = await axios.get(url);
    return parser.parse(response.data);
  } catch (error) {
    console.error(chalk.red(`Error fetching XML from ${url}: ${error.message}`));
    return null;
  }
}

async function getAllUrls() {
  const indexData = await fetchXml(sitemapIndexUrl);
  if (!indexData?.sitemapindex?.sitemap) {
    throw new Error("Invalid sitemap index format.");
  }

  const sitemapList = Array.isArray(indexData.sitemapindex.sitemap)
    ? indexData.sitemapindex.sitemap
    : [indexData.sitemapindex.sitemap];

  let allUrls = [];

  for (const sitemap of sitemapList) {
    const sitemapUrl = sitemap.loc;
    const sitemapData = await fetchXml(sitemapUrl);

    if (!sitemapData?.urlset?.url) continue;

    const urls = Array.isArray(sitemapData.urlset.url)
      ? sitemapData.urlset.url.map(entry => entry.loc)
      : [sitemapData.urlset.url.loc];

    allUrls = allUrls.concat(urls);
  }

  return allUrls;
}

function shouldSkip(url) {
  return skipPatterns.some(pattern => url.includes(pattern));
}

function convertToNewUrl(originalUrl) {
  const { pathname, search } = new URL(originalUrl);
  return `${newBaseUrl}${pathname}${search}`;
}

async function checkUrl(url) {
  try {
    const response = await axios.get(url, { timeout: 10000 });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function main() {
  console.log(chalk.blue("Fetching sitemap URLs..."));
  const originalUrls = await getAllUrls();
  console.log(chalk.green(`Found ${originalUrls.length} URLs.`));

  const missingUrls = [];
  let successCount = 0, skippedCount = 0;

  for (const originalUrl of originalUrls) {
    if (shouldSkip(originalUrl)) {
      skippedCount++;
      console.log(chalk.yellow(`[Skipped] ${originalUrl}`));
      continue;
    }

    const newUrl = convertToNewUrl(originalUrl);
    const exists = await checkUrl(newUrl);

    if (exists) {
      console.log(chalk.green(`[OK] ${newUrl}`));
      successCount++;
    } else {
      console.log(chalk.red(`[Missing] ${newUrl}`));
      missingUrls.push(newUrl);
    }
  }

  console.log(chalk.bold("\n===== REPORT ====="));
  console.log(chalk.green(`✅ Working URLs: ${successCount}`));
  console.log(chalk.red(`❌ Missing URLs: ${missingUrls.length}`));
  console.log(chalk.yellow(`⏭️ Skipped URLs: ${skippedCount}`));

  if (missingUrls.length > 0) {
    console.log("\nMissing URLs:");
    missingUrls.forEach(url => console.log(chalk.red(url)));
  }
}

main().catch(err => {
  console.error(chalk.red("Unexpected error:"), err);
});
