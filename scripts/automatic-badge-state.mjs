const SCORE_PATTERN = /^AI score \d+%$/;

async function readAutomaticScores(session) {
  const { root } = await session.send('DOM.getDocument', { depth: -1, pierce: true });
  const scores = [];
  const visit = (node) => {
    const attributes = node.attributes ?? [];
    const isBadge = attributes.some(
      (value, index) => index % 2 === 0 && value === 'data-image-signal-id',
    );
    if (isBadge) {
      const text = (node.children ?? [])
        .filter((child) => child.nodeName === '#text')
        .map((child) => child.nodeValue)
        .join('')
        .trim();
      if (SCORE_PATTERN.test(text)) scores.push(text);
    }
    for (const child of node.children ?? []) visit(child);
    for (const shadowRoot of node.shadowRoots ?? []) visit(shadowRoot);
  };
  visit(root);
  return scores.sort();
}

export async function waitForAutomaticScores(page, expectedCount, timeoutMs = 120_000) {
  const session = await page.createCDPSession();
  const deadline = Date.now() + timeoutMs;
  try {
    await session.send('DOM.enable');
    while (Date.now() < deadline) {
      const scores = await readAutomaticScores(session);
      if (scores.length === expectedCount) return scores;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const scores = await readAutomaticScores(session);
    throw new Error(
      `Expected ${expectedCount} accessible automatic scores, found ${scores.length}: ${JSON.stringify(scores)}`,
    );
  } finally {
    await session.detach();
  }
}
