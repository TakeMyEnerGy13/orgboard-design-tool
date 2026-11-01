async function visitWorkspace(page, url) {
  await page.goto(url);
  const skip = page.locator('#guide-skip');
  if (await skip.isVisible()) await skip.click();
}

module.exports = { visitWorkspace };
