import { clickNext, confirmBtn, openTopic, currentTargetId, E2E, expect, mapReady, nextBtn, otherId, selectRegion, start, test } from './helpers.ts';

test.describe('practice', () => {
  test('T02–T05 mixed 5-question round: feedback, hidden answer, reveal, single review, 360/500', async ({ page }) => {
    await start(page, E2E, 'practice', '5');
    const status = page.getByTestId('status');
    await expect(status).toContainText('Válassz egy területet');
    await expect(status).toContainText('Hátralévő próbálkozás: 3');

    // Q1 correct first try
    let id = await currentTargetId(page);
    await selectRegion(page, id);
    await expect(status).toContainText('Kijelölve');
    await confirmBtn(page).click();
    await expect(status).toContainText('Helyes!');
    await clickNext(page);

    // Q2 correct first try, Q3 correct first try
    for (let i = 0; i < 2; i++) {
      id = await currentTargetId(page);
      await selectRegion(page, id);
      await confirmBtn(page).click();
      await expect(status).toContainText('Helyes!');
      await clickNext(page);
    }

    // Q4: wrong, then the same wrong area cannot be re-submitted, then correct
    id = await currentTargetId(page);
    const wrong = otherId(id);
    await selectRegion(page, wrong);
    await confirmBtn(page).click();
    await expect(status).toContainText('Helytelen. Próbáld újra!');
    await expect(status).toContainText('Hátralévő próbálkozás: 2');
    await expect(status).not.toContainText(await page.locator('#question').innerText().then((q) => q.replace('Keresd meg: ', '')));
    await selectRegion(page, wrong);
    await expect(status).toContainText('már kipróbáltad');
    await expect(confirmBtn(page)).toBeDisabled();
    await selectRegion(page, id);
    await confirmBtn(page).click();
    await expect(status).toContainText('Helyes!');
    await clickNext(page);

    // Q5: reveal
    expect(await currentTargetId(page)).toBeTruthy();
    await page.getByRole('button', { name: 'Mutasd meg' }).click();
    await expect(status).toContainText('A helyes terület:');
    await expect(nextBtn(page)).toHaveText('Következő');
    await clickNext(page);

    // Review: 2 unique tasks, header says so; fail one completely, solve the other
    await expect(page.locator('main')).toContainText('Hibák ismétlése • 1 / 2');
    await expect(page.locator('main')).toContainText('Az eredeti pontszám nem változik.');
    id = await currentTargetId(page);
    const avoid: string[] = [];
    for (let k = 0; k < 3; k++) {
      const w = otherId(id, avoid);
      avoid.push(w);
      await selectRegion(page, w);
      await confirmBtn(page).click();
    }
    await expect(status).toContainText('Helytelen. A helyes terület:');
    await clickNext(page);
    await expect(page.locator('main')).toContainText('Hibák ismétlése • 2 / 2');
    id = await currentTargetId(page);
    await selectRegion(page, id);
    await confirmBtn(page).click();
    await expect(nextBtn(page)).toHaveText('Eredmény');
    await clickNext(page);

    await expect(page.getByTestId('result')).toBeVisible();
    await expect(page.getByTestId('correct')).toHaveText('3 / 5');
    await expect(page.getByTestId('percent')).toHaveText('60%');
    await expect(page.getByTestId('points')).toHaveText('360 / 500');
    await expect(page.locator('main')).not.toContainText('Jegy');
  });

  test('double-clicking "confirm" does not skip the feedback', async ({ page }) => {
    await start(page, E2E, 'practice', '5');
    const id = await currentTargetId(page);
    await selectRegion(page, id);
    await confirmBtn(page).dblclick();
    await expect(page.getByTestId('status')).toContainText('Helyes!');
    await expect(page.locator('main')).toContainText('Gyakorlás · 1 / 5');
  });

  test('T13 all 27 regions selectable in a round; Kyiv and Sevastopol after zooming in; 2700/2700', async ({ page }) => {
    await start(page, E2E, 'practice', 'all');
    const seen = new Set<string>();
    for (let i = 0; i < 27; i++) {
      const id = await currentTargetId(page);
      seen.add(id);
      await selectRegion(page, id);
      await confirmBtn(page).click();
      await expect(page.getByTestId('status')).toContainText('Helyes!');
      await clickNext(page);
    }
    expect(seen.size).toBe(27);
    await expect(page.getByTestId('points')).toHaveText('2700 / 2700');
    await expect(page.getByTestId('correct')).toHaveText('27 / 27');
  });
});

test.describe('assessment', () => {
  test('T06/T07 12 questions: changeable selection, neutral UI for right and wrong, no way back, 9/12 → 75%, grade 9', async ({ page }) => {
    await start(page, E2E, 'assessment', '12');
    const status = page.getByTestId('status');
    await expect(page.getByRole('button', { name: 'Mutasd meg' })).toHaveCount(0);
    const snapshots: string[] = [];
    for (let i = 0; i < 12; i++) {
      await expect(page.locator('main')).toContainText(`Számonkérés · ${i + 1} / 12`);
      const id = await currentTargetId(page);
      const answer = i < 9 ? id : otherId(id);
      await selectRegion(page, otherId(id, [answer]));
      await selectRegion(page, answer); // selection can be changed before confirming
      await expect(status).toHaveText('Kijelölve. Véglegesítsd a választ, vagy válassz másikat.');
      const before = await status.getAttribute('class');
      await confirmBtn(page).click();
      if (i < 11) {
        await expect(status).toHaveText('Válassz egy területet a térképen.');
        snapshots.push(`${before}|${await status.getAttribute('class')}`);
        await expect(page.locator('main')).not.toContainText(/Helyes|Helytelen/);
      }
    }
    expect(new Set(snapshots).size, 'same UI state after right and wrong answers').toBe(1);
    await expect(page.getByTestId('correct')).toHaveText('9 / 12');
    await expect(page.getByTestId('percent')).toHaveText('75%');
    await expect(page.getByTestId('grade')).toHaveText('9 / 12-es jegy');
    // No way back to a closed question.
    await page.goBack().catch(() => {});
    await expect(page.locator('#question')).toHaveCount(0);
  });

  test('T07 26/27 → 96,3%, grade 12', async ({ page }) => {
    await start(page, E2E, 'assessment', 'all');
    for (let i = 0; i < 27; i++) {
      const id = await currentTargetId(page);
      await selectRegion(page, i === 0 ? otherId(id) : id);
      await confirmBtn(page).click();
    }
    await expect(page.getByTestId('correct')).toHaveText('26 / 27');
    await expect(page.getByTestId('percent')).toHaveText('96,3%');
    await expect(page.getByTestId('grade')).toHaveText('12 / 12-es jegy');
  });

  test('T08/T10 5-minute limit with a selected but unconfirmed answer: timeout after background, N stays 5', async ({ page }) => {
    await page.clock.install();
    await start(page, E2E, 'assessment', '5', '5 perc');
    await expect(page.getByRole('timer')).toHaveText(/0[45]:\d\d/);
    for (let i = 0; i < 2; i++) {
      const id = await currentTargetId(page);
      await selectRegion(page, id);
      await confirmBtn(page).click();
    }
    const id = await currentTargetId(page);
    await selectRegion(page, id); // selected, never confirmed
    // Simulate the tab being hidden while time passes, then coming back.
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.fastForward('06:00');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.getByTestId('result')).toBeVisible();
    await expect(page.locator('main')).toContainText('Lejárt az idő.');
    await expect(page.getByTestId('correct')).toHaveText('2 / 5');
    await expect(page.getByTestId('duration')).toHaveText('05:00');
    await expect(page.getByTestId('grade')).toHaveText('5 / 12-es jegy');
  });
});

test.describe('round controls', () => {
  test('T11/T16 restart and exit dialogs; language and theme switch keep the round; reload returns home with nothing stored', async ({ page }) => {
    await start(page, E2E, 'practice', '12');
    const q1 = await currentTargetId(page);
    const wrong = otherId(q1);
    await selectRegion(page, wrong);
    await confirmBtn(page).click();
    await expect(page.getByTestId('status')).toContainText('Hátralévő próbálkozás: 2');

    // Language + theme switch mid-question
    await page.getByLabel('Nyelv', { exact: true }).selectOption('uk');
    await expect(page.locator('#question')).toContainText('Знайди:');
    await page.getByLabel('Вигляд', { exact: true }).selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await currentTargetId(page)).toBe(q1);
    await expect(page.locator('main')).toContainText('Практика · 1 / 12');
    await expect(page.getByTestId('status')).toContainText('Залишилося спроб: 2');

    // Restart: cancel keeps everything (Escape = safe choice)
    await page.getByRole('button', { name: 'Почати заново' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Продовжити' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await currentTargetId(page)).toBe(q1);
    await expect(page.getByTestId('status')).toContainText('Залишилося спроб: 2');

    // Restart: confirm starts a fresh round
    await page.getByRole('button', { name: 'Почати заново' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Нове коло' }).click();
    await mapReady(page);
    await expect(page.locator('main')).toContainText('Практика · 1 / 12');
    await expect(page.getByTestId('status')).toContainText('Залишилося спроб: 3');

    // Reload: home, only the preference key in storage
    await page.reload();
    await expect(page.locator('#question')).toHaveCount(0);
    await expect(page.locator('[data-topic="ukraine-tectonics"]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const storage = await page.evaluate(async () => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
      idb: (await indexedDB.databases?.())?.map((d) => d.name) ?? [],
      cookies: document.cookie,
    }));
    expect(storage).toEqual({ local: ['topogok.preferences.v1'], session: [], idb: [], cookies: '' });
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('topogok.preferences.v1')!))).toEqual({ theme: 'dark', locale: 'uk' });

    // Exit with confirmation
    await start(page, E2E, 'practice', '5');
    await page.getByRole('button', { name: 'Вийти' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Вийти' }).click();
    await expect(page.locator('#question')).toHaveCount(0);
  });
});

test.describe('tectonics topic', () => {
  test('practice: only 5/all offered, grey background land is not an answer, all 11 units selectable (1100/1100)', async ({ page }) => {
    await openTopic(page, E2E, 'tectonics');
    await expect(page.locator('h1')).toHaveText('Ukrajna tektonikai szerkezete');
    await page.getByRole('button', { name: /^Gyakorlás/ }).click();
    await expect(page.locator('label', { hasText: /^12$/ })).toHaveCount(0);
    await expect(page.locator('label', { hasText: 'Mindegyik (11)' })).toBeVisible();
    await page.locator('label', { hasText: 'Mindegyik (11)' }).click();
    await page.getByRole('button', { name: 'Indítás' }).click();
    await mapReady(page);
    await expect(page.locator('main')).toContainText('A szürke területek nem tartoznak a kérdezett egységekhez.');

    // Kerch peninsula is background land: tapping it selects nothing.
    const xy = await page.evaluate(() => {
      const h = window.__topogokE2E!.maps['main']!;
      h.container.scrollIntoView({ block: 'center' });
      const r = h.container.getBoundingClientRect();
      const q = h.project([35.95, 45.35]);
      return { x: r.left + q.x, y: r.top + q.y };
    });
    await page.mouse.click(xy.x, xy.y);
    await page.waitForTimeout(300);
    await expect(page.getByTestId('status')).toContainText('Válassz egy területet a térképen.');
    await expect(confirmBtn(page)).toBeDisabled();

    const seen = new Set<string>();
    for (let i = 0; i < 11; i++) {
      const id = await currentTargetId(page);
      expect(id.startsWith('TU-')).toBe(true);
      seen.add(id);
      await selectRegion(page, id);
      await confirmBtn(page).click();
      await expect(page.getByTestId('status')).toContainText('Helyes!');
      await clickNext(page);
    }
    expect(seen.size).toBe(11);
    await expect(page.getByTestId('points')).toHaveText('1100 / 1100');
  });

  test('assessment: 4/5 → 80%, grade 10, in Ukrainian', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('topogok.preferences.v1', JSON.stringify({ locale: 'uk', theme: 'light' })));
    await start(page, E2E, 'assessment', '5', undefined, 'tectonics');
    for (let i = 0; i < 5; i++) {
      const id = await currentTargetId(page);
      await selectRegion(page, i === 0 ? otherId(id) : id);
      await confirmBtn(page).click();
    }
    await expect(page.getByTestId('correct')).toHaveText('4 / 5');
    await expect(page.getByTestId('percent')).toHaveText('80%');
    await expect(page.getByTestId('grade')).toHaveText('10 з 12');
  });
});
