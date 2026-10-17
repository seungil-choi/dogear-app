/**
 * EXIF 제거에 실패하면 원본을 넘기지 않는다(2026-10-16 감사 P2-18).
 * 예전엔 실패 시 원본 URI를 돌려줘 GPS가 박힌 사진이 공개 버킷에 올라갈 수 있었다.
 */
const mockRender = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: () => ({ renderAsync: mockRender }) },
}));
const mockReport = jest.fn();
jest.mock('../../utils/errorReporter', () => ({ reportError: (...a: unknown[]) => mockReport(...a) }));

import { stripExif, stripExifAll, PhotoProcessError } from '../stripExif';
import { photoPickErrorMessage, PHOTO } from '../../constants/messages';

beforeEach(() => { mockRender.mockReset(); mockReport.mockReset(); });

it('성공하면 새로 저장된 파일 URI를 돌려준다', async () => {
  mockRender.mockResolvedValue({ saveAsync: async () => ({ uri: 'file:///clean.jpg' }) });
  await expect(stripExif('file:///orig.jpg')).resolves.toBe('file:///clean.jpg');
});

it('실패하면 원본 URI 대신 PhotoProcessError를 던지고 기록한다', async () => {
  mockRender.mockRejectedValue(new Error('decode failed'));
  await expect(stripExif('file:///orig.jpg')).rejects.toBeInstanceOf(PhotoProcessError);
  expect(mockReport).toHaveBeenCalledWith(expect.any(PhotoProcessError), 'handled');
  // 기기 경로는 기록에 남기지 않는다
  expect(String(mockReport.mock.calls[0][0].message)).not.toContain('orig.jpg');
});

it('여러 장 중 한 장이라도 실패하면 전체를 받지 않는다', async () => {
  mockRender
    .mockResolvedValueOnce({ saveAsync: async () => ({ uri: 'file:///a.jpg' }) })
    .mockRejectedValueOnce(new Error('boom'));
  await expect(stripExifAll(['1', '2'])).rejects.toBeInstanceOf(PhotoProcessError);
});

it('실패 문구는 위치정보 제거 실패와 일반 실패를 구분한다', () => {
  expect(photoPickErrorMessage(new PhotoProcessError('x'))).toBe(PHOTO.processFailed);
  expect(photoPickErrorMessage(new Error('x'))).toBe(PHOTO.loadFailed);
});
