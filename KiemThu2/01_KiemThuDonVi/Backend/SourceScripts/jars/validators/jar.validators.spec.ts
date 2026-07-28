import { validate } from 'class-validator';
import { IsHexColor, IsValidIcon, ALLOWED_ICONS } from './jar.validators';

class HexColorTestDto {
  @IsHexColor()
  color?: string;
}

class IconTestDto {
  @IsValidIcon()
  icon?: string;
}

describe('IsHexColor', () => {
  it('passes for a valid 6-digit hex color', async () => {
    const dto = new HexColorTestDto();
    dto.color = '#3B82F6';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('passes for a valid 3-digit shorthand hex color', async () => {
    const dto = new HexColorTestDto();
    dto.color = '#F00';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('allows undefined/null for optional fields', async () => {
    const dto = new HexColorTestDto();
    dto.color = undefined;

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails for an invalid hex color string', async () => {
    const dto = new HexColorTestDto();
    dto.color = 'blue';

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isHexColor');
  });

  it('fails for a hex color missing the leading #', async () => {
    const dto = new HexColorTestDto();
    dto.color = '3B82F6';

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
  });

  it('fails for a non-string value', async () => {
    const dto = new HexColorTestDto();
    (dto as any).color = 12345;

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
  });
});

describe('IsValidIcon', () => {
  it('passes for an icon name in the allowed list', async () => {
    const dto = new IconTestDto();
    dto.icon = 'Utensils';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('allows undefined/null for optional fields', async () => {
    const dto = new IconTestDto();
    dto.icon = undefined;

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails for an icon name not in the allowed list', async () => {
    const dto = new IconTestDto();
    dto.icon = 'NotARealIcon';

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isValidIcon');
  });

  it('fails for a non-string value', async () => {
    const dto = new IconTestDto();
    (dto as any).icon = 42;

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
  });

  it('every entry in ALLOWED_ICONS is itself considered valid', async () => {
    for (const icon of ALLOWED_ICONS) {
      const dto = new IconTestDto();
      dto.icon = icon;

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    }
  });
});
