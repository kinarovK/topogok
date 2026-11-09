import { expect, mapReady, NAME, PROD, test } from './helpers.ts';

test('T13/T14 production build: every region is hit at its label point; names in both languages; no labels or reveal inside a round', async ({ page }) => {
  await page.goto(PROD);
  await page.getByRole('button', { name: 'Térkép felfedezése' }).click();
  await mapReady(page, 'explore');
  const labels = page.locator('[data-label-id]');
  await expect(labels).toHaveCount(27);
  const ids = await labels.evaluateAll((els) => els.map((e) => e.getAttribute('data-label-id')!));
  await page.locator('[data-map="explore"]').scrollIntoViewIfNeeded();
  for (const id of ids) {
    const label = page.locator(`[data-label-id="${id}"]`);
    const box = (await label.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('explore-selected')).toHaveText(`Kiválasztva: ${NAME.get(id)!.hu}`);
  }
  await page.getByLabel('Nyelv', { exact: true }).selectOption('uk');
  await expect(page.locator('[data-label-id="UA-21"]')).toHaveText('Закарпатська область');
  await page.getByText('Показувати назви').click();
  await expect(page.locator('[data-label-id]')).toHaveCount(0);

  // A round offers no label toggle and no reveal in assessment.
  await page.getByRole('button', { name: 'Назад' }).click();
  await page.getByRole('button', { name: /^Перевірка знань/ }).click();
  await page.getByRole('button', { name: 'Почати' }).click();
  await mapReady(page);
  await expect(page.getByText('Показувати назви')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Показати відповідь' })).toHaveCount(0);
  await expect(page.locator('[data-label-id]')).toHaveCount(0);
});

test('T24 data failure: corrupted package shows a localized error and never starts a round', async ({ page }) => {
  await page.route('**/regions.geojson', (r) => r.fulfill({ status: 200, contentType: 'application/geo+json', body: '{"type":"FeatureCollection","features":[]}' }));
  await page.goto(PROD);
  await page.getByRole('button', { name: /^Gyakorlás/ }).click();
  await expect(page.getByRole('alert')).toContainText('A térképadatok hiányosak vagy sérültek');
  await expect(page.getByRole('button', { name: 'Újrapróbálás' })).toBeVisible();
  await expect(page.locator('#question')).toHaveCount(0);
});
