import { expect, PROD, test, topicCard } from './helpers.ts';

test('home: topics are grouped by grade in folding blocks; an opened block stays open after a reload', async ({ page }) => {
  await page.goto(PROD);
  const blocks = page.locator('details[data-grade]');
  await expect(blocks).toHaveCount(3);
  await expect(page.locator('[data-topic="ukraine-tectonics"]')).toBeHidden();
  await expect(await topicCard(page, 'ukraine-tectonics')).toBeVisible();
  await expect(page.locator('details[data-grade="8"]')).toHaveAttribute('open', '');
  await page.reload();
  await expect(page.locator('[data-topic="ukraine-tectonics"]')).toBeVisible();
  await expect(page.locator('[data-topic="continent-africa"]')).toBeHidden();
});
