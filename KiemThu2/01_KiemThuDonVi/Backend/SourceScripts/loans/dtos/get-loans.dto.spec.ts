import { plainToInstance } from 'class-transformer';
import { GetLoansDto } from './get-loans.dto';

describe('GetLoansDto (filter transform)', () => {
  it('leaves filter undefined when no value is provided', () => {
    const result = plainToInstance(GetLoansDto, {});
    expect(result.filter).toBeUndefined();
  });

  it('leaves filter undefined when given a falsy value', () => {
    const result = plainToInstance(GetLoansDto, { filter: '' });
    expect(result.filter).toBeUndefined();
  });

  it('accepts an already-parsed array value', () => {
    const result = plainToInstance(GetLoansDto, {
      filter: [{ key: 'loan_type', value: 'bank' }],
    });
    expect(result.filter).toHaveLength(1);
    expect(result.filter?.[0]).toMatchObject({ key: 'loan_type', value: 'bank' });
  });

  it('parses a JSON string containing an array', () => {
    const result = plainToInstance(GetLoansDto, {
      filter: JSON.stringify([{ key: 'provider_id', value: 'p-1' }]),
    });
    expect(result.filter).toHaveLength(1);
    expect(result.filter?.[0]).toMatchObject({ key: 'provider_id', value: 'p-1' });
  });

  it('wraps a JSON string containing a single object into an array', () => {
    const result = plainToInstance(GetLoansDto, {
      filter: JSON.stringify({ key: 'interest_type', value: 'fixed' }),
    });
    expect(result.filter).toHaveLength(1);
    expect(result.filter?.[0]).toMatchObject({ key: 'interest_type' });
  });

  it('returns undefined when the string is not valid JSON', () => {
    const result = plainToInstance(GetLoansDto, { filter: 'not-json{' });
    expect(result.filter).toBeUndefined();
  });

  it('wraps a non-array, non-string value into a single-element array', () => {
    const result = plainToInstance(GetLoansDto, { filter: { key: 'collateral_required', value: true } });
    expect(result.filter).toHaveLength(1);
  });
});
