import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ClassifyRequestDto } from './classify-request.dto';

describe('ClassifyRequestDto validation', () => {
  it('passes for a valid description with no amount', async () => {
    const dto = plainToInstance(ClassifyRequestDto, { description: 'ăn trưa 50k' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('passes for a valid description with a non-negative amount', async () => {
    const dto = plainToInstance(ClassifyRequestDto, { description: 'ăn trưa', amount: 50000 });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  // AIClassify-TC006: amount âm phải bị chặn bởi @Min(0).
  it('fails validation when amount is negative', async () => {
    const dto = plainToInstance(ClassifyRequestDto, { description: 'ăn trưa', amount: -50000 });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('amount');
    expect(errors[0].constraints).toHaveProperty('min');
  });

  it('fails validation when description is not a string', async () => {
    const dto = plainToInstance(ClassifyRequestDto, { description: 12345 });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('description');
  });

  // AIClassify-TC005 (test case spec expects "Lỗi validate IsNotEmpty" for an
  // empty description): the DTO currently only has @IsString(), no
  // @IsNotEmpty(). An empty string satisfies @IsString(), so validation
  // currently PASSES for description=''. This documents the actual current
  // behavior — flagged as a gap vs. the QA test case, not silently patched here.
  it('CURRENTLY passes validation for an empty-string description (no @IsNotEmpty guard present)', async () => {
    const dto = plainToInstance(ClassifyRequestDto, { description: '' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
