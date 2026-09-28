import { describe, expect, it } from 'vitest';
import { misuraImmagine } from './immagine';

/*
 * I campioni sono file veri, prodotti da un encoder vero (Pillow) e messi
 * qui in base64: un'immagine scritta a mano byte per byte proverebbe che il
 * parser legge quello che io credo sia un JPEG, non quello che è un JPEG.
 * Sono tutti 7×3, tranne il progressivo che è 4×9 apposta — larghezza e
 * altezza scambiate sono l'errore più facile da fare e il più difficile da
 * vedere su un'immagine quadrata.
 */
const b = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

const PNG = b('iVBORw0KGgoAAAANSUhEUgAAAAcAAAADCAIAAADQoYKSAAAAFElEQVR4nGM8wcXFgAGYMIVwigIAOMYA4isJLm8AAAAASUVORK5CYII=');
const GIF = b('R0lGODdhBwADAIEAAMgKCgAAAAAAAAAAACwAAAAABwADAAAICQABCBxIsKDBgAA7');
const JPEG = b('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAcDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDgqKKK8M/VD//Z');
const JPEG_EXIF = b('/9j/4AAQSkZJRgABAQAAAQABAAD/4QDQRXhpZgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAcDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDgqKKK8M/VD//Z');
const JPEG_PROGRESSIVO = b('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAAJAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfg//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAQUCP//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEABj8CP//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8hP//aAAwDAQACAAMAAAAQA//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QP//Z');

describe('misuraImmagine', () => {
  it('legge un PNG', () => {
    expect(misuraImmagine(PNG)).toEqual({ larghezza: 7, altezza: 3 });
  });

  it('legge un JPEG', () => {
    expect(misuraImmagine(JPEG)).toEqual({ larghezza: 7, altezza: 3 });
  });

  it('salta l\'EXIF e arriva al SOF', () => {
    // le misure non stanno nel primo segmento: prima ci sono le miniature e
    // i dati della macchina fotografica, che qui occupano 208 byte
    expect(misuraImmagine(JPEG_EXIF)).toEqual({ larghezza: 7, altezza: 3 });
  });

  it('legge anche un JPEG progressivo, che ha un SOF diverso', () => {
    // SOF2 invece di SOF0: un controllo su `=== 0xc0` lo mancherebbe
    expect(misuraImmagine(JPEG_PROGRESSIVO)).toEqual({ larghezza: 4, altezza: 9 });
  });

  it('legge un GIF, che ha le misure invertite', () => {
    expect(misuraImmagine(GIF)).toEqual({ larghezza: 7, altezza: 3 });
  });

  it('non inventa misure per un formato che non conosce', () => {
    expect(misuraImmagine(b('UklGRiIAAABXRUJQVlA4'))).toBeNull();
    expect(misuraImmagine(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(misuraImmagine(new Uint8Array(0))).toBeNull();
  });

  it('non scambia un file qualunque per un PNG solo per la firma', () => {
    const finto = new Uint8Array(40);
    finto.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // manca «IHDR» al byte 12: senza quel controllo tornerebbe 0×0
    expect(misuraImmagine(finto)).toBeNull();
  });

  it('non si impianta su un JPEG troncato', () => {
    expect(misuraImmagine(JPEG.slice(0, 40))).toBeNull();
  });
});
