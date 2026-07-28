import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ChatRequestDto } from './chat-request.dto';

describe('ChatRequestDto validation', () => {
  it('passes for a minimal valid request (message only)', async () => {
    const dto = plainToInstance(ChatRequestDto, { message: 'Tháng này tôi nên tiết kiệm bao nhiêu?' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('passes with a valid sessionId to continue an existing conversation', async () => {
    const dto = plainToInstance(ChatRequestDto, {
      message: 'Vậy còn lọ giáo dục thì sao?',
      sessionId: '123e4567-e89b-12d3-a456-426614174000',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  // AIChat-TC003: gửi tin nhắn rỗng phải bị chặn bởi @IsNotEmpty().
  it('fails validation when message is empty', async () => {
    const dto = plainToInstance(ChatRequestDto, { message: '' });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('message');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('fails validation when message is missing entirely', async () => {
    const dto = plainToInstance(ChatRequestDto, {});

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'message')).toBe(true);
  });

  // AIChat-TC004: sessionId sai định dạng UUID phải bị chặn bởi @IsUUID().
  it('fails validation when sessionId is not a valid UUID', async () => {
    const dto = plainToInstance(ChatRequestDto, { message: 'Xin chào', sessionId: '12345' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('sessionId');
    expect(errors[0].constraints).toHaveProperty('isUuid');
  });

  it('passes when sessionId is omitted (a new session will be created)', async () => {
    const dto = plainToInstance(ChatRequestDto, { message: 'Xin chào' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
