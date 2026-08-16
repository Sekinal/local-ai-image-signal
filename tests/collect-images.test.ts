import { collectVisiblePageImages } from '../lib/collect-images';

describe('page image inventory limits', () => {
  it('returns page identity and caps aggregate embedded URL characters', () => {
    document.body.replaceChildren();
    for (let index = 0; index < 3; index += 1) {
      const image = document.createElement('img');
      image.src = `data:image/png;base64,${String(index).repeat(1_900)}`;
      image.style.opacity = '1';
      image.getBoundingClientRect = () =>
        ({
          width: 200,
          height: 200,
          top: 0,
          left: 0,
          right: 200,
          bottom: 200,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;
      document.body.append(image);
    }

    const collection = collectVisiblePageImages(100, {
      maxDataUrlCharacters: 2_000,
      maxAggregateUrlCharacters: 5_000,
    });
    expect(collection.pageUrl).toBe(location.href);
    expect(collection.images).toHaveLength(2);
    expect(collection.skippedOversizedDataUrls).toBe(1);
  });
});
