import { isValidEmail } from '../email';

describe('isValidEmail', () => {
  it('일반적인 주소는 통과', () => {
    for (const v of [
      'name@example.com',
      'review@9factorial.com',
      'first.last+tag@sub.example.co.kr',
      '  padded@example.com  ',
      'UPPER@EXAMPLE.COM',
      'a_b-c%d@my-host.io',
    ]) {
      expect(isValidEmail(v)).toBe(true);
    }
  });

  it('한글 자모·한글이 섞인 값은 거부 (예전 식은 통과시켰음)', () => {
    for (const v of ['ㅁ@ㅁ.ㅁ', '홍길동@example.com', 'name@예제.com', 'name@example.컴']) {
      expect(isValidEmail(v)).toBe(false);
    }
  });

  it('형식이 깨진 값은 거부', () => {
    for (const v of [
      '',
      '   ',
      'name',
      'name@',
      '@example.com',
      'name@example',
      'name@example.c',
      'name@-example.com',
      'name@example-.com',
      'name@@example.com',
      'na me@example.com',
      'name@exa mple.com',
      'name@.example.com',
    ]) {
      expect(isValidEmail(v)).toBe(false);
    }
  });
});
